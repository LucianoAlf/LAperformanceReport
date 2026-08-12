# Chamada retroativa: decisão humana sobre fallback do Emusys

## Objetivo

Fazer com que marcar `Falta` em uma aula passada transforme o fallback neutro do Emusys (`status='ausente'`, sem `status_presenca` humana) em uma decisão persistida da secretaria. O botão deve permanecer marcado após o recarregamento da Agenda.

## Causa raiz confirmada

`app_registrar_chamada_agenda` deriva `v_status_anterior` com:

```sql
coalesce(
  v_existente.status_presenca,
  case v_existente.status when 'presente' then 'presente' when 'ausente' then 'falta' end
)
```

Para uma linha antiga do Emusys, isso produz `falta` mesmo quando `status_presenca` é `NULL` e `respondido_por='emusys'`. Ao receber `status='falta'`, a função sai pelo caminho idempotente e não grava a decisão humana. A UI recebe um retorno sem erro, exibe sucesso e, ao recarregar, continua recebendo estado `indeterminado`.

O diagnóstico foi confirmado no projeto Supabase `ouqwbbermlzqqvtqwlul`: existem 84 registros nesse estado em 10/08/2026 e 97 em 11/08/2026; em 12/08/2026 não há nenhum. A Vanessa citada no relato aparece em 06/08/2026 exatamente com esse contrato de dados.

## Desenho aprovado

- Corrigir somente a RPC `app_registrar_chamada_agenda`.
- Manter a derivação de `v_status_anterior` para auditoria e transições.
- Restringir o `continue` idempotente a registros que já possuam `status_presenca`.
- Quando `status_presenca` estiver nulo, sempre promover a linha para a decisão humana solicitada, preservando a evidência bruta do Emusys.
- Não alterar `get_agenda_dia`, `estadoDoAluno`, os botões ou o comportamento do dia atual.
- Não fazer backfill automático das linhas históricas; a equipe decide cada chamada.

## Validação

1. Fixture real de PostgreSQL 17 reproduzindo a linha `ausente` do Emusys.
2. Teste de regressão confirmando `atualizados=1`, `status_presenca='falta'` e `respondido_por='agenda_secretaria'`.
3. Teste de idempotência para uma decisão humana já persistida.
4. Typecheck/build do frontend.
5. E2E autenticado na Agenda, sem criar dados artificiais: abrir uma aula passada com fallback real, marcar `Falta`, confirmar visualmente o botão e recarregar a página para confirmar persistência.

## Fora de escopo

- Alterar registros históricos em lote.
- Corrigir a fonte Emusys ou o sync.
- Redeploy de Edge Function.
- Mensagens automáticas ou outbound.
