# Relatório de presença consolidado para destinatário individual

**Data:** 2026-08-26
**Pedido:** Fabi Valdevino (administrativo, multi-unidade) quer receber, no privado, a relação diária dos alunos que ficaram sem presença lançada no dia anterior — para monitorar se as presenças estão sendo lançadas.

---

## 1. O que já existe (não reescrever)

O relatório **já roda em produção desde 13/08/2026** para os 3 grupos de unidade (RELATÓRIOS DIÁRIOS BR/CG/RC), às 9h BRT, sobre o dia anterior. 33 envios, zero erro.

Cadeia atual, **inteiramente no banco** — nenhuma edge function no caminho:

| Peça | Papel |
|---|---|
| `pg_cron` jobid 154 `relatorio-presenca-pendencias-9h` (`0 12 * * *` UTC) | dispara |
| `fn_enfileirar_relatorio_presenca(p_data, p_dry_run)` | descobre destino por unidade, pula unidade sem aula, enfileira |
| `fn_texto_relatorio_presenca(p_unidade_id, p_data)` | monta o texto **de uma unidade** |
| `fn_presenca_pendencias_do_dia(p_unidade_id, p_data)` | **fonte única da regra** de o que é pendência |
| `fila_relatorios_sol_hermes` (`status='sol_pendente'`) | fila de envio |
| `process-sol-report-queue.py` (cron do user `sol` na la-hq, 1 min, `flock`) | worker: envia e marca `enviada`/`erro` |
| `lareport_whatsapp_single.send_single_report` | bridge nativa da Sol → fallback UAZAPI caixa 3 |

A pergunta da Fabi — *"a Lia enviando a relação para as adms já está acontecendo?"* — tem resposta **sim**, mas hoje quem envia é a **Sol**. A caixa 3 (`Lia - Sucesso do Aluno`, número `552123425316`) é apenas o fallback usado quando a bridge nativa está fora do ar; daí a impressão de que é a Lia. Para a Fabi isso muda: ela recebe **pela Lia**, porque é do Sucesso do Aluno (§2).

O conteúdo que ela descreve é **exatamente** a seção que já existe (`⚠️ SEM PRESENÇA E SEM FALTA`, agrupada por professor, com hora / aluno / curso). Não há métrica nova a criar: o que falta é um destinatário.

## 2. Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde mora a lógica | **LA Report (banco)**, não a Lia na VPS | a automação já é toda do banco; a Lia tem crontab vazio e o Fábio roda sem systemd; a fila já dá retry, auditoria, idempotência e fallback; sai na mesma execução das 9h, sem criar um segundo horário que divirja do que as adms veem |
| Formato | **1 mensagem consolidada** com as 3 unidades em seções | ela quer conferir, não operar; uma leitura só |
| Unidade sem pendência | aparece com `✅ Tudo fechado.` | silêncio é ambíguo — ela não distinguiria "dia limpo" de "automação quebrada" |
| Dia sem aula em nenhuma unidade | **não envia nada** | domingo sem aula não gera relatório; ruído ensina a ignorar o canal (mesma regra já aplicada por unidade) |
| Seções | as **duas** (`sem presença e sem falta` + `respostas que não batem`) | conflito de lançamento é o mesmo problema por outro ângulo; é o que as adms já recebem |
| Cadastro do destinatário | linha em `whatsapp_destinatarios_relatorio` | tabela existente que já governa quem recebe admin/comercial; incluir o Alf amanhã vira `INSERT`, sem deploy |
| Quem envia | **a Lia** (caixa 3, `552123425316`), não a Sol | a Fabi é do Sucesso do Aluno e a caixa 3 tem `departamento = 'sucesso_aluno'` — o remetente segue o departamento de quem recebe, não a conveniência da fila. Ela **já está na `WHATSAPP_ALLOWED_USERS` da Lia**, então pode responder e ser atendida |
| Rota quando forçada | **sem fallback cruzado** | se a UAZAPI da Lia falhar, a linha vira `erro` em vez de sair pelo número da Sol; a Fabi vai justamente conferir quem manda, e trocar o remetente no dia da falha destrói a confiança no canal |

