# Lia — acompanhamento ativo da pesquisa de evasão

**Data:** 02/08/2026

**Status:** aprovada pelo Alf com fases A-D; fundação estrutural da Fase A
aplicada em produção com entregas produtivas bloqueadas; transporte reconciliado
em 03/08/2026; dispatcher implementado localmente, ainda sem adaptação remota,
piloto ou ativação

**Autoridade de produto:** Alf

**Posição no roadmap:** novo bloco **B.5**, depois do Subprojeto B e antes do Subprojeto C

**Escopo:** alertas privados, follow-up de três dias, histórico de resposta, KPI agregado e estados operacionais na tela

## 1. Decisão

A Lia passa a acompanhar ativamente a operação da pesquisa de evasão. A equipe
não deve depender de lembrar de abrir o LA Report para descobrir que uma família
respondeu ou que uma pesquisa precisa de follow-up.

O LA Report continua sendo a fonte canônica. A Lia:

1. detecta eventos e prazos a partir dos dados canônicos;
2. avisa individualmente quem enviou a pesquisa;
3. publica somente indicadores agregados no grupo;
4. leva a pessoa de volta à fila correta do sistema;
5. nunca transforma WhatsApp, Telegram ou texto gerado por IA na fonte do caso.

## 2. Objetivos

- Avisar a pessoa que enviou a pesquisa quando chegar uma resposta válida.
- Avisar com prioridade maior quando chegar uma rodada nova depois de uma
  revisão concluída.
- Aos três dias sem resposta válida, enviar à pessoa que fez o disparo um
  resumo privado das pesquisas que precisam de follow-up.
- Exibir no LA Report os estados `Enviado`, `Aguardando resposta` e
  `Follow-up pendente`.
- Registrar historicamente taxa e tempo de resposta sem misturar teste com
  produção.
- Preparar, mas não ativar sem nova decisão do Alf, um único follow-up
  automático para a família.

## 3. Não objetivos

- Classificar causas, sentimento, match ou divergência; isso permanece no
  Subprojeto C.
- Criar ação de retenção, encaminhamento pedagógico ou indicador de professor.
- Reestruturar todos os agentes da VPS.
- Migrar Sol e Fábio para o mesmo motor.
- Substituir a fila e a timeline do LA Report por conversas no WhatsApp.
- Enviar resposta, transcrição, áudio, telefone ou detalhe financeiro em alerta
  interno.
- Ativar o follow-up automático ao aluno nesta entrega sem aprovação adicional.

## 4. Evidência atual

A auditoria de 02/08/2026 foi somente leitura e confirmou o projeto de produção
`ouqwbbermlzqqvtqwlul`.

### 4.1 Pesquisa

- `pesquisa_evasao` já registra `executado_por_usuario_id`,
  `executado_por_auth_user_id`, `enviado_em`, `caixa_id`, modo de teste,
  opt-out, estados de resposta e conteúdo novo depois de revisão.
- As mensagens multipartes, transcrições e rodadas ficam nas tabelas do
  Subprojeto B.
- O default de novas pesquisas é `multipartes_v2`.
- Além das pesquisas de teste anteriores, Jéssica fez os dois primeiros envios
  produtivos em 03/08/2026, às 10:52 e 10:55 BRT. Ambos nasceram em
  `multipartes_v2` e estavam `sem_resposta` no preflight desta implementação.
- O histórico produtivo começa com esses dois casos. Nenhum teste anterior pode
  ser usado como baseline ou KPI.

### 4.2 Destino privado do operador

- A verificação somente leitura de 02/08/2026 confirmou os três usuários ativos,
  autenticados e com telefone normalizado no projeto de produção:
  - Alf (`usuarios.id=2`): `5521981278047`;
  - Jéssica (`usuarios.id=29`): `5521984695110`;
  - Fabi (`usuarios.id=30`): `5521994696489`.
- Esses valores serão seeds do cadastro governado de destino privado, com origem
  e data de verificação. Não serão fallback consultado em `usuarios.telefone`
  durante o envio.
- O número do Alf é o destino obrigatório do piloto ponta a ponta. Nenhum alerta
  real para Fabi ou Jéssica pode ser liberado antes dessa prova.
- Ausência, inatividade ou falha de um destino nunca autoriza fallback para
  grupo nem envio para outra pessoa.

### 4.3 Motores existentes

A auditoria somente leitura de 03/08/2026 confirmou que a Lia já possui um
caminho de saída produtivo e estável. Não é necessário criar um segundo bridge:

- `whatsapp_caixas.id=3` é a caixa canônica `Lia - Sucesso do Aluno`, ativa,
  usando `https://lamusic.uazapi.com` e o número de origem
  `+55 21 2342-5316`;
