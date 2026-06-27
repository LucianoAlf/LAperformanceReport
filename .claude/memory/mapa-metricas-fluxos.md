# Mapa Completo — Métricas e Fluxos de Dados do Frontend

Documento de referência: quais dados cada tela/componente consome, de onde vêm (RPC, tabela, view, hook), e quais cálculos acontecem no frontend vs. banco.

---

## I. Páginas e Componentes Principais

| Rota | Componente | Hooks Principais |
|---|---|---|
| `/app` | DashboardPage.tsx | useMetasKPI, useKPIsGestao, useKPIsComercial, useDadosMensais |
| `/app/comercial` | ComercialPage.tsx | useKPIsComercial, useCheckLeadDuplicado, useCheckAlunoDuplicado, useMatriculadorPrograma |
| `/app/administrativo` | AdministrativoPage.tsx | useMetas, useKPIsRetencao, useFidelizaPrograma, useProjetos |
| `/app/alunos` | AlunosPage.tsx | useHistoricoLTV, useAnaliseTurmas, useContatosAluno, useProjetos |
| `/app/professores` | ProfessoresPage.tsx | useKPIsProfessor, useProfessor360, useHealthScore, useProfessoresPerformance |
| `/app/retencao` | PlanilhaRetencao.tsx | useKPIsRetencao, useEvasoesData |
| `/app/metas` | MetasPageNew.tsx | useMetas, useCompetenciaFiltro |
| `/app/gestao-mensal` | GestaoMensalPage.tsx | useKPIsGestao, useDadosMensais, useCompetenciaFiltro |
| `/app/projetos` | ProjetosPage.tsx | useProjetos |

---

## II. Hooks por Domínio

### Comercial

#### `useKPIsComercial(unidadeId, ano?, mes?)`
- **Fonte:** `vw_kpis_comercial_mensal` (VIEW) + fallback `leads`, `alunos`
- **Retorna:** total_leads, taxa_conversao, novas_matriculas, faturamento_novos, ticket_medio, leads_por_canal, matriculas_por_professor, funil
- **Cálculos no banco:** taxa_showup, taxa_conversao_lead_exp, taxa_conversao_exp_mat, ticket_medio
- **Cálculos no frontend:** Consolidação de unidades, agregação por canal/professor, estrutura do funil

#### `useComercialData(ano, unidade)`
- **Fonte:** `dados_comerciais`, `metas_comerciais`
- **Cálculos no frontend:** calcularKPIs (taxas de conversão, ticket médio, faturamento), processarDadosMensais, processarDadosPorUnidade

#### `useMatriculadorPrograma()`
- **Fonte:** RPC `get_programa_matriculador_dados`, tabela `programa_matriculador_penalidades`
- **Cálculos no frontend:** Pontuação dos matriculadores (taxa_showup, taxa_exp_mat, taxa_geral, volume, ticket, bonus, penalidades)

#### `useCheckLeadDuplicado()` / `useCheckAlunoDuplicado()`
- **Fonte:** `leads` / `alunos`
- **Lógica:** Match por telefone normalizado (forte) + match por nome+unidade (fraco)

---

### Gestão

#### `useKPIsGestao(unidadeId, ano?, mes?)`
- **Fonte:** `vw_kpis_gestao_mensal` (VIEW) + fallback `dados_mensais`
- **Retorna:** alunos_ativos, alunos_pagantes, bolsistas, ticket_medio, mrr, arr, ltv_medio, churn_rate, taxa_renovacao, evasoes
- **Cálculos no banco:** MRR = alunos_pagantes × ticket_medio, ARR = MRR × 12, LTV médio
- **Cálculos no frontend:** Consolidação de unidades, médias de taxas percentuais

#### `useDadosMensais(range, unidadeId?)`
- **Fonte:** `dados_mensais`
- **Cálculos no frontend:** Agregação por período (mensal/trimestral/semestral/anual), faturamento_realizado = faturamento_estimado - inadimplência

---

### Professores

#### `useKPIsProfessor(unidadeId?, professorId?)`
- **Fonte:** `vw_kpis_professor_completo` (VIEW)
- **Retorna:** carteira_alunos, ticket_medio, media_presenca, taxa_conversao, taxa_renovacao, taxa_faltas, evasoes, mrr_perdido, nps_medio, media_alunos_turma, rankings

#### `useHealthScore()`
- **Fonte:** Cálculo 100% no frontend baseado em KPIs do professor
- **Pesos:**
  - Crescimento da carteira: 15%
  - Média alunos/turma: 20%
  - Retenção: 25%
  - Conversão de experimentais: 15%
  - Presença: 15%
  - Evasões (inverso): 10%
- **Classificação:** Saudável ≥ 70 · Atenção 50–69 · Crítico < 50

