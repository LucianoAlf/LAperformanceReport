# MAPEAMENTO COMPLETO DO FRONTEND — LA Music Report
## Auditoria de Fontes de Dados (15/02/2026)

---

## TAREFA 1: MAPA DO FRONTEND (página por página)

---

### 📊 PÁGINA: DashboardPage.tsx
**URL:** `/app`

#### COMPONENTE: Cards de Gestão (Pagantes, Matrículas, Evasões, Ticket)
- **Fonte de dados:** 
  - Período atual: `vw_kpis_gestao_mensal`
  - Período histórico: `dados_mensais` → fallback para `alunos` + `vw_kpis_retencao_mensal`
- **Query exata:**
  ```sql
  -- Período atual
  SELECT * FROM vw_kpis_gestao_mensal WHERE ano = 2026 AND mes = 2 [AND unidade_id = ?]
  
  -- Período histórico
  SELECT * FROM dados_mensais WHERE ano = ? AND mes >= ? AND mes <= ? [AND unidade_id = ?]
  ```
- **Filtra por período?** SIM — usa `isPeriodoAtual` para decidir fonte
- **Tem comparativo com ano anterior?** NÃO diretamente nos cards
- **Funciona para meses históricos?** ⚠️ PARCIAL — depende de `dados_mensais` existir

#### COMPONENTE: Cards de Comercial (Leads, Experimentais, Conversão, Ticket Passaporte)
- **Fonte de dados:**
  - Período histórico: `vw_kpis_comercial_historico`
  - Período atual: `dados_comerciais`
- **Query exata:**
  ```sql
  SELECT * FROM vw_kpis_comercial_historico WHERE ano = ? AND mes >= ? AND mes <= ? [AND unidade_id = ?]
  ```
- **Filtra por período?** SIM
- **Funciona para meses históricos?** ✅ SIM (usa view histórica)

#### COMPONENTE: Cards de Professores (Total, Média Alunos, Taxa Renovação)
- **Fonte de dados:** `professores`, `professores_unidades`, `vw_turmas_implicitas`, `professores_performance`, `renovacoes`
- **Query exata:** Múltiplas queries em paralelo
- **Filtra por período?** SIM — usa range de datas para renovações
- **Funciona para meses históricos?** ⚠️ PARCIAL — `professores_performance` é anual

#### COMPONENTE: Evolução de Alunos (gráfico 12 meses)
- **Fonte de dados:** `dados_mensais`
- **Query exata:**
  ```sql
  SELECT ano, mes, alunos_pagantes FROM dados_mensais WHERE ano >= ? [AND unidade_id = ?] ORDER BY ano, mes
  ```
- **Funciona para meses históricos?** ✅ SIM

#### COMPONENTE: Resumo por Unidade (cards Barra, CG, Recreio)
- **Fonte de dados:**
  - Período atual: `vw_dashboard_unidade`
  - Período histórico: `dados_mensais` → fallback para `vw_dashboard_unidade`
- **Filtra por período?** ⚠️ PROBLEMA — `vw_dashboard_unidade` usa CURRENT_DATE
- **Funciona para meses históricos?** ❌ NÃO — sempre mostra dados atuais se `dados_mensais` vazio

#### COMPONENTE: Alertas Inteligentes
- **Fonte de dados:** `vw_alertas_inteligentes`
- **Problema:** ⚠️ View usa `evasoes_legacy` (tabela errada)

---

### 📋 PÁGINA: AdministrativoPage.tsx
**URL:** `/app/administrativo`

#### COMPONENTE: Resumo do Mês (KPIs)
- **Fonte de dados:**
  - Período atual: `vw_kpis_gestao_mensal`
  - Período histórico: `dados_mensais` → fallback para `alunos`
  - Retenção: `vw_kpis_retencao_mensal`
- **Query exata:**
  ```sql
  SELECT * FROM vw_kpis_gestao_mensal WHERE ano = ? AND mes = ? [AND unidade_id = ?]
  SELECT * FROM vw_kpis_retencao_mensal WHERE ano = ? AND mes = ? [AND unidade_id = ?]
  ```
- **Filtra por período?** SIM — usa `useCompetenciaFiltro`
- **Funciona para meses históricos?** ⚠️ PARCIAL

#### COMPONENTE: Lançamento Rápido (Renovações, Evasões, etc.)
- **Fonte de dados:** `movimentacoes_admin`
- **Query exata:**
  ```sql
  SELECT *, unidades(codigo) FROM movimentacoes_admin 
  WHERE data >= ? AND data <= ? [AND unidade_id = ?]
  ORDER BY data DESC
  ```
