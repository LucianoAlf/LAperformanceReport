# P0.1 - Status de Validacao e Plano de Deprecacao de Fontes KPI

Data: 2026-06-08

## 1. O que foi feito

- Criada fonte canonica viva para KPIs executivos de alunos em `src/lib/kpisAlunosVivosCanonicos.ts`.
- Criado/ajustado contrato de consumo em `src/hooks/useKPIsAlunosCanonicos.ts`.
- Dashboard, Analytics/Gestao, Administrativo e Pagina Alunos passaram a consumir a fonte canonica para KPIs executivos de alunos.
- Mes fechado/historico usa `dados_mensais`.
- Mes atual aberto usa calculo vivo canonico direto de `alunos`/`movimentacoes_admin`, sem depender cegamente de `vw_kpis_gestao_mensal` para alunos ativos.
- Corrigido bug do Administrativo com FK ambigua em `movimentacoes_admin -> unidades`.
- Corrigido crash visual em Analytics/Gestao por uso de variaveis de competencia antes da inicializacao.
- Instalado Playwright e validado visualmente via Chrome logado.

## 2. Validado visualmente

Ambiente validado: app local `http://127.0.0.1:4176`, Chrome logado.

### Campo Grande / Junho 2026 aberto

| Tela | Status |
|---|---|
| Analytics / Gestao | OK: ativos 479, pagantes 449, Kids 194, School 285, banda 39, novas 6, evasoes 5 |
| Dashboard | OK: pagantes 449, matriculas mes 6, evasoes 5, ticket R$ 389 |
| Pagina Alunos | OK: matriculas 543, ativos 479, pagantes 449, segundo curso 27, banda 39, ticket R$ 389 |
| Administrativo | OK: ativos 479, pagantes 449, matriculas 543, bolsistas 30, novos 6 |

### Campo Grande / Maio 2026 fechado

| Tela | Status |
|---|---|
| Analytics / Gestao | OK: badge Fechado, ativos 496, pagantes 470, Kids 202, School 294, evasoes 13 |

### Barra e Recreio / Junho 2026 aberto

| Unidade | Status |
|---|---|
| Barra | OK: Kids 147 + School 81 = ativos 228 |
| Recreio | OK: Kids 173 + School 154 = ativos 327 |

## 3. O que esta validado com seguranca

- Cards executivos de alunos nas quatro telas principais:
  - Dashboard;
  - Analytics/Gestao;
  - Administrativo;
  - Pagina Alunos.
- Separacao de regra:
  - `alunos_ativos` = pessoas unicas;
  - `matriculas_ativas` = vinculos;
  - Kids/School usa a mesma base de alunos ativos;
  - mes fechado nao recalcula silenciosamente pela tabela viva.
- Build passou.
- Smoke test em aba limpa do Chrome passou sem erro novo de console.

## 4. O que ainda NAO esta 100% validado

Ainda nao da para afirmar que todos os graficos, relatorios, modais e RPCs bebem da mesma fonte.

Principais pontos pendentes:

| Area | Evidencia | Risco |
|---|---|---|
| Dashboard - camada legada | `DashboardPage.tsx` ainda consulta `vw_dashboard_unidade` e `vw_kpis_gestao_mensal` em trechos auxiliares | Pode sobrar grafico/alerta/resumo usando fonte antiga |
| Analytics/Gestao - financeiro/retencao | `TabGestao.tsx` ainda usa `vw_kpis_retencao_mensal` e `vw_kpis_gestao_mensal` para dados atuais de grafico financeiro | Grafico pode divergir do card canonico |
| Analytics/Gestao - fallback morto | Existe bloco `if (false)` com fallback antigo calculando de `alunos` | Baixo risco runtime, mas divida tecnica |
| `useDadosHistoricos` | Usa `vw_kpis_gestao_mensal`, `vw_kpis_comercial_historico`, `vw_unidade_anual` | Relatorios/graficos historicos podem nao obedecer `dados_mensais` |
| `TabDashboard` | Usa `vw_dashboard_unidade` e `dados_mensais` | Aba legada precisa decisao: migrar ou deprecar |
| Retencao | `useKPIsRetencao` e `TabGestao` ainda leem `vw_kpis_retencao_mensal` e `movimentacoes_admin` | Precisa alinhar regra de churn/aviso previo/nao renovacao |
| Administrativo - relatorios | `ModalRelatorio`, Alertas e Lancamentos usam `movimentacoes_admin`/RPCs proprias | Operacional ok, mas precisa mapa de relatorio |
| Professores / Carteira | Usa `get_carteira_professores` e queries diretas em `alunos` | Deve ficar como carteira operacional, nao KPI historico |
| Fideliza+ | Usa RPC `get_programa_fideliza_dados` | Ainda nao auditado; nao pode afirmar que bate com fonte canonica |

