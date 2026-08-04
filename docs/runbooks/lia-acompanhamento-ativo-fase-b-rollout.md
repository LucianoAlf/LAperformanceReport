# Lia Fase B — rollout do follow-up de 72 horas

## Estado inicial

- projeto de produção: `ouqwbbermlzqqvtqwlul`;
- Fase A ativa e saudável, com caixa 3, outbox, dispatcher e cron por minuto;
- Fase B bloqueada por `followup_72h_liberado=false`;
- nenhum novo cron, bridge, fila de relatório ou webhook inbound faz parte do
  rollout;
- o follow-up automático à família permanece desligado;
- caso real de aceite: pesquisa de Ezequiel FernandoFerreira de almeida,
  vencimento em 06/08/2026 10:55:54 BRT e primeiro resumo elegível em
  07/08/2026 09:00 BRT.

## Cadência aprovada

- a fila da tela muda exatamente em `enviado_em + 72 hours`;
- o WhatsApp recebe um resumo por operador e por dia, às 09:00 BRT;
- o resumo agrupa tudo que venceu desde o resumo anterior;
- a idempotência diária usa
  `followup_3d_operador:{usuario_id}:{YYYYMMDD}`;
- um caso que vence depois do resumo diário permanece visível na tela e entra
  no resumo do dia seguinte;
- o texto lista no máximo dez alunos, informa a quantidade restante e leva à
  fila filtrada.

## Restrições antes do rollout

- não aplicar migration, publicar Edge ou frontend sem autorização do Alf;
- não criar a migration de ativação antes do piloto aceito;
- não tocar em `webhook-whatsapp-inbox` ou `enviar-pesquisa-evasao`;
- não enviar follow-up automático à família;
- preservar os alertas da Fase A mesmo se o produtor da Fase B falhar.

## Gates previstos

1. migration estrutural com `followup_72h_liberado=false`;
2. Edge compatível e produtor inerte;
3. frontend depois das RPCs;
4. piloto exclusivo no destino governado do Alf;
5. diff e hash da migration de ativação;
6. ativação e observação do primeiro resumo real.

## Rollback direcionado

O primeiro passo de contenção é definir `followup_72h_liberado=false`. Em caso
de regressão da Edge, republicar a versão anterior de `processar-alertas-lia`.
As ações manuais, resumos e itens já auditados não são apagados pelo rollback.

## Evidências locais

### Pacote preparado em 03/08/2026

- migration estrutural:
  `supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql`;
- tamanho: `34609 bytes`;
- SHA-256:
  `f96edb6492ba8845e4f61576524f064b7acbb9fcc505c2b4a3dc81ba0bedd21c`;
- a migration adiciona `followup_72h_liberado` com `default false` e não
  altera o valor para `true`;
- não existe migration de ativação no pacote local;
- nenhum novo cron é criado: o produtor diário é acordado pelo dispatcher da
  Fase A e só produz entre `09:00:00` e `09:00:59` BRT;
- o dispatcher trata falha do produtor como diagnóstico sanitizado e continua
  reclamando alertas da Fase A;
- nenhuma alteração foi feita em `webhook-whatsapp-inbox` ou
  `enviar-pesquisa-evasao`.

### Provas automatizadas

- suíte Node focada: `29 passed`, `0 failed`, `2 skipped`; os dois skips eram
  somente as fixtures PostgreSQL sem variável de container naquele processo;
- suíte Deno do dispatcher: `15 passed`, `0 failed`;
- `deno check supabase/functions/processar-alertas-lia/index.ts`: aprovado;
- `npm run build`: aprovado, mantendo apenas os avisos preexistentes de chunks
  e reexport do Recharts;
- fixture isolada em PostgreSQL 17: `6 passed`, `0 failed`, incluindo execução
  real de `tests/fixtures/lia_followup_72h_fase_b_pg17.sql`;
- a fixture prova prazo exato de 72 horas, resumo diário, idempotência por
  operador/data, isolamento entre operadores, interação não substantiva ainda
  pendente, exclusão de teste/resposta válida/opt-out, auditoria manual e
  cancelamento quando chega resposta antes do claim.

O container descartável `pesquisa-evasao-pg17-faseb` foi usado apenas para a
fixture local e removido ao final da verificação.

### Interface e smoke

- frontend usa somente
  `listar_followups_pesquisa_evasao_v1`,
  `contar_followups_pesquisa_evasao_v1` e
  `registrar_followup_pesquisa_evasao_v1`;
- não há escrita direta em `pesquisa_evasao_followup_acoes`;
- o link `?destino=pesquisas-evasao&filtro=followup_pendente` seleciona a área
  e o filtro da fila;
- o painel exibe contador, busca, filtros, paginação, prazo, operador, estado,
  interação não substantiva, conversa protegida e ações auditadas;