- **Funciona para meses históricos?** ✅ SIM

#### COMPONENTE: Tabelas de Detalhamento
- **Fonte de dados:** `movimentacoes_admin` (filtrado por tipo)
- **Funciona para meses históricos?** ✅ SIM

#### COMPONENTE: Resumo Administrativo (Indicadores)
- **Fonte de dados:** Calculado a partir de `movimentacoes_admin` + `vw_kpis_retencao_mensal`
- **Tempo Permanência:** ⚠️ Vem de `vw_kpis_gestao_mensal.tempo_permanencia_medio` ou `dados_mensais.tempo_permanencia`
- **Funciona para meses históricos?** ⚠️ PARCIAL — tempo permanência zerado para Jan/2026

---

### 📈 PÁGINA: GestaoMensalPage.tsx (Analytics)
**URL:** `/app/gestao-mensal`

#### ABA: TabGestao.tsx (Alunos/Financeiro/Retenção)

##### Sub-aba Alunos
- **Fonte de dados:**
  - Período atual: `vw_kpis_gestao_mensal`
  - Período histórico: `dados_mensais` → fallback para `alunos` + `evasoes_v2` + `renovacoes`
- **Comparativo mês anterior:** `dados_mensais` WHERE ano=? AND mes=?-1
- **Comparativo ano anterior:** `dados_mensais` WHERE ano=?-1 AND mes=?
- **Funciona para meses históricos?** ✅ SIM (com fallback)

##### Sub-aba Financeiro
- **Fonte de dados:** Mesma lógica de TabGestao
- **Evolução MRR:** `dados_mensais` (últimos 12 meses)

##### Sub-aba Retenção (dentro de TabGestao)
- **Fonte de dados:** `vw_kpis_retencao_mensal` + `evasoes_v2`
- **Funciona para meses históricos?** ✅ SIM

#### ABA: TabRetencao.tsx (standalone)
- **Fonte de dados:** `evasoes_v2`, `renovacoes`, `alunos`
- **Query exata:**
  ```sql
  SELECT * FROM evasoes_v2 WHERE data_evasao >= ? AND data_evasao <= ? [AND unidade_id = ?]
  SELECT * FROM renovacoes WHERE data_vencimento >= ? AND data_vencimento <= ? [AND unidade_id = ?]
  ```
- **Funciona para meses históricos?** ✅ SIM

#### ABA: TabComercialNew.tsx
- **Fonte de dados:**
  - Período histórico: `vw_kpis_comercial_historico`
  - Período atual: `leads` (direto)
- **Funciona para meses históricos?** ✅ SIM

#### ABA: TabProfessoresNew.tsx
- **Fonte de dados:** `vw_kpis_professor_completo`, `vw_evasoes_professores`, `evasoes_v2`, `renovacoes`, `vw_turmas_implicitas`
- **Funciona para meses históricos?** ⚠️ PARCIAL — algumas views usam CURRENT_DATE

---

### 🛒 PÁGINA: ComercialPage.tsx
**URL:** `/app/comercial`

#### COMPONENTE: Resumo do Mês (Leads, Experimentais, Visitas, Matrículas)
- **Fonte de dados:** `leads` (direto) → fallback para `dados_comerciais`
- **Query exata:**
  ```sql
  SELECT *, canais_origem(nome), cursos(nome), unidades(codigo) 
  FROM leads 
  WHERE data_contato >= ? AND data_contato <= ? [AND unidade_id = ?]
  ORDER BY data_contato DESC
  ```
- **Filtra por período?** SIM — usa `useCompetenciaFiltro`
- **Funciona para meses históricos?** ✅ SIM (com fallback para dados_comerciais)

#### COMPONENTE: Tabelas de Detalhamento (Leads, Experimentais, Matrículas)
- **Fonte de dados:** `leads` (filtrado por status)
- **Funciona para meses históricos?** ✅ SIM

---

### 👥 PÁGINA: AlunosPage.tsx
**URL:** `/app/alunos`

#### COMPONENTE: KPIs (Total Ativos, Pagantes, Bolsistas, Ticket, LTV)
- **Fonte de dados:** `alunos` (direto) + RPC `get_tempo_permanencia`
- **Query exata:**
  ```sql
  SELECT id, nome, status, tipo_matricula_id, is_segundo_curso, valor_parcela, ...
  FROM alunos [WHERE unidade_id = ?]
  ORDER BY nome
  ```
