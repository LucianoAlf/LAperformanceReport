# P0.1C - Fontes de graficos/relatorios e plano de deprecacao

Data: 2026-06-08

Projeto Supabase confirmado no MCP: `ouqwbbermlzqqvtqwlul`

## 1. Resumo executivo

O pacote P0.1 anterior colocou os cards executivos de alunos no trilho canonico.

Este pacote P0.1C continuou a sanitizacao em graficos/resumos:

- Dashboard deixou de usar `vw_dashboard_unidade` e `vw_kpis_gestao_mensal` para KPIs executivos de alunos.
- Grafico "Evolucao de Alunos" do Dashboard passou a ser "Evolucao de Alunos Ativos", usando:
  - historico: `dados_mensais.alunos_ativos`;
  - mes atual aberto: fonte viva canonica.
- Resumo por Unidade do Dashboard passou a usar fonte viva canonica no mes atual e `dados_mensais` no historico.
- Analytics/Gestao deixou de usar `vw_kpis_gestao_mensal` como fallback para historico sem snapshot.
- Analytics/Gestao deixou de complementar grafico financeiro do mes atual via `vw_kpis_gestao_mensal`; agora usa a fonte canonica viva.
- Removido mapper morto `mapViewGestao` em `useKPIsAlunosCanonicos`.

Status honesto:

- Cards principais de alunos: validados nas quatro telas principais.
- Parte dos graficos/resumos de alunos: corrigida neste pacote.
- Ecossistema inteiro: ainda nao esta 100% livre de fonte legada.
- Nenhuma view/RPC/tabela deve ser deprecada ainda.

## 2. Arquivos alterados neste pacote

| Arquivo | Mudanca |
|---|---|
| `src/components/App/Dashboard/DashboardPage.tsx` | Remove uso de `vw_dashboard_unidade`/`vw_kpis_gestao_mensal` para KPIs de alunos; grafico de evolucao usa `dados_mensais` + fonte canonica viva. |
| `src/components/GestaoMensal/TabGestao.tsx` | Remove fallback vivo/historico perigoso para alunos; grafico financeiro do mes atual usa fonte canonica viva, nao `vw_kpis_gestao_mensal`. |
| `src/hooks/useKPIsAlunosCanonicos.ts` | Remove mapper legado nao usado de `vw_kpis_gestao_mensal`. |

## 3. Validacao executada

### Build

`npm run build` passou.

Avisos restantes:

- warnings antigos de chunk/circular reexport do `recharts`;
- nao bloqueiam este pacote, mas ficam como divida tecnica de build.

### Smoke visual via Chrome

Ambiente: `http://127.0.0.1:4176`

| Tela | Resultado |
|---|---|
| Dashboard | Abriu sem erro de console; mostra badge "KPIs de alunos: Calculo vivo"; consolidado Jun/2026 coerente. |
| Analytics/Gestao | Abriu sem erro de console; consolidado Jun/2026: Kids 514 + School 520 = Ativos 1.034. |
| Pagina Alunos | Abriu sem erro de console; mostra "Dados operacionais - carteira ao vivo"; consolidado Jun/2026: Matriculas 1.209, Ativos 1.034, Pagantes 989. |
| Administrativo | Abriu sem erro de console; resumo/alertas carregaram. |

## 4. Matriz de fontes - estado atual

