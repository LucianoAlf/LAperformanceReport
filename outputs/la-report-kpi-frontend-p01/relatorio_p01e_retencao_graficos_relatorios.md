# P0.1E - Retencao, Graficos e Relatorios Administrativos

Data: 2026-06-08

## 1. Resumo executivo

Este pacote continua a sanitizacao das fontes de KPI sem mexer em banco.

O foco foi separar:

- KPI executivo historico fechado: `dados_mensais`;
- retencao operacional de mes aberto: `vw_kpis_retencao_mensal` + `movimentacoes_admin`;
- detalhes operacionais: `movimentacoes_admin`.

Nao houve migration, deploy, UPDATE, DELETE, INSERT, backfill ou recalculo de snapshot.

## 2. Evidencia SELECT-only

Projeto confirmado pelo MCP:

- `https://ouqwbbermlzqqvtqwlul.supabase.co`

Junho/2026 aberto:

- `vw_kpis_retencao_mensal` bate com `movimentacoes_admin` para totais operacionais do mes nas tres unidades.
- Campo Grande: view mostra 2 evasoes totais, 32 renovacoes, 2 nao renovacoes, 1 aviso por data de junho e 2 avisos com saida em julho.
- Recreio: view mostra 17 evasoes, 2 renovacoes e 3 avisos com saida em julho.
- Barra: view mostra 3 evasoes, 14 renovacoes e 0 avisos.

Maio/2026 fechado:

| Unidade | Snapshot churn | View taxa_evasao | Observacao |
|---|---:|---:|---|
| Barra | 5.88 | 5.78 | Diverge por denominador vivo da view |
| Campo Grande | 2.77 | 2.90 | Diverge por denominador vivo da view |
| Recreio | 6.09 | 6.05 | Diverge por denominador vivo da view |

Conclusao:

- Para mes fechado, a view de retencao nao pode substituir `dados_mensais`.
- Para mes aberto, a view segue util como fonte operacional enquanto o dominio de renovacao antecipada nao for redesenhado.

## 3. Correcoes aplicadas

### Analytics/Gestao

Arquivo:

- `src/components/GestaoMensal/TabGestao.tsx`

Problema:

- O grafico historico de Taxa de Renovacao substituia o mes atual pela fonte canonica de alunos, mas preenchia `taxa_renovacao = 0`.
- Isso criava queda artificial para zero em Junho aberto.

Correcao:

- O mes atual continua usando a fonte canonica de alunos para financeiro/alunos.
- A `taxa_renovacao` do ponto atual passa a vir de `retencaoData` ja carregado para a competencia aberta.

### Simulador/Metas

Arquivo:

- `src/hooks/useDadosHistoricos.ts`

Problema:

- Apos trocar a fonte atual para `fetchKPIsAlunosCanonicos`, `taxaRenovacao` ficou fixa em `0`.

Correcao:

- Mes fechado: `taxaRenovacao` vem de `dados_mensais`.
- Mes aberto vivo: `taxaRenovacao` vem de `vw_kpis_retencao_mensal`.
- Mes preliminar/indisponivel: fica 0, sem inventar valor.

## 4. Relatorio administrativo WhatsApp

Status atual local:

- KPIs de alunos/matriculas ja foram migrados para regra canonica viva no pacote P0.1D.
- Retencao/renovacao/evasao continuam em `vw_kpis_retencao_mensal` + `movimentacoes_admin`.

Decisao:

- Nao alterar renovacao antecipada neste pacote, conforme orientacao do Alf.
- A correcao local ainda precisa de deploy controlado da Edge Function para chegar ao relatorio automatico real.

## 5. O que ainda nao esta 100%

| Area | Fonte atual | Risco |
|---|---|---|
| Retencao futura/antecipada | `movimentacoes_admin` pela data de lancamento | Renovacao de julho pode aparecer em junho |
| Fideliza+ | `get_programa_fideliza_dados` | Ainda nao auditado |
| Professores/Carteira | `get_carteira_professores` | Operacional, nao historico |
| `TabDashboard` legado | `vw_dashboard_unidade` | Precisa decisao de remover/migrar |
| Comercial/Leads | views comerciais | Fora do P0.1 |

## 6. Regra de deprecacao

Ainda nao aprovar deprecacao de:

- `vw_kpis_retencao_mensal`;
- `vw_dashboard_unidade`;
- `get_programa_fideliza_dados`;
- `get_carteira_professores`;
- views comerciais.

Motivo:

- Ainda existem referencias reais em codigo, relatorio ou areas fora do P0.1.

## 7. Validacao

- Build local passou.
- Validacao visual anterior no Chrome confirmou os cards de alunos.
- Este pacote validou a causa da divergencia de retencao por SELECT-only.

## 8. Proximo passo recomendado

1. Deploy controlado do `relatorio-admin-whatsapp`.
2. Teste manual do relatorio para Campo Grande e Recreio.
3. P0.1F: auditar/deprecar `TabDashboard` legado ou migrar se ainda for usado.
4. P0.2: Fideliza+.
5. P0.3: Professores/Carteira.