- **Filtra por período?** NÃO — mostra snapshot atual
- **Funciona para meses históricos?** ❌ NÃO — sempre mostra dados atuais

#### COMPONENTE: Lista de Alunos
- **Fonte de dados:** `alunos` + `vw_turmas_implicitas` + `anotacoes_alunos`
- **Funciona para meses históricos?** ❌ NÃO — snapshot atual

#### COMPONENTE: Gestão de Turmas
- **Fonte de dados:** `vw_turmas_implicitas`, `turmas_explicitas`
- **Funciona para meses históricos?** ❌ NÃO

---

### 👨‍🏫 PÁGINA: ProfessoresPage.tsx
**URL:** `/app/professores`

#### COMPONENTE: Lista de Professores
- **Fonte de dados:** `professores`, `professores_unidades`, `vw_turmas_implicitas`
- **Funciona para meses históricos?** ❌ NÃO — snapshot atual

#### ABA: TabPerformanceProfessores.tsx
- **Fonte de dados:**
  - Período atual: `vw_kpis_professor_mensal`
  - Período histórico: `professores_performance` (tabela importada)
- **Funciona para meses históricos?** ⚠️ PARCIAL

---

## TAREFA 2: MAPA DAS RPCs

| RPC | O que faz | Parâmetros | Usada por | Fonte interna |
|-----|-----------|------------|-----------|---------------|
| `get_tempo_permanencia` | Calcula tempo médio de permanência dos alunos | `p_unidade_id` | AlunosPage.tsx | `alunos`, `alunos_historico` |
| `get_programa_fideliza_dados` | Dados do programa Fideliza+ | `p_ano`, `p_trimestre`, `p_unidade_id` | useFidelizaPrograma.ts | Tabelas fideliza_* |
| `registrar_penalidade_fideliza` | Registra penalidade no Fideliza+ | `p_ano`, `p_trimestre`, `p_unidade_id`, ... | useFidelizaPrograma.ts | programa_fideliza_* |
| `deletar_penalidade_fideliza` | Remove penalidade | `p_id` | useFidelizaPrograma.ts | programa_fideliza_* |
| `atualizar_config_fideliza` | Atualiza config do programa | `p_ano`, `p_campo`, `p_valor` | useFidelizaPrograma.ts | programa_fideliza_* |
| `salvar_historico_trimestral_fideliza` | Snapshot trimestral | `p_ano`, `p_trimestre` | useFidelizaPrograma.ts | programa_fideliza_* |
| `get_programa_matriculador_dados` | Dados do programa Matriculador | `p_ano`, `p_unidade_id` | useMatriculadorPrograma.ts | Tabelas matriculador_* |
| `registrar_penalidade_matriculador` | Registra penalidade | `p_ano`, `p_unidade_id`, `p_tipo`, ... | useMatriculadorPrograma.ts | programa_matriculador_* |
| `deletar_penalidade_matriculador` | Remove penalidade | `p_id` | useMatriculadorPrograma.ts | programa_matriculador_* |
| `atualizar_config_matriculador` | Atualiza config | `p_ano`, `p_config` | useMatriculadorPrograma.ts | programa_matriculador_* |
| `get_historico_mensal_matriculador` | Histórico mensal | `p_ano`, `p_unidade_id` | useMatriculadorPrograma.ts | programa_matriculador_* |
| `reverter_ocorrencia` | Reverte ocorrência Professor 360 | `p_ocorrencia_id`, `p_usuario_id`, ... | useProfessor360.ts | professor_360_* |
| `restaurar_ocorrencia` | Restaura ocorrência | `p_ocorrencia_id`, `p_usuario_id`, ... | useProfessor360.ts | professor_360_* |
| `editar_ocorrencia` | Edita ocorrência | `p_ocorrencia_id`, `p_usuario_id`, ... | useProfessor360.ts | professor_360_* |
| `registrar_log_ocorrencia` | Log de alteração | `p_ocorrencia_id`, `p_acao`, ... | useProfessor360.ts | professor_360_ocorrencias_log |
| `calcular_health_score_alunos_batch` | Recalcula health score | `p_unidade_id` | TabSucessoAluno.tsx | alunos |
| `calcular_tempo_medio_resposta_crm` | Tempo médio resposta CRM | `p_inicio`, `p_fim` | DashboardTab.tsx (PreAtendimento) | crm_mensagens |
| `marcar_conversa_lida` | Marca conversa como lida | `p_conversa_id` | useConversas.ts | crm_conversas |
| `toggle_mila_conversa` | Pausa/ativa Mila | `p_conversa_id`, `p_pausar`, `p_operador` | ChatPanel.tsx | crm_conversas |
| `get_checklists_farmer` | Lista checklists Farmer | `p_colaborador_id`, `p_unidade_id`, `p_status` | useChecklists.ts, useDashboardStats.ts | farmer_checklists |
| `criar_checklist_from_template` | Cria checklist de template | `p_template_id`, `p_colaborador_id`, `p_unidade_id` | useChecklists.ts | farmer_* |
| `marcar_checklist_item` | Marca item como concluído | `p_item_id`, `p_concluida`, `p_colaborador_id` | useChecklistDetail.ts | farmer_checklist_items |
| `vincular_alunos_checklist` | Vincula alunos ao checklist | `p_checklist_id`, `p_farmer_id`, ... | ChecklistsTab.tsx | farmer_checklist_contatos |
| `get_dados_turma_unidade` | Dados consolidados de turma | `p_unidade_id` | useSimuladorTurma.ts | alunos, turmas |

