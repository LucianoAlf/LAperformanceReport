# P0.1G - Pos-execucao

Data: 2026-06-09

## 1. Migration executada

Migration aplicada no projeto Supabase:

- Projeto: `ouqwbbermlzqqvtqwlul`
- URL confirmada antes da execucao: `https://ouqwbbermlzqqvtqwlul.supabase.co`
- Migration: `p01g_fonte_canonica_kpis_alunos_relatorios`
- Versao registrada: `20260609032441`

## 2. Objetos criados/alterados

Funcoes presentes apos execucao:

| Funcao | Retorno | Security | Search path |
|---|---|---|---|
| `get_kpis_alunos_canonicos(uuid, integer, integer)` | `jsonb` | `SECURITY DEFINER` | `public, pg_temp` |
| `get_dados_relatorio_gerencial(uuid, integer, integer)` | `jsonb` | `SECURITY DEFINER` | `public, pg_temp` |
| `get_dados_relatorio_gerencial_legacy_p01g(uuid, integer, integer)` | `jsonb` | `SECURITY DEFINER` | `public, pg_temp` |
| `get_dados_retencao_ia(uuid, integer, integer)` | `json` | invoker | `public, pg_temp` |
| `get_dados_retencao_ia_legacy_p01g(uuid, integer, integer)` | `json` | invoker legado | sem `proconfig` |

## 3. Permissoes

`anon` nao executa mais:

- `get_kpis_alunos_canonicos`;
- `get_dados_relatorio_gerencial`;
- `get_dados_retencao_ia`;
- wrappers legado `_legacy_p01g`.

Continuam com EXECUTE:

- `authenticated`;
- `service_role`;
- `postgres`.

## 4. Testes pos-execucao

### Campo Grande / Junho 2026 aberto

`get_kpis_alunos_canonicos(CG, 2026, 6)`:

| KPI | Resultado |
|---|---:|
| Fonte | `vivo` |
| Alunos ativos | 479 |
| Alunos pagantes | 449 |
| Kids | 194 |
| School | 285 |
| Sem classificacao | 0 |
| Matriculas ativas | 543 |
| Banda | 39 |
| 2o curso | 27 |
| Ticket medio | 388.95 |
| MRR | 174639.23 |

### Campo Grande / Maio 2026 fechado

`get_kpis_alunos_canonicos(CG, 2026, 5)`:

| KPI | Resultado |
|---|---:|
| Fonte | `dados_mensais` |
| Competencia fechada | `true` |
| Alunos ativos | 496 |
| Alunos pagantes | 470 |
| Ticket medio | 368.66 |
| MRR | 173270.20 |
| Evasoes | 13 |
| Churn | 2.77 |

### Relatorio gerencial

`get_dados_relatorio_gerencial(CG, 2026, 6)`:

- retorna `kpis_alunos_canonicos`;
- substitui `kpis_gestao`;
- `kpis_gestao` possui 1 linha;
- top-level `matriculas_ativas`, `matriculas_banda` e `matriculas_2_curso` batem com a fonte canonica.

### Retencao IA

`get_dados_retencao_ia(CG, 2026, 6)`:

- retorna `kpis_alunos_canonicos`;
- substitui `kpis_gestao`;
- mantem `kpis_retencao` legado para P0.1H.

### Consolidado Junho 2026

`get_kpis_alunos_canonicos(NULL, 2026, 6)`:

| KPI | Resultado |
|---|---:|
| Fonte | `vivo` |
| Unidades | 3 |
| Alunos ativos | 1034 |
| Alunos pagantes | 989 |
| Kids | 514 |
| School | 520 |
| Sem classificacao | 0 |
| Kids + School + sem classificacao fecha com ativos | `true` |
| Matriculas ativas | 1209 |
| Banda | 116 |
| 2o curso | 64 |

## 5. Dados historicos

Checklist:

- `audit_log` para `dados_mensais` nos ultimos 15 minutos: `0`.
- Nenhum `dados_mensais` foi recalculado.
- Nenhum fechamento foi executado.
- Nenhum backfill foi executado.

## 6. Pontos que continuam fora da P0.1G

- `kpis_retencao` ainda vem de `vw_kpis_retencao_mensal`.
- Relatorio WhatsApp automatico/Edge Function nao foi deployado nesta etapa.
- Fideliza+ continua P0.2.
- Professores/Carteira continua operacional, nao historico.
- Deprecacao de views/tabelas ainda nao esta aprovada.

## 7. Proxima frente recomendada

P0.1H:

- alinhar `vw_kpis_retencao_mensal` / retencao dos graficos e relatorios;
- decidir regra canonica para renovacao antecipada, aviso previo e nao renovacao;
- depois migrar/deployar `relatorio-admin-whatsapp` para usar `get_kpis_alunos_canonicos` em vez de manter calculo local duplicado.