## 5. Candidatos a deprecacao: ainda NAO aprovar

Nenhum destes objetos deve ser removido agora.

| Objeto | Status atual | Motivo para nao deprecar ainda |
|---|---|---|
| `vw_kpis_gestao_mensal` | Candidata futura | Ainda referenciada por Dashboard, TabGestao e useDadosHistoricos |
| `vw_dashboard_unidade` | Candidata futura | Ainda referenciada por Dashboard e TabDashboard |
| `vw_kpis_retencao_mensal` | Candidata futura | Ainda referenciada por Administrativo, TabGestao e useKPIsRetencao |
| `vw_kpis_comercial_mensal` | Fora do P0.1 | Comercial/Leads precisa frente propria |
| `vw_kpis_comercial_historico` | Fora do P0.1 | Historico comercial precisa frente propria |
| RPC `get_programa_fideliza_dados` | Bloqueada | Precisa auditoria de corpo SQL antes de qualquer mudanca |
| RPC `get_carteira_professores` | Bloqueada | Deve ser classificada como operacional/professor, nao historico |

## 6. Proximo pacote recomendado

### P0.1C - Fechar graficos e relatorios de alunos

Objetivo: garantir que cards e graficos de alunos usem a mesma fonte.

1. Dashboard:
   - remover dependencia de `vw_kpis_gestao_mensal` para qualquer KPI executivo de aluno;
   - revisar grafico "Evolucao de Alunos";
   - revisar "Resumo por Unidade".
2. Analytics/Gestao:
   - revisar grafico "Evolucao Mensal";
   - revisar graficos financeiros que substituem mes atual via `vw_kpis_gestao_mensal`;
   - substituir mes atual por fonte canonica quando o KPI for de alunos/financeiro derivado de alunos.
3. Administrativo:
   - auditar `ModalRelatorio` e relatorio WhatsApp;
   - classificar o que e operacional (`movimentacoes_admin`) versus KPI executivo.
4. Gerar matriz por grafico:
   - tela;
   - componente;
   - fonte atual;
   - fonte canonica;
   - precisa patch.

### P0.2 - Fideliza+

Objetivo: auditar `get_programa_fideliza_dados` com `pg_get_functiondef`, mapear fontes internas e decidir se trimestre fechado deve usar snapshot.

### P0.3 - Professores / Carteira

Objetivo: manter carteira como operacional ao vivo, mas impedir que seja confundida com KPI historico fechado.

## 7. Regra para deprecar banco

So aprovar deprecacao quando todos os itens abaixo forem verdadeiros:

1. Zero referencia no frontend.
2. Zero referencia em RPC/function/view dependente.
3. Zero dependencia em relatorio, n8n, cron ou automacao.
4. Existe substituto canonico documentado.
5. Existe plano de rollback.
6. O objeto foi marcado como deprecated antes de ser removido.

## 8. Decisao atual

- Status dos cards executivos de alunos: validado nas telas principais.
- Status de todos os graficos/relatorios/RPCs: ainda nao validado.
- Proxima acao segura: P0.1C, auditar e corrigir graficos/relatorios de alunos antes de qualquer deprecacao de view/tabela.