---

## TAREFA 3: MAPA DAS VIEWS REALMENTE USADAS

| View | Usada pelo frontend? | Fonte de evasões | Usa CURRENT_DATE? | Funciona histórico? |
|------|---------------------|------------------|-------------------|---------------------|
| `vw_kpis_gestao_mensal` | ✅ Dashboard, TabGestao, Administrativo | evasoes_v2 ✅ | ✅ SIM | ❌ Só mês atual |
| `vw_kpis_retencao_mensal` | ✅ Dashboard, TabGestao, Administrativo | evasoes_v2 ✅ | NÃO | ✅ SIM |
| `vw_kpis_comercial_mensal` | ✅ useKPIsComercial | — | ✅ SIM | ❌ Só mês atual |
| `vw_kpis_comercial_historico` | ✅ Dashboard, TabComercialNew | — | NÃO | ✅ SIM |
| `vw_kpis_professor_mensal` | ✅ TabPerformanceProfessores | — | ✅ SIM | ❌ Só mês atual |
| `vw_kpis_professor_completo` | ✅ TabProfessoresNew, useKPIsProfessor | — | ✅ SIM | ❌ Só mês atual |
| `vw_dashboard_unidade` | ✅ Dashboard, TabDashboard | evasoes_v2 ✅ | ✅ SIM | ❌ Só mês atual |
| `vw_alertas_inteligentes` | ✅ Dashboard | ⚠️ evasoes_legacy | ✅ SIM | ❌ PROBLEMA |
| `vw_turmas_implicitas` | ✅ Alunos, Professores, Turmas, Grade | — | NÃO | ✅ Snapshot atual |
| `vw_evasoes_professores` | ✅ TabProfessoresNew | ⚠️ Verificar | ? | ? |
| `vw_fator_demanda_professor` | ✅ TabPerformanceProfessores | — | ? | ? |
| `vw_consolidado_anual` | ✅ useSupabase | ⚠️ Verificar | NÃO | ✅ SIM |
| `vw_unidade_anual` | ✅ useSupabase, useDadosHistoricos | ⚠️ Verificar | NÃO | ✅ SIM |
| `vw_sazonalidade` | ✅ useSupabase | ⚠️ Verificar | NÃO | ✅ SIM |

### Views NÃO usadas pelo frontend (candidatas a remoção):
- `vw_evasoes_motivos` — usa evasoes_legacy ⚠️
- `vw_evasoes_resumo` — usa evasoes_legacy ⚠️
- `vw_professores_performance_atual` — usa evasoes_legacy ⚠️
- `vw_metas_vs_realizado` — verificar uso
- `vw_projecao_metas` — verificar uso
- `vw_ranking_professores_evasoes` — verificar uso
- `vw_totais_unidade_performance` — verificar uso

---

## TAREFA 4: COMPARATIVOS COM ANO ANTERIOR

### Componentes que fazem comparação:

| Componente | Comparativo | Fonte dados anterior | Correto? |
|------------|-------------|---------------------|----------|
| TabGestao.tsx | Mês anterior | `dados_mensais` WHERE ano=?-1 OR mes=?-1 | ✅ OK |
| TabGestao.tsx | Mesmo mês ano anterior | `dados_mensais` WHERE ano=?-1 AND mes=? | ✅ OK |
| KPICard (variação) | % vs anterior | Calculado no frontend | ✅ OK |