- o modal informa que o registro não envia mensagem à família, exige canal
  para `realizado` e limita observação a 500 caracteres;
- o app local abriu corretamente até a tela de autenticação. O smoke visual
  autenticado com dados ficou deliberadamente para o Gate C da Task 8: antes
  da migration as RPCs não existem em produção, e nenhuma credencial foi usada
  nesta verificação local.

### Caso real de aceite e cadência

O caso previamente verificado de Ezequiel FernandoFerreira de almeida vence em
06/08/2026 às 10:55:54 BRT. Ele deve aparecer na tela naquele instante e só
entrar no resumo de Jéssica em 07/08/2026 às 09:00 BRT. Essa diferença entre o
estado imediato da tela e o aviso diário é intencional e aceita.

### Estado dos gates

- Tasks 1 a 7: implementadas e verificadas localmente;
- Task 8: não iniciada;
- produção: sem migration da Fase B, sem Edge nova, sem frontend novo e sem
  mensagem de WhatsApp desta fase;
- piloto: deverá usar exclusivamente o destino governado do Alf;
- activation migration: só será criada depois do aceite explícito do piloto;
- follow-up automático à família: fora de escopo e sem implementação.

## Gate A — migration estrutural em produção

Executado em 03/08/2026, aproximadamente 20:40 BRT, no projeto
`ouqwbbermlzqqvtqwlul`.

- arquivo aplicado:
  `supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql`;
- SHA-256 conferido antes da aplicação:
  `f96edb6492ba8845e4f61576524f064b7acbb9fcc505c2b4a3dc81ba0bedd21c`;
- registro remoto criado como versão `20260803234012`, nome
  `20260804090000_lia_followup_72h_fase_b`;
- `alertas_producao_liberados=true` permaneceu inalterado;
- `followup_72h_liberado=false`, conforme o gate de contenção;
- Ezequiel FernandoFerreira de almeida permaneceu em
  `aguardando_resposta`, sem interação, resposta válida, opt-out ou follow-up
  pendente; vencimento calculado em 06/08/2026 10:55:54 BRT;
- contagens pós-migration: `0` ações manuais, `0` resumos, `0` itens e `0`
  entregas de follow-up na outbox;
- as cinco entregas preexistentes da Fase A permaneceram `enviado`, todas com
  `provider_message_id`, sem falha e sem associação a resumo de follow-up;
- o cron `lia-alertas-privados-dispatcher-minuto` permaneceu ativo a cada
  minuto e a primeira execução observada após a migration terminou
  `succeeded`;
- nenhum deploy de Edge ou frontend e nenhum envio de WhatsApp foi realizado
  neste gate.

Gate B não iniciado; aguarda confirmação explícita do Alf.

## Gate B — Edge compatível

Iniciado em 03/08/2026, aproximadamente 20:45 BRT.

- a versão publicada antes do gate era a `v3`, com `verify_jwt=true`, e
  correspondia exatamente ao pacote da Fase A;
- o diff publicado adicionou somente a chamada best effort do produtor
  `produzir_lia_resumos_followup_72h` no ciclo automático e o tipo
  `followup_3d_resumo`; `webhook-whatsapp-inbox` não entrou no pacote;
- testes imediatamente anteriores ao deploy: `15` testes Deno e `5` testes
  Node aprovados, além de `deno check` verde;
- `processar-alertas-lia` foi publicada como `v4`, `verify_jwt=true`, digest
  remoto `42e2758377bf923dc828a352fbecf5d3efdccce181bd774b817a83cb6a01d432`;
- matriz ao vivo: anônimo `401`, JWT inválido `401`, usuário comum `403` com
  `service_role_required`, e service role deste projeto `200` com
  `sem_pendencia`;
- o produtor retornou `(0,0)`, `followup_72h_liberado` permaneceu `false` e
  continuaram existindo `0` resumos e `0` entregas de follow-up;
- as execuções do cron sobre a `v4` retornaram `sem_pendencia`, sem log de erro
  do produtor ou do dispatcher;
- foi criado um alerta controlado da Fase A na pesquisa de teste, destinatário
  governado `usuarios.id=2`, final `8047`, caixa 3, ambiente `teste`;
- às 20:48 BRT a janela aprovada de 08h às 20h já estava fechada. O dispatcher
  preservou corretamente a contenção: alerta
  `9c04dabb-a768-4ea7-b64f-3d5daffa771b` ficou `pendente`, com `0` tentativas e
  sem `provider_message_id`; nenhuma entrega foi criada para Jéssica ou Fabi;
- nenhuma alteração foi feita no webhook inbound ou no frontend.

O Alf aceitou o Gate B com a contenção da janela como comportamento correto.
A prova física da entrega ficou programada para a reabertura das 08h BRT e
passou a ser pré-condição do Gate D, não do deploy exclusivamente visual do
Gate C. Não houve bypass da janela.