- a UAZAPI ainda apresenta o nome interno `Sol - Sucesso do Aluno`, mas o
  fingerprint da credencial é idêntico ao da caixa 3 e ao bridge da Lia. É
  somente uma divergência de nome, não compartilhamento de sessão;
- o número, a URL e o webhook com `caixa_id=3` coincidem entre o painel da
  UAZAPI e o banco. O perfil no provedor é `La Music`, com avatar da Lia;
- as instâncias `Maria Financeiro` (`5521989784688`), `Fábio Pedagógico`
  (`5521998250178`) e `Tom (LA Organizer)` (`5521997243082`) são canais
  distintos e não estão cadastradas em `whatsapp_caixas`;
- a caixa 1 `Mila teste` corresponde à instância UAZAPI ainda nomeada
  `teste sol`; a caixa 2 `Sol` usa WAHA, outro número e outra sessão;
- `notificar-primeira-aula-fabi`, acionada diariamente por `pg_cron`, envia
  direto por `POST /send/text` da UAZAPI para a Fabi;
- `disparar-pesquisa-1a-aula-auto` usa o mesmo caminho para avisos excepcionais
  da Fabi;
- `processar-matricula-emusys` chama `enviar-boas-vindas-matricula`, que usa a
  mesma caixa 3 para notificar a Jéssica;
- a produção registra 88 notificações confirmadas para as duas: 81 de nova
  matrícula para Jéssica, seis resumos de primeira aula e um alerta de
  auto-disparo para Fabi, todas com `whatsapp_message_id`;
- o Hermes da Lia também usa a mesma credencial e o mesmo número pelo bridge
  `3001`, principalmente para conversa e grupo. Ele não precisa participar da
  entrega da outbox da Fase A.

Os envios automáticos existentes não passam por `bi_messages_lamusic`, pelo
bridge da Sol ou pela fila do Fábio. São chamadas backend-to-provider da própria
caixa 3.

- `bi_messages_lamusic` possui quatro mensagens concluídas. Seu contrato é de
  conversa do agente BI: `conversation_id`, papel, conteúdo, SQL, resultado e
  estados `pending/processing/done/error`. Não possui destino WhatsApp,
  política de canal, referência de pesquisa ou idempotência por evento.
- A Edge `bi-agent-lamusic` está desativada e o próprio código informa que o
  processamento migrou para a Sol na VPS por `bi_messages_lamusic`.
- `fila_relatorios_whatsapp` tem transporte, tentativas e evidência, mas é uma
  fila de relatório agregado. O schema aceita somente `relatorio_admin` e
  `relatorio_comercial` e deduplica por tipo, unidade, JID e dia.
- `fila_relatorios_sol_hermes` tem 29 entregas e 3 erros, aceita referência e
  metadata e possui watchdog. Entretanto, seu contrato ainda usa nomes e
  unicidade de relatório/grupo, inadequados para vários alertas individuais no
  mesmo dia.
- As tabelas genéricas `notificacao_*` estão acopladas a projetos, guardam a
  mensagem integral e permitem gerenciamento amplo a qualquer usuário
  autenticado. Não são adequadas para respostas privadas de evasão.
- `whatsapp_destinatarios_relatorio` já governa destinos de relatórios em
  grupo, mas não possui destino privado do Sucesso do Aluno.

## 5. Alternativas consideradas

### 5.1 Usar `bi_messages_lamusic` para tudo

É a opção mais curta, mas mistura conversa de BI, eventos de negócio e
transporte. Não há destinatário, fila por canal, deduplicação por rodada nem
evidência de entrega. Uma mudança no agente poderia atrasar ou duplicar alertas.

**Decisão:** não usar.

### 5.2 Escrever diretamente nas filas de relatório atuais

Reaproveita workers existentes, mas força alertas privados em tabelas
desenhadas para um relatório por grupo/dia. A unicidade atual pode engolir a
segunda resposta recebida pelo mesmo operador no mesmo dia.

**Decisão:** não usar como fonte de evento. O transporte existente pode ser
reaproveitado somente por adaptador explícito.

### 5.3 Outbox canônico com o transporte existente da caixa 3

O domínio grava uma vez o evento e sua entrega. Uma Edge Function backend-only
reclama uma entrega por RPC atômica e envia diretamente pela caixa 3, usando o
mesmo `POST /send/text` da UAZAPI que já entrega notificações para Fabi e
Jéssica. O `pg_cron` apenas acorda o dispatcher; falha do canal não apaga nem
recria o evento.

**Decisão aprovada:** esta opção. Ela preserva a outbox, o destino governado e a
auditoria, mas elimina rota nova no bridge, worker Python, service e timer da
VPS. O reaproveitamento é do transporte produtivo real da Lia, não de uma fila
de BI ou relatório.

### 5.4 Criar `POST /send-alert` no bridge 3001