#### `useProfessor360(unidadeId?, professorId?)`
- **Fontes:** `professor_360_criterios`, `professor_360_ocorrencias`, `professor_360_avaliacoes`, `professor_360_config`, `professor_360_ocorrencias_log`
- **RPC:** `get_kpis_professor_periodo`
- **Cálculos no frontend:** Pontuação por critério (pontos_perda × qtd, com tolerância), nota_base = soma critérios, nota_final = nota_base + bonus - penalidades

#### `useProfessorDependencies(unidadeId?, professorId?)`
- **Fontes:** `alunos`, `aulas_emusys`, `leads`, `turmas`, `movimentacoes`, `renovacoes`, `experimentais_professor_mensal`, `aluno_presenca`, `professor_360_*`, `aluno_feedback_professor`, `professor_videos`

---

### Retenção / Evasões

#### `useKPIsRetencao(unidadeId, ano?, mes?)`
- **Fonte:** `vw_kpis_retencao_mensal` (VIEW) + fallback `movimentacoes_admin`, `renovacoes`, `alunos`
- **Retorna:** total_evasoes, taxa_evasao, mrr_perdido, renovacoes, taxa_renovacao, taxa_nao_renovacao, evasoes_por_motivo, evasoes_por_professor
- **Cálculos no frontend:**
  - taxa_evasao = (total_evasoes - transferencias) / total_alunos × 100
  - taxa_renovacao = renovacoes_realizadas / renovacoes_previstas × 100

#### `useEvasoesData(ano, unidade)`
- **Fonte:** `evasoes`
- **Cálculos no frontend:** Agregação por mês/unidade/professor, risco professor (≥ 15 evasões = crítico)

---

### Alunos / LTV

#### `useHistoricoLTV(unidadeId)`
- **Fonte:** RPC `get_historico_ltv`, tabela `alunos_historico`
- **Retorna:** registros de ex-alunos, kpis (totalExAlunos, tempoMedio, taxaRetorno), curva de sobrevivência, histograma, evolução temporal
- **Cálculos no frontend:** curva de sobrevivência, histograma de faixas, taxa de retorno = pessoas com ≥ 2 passagens / total

---

### Administrativo / Programas

#### `useMetas(unidadeId, ano?, mes?)`
- **Fonte:** `metas` + tabelas de realizado (`alunos`, `leads`, `renovacoes`, `movimentacoes_admin`)
- **Cálculos no frontend:**
  - Realizado = contagem/soma conforme tipo
  - Percentual = realizado / meta × 100
  - Projeção = (realizado / dias_passados) × dias_do_mês
  - Status = baseado em % esperado para o dia

#### `useFidelizaPrograma()`
- **Fonte:** RPC `get_programa_fideliza_dados`, tabelas `programa_fideliza_*`
- **Cálculos no frontend:** Pontuação de farmers (churn, inadimplência, renovação, reajuste, lojinha, bonus, penalidades), ranking por total de pontos

#### `useProjetos()`
- **Fontes:** `projetos`, `projeto_fases`, `projeto_tarefas`, `projeto_equipe`, `projeto_tipo_fases_template`, `projeto_tipo_tarefas_template`
- **Cálculos no frontend:** % de progresso (tarefas concluídas), detecção de atrasos, cálculo de prazos

---

## III. Mapa de Views

| View | Hooks | Descrição |
|---|---|---|
| `vw_kpis_comercial_mensal` | useKPIsComercial | KPIs comerciais por unidade/mês |
| `vw_kpis_gestao_mensal` | useKPIsGestao | KPIs de gestão por unidade/mês |
| `vw_kpis_professor_completo` | useKPIsProfessor | KPIs completos de professores |
| `vw_kpis_retencao_mensal` | useKPIsRetencao | KPIs de retenção por unidade/mês |
| `vw_kpis_professor_mensal` | useKPIsProfessor (legacy) | KPIs mensais (inclui nps_medio) |

---

## IV. Mapa de RPCs

### Comercial
- `get_programa_matriculador_dados` — dados dos matriculadores
- `atualizar_config_matriculador`

### Gestão
- `get_kpis_consolidados`, `get_kpis_unidade`
- `recalcular_dados_mensais`, `upsert_dados_mensais`

### Professores
- `get_carteira_professores` — carteira por professor, filtra `status='ativo'`, exclui `is_projeto_banda`
- `get_kpis_professor_periodo` — KPIs em período específico
- `get_presenca_por_aluno_professor`
- `calcular_health_score_alunos_batch`
- `registrar_log_ocorrencia`, `editar_ocorrencia`, `reverter_ocorrencia`, `restaurar_ocorrencia`

### Retenção / Alunos
- `get_dados_retencao_ia`, `get_resumo_renovacoes_proximas`
- `get_historico_ltv` — ex-alunos com tempo de permanência
- `buscar_anamnese_pendente`

