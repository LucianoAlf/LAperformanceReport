# Pendencia tecnica P0.1 - Kids/School em snapshot

Data: 2026-06-08

## Contexto

Em Campo Grande / Maio 2026, `dados_mensais` possui `alunos_ativos = 496`, mas o snapshot historico nao possui colunas especificas para a segmentacao LA Music Kids / LA Music School.

Para exibir a competencia fechada sem `N/D`, o frontend usa uma reconstrucao auditada e aprovada operacionalmente:

- Kids: 202
- School: 294
- Total: 496

Essa reconstrucao nao deve ser tratada como snapshot canonico definitivo.

## Pendencia

No proximo ciclo de schema/fechamento, adicionar campos em `dados_mensais`:

- `alunos_kids`
- `alunos_school`

## Regra canonica futura

Para novos fechamentos, Kids/School precisa virar snapshot real, calculado no fechamento pela idade na data de corte da competencia.

Nao usar `idade_atual` como criterio canonico definitivo para competencia historica.

## Restricoes

Esta pendencia nao autoriza:

- migration imediata;
- alteracao em `dados_mensais`;
- backfill;
- recalculo de snapshot;
- fechamento ou retificacao automatica.
