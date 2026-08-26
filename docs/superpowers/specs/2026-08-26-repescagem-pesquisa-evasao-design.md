# Repescagem da pesquisa de evasão — design

**Data:** 2026-08-26
**Origem:** pedido da Jessyca (Sucesso do Aluno) — "estou com pesquisas de evasão
que não foram respondidas e gostaria de reenviar a mensagem; teria um botão aqui?"
**Decisões de produto:** Hugo (26/08/2026)

---

## 1. Problema

Das 37 pesquisas de evasão enviadas em produção, **31 não tiveram nenhuma resposta**
(zero mensagem de volta), 4 foram respondidas e 2 ficaram com envio incerto.

Quem responde, responde rápido: os tempos até a primeira mensagem foram
**0,0h · 0,1h · 0,8h · 31,9h**. Três das quatro responderam na mesma hora. Ou seja,
o canal funciona — falta alcance, não insistência prolongada.

Há um agravante já medido, tratado em frente separada (ver §9): a pesquisa está
saindo em média **29 a 53 dias depois da evasão**, porque o disparo é manual.

Hoje não existe caminho de reenvio na tela. O único caminho é abrir a conversa na
Caixa de Entrada e escrever à mão.

## 2. O que será construído

Uma **fila de repescagem** dentro da aba já existente *Sucesso do Aluno →
Acompanhamento de follow-up* (`FilaFollowupEvasao`):

- a equipe marca quem quer repescar e clica em enviar;
- **nada é enviado no clique** — as linhas entram numa fila com horário sorteado;
- um worker solta uma mensagem por vez, devagar, dentro da janela comercial;
- a linha mostra o estado: `na fila · sai ~14:32` → `enviando` → `repescada 26/08`.

O envio lento existe para proteger o número da caixa **Lia – Sucesso do Aluno**,
que é o mesmo canal usado com aluno ativo. Disparar 25 mensagens em rajada é o
padrão que faz o WhatsApp derrubar o número.

### Não muda

A repescagem é **a mesma pesquisa**, com texto diferente. Mesma linha em
`pesquisa_evasao`, mesma caixa, mesma captura de resposta, mesma análise, mesma
revisão. **Sem botões** — a pesquisa original é pergunta aberta (texto ou áudio) e
a repescagem mantém o formato.

A captura não precisa de nenhuma alteração: o `webhook-whatsapp-inbox` casa a
resposta **pelo telefone** com a pesquisa que está aberta, sem olhar qual mensagem
nossa a provocou. Quem responder à repescagem cai em `coletando` →
`pronta_para_revisao` como hoje.

## 3. Régua

Dois toques, por decisão de produto:

| Toque | Quando | Texto |
|---|---|---|
| 1 | D+1 da evasão | pesquisa original (`evasao_aberta`) |
| 2 | ≥ D+3 do 1º envio, sob comando da equipe | repescagem (`evasao_repescagem`) |

Um terceiro toque não entra agora — insistir uma terceira vez com quem ignorou
duas tem retorno baixo e desgasta o número. A estrutura de dados, porém, nasce
preparada para N toques (§4), para que acrescentar o 3º seja uma linha de dados e
um template, não uma migration.

## 4. Dados

### Tabela nova: `pesquisa_evasao_envios_fila`

Uma linha **por toque**, não por repescagem.

| Coluna | Tipo | Papel |
|---|---|---|
| `id` | uuid pk | |
| `pesquisa_id` | uuid FK → `pesquisa_evasao` | alvo |
| `toque` | int | 2 = repescagem. O 1 fica reservado ao envio original, se um dia migrar para cá |
| `template_id` / `template_versao` | uuid / int | mesmo rastro que `pesquisa_evasao` guarda |
| `status` | text | `pendente` · `enviando` · `enviada` · `falhou` · `cancelada` |
| `agendada_para` | timestamptz | horário sorteado no enfileiramento |
| `enfileirada_por_usuario_id` / `enfileirada_em` | int / timestamptz | autoria |
| `worker_id` / `lease_expires_at` | uuid / timestamptz | posse da linha pelo worker |
| `tentativas` / `ultimo_erro` | int / text | diagnóstico |
| `provider_message_id` / `enviada_em` | text / timestamptz | confirmação do provedor |

**Índices que garantem a unicidade do envio:**

- `UNIQUE (pesquisa_id, toque)` — o mesmo toque nunca é enfileirado duas vezes,
  independentemente de clique duplo ou lote repetido;
- `UNIQUE (pesquisa_id) WHERE status IN ('pendente','enviando')` — nunca dois
  envios vivos para a mesma pessoa ao mesmo tempo, mesmo com régua de N toques.