### Farmer / Administrativo
- `get_checklists_farmer`, `get_checklist_detail`
- `get_rotinas_do_dia`, `get_historico_rotinas`, `get_progresso_rotinas_hoje`
- `marcar_checklist_item`, `criar_checklist_from_template`, `vincular_alunos_checklist`, `marcar_rotina_concluida`
- `get_cron_health`

### Fideliza
- `get_programa_fideliza_dados`, `atualizar_config_fideliza`
- `registrar_penalidade_fideliza`, `deletar_penalidade_fideliza`
- `salvar_historico_trimestral_fideliza`

### Relatórios
- `get_dados_relatorio_coordenacao` — sem filtro de status em alunos (bug conhecido)
- `get_dados_relatorio_gerencial`
- `execute_bi_query_lamusic`

### Outros
- `rpc_analise_turmas`
- `get_heatmap_data`, `get_heatmap_totais`
- `get_comparativo_anos`
- `calcular_tempo_medio_resposta_crm`
- `usuario_perfis_lista`, `usuario_permissoes`

---

## V. Tabelas com Acesso Direto do Frontend

### Operação contínua (READ/WRITE)
| Tabela | Operações | Hooks |
|---|---|---|
| `leads` | SELECT, INSERT, UPDATE, DELETE | useKPIsComercial, useCheckLeadDuplicado |
| `alunos` | SELECT, INSERT, UPDATE, DELETE | useKPIsComercial, useKPIsGestao, useMetas |
| `alunos_historico` | SELECT, INSERT, UPDATE, DELETE | useHistoricoLTV |
| `renovacoes` | SELECT, INSERT, UPDATE, DELETE | useKPIsRetencao, useMetas |
| `movimentacoes_admin` | SELECT, INSERT | useKPIsRetencao, useMetas |
| `turmas` | SELECT, INSERT, UPDATE, DELETE | useProfessorDependencies |
| `professores` | SELECT, UPDATE | useKPIsProfessor, useProfessor360 |
| `metas` | SELECT, INSERT, UPDATE, DELETE | useMetas |
| `dados_mensais` | SELECT, INSERT, UPDATE | useKPIsGestao, useDadosMensais |
| `professor_360_*` | SELECT, INSERT, UPDATE, DELETE | useProfessor360 |
| `programa_fideliza_*` | SELECT, INSERT, UPDATE, DELETE | useFidelizaPrograma |
| `programa_matriculador_penalidades` | SELECT, INSERT, DELETE | useMatriculadorPrograma |
| `projetos`, `projeto_*` | SELECT, INSERT, UPDATE, DELETE | useProjetos |

---

## VI. Cálculos: Banco vs. Frontend

### Feitos no banco (VIEW/RPC retorna pronto)
- MRR = alunos_pagantes × ticket_medio
- ARR = MRR × 12
- Taxa conversão = experimentais / leads
- Taxa showup = realizadas / agendadas
- LTV médio
- Dados de carteira por professor (`get_carteira_professores`)
- Dados de 360° por critério (quando compilado em RPC)

### Feitos no frontend
- Consolidação multi-unidade (SUM, AVG conforme métrica)
- Health Score completo (6 fatores × pesos — `useHealthScore`)
- Projeção de metas = (realizado / dia) × 30
- Status de meta (% esperado para o dia)
- Curva de sobrevivência LTV
- Pontuação dos programas Fideliza + Matriculador
- Rankings, ordenações, filtros de tabela
- Formatação de moeda, %, data

---

## VII. Contextos e Filtros Globais

- **`useCompetenciaFiltro()`**: tipo (mensal/trimestral/semestral/anual/personalizado/diario) + range de datas. Todos os hooks recalculam ao mudar.
- **`filtroAtivo`** (OutletContext): UUID da unidade ou `'todos'`
- **Filtros por hook:** unidade_id, ano, mes, professorId (drill-down), status

---

## VIII. Bugs / Inconsistências Documentadas

- **`get_dados_relatorio_coordenacao`**: consulta alunos sem filtro de status (inclui evadido, inativo, trancado). Apenas `AND a.status != 'lead'`.
- **`TabCarteiraProfessores.tsx:197`**: filtra `.in('status', ['ativo', 'trancado'])` — inclui trancado contra a regra da carteira.
- **`ModalDetalhesProfessorPerformance.tsx`**: 3 queries incluem todos os status (`.in('status', ['ativo', 'inativo', 'trancado', 'evadido'])`).
- **`ModalDetalhesTurmas.tsx:82`**: inclui trancado (`.in('status', ['ativo', 'trancado'])`).
- **NPS Médio**: `professores.nps_medio` é lido do banco mas cálculo não está em código acessível — pode estar em `vw_kpis_professor_mensal` (SQL não localizado no repositório).
- **Taxa de Conversão (RPC vs docs)**: `get_kpis_experimentais_professor` usa `status` do lead (`matriculado`, `convertido`) — não a flag `experimental_realizada`. A assimetria documentada em `metricas.md` não reflete exatamente a implementação.