Funcionaria, mas duplicaria o caminho backend-to-provider que já existe e
criaria mais quatro peças operacionais: rota, worker Python, service e timer.
Também exigiria hardening do bridge antes de entregar valor.

**Decisão:** rejeitada após auditoria. O rascunho local não será instalado e
deve ser removido antes do commit da nova implementação.

## 6. Fontes e granularidade

### 6.1 Fonte canônica

- Pesquisa, envio, opt-out e operador: `pesquisa_evasao`.
- Evento recebido: `pesquisa_evasao_mensagens`.
- Rodada e revisão: `pesquisa_evasao_analises`.
- Transcrição: `pesquisa_evasao_transcricoes`.
- Aluno e unidade: snapshots da pesquisa; o alerta não refaz join por nome.
- Pessoa interna: `usuarios.id`, resolvida por
  `executado_por_usuario_id`; `executado_por_auth_user_id` serve como evidência
  adicional, não como substituto silencioso.

O grão operacional é **uma pesquisa**. O grão de resposta é **uma rodada da
pesquisa**. O grão de entrega é **um evento para um destinatário e canal**.

### 6.2 Novos contratos conceituais

A implementação deverá separar três conceitos:

1. **Evento operacional:** fato imutável, por exemplo
   `resposta_nova`, `rodada_nova_pos_revisao` ou `followup_3d_vencido`.
2. **Entrega interna:** tentativa de avisar uma pessoa ou um grupo, com destino
   validado, status, tentativas, template e evidência do provedor.
3. **Snapshot de KPI:** agregado histórico por coorte e horário de corte.

Os nomes físicos das tabelas serão definidos no plano, mas o contrato não pode
reusar `bi_messages_lamusic` nem `notificacao_log` como fonte desses fatos.

### 6.3 Destinos

- Destino privado: cadastro governado por `usuarios.id`, com JID/telefone
  validado, ativo, origem e data de verificação.
- Destino de grupo: configuração explícita de relatório do Sucesso do Aluno.
- `usuarios.telefone` pode ajudar no provisionamento inicial, mas não deve ser
  fallback silencioso em tempo de execução.
- O destino efetivamente usado fica congelado na entrega, sem ser exibido em
  lista geral.

## 7. Regra de canal

### 7.0 Propriedade permanente dos canais

Cada agente é proprietário do seu canal de saída e não compartilha número,
sessão nem fila de envio com outro agente:

- Lia: Sucesso do Aluno, caixa 3, número `+55 21 2342-5316`; o dispatcher da
  outbox envia direto pela UAZAPI e o Hermes conversacional continua no bridge
  próprio em `127.0.0.1:3001`;
- Sol: administrativo, bridge próprio em `127.0.0.1:3000` e sessão própria;
- Fábio: professores e coordenação, bridge próprio em `127.0.0.1:8657` e sessão
  própria.

As Fases B, C e D preservam essa fronteira. Uma indisponibilidade da Sol não
pode parar alertas, follow-ups ou KPI do Sucesso do Aluno; uma indisponibilidade
da Lia não pode ser contornada silenciosamente pelo número da Sol.

### 7.1 WhatsApp privado

Vão para o WhatsApp privado da pessoa que enviou:

- primeira resposta válida da família;
- opt-out da família;
- rodada nova depois de revisão concluída;
- resumo das pesquisas sem resposta após três dias;
- erro operacional que exige ação daquela pessoa.

O destinatário é **somente** `executado_por_usuario_id`, congelado na pesquisa
original. Não existe notificação cruzada: Fabi não recebe os casos enviados por
Jéssica, Jéssica não recebe os casos enviados por Fabi e nenhuma das duas
recebe o conjunto completo por conveniência.

Esses avisos não são encaminhados ao grupo quando o destino privado está
ausente ou falha. Se o operador estiver inativo, ausente ou sem destino
verificado, o evento fica visível em uma fila administrativa de entrega; nunca
é redirecionado para o grupo ou para outro operador.

### 7.2 Grupo

Vão para o grupo:

- KPI agregado do período;
- taxa de resposta;
- quantidade sem resposta após três dias;
- tempo de resposta;
- tendência em relação ao período anterior.

O grupo nunca recebe nome do aluno ou responsável, telefone, texto, áudio,
transcrição, motivo individual ou link para uma resposta específica.

### 7.3 Telegram

Telegram não é fonte nem destino definitivo deste bloco. Durante uma transição
controlada, o relatório antigo pode permanecer sem duplicar os novos avisos. A
desativação ou manutenção do Telegram pertence ao Subprojeto E.

## 8. Gatilhos

### 8.1 Primeira resposta de uma rodada

O alerta nasce uma única vez por `pesquisa + versão da rodada` quando surge o
primeiro conteúdo substantivo resolvido ou um opt-out.

