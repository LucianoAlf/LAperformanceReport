# Baseline Read-Only - Fechamento Junho 2026

Data da leitura: 2026-06-30.

Escopo: somente leitura. Nenhum dado de producao foi alterado.

## Git

Estado apos `git fetch` e `git pull --ff-only origin main`:

- Branch: `main`.
- HEAD local/remoto: `caf17b8 fix(relatorios): restaura DEFAULT de data_dia na fila de relatorios`.
- Pull aplicado em fast-forward, sem conflito.
- Existem alteracoes locais nao commitadas anteriores a esta auditoria em arquivos de alunos/sync/relatorio.

## Cron

Nao foi encontrado cron ativo chamando diretamente:

- `snapshot_dados_mensais`
- `fechar_dados_mensais`
- `recalcular_dados_mensais`

Crons relevantes encontrados:

- `relatorio-diario-20h`: 23:00 UTC, equivalente a 20:00 BRT.
- `relatorio-diario-sabado-16h`: 19:00 UTC, equivalente a 16:00 BRT.
- `sync-matriculas-cg`: 02:00 UTC, equivalente a 23:00 BRT do dia anterior.
- `sync-matriculas-recreio`: 02:20 UTC, equivalente a 23:20 BRT do dia anterior.
- `sync-matriculas-barra`: 02:40 UTC, equivalente a 23:40 BRT do dia anterior.

Implicacao: um corte oficial as 22:00 BRT precisa congelar leitura antes dos syncs automaticos de matriculas da noite.

## Baseline Vivo - Administrativo Operacional

Fonte: `get_kpis_alunos_admin_operacional(null, 2026, 6)`.

| Unidade | Ativos | Pagantes | Nao pagantes | Trancados | Matriculas ativas | Banda | 2o curso | Novas |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Barra | 237 | 235 | 2 | 4 | 263 | 12 | 14 | 12 |
| Campo Grande | 469 | 436 | 33 | 9 | 539 | 44 | 26 | 12 |
| Recreio | 334 | 323 | 11 | 4 | 417 | 58 | 25 | 17 |
| Consolidado | 1040 | 994 | 46 | 17 | 1219 | 114 | 65 | 41 |

Observacao da fonte:

```text
Relatorio administrativo operacional: aluno regular trancado continua na carteira; banda/projeto conta apenas quando ativo.
```

## Baseline Vivo - KPIs Executivos Canonicos

Fonte: `get_kpis_alunos_canonicos(null, 2026, 6)`.

| Unidade | Ativos | Pagantes | MRR previsto | Ticket | Inadimplentes | Valor inadimplente | Matriculas | Banda | 2o curso | Novas | Evasoes | Churn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Barra | 237 | 235 | 106097.15 | 451.48 | 4 | 2087.00 | 263 | 12 | 14 | 13 | 4 | 1.70 |
| Campo Grande | 469 | 436 | 170157.18 | 390.27 | 31 | 11161.00 | 540 | 45 | 26 | 12 | 7 | 1.61 |
| Recreio | 334 | 323 | 144287.63 | 446.71 | 2 | 815.00 | 414 | 55 | 25 | 17 | 17 | 5.26 |
| Consolidado | 1040 | 994 | 420541.96 | 423.08 | 37 | 14063.00 | 1217 | 112 | 65 | 42 | 28 | 2.82 |

Alertas:

- A fonte executiva ainda informa `tempo_permanencia = 0` e `ltv_medio = 0` no consolidado e por unidade. Isso precisa ser tratado antes de congelar relatorios de retencao/LTV.
- A fonte executiva diverge da fonte administrativa em algumas contagens de matriculas/banda:
  - Campo Grande: admin `539/44`, executivo `540/45`.
  - Recreio: admin `417/58`, executivo `414/55`.

## Baseline Vivo - Comercial

Fonte: `get_kpis_comercial_canonicos_v2(null, 2026, 6, 'mensal', null)`.

| Unidade | Leads | Conversoes de lead | Matriculas comerciais principais | Exp status operacional | Exp presenca confirmada | Exp status sem presenca |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Barra | 161 | 9 | 12 | 30 | 11 | 19 |
| Campo Grande | 421 | 12 | 12 | 18 | 6 | 12 |
| Recreio | 253 | 15 | 17 | 51 | 8 | 43 |
| Consolidado | 835 | 36 | 41 | 99 | 25 | 74 |

Alertas da fonte:

- Existem experimentais com status realizada/convertido sem presenca individual confirmada.
- Existem 5 matriculas sem lead vinculado.

## Estado Atual De `dados_mensais`

Fonte: tabela `dados_mensais`, ano 2026, mes 6.

| Unidade | Ativos | Pagantes | Matriculas | Banda | 2o curso | Bolsistas integrais | Bolsistas parciais | Novas | Evasoes | Ticket | Tempo perm. | Updated at |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Campo Grande | 478 | 448 | 542 | 40 | 28 | 0 | 0 | 2 | 7 | 0.00 | 0.0 | 2026-06-27 16:22:40 UTC |
| Recreio | 323 | 311 | 404 | 59 | 24 | 0 | 0 | 4 | 17 | 0.00 | 0.0 | 2026-06-25 16:33:37 UTC |

Nao existe linha de Barra para junho/2026 em `dados_mensais`.

Conclusao:

- `dados_mensais` de junho esta incompleto e antigo.
- Nao pode ser usado como fechamento oficial de junho no estado atual.
- Se for atualizado, deve receber valores canonicos aprovados, nao recalculo legado.

## Estado Atual De Historicos Complementares

Contagens em producao:

- `competencias_mensais` junho/2026: 0.
- `programa_matriculador_historico` junho/2026: 0.
- `programa_fideliza_historico` 2026: 0.
- `relatorios_diarios` junho/2026: 0.

## Decisao Para Proxima Task

Antes de qualquer escrita:

1. Resolver divergencia admin x executivo para matriculas/banda.
2. Resolver `tempo_permanencia`/`ltv_medio` zerados na fonte executiva.
3. Gerar preview por unidade e dominio com fonte declarada.
4. Somente depois persistir em `dados_mensais`, historicos de programas e/ou tabela complementar se realmente necessaria.