**Descartado — número fixo dentro da função:** colaborador troca de número ou sai, e a correção vira `CREATE OR REPLACE` de madrugada.

**Descartado por ora — migrar a descoberta dos grupos por unidade para a tabela.** Hoje `fn_enfileirar_relatorio_presenca` descobre o grupo de cada unidade lendo a própria fila (`grupo_nome ilike 'RELAT%DI%RIOS%'` do último envio `enviada`). É frágil: se a fila for limpa, a automação para em silêncio. Mas é um conserto próprio, com seu próprio teste — não pega carona no pedido da Fabi, que não depende dele.

## 3. Mudanças

### 3.1 DDL mínima

`fila_relatorios_sol_hermes.unidade_id` é `NOT NULL` com FK para `unidades`, e a linha consolidada não pertence a nenhuma unidade:

```sql
alter table public.fila_relatorios_sol_hermes alter column unidade_id drop not null;
```

Relaxar `NOT NULL` é permissivo: nenhuma escrita existente passa a falhar. O worker seleciona `unidade_id` mas **não o usa** — só `unidade_nome` aparece no log de auditoria. `unidade_nome` e `grupo_nome` seguem `NOT NULL` e recebem `'Consolidado'` e o nome do destinatário.

### 3.2 `fn_texto_relatorio_presenca_consolidado(p_data date) returns text`

Função nova. Itera as unidades que **tiveram aula** no dia (mesma condição já usada no enfileiramento), em ordem de nome, e para cada uma chama a **mesma** `fn_presenca_pendencias_do_dia`. A regra de o que conta como pendência continua existindo em um lugar só — duas fontes de escrita com regra própria para o mesmo número foi a causa-raiz das duplicatas de renovação; não se repete aqui.

Estrutura do texto: cabeçalho único com a data → uma seção por unidade (`🏢 NOME`, com as duas subseções ou `✅ Tudo fechado.`) → rodapé único.

### 3.3 `fn_enfileirar_relatorio_presenca` — bloco aditivo

Depois do loop atual, que fica **intocado**, acrescenta: se ao menos uma unidade teve aula no dia, para cada destinatário `ativo` de `whatsapp_destinatarios_relatorio` com `tipo = 'presenca_pendencias_consolidado'`, enfileira uma linha com `tipo_relatorio = 'presenca_pendencias_consolidado'`, `unidade_id = null` e `unidade_nome = 'Consolidado'`.

⚠️ **A idempotência é por `jid`, não por unidade.** O guard atual compara `unidade_id = v_u.unidade_id`; na linha consolidada `unidade_id` é `NULL` e `= NULL` nunca casa — o guard passaria sempre e a Fabi receberia uma mensagem por execução. O `not exists` do bloco novo usa `tipo_relatorio = 'presenca_pendencias_consolidado' and jid = d.jid and data_dia = p_data and status <> 'erro'`.

`p_dry_run = true` devolve o texto no JSON sem inserir nada, como já faz por unidade.

### 3.4 Quem envia: coluna `caixa_id` no destinatário

Hoje o worker sempre tenta a bridge nativa da Sol e só usa a UAZAPI da caixa 3 como
**fallback**. Para a Fabi o remetente precisa ser a Lia por definição, não por acidente de
indisponibilidade — então o destinatário passa a declarar por qual caixa sai:

```sql
alter table public.whatsapp_destinatarios_relatorio
  add column caixa_id integer null references public.whatsapp_caixas(id);
```

`null` = comportamento atual (bridge da Sol com fallback), preservando as linhas existentes.
Preenchido = envio direto por aquela caixa, sem fallback cruzado. Trocar quem envia vira um
`UPDATE`, sem deploy e sem tocar em código.

A função copia o valor para `metadata.caixa_id` da linha da fila, e o worker o lê dali.