### Problema potencial:
- Os dados de 2025 em `dados_mensais` foram **importados de uma apresentação** em jan/2026
- São **confiáveis** para comparativos históricos
- **Janeiro/2026 NÃO TEM dados** em `dados_mensais` → comparativo com Dez/2025 funciona, mas Jan/2026 vs Jan/2025 pode falhar

---

## TAREFA 5: TABELAS HISTÓRICAS vs TABELAS VIVAS

| Tabela | Registros | Atualizada automaticamente? | Última atualização |
|--------|-----------|---------------------------|-------------------|
| `dados_mensais` | 111 | ❌ NÃO — manual | 05/jan/2026 (bulk) |
| `dados_comerciais` | 43 | ❌ NÃO — manual | 18/jan/2026 (bulk) |
| `experimentais_mensal_unidade` | 40 | ❌ NÃO — manual | 18/jan/2026 (bulk) |
| `experimentais_professor_mensal` | 292 | ❌ NÃO — manual | 18/jan/2026 (bulk) |
| `cursos_matriculados` | 226 | ❌ NÃO — manual | 19/jan/2026 (bulk) |
| `alunos_historico` | 1.350 | ❌ NÃO — manual | ? |
| `origem_leads` | 550 | ❌ NÃO — manual | ? |
| `professores_performance` | 125 | ❌ NÃO — manual | ? |

### Impacto:
- **Janeiro/2026** não tem registro em `dados_mensais` → Dashboard mostra zeros ou dados atuais
- **Fevereiro/2026** tem registro parcial → pode estar desatualizado
- Não existe **job automático** para popular essas tabelas no fechamento do mês

---

## TAREFA 6: HOOKS E SERVIÇOS

| Hook/Service | Tabelas/Views que consulta | Usado por | Cache? |
|--------------|---------------------------|-----------|--------|
| `useKPIsGestao.ts` | `vw_kpis_gestao_mensal` | Não usado diretamente (inline) | NÃO |
| `useKPIsRetencao.ts` | `vw_kpis_retencao_mensal`, `alunos` | Não usado diretamente | NÃO |
| `useKPIsComercial.ts` | `vw_kpis_comercial_mensal` | Não usado diretamente | NÃO |
| `useKPIsProfessor.ts` | `vw_kpis_professor_completo` | Não usado diretamente | NÃO |
| `useDadosHistoricos.ts` | `vw_kpis_gestao_mensal`, `vw_kpis_comercial_historico`, `vw_unidade_anual` | Não usado diretamente | NÃO |
| `useDadosMensais.ts` | `dados_mensais` | Verificar uso | NÃO |
| `useEvasoesData.ts` | `evasoes_v2` | Verificar uso | NÃO |
| `useCompetenciaFiltro.ts` | Nenhuma (estado local) | Dashboard, Administrativo, Comercial, Analytics | SIM (estado) |
| `useMetasKPI.ts` | `metas_kpi` | Dashboard, TabGestao | NÃO |
| `useFidelizaPrograma.ts` | RPCs fideliza_* | TabProgramaFideliza | NÃO |
| `useMatriculadorPrograma.ts` | RPCs matriculador_* | TabProgramaMatriculador | NÃO |
| `useProfessor360.ts` | `professor_360_*`, RPCs | Professor360Page | NÃO |
| `useSupabase.ts` | `vw_consolidado_anual`, `vw_unidade_anual`, `vw_sazonalidade` | Verificar uso | NÃO |

---

## 🚨 RESUMO DOS PROBLEMAS IDENTIFICADOS

### CRÍTICOS:
1. **`vw_alertas_inteligentes`** usa `evasoes_legacy` (tabela errada)
2. **`dados_mensais` Jan/2026** não existe → Dashboard mostra zeros
3. **16 views usam CURRENT_DATE** → não funcionam para períodos históricos
4. **Tempo de Permanência zerado** para Jan/2026 na aba Retenção

### MODERADOS:
5. **4 views** ainda referenciam `evasoes_legacy` ou `evasoes` (ambíguo)
6. **Tabelas históricas** nunca são atualizadas automaticamente
7. **Resumo por Unidade** no Dashboard não respeita filtro de período

### BAIXOS:
8. Hooks de KPIs existem mas não são usados (código inline nas páginas)
9. Algumas views podem estar órfãs (não usadas por ninguém)

---

*Documento gerado em 15/02/2026 — Auditoria de Mapeamento Frontend*
