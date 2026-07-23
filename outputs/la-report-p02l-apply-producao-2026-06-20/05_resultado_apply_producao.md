# P02L - Resultado do apply em producao

Data: 2026-06-20

Ambiente confirmado:

- `https://ouqwbbermlzqqvtqwlul.supabase.co`

## Analise de risco antes do apply

Foi checado trigger na tabela `public.lead_experimentais`.

Resultado:

- existe apenas `trg_audit`;
- trigger executa `fn_audit_log()`;
- efeito esperado: criar registros em `audit_log`;
- nao altera funil, status, presenca, leads, alunos ou snapshots.

## Preflight final

Resultado antes do apply:

| Validacao | Unidade | Total |
|---|---|---:|
| APTO_PREVIEW_PRODUCAO | Barra | 5 |
| APTO_PREVIEW_PRODUCAO | Campo Grande | 13 |
| APTO_PREVIEW_PRODUCAO | Recreio | 10 |

Resumo:

- APTO: 28
- BLOQUEAR: 0

## Apply executado

Apply executado com:

- `BEGIN`
- `guard_count = 28`
- `UPDATE public.lead_experimentais`
- campo alterado: somente `aluno_id`
- `COMMIT`

Resultado do `RETURNING`:

- 28 linhas retornadas;
- `total_guarded = 28`;
- `aluno_id_before = null` em todas;
- `aluno_id_after` preenchido nos 28 casos.

## Validacao pos-apply

Resultado:

| Metrica | Total |
|---|---:|
| total_lote | 28 |
| preenchidos_corretos | 28 |
| ainda_nulos | 0 |
| divergentes | 0 |

Auditoria:

| Metrica | Total |
|---|---:|
| audit_updates_recentes | 28 |

## O que foi alterado

Somente:

- `public.lead_experimentais.aluno_id` nos 28 casos P02L.

## O que nao foi alterado

- `lead_experimentais.status`
- `lead_experimentais.data_experimental`
- `lead_experimentais.horario_experimental`
- `lead_experimentais.professor_experimental_id`
- `aluno_presenca`
- `aulas_emusys`
- `leads`
- `alunos`
- `dados_mensais`
- `dados_comerciais`
- `origem_leads`
- UI
- KPI
- relatorios
- taxa experimental -> matricula

## Status de regra

Mesmo apos P02L:

- taxa experimental -> matricula continua bloqueada;
- conversao oficial continua bloqueada;
- P02L apenas melhora a costura `lead_experimentais.aluno_id` dos 28 casos certos.