| Area | Item | Fonte atual apos P0.1C | Status | Observacao |
|---|---|---|---|---|
| Dashboard | Cards de gestao/alunos | `fetchKPIsAlunosCanonicos` | OK | Mes aberto vivo canonico; mes fechado `dados_mensais`. |
| Dashboard | Evolucao de Alunos Ativos | `dados_mensais` + fonte canonica viva para mes atual | OK parcial | Historico depende de snapshot; mes atual vivo canonico. |
| Dashboard | Resumo por Unidade | Fonte canonica viva ou `dados_mensais` | OK parcial | Sem fallback para view legada. |
| Dashboard | Alertas inteligentes | `vw_alertas_inteligentes` | Fora do P0.1 | Nao e KPI executivo de alunos. |
| Dashboard | Comercial/leads | hooks/views comerciais | Fora do P0.1 | Frente futura Leads/Comercial. |
| Analytics/Gestao | Cards de alunos | `useKPIsAlunosCanonicos` | OK | Mes fechado nao recalcula vivo. |
| Analytics/Gestao | Evolucao mensal de alunos/evasoes/matriculas | `dados_mensais` + fonte viva canonica para atual | OK parcial | Retencao ainda precisa pacote proprio. |
| Analytics/Gestao | Financeiro do mes atual | Fonte viva canonica | OK parcial | Removeu dependencia de `vw_kpis_gestao_mensal` para complementar mes atual. |
| Analytics/Gestao | Retencao | `vw_kpis_retencao_mensal` + `movimentacoes_admin` | Pendente | Precisa P0.1D/P0.2 para regra de churn, aviso previo, nao renovacao. |
| Pagina Alunos | Cards operacionais | Fonte viva canonica + queries operacionais | OK operacional | Carteira viva, nao historico fechado. |
| Administrativo | Cards resumo de alunos | Fonte viva canonica | OK parcial | Relatorios/retencao ainda usam fontes proprias. |
| Administrativo | Lancamentos/retencao | `movimentacoes_admin` + `vw_kpis_retencao_mensal` | Pendente | Operacional, mas precisa matriz de relatorio. |
| Administrativo/Fideliza+ | Programa Fideliza+ | RPC `get_programa_fideliza_dados` | Bloqueado | Auditoria P0.2 obrigatoria antes de qualquer mudanca/deprecacao. |
| Professores/Carteira | Carteira professor | RPC `get_carteira_professores` | Operacional | Nao deve ser tratado como KPI historico fechado. |
| Metas/Simulador | Historico | `useDadosHistoricos` com views antigas | Pendente | Bloqueia deprecacao de `vw_kpis_gestao_mensal`. |
| GestaoMensal/TabDashboard | Aba legada exportada | `vw_dashboard_unidade` + `dados_mensais` | Pendente | Precisa decidir migrar ou remover da navegacao. |

## 5. Dependencias de banco confirmadas por SELECT-only

### Views

| Objeto | Usa `dados_mensais` | Usa `alunos` | Usa `movimentacoes_admin` | Status |
|---|---:|---:|---:|---|
| `vw_dashboard_unidade` | Sim | Sim | Sim | Legada/candidata futura; nao deprecar. |
| `vw_kpis_gestao_mensal` | Nao | Sim | Sim | Legada/candidata futura; nao deprecar. |
| `vw_kpis_retencao_mensal` | Nao | Sim | Sim | Pendente retencao. |
| `vw_unidade_anual` | Sim | Sim | Nao | Usada em historicos/metas; nao deprecar. |
| `vw_kpis_comercial_mensal` | Nao | Sim | Nao | Fora do P0.1; Leads/Comercial. |
| `vw_kpis_comercial_historico` | Nao | Nao | Nao | Fora do P0.1; usa `dados_comerciais`. |

### RPCs/funcoes

| Funcao | Dependencia relevante | Status |
|---|---|---|
| `get_dados_relatorio_gerencial` | `vw_kpis_gestao_mensal`, `vw_kpis_retencao_mensal`, `dados_mensais`, `alunos` | Bloqueia deprecacao. |
| `get_dados_retencao_ia` | `vw_kpis_gestao_mensal`, `vw_kpis_retencao_mensal`, `dados_mensais`, `alunos`, `movimentacoes_admin` | Bloqueia deprecacao. |
| `get_programa_fideliza_dados` | `dados_mensais`, `alunos`, `movimentacoes_admin` | P0.2 obrigatorio. |
| `get_carteira_professores` | `alunos` | Operacional/professor; nao historico. |
| `get_historico_ltv` | `alunos`/historico proprio | Pendente LTV/retencao. |
| `rpc_analise_turmas` | `alunos`/presencas | Operacional; fora de KPI historico fechado. |