- Vários textos e áudios da mesma rodada geram um único alerta.
- Se a rodada sucede uma versão já revisada, o gatilho prioritário da seção
  8.2 substitui este alerta geral; os dois nunca são enviados para a mesma
  rodada.
- Abertura de conversa e adiamento não contam como resposta válida.
- Áudio só aciona resposta válida depois de persistido e classificado; falha de
  transcrição não apaga o evento.
- `modo_teste=true` não gera alerta produtivo. Testes usam destino e métricas
  isolados.

Chave idempotente recomendada:
`resposta_nova:{pesquisa_id}:{analise_versao}`.

### 8.2 Rodada nova depois de revisão

Quando uma versão anterior já está `revisada` e uma nova rodada recebe conteúdo
substantivo ou opt-out:

- a pesquisa volta à fila de revisão pelo contrato do Subprojeto B;
- nasce um alerta privado de prioridade alta;
- a versão revisada permanece imutável;
- apenas um alerta é emitido para a nova versão.

Chave idempotente recomendada:
`rodada_pos_revisao:{pesquisa_id}:{analise_versao}`.

### 8.3 Follow-up de três dias para a equipe

Uma pesquisa entra na fila de follow-up ao completar 72 horas desde
`enviado_em` quando:

- o envio foi confirmado;
- não é teste;
- não existe resposta válida;
- não existe opt-out;
- nenhum follow-up foi concluído ou dispensado.

O aviso é um resumo privado por operador, não uma mensagem por aluno. O ciclo
agrupa no máximo dez nomes e informa quantos casos adicionais existem, sempre
com link para a fila filtrada.

Uma interação não substantiva mantém o caso na fila, mas ganha o rótulo
`Interagiu sem resposta válida`. Para o eventual follow-up automático à
família, qualquer interação recebida bloqueia o disparo até decisão humana.

Chave idempotente recomendada:
`followup_3d_operador:{usuario_id}:{data_corte_brt}`.

### 8.4 KPI histórico

Um snapshot diário fecha as métricas com horário de corte e versão da regra. A
cadência de publicação no grupo depende da decisão do Alf.

## 9. Conteúdo das mensagens internas

### 9.1 Resposta nova — privado

```text
🔔 *Resposta recebida — Pesquisa de evasão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família respondeu à pesquisa que você enviou. O conteúdo permanece protegido no LA Report.

👉 {{link_sucesso_aluno}}
```

### 9.2 Rodada nova depois de revisão — privado

```text
🔔 *Nova rodada após revisão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família enviou novo conteúdo depois da revisão. O caso voltou para a fila e precisa de uma nova leitura.

👉 {{link_sucesso_aluno}}
```

### 9.3 Opt-out — privado

```text
🔕 *Família recusou novos contatos — Pesquisa de evasão*

Aluno: {{aluno_nome}}
Unidade: {{unidade_nome}}

A família pediu para não receber novas mensagens desta pesquisa. O caso foi bloqueado para follow-up.

👉 {{link_sucesso_aluno}}
```

O alerta não expõe o texto exato usado pela família.

### 9.4 Follow-up de três dias — privado

```text
⏰ *Pesquisas aguardando follow-up — 3 dias*

Você tem {{total}} pesquisa(s) enviada(s) sem resposta válida:

{{lista_aluno_unidade_data_envio}}

{{quantidade_restante}}
👉 {{link_fila_followup}}
```

A lista contém somente aluno, unidade e data de envio. Não contém telefone,
motivo da saída nem resposta.

### 9.5 KPI — grupo

```text
📊 *Pesquisa de evasão — {{periodo}}*

Enviadas: {{enviadas}}
Respostas válidas: {{respondidas}} ({{taxa_resposta}})
Sem resposta após 3 dias: {{sem_resposta_d3}}
Tempo mediano até a resposta: {{tempo_mediano}}
Opt-outs: {{opt_outs}}

Comparação com o período anterior: {{tendencia}}
Metodologia: {{versao_regra}}
```

O relatório não lista casos individuais.

## 10. Estados visíveis na interface

O estado exibido é derivado do envio, da resposta e do follow-up; não substitui
os estados técnicos do Subprojeto B.

| Estado visível | Regra |
|---|---|
| Enviado | Provedor confirmou o envio; exibir também data, hora e operador |
| Aguardando resposta | Enviado, sem resposta válida, opt-out ou prazo D+3 vencido |
| Follow-up pendente | Prazo D+3 vencido e caso ainda elegível |
| Follow-up avisado | Alerta privado entregue ao operador |
| Follow-up realizado | Ação manual registrada ou follow-up automático confirmado |
| Interagiu sem resposta válida | Houve abertura/adiamento, sem conteúdo analisável |
| Respondendo | Rodada multipartes em coleta |
| Pronta para revisão | Rodada fechada e disponível na fila |
| Nova rodada | Conteúdo novo depois de revisão anterior |
| Revisada | Última rodada concluída e sem conteúdo novo |
| Opt-out | Família recusou contato; nenhum follow-up permitido |