**Mudanças na VPS** (user `sol`, com backup `.bak-<timestamp>-<motivo>` conforme o padrão da casa):

- `process-sol-report-queue.py` — incluir `metadata` no `select` da fila e repassar
  `caixa_id` ao envio. Hoje o `select` não traz esse campo.
- `lareport_whatsapp_single.py` — `send_single_report(jid, text, timeout=180, caixa_id=None)`.
  Com `caixa_id`, envia **só** pela UAZAPI daquela caixa; sem ele, mantém exatamente o
  comportamento atual. A validação de texto público continua acontecendo antes da escolha de rota.

Nada é alterado na VPS ou no perfil da Lia: a instância UAZAPI é na nuvem e as credenciais
da caixa 3 já vêm de `whatsapp_caixas`.

### 3.5 Dado

```sql
insert into public.whatsapp_destinatarios_relatorio (tipo, nome, jid, unidade_id, caixa_id, ativo)
values ('presenca_pendencias_consolidado', 'Fabi Valdevino (privado)',
        '5521994696489', null, 3, true);
```

## 4. Fora de escopo

- Migrar a descoberta dos grupos por unidade para a tabela (ver §2).
- Mudar o remetente dos 3 grupos de unidade: continuam saindo pela Sol, como hoje.
- Dar à Lia contexto sobre este relatório (ver §5).
- Qualquer tela no front.
- Paginação do texto: o pior dia histórico somou **2.745 caracteres** nas 3 unidades, contra teto de **16.000** no `send_single_report` — folga de 5,8×.

## 5. Riscos e guardas

| Risco | Guarda |
|---|---|
| Texto barrado pelo `validate_public_text` do worker (rejeita `get_*`, `RPC`, `snapshot`, `America/Sao_Paulo` e afins) | o texto só tem nome, hora, curso e emoji — nenhum termo técnico; conferido no dry-run antes de enviar |
| DM bloqueado por allowlist | `5521994696489` **já consta** em `WHATSAPP_ALLOWED_USERS` do perfil da Lia (20 números) |
| Mensagem duplicada a cada execução | idempotência por `jid` (§3.3) |
| UAZAPI da Lia fora do ar | linha vira `erro` e fica visível na fila; **não** cai para o número da Sol (§2) |
| Regressão nos 3 grupos de unidade | `caixa_id` nasce `null` nas linhas existentes e o caminho sem `caixa_id` é o código atual, sem desvio |
| A Fabi responder e a Lia não saber do que se trata | ela **está** na allowlist da Lia, então a resposta é atendida — mas a agente não tem contexto deste relatório. Aceito nesta fase: melhor uma resposta genérica da Lia do que uma mensagem vinda de um número que ninguém atende |
| Envio acidental sem aprovação | nada é enviado sem OK explícito do Hugo; o primeiro disparo é manual e conferido |

## 6. Validação

1. `select public.fn_enfileirar_relatorio_presenca(current_date - 1, true);` — dry-run, confere o texto consolidado sem inserir.
2. Conferir que o consolidado bate, unidade a unidade, com as 3 mensagens que as adms receberam no mesmo dia.
3. Provar que a rota forçada não contaminou o caminho antigo: um envio dos 3 grupos por unidade depois da mudança, ainda pela Sol.
4. Com OK do Hugo: primeiro envio real, conferindo com a Fabi que chegou **pelo número da Lia** (`552123425316`).
5. **Sinal de sucesso** (👁️ OBSERVAR por 5 dias úteis):

```sql
select data_dia, status, enviada_em, message_id
  from fila_relatorios_sol_hermes
 where tipo_relatorio = 'presenca_pendencias_consolidado'
 order by id desc limit 10;
```

Esperado: 1 linha por dia útil, `status = 'enviada'`, `message_id` preenchido.

**Fracasso:** `status = 'erro'`, ou 2+ linhas do mesmo `data_dia` (idempotência furada), ou nenhuma linha em dia que teve aula.