**Por que tabela e não colunas em `pesquisa_evasao`:** com teto de 1 repescagem o
grão seria 1:1 e colunas bastariam, mas a régua provavelmente cresce; migrar
depois custa mais do que nascer certo. Decisão do Hugo em 26/08.

**Por que não reusar filas existentes:** `crm_mensagens_agendadas` é do CRM de
leads, está vazia e tem a trava de concorrência quebrada (o `UPDATE` para
`'enviando'` não filtra por status) — reusar seria herdar um bug conhecido.
`fila_relatorios_sol_hermes` é da bridge da Sol para grupos, com outro destino e
outra rota de envio.

**Por que não usar `pesquisa_evasao_mensagens` como fila:** ela é registro do que
**aconteceu**, e `processar-conversa-evasao` a lê para montar a análise. Uma linha
de mensagem ainda não enviada entraria nessa contagem e sujaria a análise da IA.
Ela continua sendo o **destino** do registro depois que a mensagem sai.

### RLS e grants

A tabela nasce com `revoke all from public, anon, authenticated` e recebe apenas
`select` para `authenticated`, com policy escopada por unidade no mesmo formato de
`aula_alunos_emusys` (`is_admin()` ou `unidade_id in (get_user_unidade_ids())`,
sempre dentro de `(select ...)` para virar InitPlan). Escrita apenas por
`service_role` e pelas RPCs `SECURITY DEFINER`.

**Validação obrigatória antes de fechar:** ler a tabela com
`set local role authenticated` + JWT real de admin, de usuária de unidade e de
usuária sem vínculo. Validar como `service_role` não vale — ele ignora RLS, e foi
exatamente isso que escondeu os dois incidentes anteriores de tabela nova sem
policy.

## 5. Enfileiramento

RPC `enfileirar_repescagem_evasao(p_pesquisa_ids uuid[])`, `SECURITY DEFINER`.

**O sorteio dos horários acontece aqui, não no envio** — assim a tela mostra o
plano inteiro antes de qualquer mensagem sair.

Regra:

- primeira mensagem em `now()` + jitter;
- cada seguinte soma um intervalo **aleatório entre 90 e 240 segundos**;
- horário que cair fora de **9h–19h BRT** ou em fim de semana pula para a próxima
  janela útil;
- teto de **30 por dia**; o excedente é agendado para o dia seguinte.

### Pré-condição: o 1º toque precisa ter saído, com confirmação

A RPC só enfileira pesquisa com `envio_status in ('enviado','entregue','lido')`.
A regra é escrita **pela positiva**, e não apenas como recusa do `incerto`: a
CHECK da coluna também admite `nao_enviado`, `enviando` e `falhou`, e nenhum
desses estados pode virar repescagem.

Na prática existem três camadas: não há linha em `pesquisa_evasao` sem envio; a
aba de follow-up só lista quem foi enviado há 72h ou mais; e esta guarda fecha o
caminho no banco, que é a única que vale.

### Guardas — recusas com motivo legível na tela

| Recusa | Motivo |
|---|---|
| `resposta_status = 'recusada_opt_out'` | pediu para não receber mais |
| `envio_status = 'incerto'` | não se sabe se a 1ª chegou; reconciliar antes |
| já respondeu (`coletando`, `pronta_para_revisao`, `em_revisao`, `revisada`) | sai da fila sozinha |
| já existe toque 2 | teto da régua |
| **mesmo telefone já respondeu por outro aluno** | ver abaixo |
| menos de 3 dias desde o 1º envio | ainda é cedo |

A guarda de telefone compartilhado vem de caso real: o telefone `...383015`
pertence a **dois irmãos** (Heitor e Miguel Alves da Rocha). A mãe respondeu uma
vez; o sistema fechou a pesquisa do Miguel e a do Heitor seguiu marcada como "sem
resposta". Sem essa guarda, ela receberia uma cobrança logo depois de responder.

A RPC devolve quantas entraram, quantas foram recusadas e o motivo de cada recusa.

## 6. Worker

Cron de 1 em 1 minuto → **ação nova dentro da edge `enviar-pesquisa-evasao`**
(não uma edge nova): envio de pesquisa continua com uma única fonte de escrita.
Duas fontes com regras próprias para o mesmo campo foi a causa-raiz das duplicatas
de renovação neste sistema.

Cada rodada:

1. **toma uma linha com claim atômico** —
   `update ... set status='enviando', worker_id=..., lease_expires_at=now()+'2 min'
   where status='pendente' and agendada_para <= now() ... returning`.
   Obrigatório: neste projeto um disparo de cron produz 2 a 4 execuções da edge,
   com ~0,6s entre elas. `SELECT` para checar e depois `UPDATE` falha — as três
   leem "livre";