A linha mantém um selo de auditoria `Enviado em ... por ...` mesmo quando o
estado principal já mudou para `Aguardando resposta` ou `Follow-up pendente`.

A tela deve oferecer filtro e contador para `Follow-up pendente`. A resolução
manual registra operador, horário, canal e resultado, sem apagar o vencimento.

## 11. Histórico e indicadores

### 11.1 Denominador

Entram no denominador apenas pesquisas produtivas com envio confirmado.

Ficam fora:

- `modo_teste=true`;
- envio falho, incerto ou não enviado;
- duplicata impedida por idempotência;
- pesquisa cancelada antes do envio.

### 11.2 Resposta

Resposta válida é a primeira interação substantiva da família. Opt-out e
abertura/adiamento são registrados separadamente e não inflam a taxa.

Métricas mínimas:

- total enviado;
- total com resposta válida;
- taxa de resposta por coorte de envio;
- resposta em até 24 horas e em até 72 horas;
- sem resposta em D+3;
- tempo mediano e percentil 75 até a primeira resposta válida;
- opt-out;
- follow-up devido, realizado e convertido em resposta;
- respostas tardias e rodadas novas depois de revisão.

“Ignorou” não é armazenado como julgamento permanente. O dado oficial é
`sem_resposta_d3` ou `sem_resposta_d7`, sempre com janela explícita.

### 11.3 Coorte e snapshot

- A coorte é definida por `enviado_em`, em `America/Sao_Paulo`.
- Coortes ainda dentro da janela aparecem como parciais.
- Cada snapshot guarda início, fim, corte, versão da regra, total elegível e
  contagens.
- Métricas agregadas podem ser preservadas historicamente; eventos privados
  seguem a política de retenção da pesquisa.
- Mudança de regra cria nova versão e nunca reescreve snapshot fechado.

## 12. Follow-up automático à família — desenho proposto, não autorizado

### 12.1 Regra recomendada

Se o Alf ativar a automação, a Lia poderá realizar uma única tentativa ao
completar três dias, desde que:

- o envio original esteja confirmado;
- a pesquisa não seja teste;
- não exista resposta válida, opt-out ou qualquer interação posterior ao
  envio;
- não exista follow-up anterior manual ou automático;
- o destinatário e o `caixa_id` sejam os snapshots da pesquisa original;
- o horário esteja entre 08:00 e 20:00 BRT;
- exista template ativo, versionado e aprovado para o público correto;
- a tentativa use chave idempotente única por pesquisa;
- o registro identifique `origem=lia_automatica`, sem atribuir a ação a Fabi,
  Jéssica ou outra pessoa.

O motor não troca telefone, responsável ou caixa com dados atuais. Divergência
de snapshot bloqueia e encaminha para a equipe.

As 72 horas são corridas. Qualquer interação não substantiva recebida bloqueia
a automação e encaminha o caso para decisão humana. Não existe silêncio
adicional além da janela diária de 08:00 a 20:00 BRT.

### 12.2 Cópia candidata — adulto

```text
{{aluno_primeiro_nome}}, esta é uma mensagem automática de acompanhamento da LA Music. 🎵

Passando apenas para lembrar da pergunta que enviamos sobre a sua experiência com a gente. Sua resposta é muito importante para melhorarmos.

Se quiser responder, pode mandar texto ou áudio. Se preferir não responder, tudo bem — não enviaremos outro lembrete.
```

### 12.3 Cópia candidata — responsável

```text
{{responsavel_primeiro_nome}}, esta é uma mensagem automática de acompanhamento da LA Music. 🎵

Passando apenas para lembrar da pergunta que enviamos sobre a experiência de {{aluno_primeiro_nome}} com a gente. Sua resposta é muito importante para melhorarmos.

Se quiser responder, pode mandar texto ou áudio. Se preferir não responder, tudo bem — não enviaremos outro lembrete.
```

As cópias acima são proposta de produto, não texto aprovado para produção.

### 12.4 Entrega e falha

- Existe uma única tentativa de negócio.
- Retry técnico só é permitido quando o provedor prova que não aceitou a
  mensagem e a mesma chave idempotente é preservada.
- Timeout ou resultado ambíguo não é reenviado automaticamente; o caso vai para
  conferência humana.
- Resposta que chega entre o claim e o envio cancela a tentativa.
- O evento guarda template, versão, destino snapshot, caixa, horário,
  `provider_message_id`, resultado e erro sanitizado.

## 13. Arquitetura recomendada

### 13.1 Plano de domínio — Supabase

