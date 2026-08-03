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