2. **revalida as guardas** (a pessoa pode ter respondido durante a espera) e
   verifica se já existe mensagem de saída daquele toque;
3. renderiza o template pelo público (direto / responsável) e envia `/send/text`
   pelo `provider.ts` já existente;
4. registra o envio em `pesquisa_evasao_mensagens` com `direcao = 'saida'` — a
   coluna já existe na CHECK e nunca foi usada — e fecha a linha como `enviada`;
5. falha → `tentativas + 1` e backoff; 3 tentativas e para com o erro visível.

### Lease vencido não reenvia

Linha presa em `enviando` com lease expirado **não volta para `pendente`**: vira
`falhou` com motivo "enviou sem confirmação". Nenhum reenvio automático — é a
mesma política que a edge já aplica ao `envio_status = 'incerto'`. Entre mandar
duas vezes e não mandar, o sistema não manda; a decisão volta para uma pessoa.

## 7. Template

Duas linhas novas em `pesquisa_evasao_templates`, chave `evasao_repescagem`,
públicos `direto` e `responsavel`, mesmo mecanismo de placeholders.

O texto reconhece que já houve uma mensagem antes e pede pouco — a pesquisa
original pede um relato; a repescagem aceita uma frase. **Redação aprovada pelo
Hugo em 26/08/2026**; vale passar pela Fabi antes de subir.

Público **responsavel**:

> Oi, {{responsavel_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do
> Sucesso do Aluno da LA Music 🎵
>
> Sei que te escrevi outro dia e você deve estar corrido e não quero incomodar 🥹.
> Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os
> outros alunos.
>
> Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio
> também, do jeito que for mais fácil 🙏

Público **direto**:

> Oi, {{aluno_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do
> Sucesso do Aluno da LA Music 🎵
>
> Sei que te escrevi outro dia e você deve estar corrido e não quero incomodar 🥹.
> Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os
> outros alunos.
>
> Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio
> também, do jeito que for mais fácil 🙏

⚠️ O texto **não menciona o aluno** — por isso as duas versões só diferem no nome
de quem recebe, e `{{aluno_com_preposicao}}` não é usado aqui. Continuam sendo
dois templates (e não um) porque o público é resolvido antes da renderização e o
placeholder do nome é diferente em cada um.

## 8. Tela

Em `FilaFollowupEvasao`, ao lado de "Marcar realizado / Dispensar / Ir para a
conversa":

- botão **Repescar** por linha e **Repescar todos (N)** no topo;
- confirmação do lote mostrando quantos vão e quantos foram recusados, com motivo;
- badge de estado na linha: `na fila · sai ~14:32` · `enviando` ·
  `repescada 26/08` · `não elegível: já respondeu por outro aluno`;
- **Cancelar** enquanto o status for `pendente`.

## 9. Fora do escopo

- **Disparo automático da pesquisa original em D+1** — frente separada e, na
  avaliação técnica, de maior impacto: hoje o envio é 100% manual e atrasa ~30
  dias. Não existe cron para isso.

  Medido em 26/08/2026: desde 01/06 há **103 evasões elegíveis que nunca
  receberam a pesquisa** (CG 51, Recreio 41, Barra 11) — contra 37 enviadas.
  **74% das evasões elegíveis nunca foram pesquisadas.** A repescagem alcança 31
  pessoas que viram a mensagem e não responderam; esta frente alcança as 103 que
  não viram mensagem nenhuma.

- Terceiro toque da régua.
- Botões / opções tocáveis de motivo.
- Reversão de qualquer pesquisa já marcada como `incerto`.

## 10. Testes

Padrão do repo (`node --test tests/*.test.mjs`):

- sorteio respeita intervalo, janela 9h–19h, fim de semana e teto diário;
- cada guarda recusa o caso correspondente, incluindo o telefone compartilhado;
- dois workers concorrentes não obtêm a mesma linha (claim atômico);
- quem responde durante a espera não recebe a mensagem;
- lease vencido resulta em `falhou`, nunca em novo envio;
- RLS: leitura pelos três perfis com `set local role authenticated`.

## 11. Rollout

1. Migration + RPCs + worker entram com o cron **desligado**.
2. Template revisado e aprovado por Hugo e Fabi.
3. Primeiro envio real com **um caso só**, com OK explícito do Hugo. Nenhuma
   mensagem de teste sai para número de terceiro antes disso.
4. Liberação para a Jessyca depois do caso único confirmado.
5. Medir: taxa de resposta da repescagem contra os 11% da pesquisa original,
   contra pelo menos 20 casos antes de concluir qualquer coisa.