Responsável por:

- detectar e registrar eventos idempotentes;
- resolver o operador original;
- manter estado do follow-up;
- fornecer read models da fila e dos KPIs;
- registrar snapshots históricos;
- produzir entregas estruturadas, sem dar ao agente acesso bruto às respostas.

### 13.2 Plano de transporte — Edge Function e `pg_cron`

Responsável por:

- ser invocada somente por `service_role`, com `verify_jwt=true`;
- reclamar no máximo uma entrega pronta por chamada usando a RPC atômica;
- usar obrigatoriamente `caixa_id=3`, sem fallback para outra caixa;
- enviar uma única mensagem por `POST /send/text` da UAZAPI;
- concluir somente com HTTP aceito e `message_id` não vazio;
- registrar sucesso ou erro sanitizado na outbox;
- não aplicar retry automático depois da chamada ao provedor;
- nunca decidir se o evento existe ou quem deve recebê-lo.

O `pg_cron` chama a Edge Function em intervalo curto usando uma credencial de
serviço armazenada no Vault, nunca escrita na migration. Antes do piloto, a Edge
é publicada, mas não existe cron produtivo e
`alertas_producao_liberados=false`. O piloto chama o dispatcher com um
`alerta_id` específico para impedir consumo de qualquer outra entrega.

O dispatcher usa o transporte já comprovado da caixa 3. Não chama os bridges
`3001`, `3000` ou `8657`, não escreve em `fila_relatorios_sol_hermes` e não
mantém sessão própria. Timeout, conexão encerrada depois do POST, JSON inválido,
HTTP aceito sem ID ou outro resultado ambíguo nunca são reenviados
automaticamente. Logs contêm apenas IDs internos, tipo, ambiente, status e
duração.

### 13.3 Relatório de grupo

O KPI agregado pode aproveitar `fila_relatorios_whatsapp` e
`whatsapp_destinatarios_relatorio` depois de incluir um tipo versionado próprio
e destino autorizado do Sucesso do Aluno. A geração do KPI fica fora da função
de transporte, e a publicação desse KPI continua saindo pelo canal da Lia. A
Sol publica somente relatórios administrativos pelo canal da Sol.

### 13.4 Papel da Lia

A Lia consome um read model governado de eventos e agregados. Ela não recebe
texto bruto, áudio ou transcrição para decidir canal ou destinatário. A cópia
operacional vem de template determinístico; IA pode explicar tendências em
relatório posterior, nunca criar o fato nem autorizar o envio.

## 14. Segurança, privacidade e observabilidade

- Somente serviço autorizado cria e reclama entregas.
- Usuário interno não lê a tabela de destinos privados nem a fila bruta.
- Alertas privados contêm apenas aluno, unidade, natureza do evento e link para
  a tela autenticada do Sucesso do Aluno.
- Grupo contém somente agregado.
- Links exigem login normal no LA Report e não carregam token público.
- Logs técnicos usam IDs internos, tipo, status, tentativa e correlation ID;
  não incluem resposta, transcrição, áudio, telefone, JID ou segredo.
- Conteúdo renderizado e destino snapshot da notificação têm acesso restrito e
  são expurgados após 30 dias; metadados técnicos de evento e entrega permanecem
  para auditoria sem conservar telefone ou cópia da mensagem.
- Cada entrega registra evento, destinatário, canal, template, versão, status,
  tentativas, horário e ID do provedor.
- Destino ausente, inativo ou não verificado é falha visível; não há fallback
  para grupo ou para outro número.
- Operador original inativo encaminha a entrega para a fila administrativa,
  sem notificar outro operador e sem publicar o caso no grupo.
- Notificação falha não altera o estado canônico da pesquisa.

## 15. Fronteira com o Subprojeto E

Este bloco absorve somente a menor fatia necessária do E:

- inventário do transporte já usado pela caixa 3;
- configuração de destinos privados e do grupo do Sucesso do Aluno;
- health, retry, idempotência e evidência do dispatcher da Lia;
- registro explícito de que Lia, Sol e Fábio não compartilham sessão nem fila.

Permanecem no Subprojeto E:

- inventário completo de Lia, Sol, Fábio e Hermes;
- decisão global Telegram versus WhatsApp;
- unificação de filas entre agentes;
- governança de prompts, processos e secrets da VPS;
- canais e relatórios que não pertencem à pesquisa de evasão.

Assim, o B.5 não espera o E inteiro, mas também não transforma uma correção de
pesquisa em reescrita geral dos agentes.

## 16. Decisões ainda reservadas ao Alf

Somente três decisões permanecem abertas:

1. ativar ou não o follow-up automático à família;
2. aprovar as duas cópias do follow-up automático, para adulto e responsável;
3. definir o grupo oficial do Sucesso do Aluno e a cadência do KPI.