## 6. Referencias frontend restantes

| Arquivo | Referencia | Classificacao |
|---|---|---|
| `src/components/App/Administrativo/AdministrativoPage.tsx` | `vw_kpis_retencao_mensal` | Pendente retencao/relatorios. |
| `src/components/GestaoMensal/TabGestao.tsx` | `vw_kpis_retencao_mensal` | Pendente retencao. |
| `src/hooks/useKPIsRetencao.ts` | `vw_kpis_retencao_mensal` | Pendente retencao. |
| `src/hooks/useDadosHistoricos.ts` | `vw_kpis_gestao_mensal`, `vw_unidade_anual` | Pendente Metas/Historico. |
| `src/components/GestaoMensal/TabDashboard.tsx` | `vw_dashboard_unidade` | Aba legada; migrar ou remover. |
| `src/hooks/useFidelizaPrograma.ts` | `get_programa_fideliza_dados` | P0.2 Fideliza+. |
| `src/components/App/Professores/TabCarteiraProfessores.tsx` | `get_carteira_professores` | Operacional, nao historico. |
| `src/hooks/useKPIsComercial.ts` | `vw_kpis_comercial_mensal` | Comercial/Leads, fora do P0.1. |

## 7. Candidatos a deprecacao

Ainda nao aprovar deprecacao de nenhum objeto.

| Objeto | Motivo do bloqueio |
|---|---|
| `vw_kpis_gestao_mensal` | Ainda usada em `useDadosHistoricos` e RPCs de relatorio/IA. |
| `vw_dashboard_unidade` | Ainda usada em `TabDashboard`; pode ter uso em rota/export legado. |
| `vw_kpis_retencao_mensal` | Usada em Administrativo, TabGestao, useKPIsRetencao e RPCs. |
| `vw_unidade_anual` | Usada em historicos/metas. |
| `get_programa_fideliza_dados` | Precisa auditoria propria P0.2. |
| `get_carteira_professores` | Deve permanecer operacional ate redesenho de Carteira. |

## 8. Proximo pacote recomendado

### P0.1D - Retencao e relatorios administrativos

Objetivo:

- alinhar `useKPIsRetencao`, Tab Retencao e Administrativo;
- definir regra canonica para:
  - churn;
  - evasoes;
  - nao renovacao;
  - aviso previo;
  - tempo de permanencia;
  - LTV;
- separar operacional vivo de historico fechado;
- revisar `get_dados_relatorio_gerencial` e `get_dados_retencao_ia`.

### P0.2 - Fideliza+

Objetivo:

- auditar corpo completo de `get_programa_fideliza_dados`;
- validar se trimestre fechado deve ler snapshot;
- corrigir regra de churn/inadimplencia/renovacao sem quebrar pontuacao.

### P0.3 - Professores/Carteira

Objetivo:

- manter carteira como operacional ao vivo;
- impedir comparacao direta com KPI historico fechado;
- revisar `get_carteira_professores`.

### P0.4 - Plano formal de deprecacao

Somente depois de:

1. zero referencia frontend;
2. zero dependencia em function/RPC/view;
3. zero dependencia em relatorio/cron/n8n;
4. substituto canonico documentado;
5. periodo de observacao;
6. rollback claro.

## 9. Decisao atual

O P0.1C reduziu a divida em Dashboard/Analytics e removeu fontes legadas perigosas de graficos/resumos de alunos no escopo corrigido.

Mas a plataforma ainda nao esta pronta para deprecar views/tabelas/RPCs antigas.

O proximo passo tecnico correto e P0.1D: Retencao e relatorios administrativos.