Já estão decididos e não voltam como gate de produto: 72 horas corridas; janela
de 08:00 a 20:00 BRT; qualquer interação não substantiva bloqueia automação;
uso da mesma caixa e do destino snapshot; resultado ambíguo do provedor não é
reenviado; operador inativo vai para fila administrativa, nunca para o grupo.

## 17. Ordem de implementação aprovada

### Fase A — eventos e alertas privados

- outbox idempotente para `resposta_nova`, `rodada_nova_pos_revisao` e
  `opt_out`;
- cadastro governado dos destinos privados por `usuarios.id`;
- entrega somente a quem enviou a pesquisa;
- fila administrativa para operador inativo, destino ausente ou falha final;
- observabilidade sem conteúdo da resposta ou telefone em log;
- piloto ponta a ponta no número do Alf antes de liberar Fabi e Jéssica.

Esta fase entrega o primeiro valor operacional e não depende de estado ou filtro
novo na interface.

### Fase B — follow-up de 72 horas para a equipe

- elegibilidade e fila de follow-up;
- resumo privado por operador;
- estados e filtro de follow-up na tela;
- registro manual de conclusão ou dispensa;
- qualquer interação não substantiva exige decisão humana.

### Fase C — histórico, coortes e KPI agregado

- snapshots históricos versionados;
- taxa e tempo de resposta por coorte;
- relatório agregado e sem PII no grupo oficial;
- publicação somente depois de definidos grupo e cadência.

### Fase D — follow-up automático opcional

Somente depois das duas decisões de conteúdo e ativação da seção 16, com dry-run,
número interno, uma única tentativa, janela de 08:00 a 20:00 BRT e autorização
explícita de rollout.

Depois dessas fases, o Subprojeto C pode classificar causas e transformar
respostas revisadas em ações sem precisar resolver novamente alerta, prazo ou
canal.

### Melhorias posteriores, fora da Fase A

- deep link que abre automaticamente a subaba Evasão e expande a pesquisa exata;
- ajuste da interface para não mostrar a lista de mensagens e a consolidação da
  rodada como conteúdo duplicado, deixando a consolidação recolhida por padrão
  ou oferecendo-a como texto corrido para copiar.

Na primeira versão, o alerta abre somente a tela do Sucesso do Aluno. A pessoa
localiza o caso pela lista. Isso preserva o valor principal da Fase A — avisar
rapidamente — sem exigir deploy de quatro componentes de frontend.

## 18. Testes obrigatórios

1. Três fragmentos da mesma rodada geram um alerta privado, não três.
2. Rodada nova depois de revisão gera novo alerta e preserva o anterior.
3. Teste não gera alerta ou KPI produtivo.
4. Opt-out gera aviso privado e bloqueia todo follow-up.
5. Abertura ou adiamento não infla taxa de resposta.
6. D+3 usa `enviado_em` e timezone BRT.
7. Resposta concorrente remove o caso da fila antes do envio de follow-up.
8. Operador sem destino verificado produz falha visível e não usa o grupo.
9. Duas respostas no mesmo dia para o mesmo operador não colidem.
10. Retry não duplica mensagem aceita pelo provedor.
11. Resultado ambíguo do follow-up automático não é reenviado.
12. KPI não contém nomes, telefones, motivos ou conteúdo.
13. Coorte parcial é identificada como parcial.
14. Mudança de regra cria nova versão sem reescrever snapshot fechado.
15. `bi_messages_lamusic` não participa do transporte.
16. Falha da Edge, do `pg_cron` ou do provedor não perde evento; recuperação
    respeita idempotência e não reenvia resultado ambíguo.
17. Alerta contém link autenticado para a tela do Sucesso do Aluno, sem token,
    resposta ou identificador sensível na URL.
18. Pessoa inativa não recebe mensagem e o caso entra na fila administrativa.
19. Fabi recebe somente eventos de pesquisas enviadas por Fabi; Jéssica recebe
    somente eventos de pesquisas enviadas por Jéssica.
20. Os três destinos seedados correspondem aos IDs 2, 29 e 30, guardam origem e
    data de verificação e não são resolvidos por fallback em `usuarios.telefone`.
21. O primeiro envio ponta a ponta usa exclusivamente o destino governado do
    Alf; Fabi e Jéssica permanecem bloqueadas até o aceite desse piloto.

## 19. Critérios de aceite

- Fabi e Jéssica recebem individualmente e somente os alertas das pesquisas que
  cada uma enviou.
- O grupo recebe somente KPI agregado.
- Nova rodada pós-revisão é avisada uma única vez e volta à fila.
- Toda pesquisa produtiva enviada aparece como aguardando ou follow-up devido.
- D+3 é auditável e não depende de alguém abrir a plataforma.
- Taxa e tempo de resposta ficam preservados por coorte e versão.
- Modo teste permanece isolado.
- Nenhuma resposta privada sai do LA Report na notificação.
- Follow-up automático permanece desligado até aprovação própria do Alf.
- Falha de WhatsApp não altera nem perde o fato canônico.

## 20. Riscos residuais

- O cadastro governado `lia_destinos_privados` e seus três seeds já existem em
  produção. O bloqueio restante é intencional: não há dispatcher publicado,
  cron nem liberação produtiva.
- Os destinos da Fabi e da Jéssica ainda estão hardcoded nas Edge Functions
  `notificar-primeira-aula-fabi`, `disparar-pesquisa-1a-aula-auto` e
  `enviar-boas-vindas-matricula`. Depois da Fase A, esses fluxos devem migrar
  para leitura de `lia_destinos_privados`; isso é dívida separada e não será
  alterado neste rollout.
- A UAZAPI nomeia internamente a instância da caixa 3 como
  `Sol - Sucesso do Aluno`, embora a credencial e o número sejam da Lia. Renomear
  em uma janela tranquila para evitar nova confusão. Renomear também `teste sol`
  para refletir a caixa 1; nenhuma dessas ações muda token, número ou sessão.
- O instance token da caixa 3 foi exibido integralmente em um print desta
  auditoria. Rotacioná-lo em janela coordenada, atualizando todos os
  consumidores e provando o envio da Lia; não rotacionar por improviso durante
  o rollout da Fase A.
- A chamada agendada da Edge exigirá a credencial de serviço no Vault. A
  auditoria confirmou que ela ainda não existe; o provisionamento é gate manual
  do rollout e o valor nunca entra em Git, migration ou log.
- O transporte da Sol não é fallback da Lia. A queda atual da sessão Sol/Hermes
  é incidente administrativo independente, sob responsabilidade do Alfredo.
- `fila_relatorios_whatsapp` apresentou histórico relevante de erros e precisa
  de health e prova de entrega antes de receber o KPI do Sucesso do Aluno.
- “Sem resposta” é uma observação temporal, não causa de evasão nem julgamento
  sobre a família.

### 20.1 Estado reconciliado da Fase A

- A migration estrutural foi aplicada em produção sob a versão remota
  `20260803124754`; ela criou outbox, destinos governados, produtor por rodada,
  claim atômico, desfechos terminais, fila administrativa e piloto restrito.
- A produção permanece bloqueada por `alertas_producao_liberados=false` e não
  existe migration de ativação. Eventos reais criados antes dela ficam em
  `aguardando_liberacao`, fora do claim do dispatcher.
- O worker Python, as units e o rascunho de `POST /send-alert` foram removidos;
  nenhum deles foi instalado na VPS.
- A adaptação `20260803210000_lia_alertas_dispatcher_edge.sql` e o dispatcher
  `processar-alertas-lia` existem e estão testados localmente, mas não foram
  aplicados ou publicados. O cron de consumo continua inexistente.
- A fixture PostgreSQL 17 e os testes de contrato da fundação cobrem
  idempotência, isolamento de destinatário, ausência de fallback, janela BRT e
  não reenvio ambíguo. Os testes do dispatcher cobrem uma única chamada ao
  provedor, `message_id` obrigatório, caixa 3 exclusiva e logs sanitizados.
- A Fase A não altera `webhook-whatsapp-inbox`; enquanto a produção estiver
  bloqueada, a equipe acompanha respostas reais diretamente na tela.
- O nome de `usuarios.id=29` foi corrigido para `Jéssica` sem reescrever os
  snapshots dos dois envios já realizados.
- O rollout é governado por
  `docs/runbooks/lia-acompanhamento-ativo-fase-a-rollout.md` e para antes do
  primeiro piloto.
- Deep link exato e ajuste visual da consolidação duplicada permanecem fora da
  Fase A.

## 21. Arquivos e contratos relacionados

- `docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md`
- `docs/superpowers/plans/2026-07-30-pesquisa-evasao-subprojeto-b-conversa-multipartes.md`
- `docs/runbooks/pesquisa-evasao-subprojeto-b-rollout.md`
- `supabase/functions/webhook-whatsapp-inbox/`
- `supabase/functions/processar-conversa-evasao/`
- `supabase/functions/processar-mensagens-agendadas/`
- `supabase/functions/bi-agent-lamusic/`
- `scripts/process-sol-report-queue.py`
- `pesquisa_evasao`
- `pesquisa_evasao_mensagens`
- `pesquisa_evasao_analises`
- `pesquisa_evasao_transcricoes`
- `bi_messages_lamusic`
- `fila_relatorios_whatsapp`
- `fila_relatorios_sol_hermes`
- `whatsapp_destinatarios_relatorio`
