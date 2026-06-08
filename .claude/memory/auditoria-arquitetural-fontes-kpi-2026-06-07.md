# Auditoria Arquitetural de Fontes de KPI

Data: 2026-06-07
Escopo: Dashboard, Analytics/Gestão Mensal, Comercial, Administrativo, Alunos, Professores e Fideliza+
Objetivo: consolidar, em um documento único, as fontes atuais de cards, gráficos e modais de KPI; classificar riscos de divergência; propor arquitetura-alvo sem alterar código, sem mexer em `dados_mensais` e sem recalcular snapshots.

---

## 1. Inventário de fontes

### Dashboard

| Item | Componente / arquivo | Hook / query / fonte | Regra atual | Temporalidade | Tipo de fonte | Risco de divergência |
|---|---|---|---|---|---|---|
| Alunos Ativos | `DashboardPage.tsx` | `vw_kpis_gestao_mensal.total_alunos_ativos`; no histórico cai para `dados_mensais.alunos_ativos`; há fallback adicional | mês atual usa view live; histórico tenta snapshot; se vazio, recalcula | live + histórico | view live + snapshot + fallback | alto |
| Alunos Pagantes | `DashboardPage.tsx` | `vw_kpis_gestao_mensal.total_alunos_pagantes`; histórico via `dados_mensais.alunos_pagantes`; fallback por `alunos` | mistura view, snapshot e fallback | live + histórico | view live + snapshot + tabela bruta | alto |
| Ticket Médio | `DashboardPage.tsx` | `vw_kpis_gestao_mensal.ticket_medio`; histórico via `dados_mensais.ticket_medio`; fallback manual | média depende da fonte do período | live + histórico | view live + snapshot + cálculo frontend | alto |
| Novas Matrículas | `DashboardPage.tsx` | cálculo direto em `alunos.data_matricula`; histórico via `dados_mensais.novas_matriculas` | evento do período | live + histórico | tabela bruta + snapshot | médio |
| Evasões | `DashboardPage.tsx` | `vw_kpis_retencao_mensal.total_evasoes`; histórico via `dados_mensais.evasoes` | evento do período | live + histórico | view live + snapshot | médio |
| Evolução de alunos | `DashboardPage.tsx` | `dados_mensais` | série histórica por mês | histórico | snapshot | médio |
| Resumo por unidade | `DashboardPage.tsx` | `vw_dashboard_unidade` | visão atual por unidade | live | view live | alto |

Observação: o Dashboard já alterna entre view live, `dados_mensais` e fallback em tabela bruta. Isso o torna uma tela de alto risco arquitetural.

### Analytics / Gestão Mensal

| Item | Componente / arquivo | Hook / query / fonte | Regra atual | Temporalidade | Tipo de fonte | Risco de divergência |
|---|---|---|---|---|---|---|
| Alunos Ativos | `TabGestao.tsx` | mês atual: `vw_kpis_gestao_mensal`; histórico: `dados_mensais` | fonte muda conforme período | live + histórico | view live + snapshot | alto |
| Alunos Pagantes | `TabGestao.tsx` | mês atual: `vw_kpis_gestao_mensal`; histórico: `dados_mensais` | fonte muda conforme período | live + histórico | view live + snapshot | alto |
| Ticket Médio | `TabGestao.tsx` | mês atual: `vw_kpis_gestao_mensal.ticket_medio`; histórico: `dados_mensais.ticket_medio`; fallback local quando histórico falha | mistura fontes | live + histórico | view live + snapshot + fallback | alto |
| MRR / ARR | `TabGestao.tsx` | mês atual: `vw_kpis_gestao_mensal`; histórico: `dados_mensais.faturamento_estimado` | financeiro derivado de fontes diferentes | live + histórico | view live + snapshot | alto |
| Inadimplência | `TabGestao.tsx` | mês atual: `vw_kpis_gestao_mensal.inadimplencia_pct`; histórico: `dados_mensais.inadimplencia` | snapshot carrega percentual consolidado | live + histórico | view live + snapshot | alto |
| Churn | `TabGestao.tsx` | mês atual: `vw_kpis_gestao_mensal.churn_rate`; histórico: `dados_mensais.churn_rate` | percentual consolidado | live + histórico | view live + snapshot | alto |
| Renovação / Não renovação / Evasões detalhadas | `TabGestao.tsx` + views/consultas de retenção | `vw_kpis_retencao_mensal`, `movimentacoes_admin`, `dados_mensais` | mistura agregado e detalhe | live + histórico | view live + tabela bruta + snapshot | alto |
| Evolução mensal | `TabGestao.tsx` | `dados_mensais` | série histórica | histórico | snapshot | médio |

Observação: `Analytics` é a tela com a separação mais explícita entre live e histórico, mas ainda mistura fallback e agregações diferentes.

### Comercial

| Item | Componente / arquivo | Hook / query / fonte | Regra atual | Temporalidade | Tipo de fonte | Risco de divergência |
|---|---|---|---|---|---|---|
| Leads | `ComercialPage.tsx`, `useKPIsComercial.ts` | `vw_kpis_comercial_mensal` | contagem por mês/unidade | live | view live | médio |
| Experimentais Agendadas / Realizadas | `ComercialPage.tsx`, `useKPIsComercial.ts` | `vw_kpis_comercial_mensal` | depende de `leads.status` | live | view live | médio |
| Faltaram | `ComercialPage.tsx`, `useKPIsComercial.ts` | cálculo em cima da view | `agendadas - realizadas` | live | cálculo sobre view | médio |
| Taxas de conversão | `ComercialPage.tsx`, `useKPIsComercial.ts` | `vw_kpis_comercial_mensal` | múltiplas fórmulas de conversão | live | view live | alto |
| Funil visual | `ComercialFunil.tsx`, `useComercialData.ts` | `dados_comerciais` | usa snapshot/manual da tabela comercial | histórico/operacional | tabela bruta/snapshot | alto |
| Ticket Médio Parcelas / Passaporte | `ComercialFinanceiro.tsx`, `useComercialData.ts` | `dados_comerciais` | valor importado/manual | histórico/operacional | tabela bruta/snapshot | alto |
| Faturamento Passaporte | `ComercialFinanceiro.tsx`, `useComercialData.ts` | `dados_comerciais` | valor manual/importado | histórico/operacional | tabela bruta/snapshot | alto |
| Faturamento Novos | `ComercialPage.tsx`, `useKPIsComercial.ts` | `vw_kpis_comercial_mensal.faturamento_novos` | soma de matrículas no período | live | view live | médio |

Observação: Comercial já convive com duas fontes principais: `vw_kpis_comercial_mensal` para cards live e `dados_comerciais` para funil/financeiro.

### Administrativo

| Item | Componente / arquivo | Hook / query / fonte | Regra atual | Temporalidade | Tipo de fonte | Risco de divergência |
|---|---|---|---|---|---|---|
| Alunos Ativos / Pagantes / Bolsistas / Ticket / MRR / ARR / Inadimplência / Churn / Permanência | `AdministrativoPage.tsx`, `useKPIsGestao.ts` | `vw_kpis_gestao_mensal` e/ou `dados_mensais` conforme período | agregado gerencial | live + histórico | view live + snapshot | alto |
| Trancados / Matrículas / Banda / 2º curso | `AdministrativoPage.tsx` | consultas diretas em `alunos` | contagens operacionais | live | tabela bruta | médio |
| Renovações previstas / realizadas / pendentes / atrasadas | `AdministrativoPage.tsx`, `useKPIsRetencao.ts` | `vw_kpis_retencao_mensal` | KPIs de retenção | live + histórico | view live + snapshot | alto |
| Não renovações / Evasões / Avisos / Transferências / MRR perdido | `AdministrativoPage.tsx`, `useKPIsRetencao.ts` | `vw_kpis_retencao_mensal` + `movimentacoes_admin` | mistura agregado e detalhe | live + histórico | view live + tabela bruta | alto |
| Tabelas operacionais (renovações, evasões, avisos, trancamentos, alunos novos) | `TabelaRenovacoes.tsx`, `TabelaEvasoes.tsx`, `TabelaAvisosPrevios.tsx`, `TabelaTrancamentos.tsx`, `TabelaAlunosNovos.tsx` | `movimentacoes_admin`, `alunos`, cálculos locais | operação do dia a dia | live | tabela bruta + cálculo frontend | médio |
| Alertas de retenção | `AlertasRetencao.tsx` | `useKPIsRetencao()` + cálculos locais | combina agregados e thresholds locais | live | view live + frontend | médio |

Observação: Administrativo é híbrido por natureza, mas os cards gerenciais já deveriam seguir a mesma disciplina de fonte do `Analytics`.

### Alunos

| Item | Componente / arquivo | Hook / query / fonte | Regra atual | Temporalidade | Tipo de fonte | Risco de divergência |
|---|---|---|---|---|---|---|
| Matrículas Ativas | `AlunosPage.tsx` | cálculo local com `alunosRaw` / `ativosETrancados` | conta linhas ativas/trancadas | live | tabela bruta + cálculo frontend | médio |
| Alunos Ativos | `AlunosPage.tsx` | cálculo local com `Set(nome)` em `alunosRaw` | conta pessoas | live | tabela bruta + cálculo frontend | alto |
| Pagantes | `AlunosPage.tsx` | cálculo local em `alunosRaw` + `tipos_matricula` | exclui `is_segundo_curso`; conta registros locais | live | tabela bruta + cálculo frontend | alto |
| Ticket Médio | `AlunosPage.tsx` | cálculo local agrupando por pessoa e somando cursos | soma cursos e divide por pessoas do mapa local | live | tabela bruta + cálculo frontend | alto |
| T. Permanência | `AlunosPage.tsx` | RPC `get_tempo_permanencia` + cálculo local | depende de RPC separada | live | RPC + frontend | médio |
| Média/Turma / Turmas Sozinhos | `AlunosPage.tsx` | `vw_turmas_implicitas` + cálculo local | operação de turmas | live | view + frontend | médio |
| Distribuição | `DistribuicaoAlunos.tsx` | dados de turmas / cálculos locais | cortes por professor, curso, dia, horário | live | tabela/view + frontend | médio |
| Histórico LTV | `TabHistoricoLTV.tsx`, `useHistoricoLTV.ts` | RPC `get_historico_ltv()` | histórico de passagens | histórico | RPC | baixo |
| Modais/listas operacionais | `TabelaAlunos.tsx`, `ModalFichaAluno.tsx` etc. | `alunos`, `anotacoes_alunos`, `anamneses`, `vw_turmas_implicitas` | operacional | live | tabela bruta + view | baixo para KPI; médio para consistência operacional |

Observação: Alunos é a prova mais clara de dívida: a tela lista via tabela bruta e recalcula cards localmente, mesmo quando o mesmo KPI já existe em fonte canônica em outra tela.

### Professores

| Item | Componente / arquivo | Hook / query / fonte | Regra atual | Temporalidade | Tipo de fonte | Risco de divergência |
|---|---|---|---|---|---|---|
| KPI cards de performance | `TabPerformanceProfessores.tsx` | tenta RPC `get_kpis_professor_periodo()`; se falha, usa múltiplas views/fallbacks | consolida carteira, ticket, presença, conversão, evasões, renovações etc. | live + período customizado | RPC + views + fallback | alto |
| Carteira | `TabCarteiraProfessores.tsx` | RPC `get_carteira_professores()` | carteira atual por professor | live | RPC | médio |
| Conversão | `ModalDetalhesConversao.tsx` | `leads` + regra local de classificação | critério ambíguo entre experimental realizada e matrícula | live/histórico por filtro | tabela bruta + frontend | alto |
| Evasões / Retenção | `ModalDetalhesEvasoes.tsx`, `ModalDetalhesRetencao.tsx` | `movimentacoes_admin` + `motivos_saida` | score depende de FK ou match textual | live/histórico por filtro | tabela bruta + frontend | alto |
| Presença | `ModalDetalhesPresenca.tsx` | RPC `get_presenca_por_aluno_professor()` ou fallback em `aluno_presenca` + `aulas_emusys` | percentual de presença | live/histórico por filtro | RPC + fallback | alto |
| Views auxiliares | `vw_kpis_professor_mensal`, `vw_kpis_professor_completo`, `vw_fator_demanda_professor`, `vw_turmas_implicitas` | referenciadas no frontend | usadas como apoio/fallback | live | view | alto |

Observação: Professores é hoje o domínio mais frágil em arquitetura de KPI porque junta RPCs, views auxiliares e fallback espalhado.

### Fideliza+

| Item | Componente / arquivo | Hook / query / fonte | Regra atual | Temporalidade | Tipo de fonte | Risco de divergência |
|---|---|---|---|---|---|---|
| Ranking / cards do trimestre | `TabProgramaFideliza.tsx`, `useFidelizaPrograma.ts` | RPC `get_programa_fideliza_dados()` | usa médias trimestrais de `dados_mensais` para churn, inadimplência, renovação e reajuste | trimestre atual ou selecionado | RPC sobre snapshot | alto |
| Pontuação / experiência / ranking final | `useFidelizaPrograma.ts` | cálculo frontend após retorno da RPC | pontuação calculada no cliente com metas/config | trimestre | cálculo frontend sobre RPC | alto |
| Penalidades | `TabProgramaFideliza.tsx` | `programa_fideliza_penalidades` via RPC + operações diretas | operação do programa | trimestre/histórico | RPC + tabela bruta | médio |
| Configurações | `TabProgramaFideliza.tsx` | `programa_fideliza_config` | auto-save direto em tabela | anual | tabela bruta | baixo |
| Histórico trimestral | `useFidelizaPrograma.ts` | `programa_fideliza_historico` via RPC | histórico fechado do programa | histórico | snapshot/tabela do programa | médio |

Observação: Fideliza+ já nasce acoplado a `dados_mensais`; portanto herda qualquer staleness do snapshot nas métricas trimestrais.

---

## 2. Classificação do problema

### Fonte divergente

- Dashboard: cards de gestão que alternam entre view live, `dados_mensais` e fallback em `alunos`
- Analytics/Gestão Mensal: mesmo KPI muda de fonte entre mês atual e histórico
- Comercial: cards live em `vw_kpis_comercial_mensal`, mas funil/financeiro em `dados_comerciais`
- Administrativo: cards gerenciais em `useKPIsGestao`/`useKPIsRetencao`; tabelas operacionais em bruto
- Alunos: cards calculados localmente, enquanto KPI equivalente existe em outras telas
- Professores: cards dependem de RPC/fallback múltiplo
- Fideliza+: métricas de ranking saem de RPC sobre `dados_mensais`, com pontuação refinada no frontend

### Regra divergente

- Pagantes e Ativos: regra por pessoa vs linha não está centralizada
- Ticket Médio: em alguns pontos é média de valores; em outros é soma de cursos por pessoa / pessoas pagantes
- Conversão em Professores: critérios do numerador e denominador não são simétricos
- Inadimplência e churn: dependem de agregado já persistido, sem uma trilha uniforme por tela

### Snapshot stale

- `dados_mensais` já foi confirmado stale para Recreio/Jun 2026 no caso `311` vs `310`
- Fideliza+ usa médias trimestrais a partir de `dados_mensais`, então herda essa classe de problema
- Gráficos históricos de Dashboard/Analytics dependem de snapshot e podem divergir do live

### Fallback improvisado

- Dashboard e Analytics usam fallback para tabelas brutas quando histórico/snapshot não retorna dado
- Professores usa RPC esperada e cai para múltiplas views/fallbacks
- Presença em Professores tem RPC/fallback alternativo

### Agregação inconsistente

- Consolidado entre unidades mistura soma, média e média ponderada em pontos diferentes
- KPI por pessoa vs por matrícula não está centralizado
- Gráficos e cards nem sempre usam a mesma agregação

### Objeto inexistente / não confirmado

- `get_kpis_professor_periodo()` — referenciada no frontend; precisa confirmação definitiva no catálogo do banco
- `get_presenca_por_aluno_professor()` — idem
- `vw_kpis_professor_mensal`, `vw_kpis_professor_completo`, `vw_fator_demanda_professor`, `vw_turmas_implicitas` — referenciadas; algumas já sabemos que existem pelo uso da aplicação, mas o inventário formal no banco ainda precisa fechamento único

### Legado / bug

- Caso `310/311` em Recreio: sintoma de arquitetura quebrada; snapshot stale confirmado
- Contagem por linha em vez de pessoa onde o KPI deveria ser por pessoa
- Critérios ambíguos de conversão em Professores
- Dependência de cálculos locais no frontend para KPI já compartilhado com outras telas

---

## 3. Arquitetura-alvo

### KPI live do mês atual → fonte canônica única

Regra-alvo:
- cada KPI executivo do mês atual deve ter **uma fonte canônica única**
- essa fonte deve alimentar cards equivalentes em todas as telas
- frontend não deve recalcular regra de negócio executiva localmente quando já existe fonte canônica

Aplicação:
- `Alunos Pagantes`, `Alunos Ativos`, `Ticket Médio`, `MRR`, `Inadimplência`, `Churn` devem sair da mesma camada canônica live em Dashboard, Analytics, Administrativo, Alunos e, quando aplicável, Fideliza+

### KPI histórico / mês fechado → `dados_mensais`

Regra-alvo:
- histórico fechado não deve ser recalculado a partir da foto atual das tabelas operacionais
- se o mês está fechado, a fonte histórica é `dados_mensais`
- gráficos históricos e comparativos de período devem usar o snapshot fechado

Aplicação:
- comparativos mês anterior/ano anterior
- séries temporais
- relatórios fechados
- parte histórica do Fideliza+

### Lista operacional → tabela bruta

Regra-alvo:
- listas, tabelas operacionais, formulários, filtros e telas de trabalho continuam vindo de tabelas brutas
- isso inclui `alunos`, `leads`, `movimentacoes_admin`, `renovacoes`, `aluno_presenca`, `turmas_explicitas`, etc.

Aplicação:
- `TabelaAlunos`
- `TabelaRenovacoes`
- `TabelaEvasoes`
- funis operacionais
- tabelas de leads
- modais de edição e governança

### Drill-down / modal → fonte detalhada coerente com o KPI pai

Regra-alvo:
- o modal detalhado pode usar fonte mais granular, mas precisa ser coerente com o KPI pai
- se o card de conversão usa regra A, o drill-down não pode listar com regra B
- se o card de evasão exclui transferências, o modal precisa espelhar isso ou explicar explicitamente a diferença

Aplicação:
- modais de conversão, evasão, retenção, presença
- gráficos clicáveis
- detalhes de cards do Dashboard/Analytics

---

## 4. Prioridade de correção

### P0 — confiança executiva

- Alunos Pagantes
- Alunos Ativos
- Ticket Médio
- MRR
- Inadimplência
- Churn

Objetivo:
- unificar fonte live do mês atual
- eliminar recalculo local competitivo
- tornar explícita a fronteira entre live e snapshot

### P1 — operação

- Comercial / funil
- Administrativo / retenção
- Professores / performance / conversão

Objetivo:
- alinhar cards com drill-downs
- remover fallbacks que escondem inconsistência
- fechar objetos não confirmados no banco

### P2 — gráficos / drill-down

- evolução
- distribuição
- modais detalhados
- comparativos por período

Objetivo:
- garantir que visualizações secundárias não contradigam os KPIs principais

---

## 5. Status de cada achado

### Confirmado

- existe fragmentação de fontes entre páginas
- `Analytics/Gestão Mensal` usa live no mês atual e `dados_mensais` no histórico
- `Alunos` recalcula cards localmente com base em tabelas brutas
- `Comercial` divide métricas entre `vw_kpis_comercial_mensal` e `dados_comerciais`
- `Fideliza+` usa RPC `get_programa_fideliza_dados()` sustentada por `dados_mensais` para as métricas trimestrais
- caso `310/311` em Recreio/Jun 2026: live/view `310`, snapshot `311`

### Provável

- divergências adicionais em KPIs executivos semelhantes entre Dashboard, Administrativo e Analytics
- agregações inconsistentes no modo consolidado entre unidades
- risco de conversão >100% por assimetria real entre critérios de experimental e matrícula

### Pendente de validação

- catálogo definitivo no banco para todas as views/RPCs referenciadas em Professores
- confirmação única de quais objetos existem fisicamente vs apenas em código/migration antiga
- quais métricas do Dashboard ainda dependem de views acopladas a `CURRENT_DATE`
- mapeamento final de todos os gráficos do Fideliza+ e do Dashboard em relação a live vs snapshot

### Legado / bug

- snapshot stale em `dados_mensais`
- KPI executivo recalculado no frontend em telas operacionais
- fallback que troca silenciosamente de fonte
- regra por pessoa/linha não unificada
- dependência de lógica histórica recalculada a partir de tabelas correntes quando falta snapshot

---

## Observações finais

- Este documento consolida a auditoria arquitetural sem alterar código.
- Não houve mudança em `dados_mensais`.
- Não houve recálculo de snapshot.
- Não assume como decisão final “converter tudo para RPC”; isso continua dependente de validação do banco e do desenho final de arquitetura.
- Próximo passo recomendado: transformar este inventário em uma matriz operacional única de `KPI -> fonte atual -> fonte alvo -> status de validação -> prioridade`.

---

## 6. Validação real no banco

Validação feita em modo SELECT-only via Supabase MCP no projeto `ouqwbbermlzqqvtqwlul`.

### Objetos confirmados no banco

- Views: `vw_kpis_gestao_mensal`, `vw_kpis_comercial_mensal`, `vw_kpis_retencao_mensal`, `vw_dashboard_unidade`, `vw_turmas_implicitas`, `vw_kpis_professor_mensal`, `vw_kpis_professor_completo`, `vw_fator_demanda_professor`
- Functions/RPCs: `get_historico_ltv`, `get_carteira_professores`, `get_kpis_experimentais_professor`, `get_kpis_professor_periodo`, `get_programa_fideliza_dados`, `get_tempo_permanencia`
- Tabelas: `alunos`, `dados_mensais`, `dados_comerciais`, `leads`, `movimentacoes_admin`, `renovacoes`, `aluno_presenca`, `aulas_emusys`, `alunos_historico`, `turmas_explicitas`, `programa_fideliza_config`, `programa_fideliza_penalidades`, `programa_fideliza_historico`, `programa_fideliza_experiencias`, `professores_unidades`, `professores_cursos`, `turmas_alunos`

### Objetos ausentes confirmados

- `get_presenca_por_aluno_professor` não existe no banco

### Achados de catálogo relevantes

- `vw_kpis_gestao_mensal`, `vw_kpis_comercial_mensal`, `vw_dashboard_unidade` e `vw_kpis_professor_mensal` usam `CURRENT_DATE` na definição
- `vw_dashboard_unidade` depende de `dados_mensais`
- `vw_kpis_gestao_mensal` existe e expõe `ano`, `mes`, `total_alunos_ativos`, `total_alunos_pagantes`, `ticket_medio`, `mrr`, `inadimplencia_pct`, `faturamento_previsto`, `faturamento_realizado`, `churn_rate`
- `get_kpis_professor_periodo` existe e consolida carteira, presença, turmas, experimentais, renovações e evasões em uma única função parametrizada
- `get_presenca_por_aluno_professor` é o único objeto principal de Professores citado no frontend e confirmado como inexistente

### Fallbacks silenciosos confirmados no código

- `useKPIsGestao` tenta `vw_kpis_gestao_mensal` e, se vier vazio, cai para `dados_mensais`; tendência do mês anterior sempre sai de `dados_mensais`
- `DashboardPage` usa `vw_kpis_gestao_mensal` no período atual; no histórico tenta `dados_mensais` e, se vazio, recalcula a partir de `alunos`
- `TabGestao` usa `dados_mensais` no histórico, mas ainda consulta `vw_kpis_gestao_mensal` como fallback de `reajuste_medio`
- `useKPIsComercial` tenta `vw_kpis_comercial_mensal` e cai para `leads` + `alunos`
- `useKPIsRetencao` tenta `vw_kpis_retencao_mensal` e cai para `movimentacoes_admin` + `renovacoes` + `alunos`
- `ModalDetalhesPresenca` tenta RPC inexistente e cai para `aluno_presenca` + `aulas_emusys`

---

## 7. Matriz operacional validada

### Dashboard

| Tela | Item | Componente/arquivo | Hook/query/RPC/view/tabela | Fonte atual | Objeto existe no banco? | Regra atual | Live ou histórico | Fonte canônica proposta | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard | Card Alunos Ativos | `DashboardPage.tsx` | `vw_kpis_gestao_mensal` / `dados_mensais` / fallback `alunos` | view live; snapshot; fallback bruto | sim | atual = view por `ano/mes`; histórico = snapshot; fallback recalcula contagem local | live + histórico | live: fonte canônica única de gestão; histórico: `dados_mensais` | alto | P0 | confirmado |
| Dashboard | Card Alunos Pagantes | `DashboardPage.tsx` | `vw_kpis_gestao_mensal` / `dados_mensais` / fallback `alunos` | view live; snapshot; fallback bruto | sim | mistura fonte live, snapshot e cálculo em tabela atual | live + histórico | live: fonte canônica única de gestão; histórico: `dados_mensais` | alto | P0 | confirmado |
| Dashboard | Card Ticket Médio | `DashboardPage.tsx` | `vw_kpis_gestao_mensal.ticket_medio` / `dados_mensais.ticket_medio` / cálculo manual | view, snapshot e cálculo local | sim | ticket muda conforme fonte do período | live + histórico | live: fonte canônica única; histórico: `dados_mensais` | alto | P0 | confirmado |
| Dashboard | Card Novas Matrículas | `DashboardPage.tsx` | `alunos.data_matricula` / `dados_mensais.novas_matriculas` | tabela bruta no live; snapshot no histórico | sim | evento do período | live + histórico | live: tabela operacional ou camada canônica de evento; histórico: `dados_mensais` | médio | P1 | confirmado |
| Dashboard | Card Evasões | `DashboardPage.tsx` | `vw_kpis_retencao_mensal` / `dados_mensais` | view live; snapshot histórico | sim | evento do período | live + histórico | live: camada canônica de retenção; histórico: `dados_mensais` | médio | P1 | confirmado |
| Dashboard | Gráfico Evolução | `DashboardPage.tsx` | `dados_mensais` | snapshot mensal | sim | série histórica | histórico | `dados_mensais` | médio | P2 | confirmado |
| Dashboard | Cards Resumo por Unidade | `DashboardPage.tsx` | `vw_dashboard_unidade` | view live dependente de `CURRENT_DATE` e `dados_mensais` | legado | visão atual por unidade | live | mesma fonte canônica live dos KPIs executivos, sem semântica ambígua | alto | P0 | confirmado |

### Analytics / Gestão Mensal

| Tela | Item | Componente/arquivo | Hook/query/RPC/view/tabela | Fonte atual | Objeto existe no banco? | Regra atual | Live ou histórico | Fonte canônica proposta | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Analytics | Card Alunos Ativos | `TabGestao.tsx` | `vw_kpis_gestao_mensal` ou `dados_mensais` | live = view; histórico = snapshot | sim | troca de fonte por período | live + histórico | live: fonte canônica única; histórico: `dados_mensais` | alto | P0 | confirmado |
| Analytics | Card Alunos Pagantes | `TabGestao.tsx` | `vw_kpis_gestao_mensal` ou `dados_mensais` | live = view; histórico = snapshot | sim | troca de fonte por período | live + histórico | live: fonte canônica única; histórico: `dados_mensais` | alto | P0 | confirmado |
| Analytics | Card Ticket Médio | `TabGestao.tsx` | `vw_kpis_gestao_mensal.ticket_medio` / `dados_mensais.ticket_medio` | view live; snapshot histórico | sim | ticket histórico vira snapshot; reajustes usam fallback da view | live + histórico | live: fonte canônica única; histórico: `dados_mensais` | alto | P0 | confirmado |
| Analytics | Card MRR | `TabGestao.tsx` | `vw_kpis_gestao_mensal.mrr` / `dados_mensais.faturamento_estimado` | view live; snapshot derivado no histórico | sim | histórico usa campo diferente da nomenclatura live | live + histórico | live: fonte canônica única; histórico: `dados_mensais` | alto | P0 | confirmado |
| Analytics | Card Inadimplência | `TabGestao.tsx` | `vw_kpis_gestao_mensal.inadimplencia_pct` / `dados_mensais.inadimplencia` | view live; snapshot histórico | sim | percentual consolidado por fonte distinta | live + histórico | live: fonte canônica única; histórico: `dados_mensais` | alto | P0 | confirmado |
| Analytics | Card Churn | `TabGestao.tsx` | `vw_kpis_gestao_mensal.churn_rate` / `dados_mensais.churn_rate` | view live; snapshot histórico | sim | percentual consolidado por fonte distinta | live + histórico | live: fonte canônica única; histórico: `dados_mensais` | alto | P0 | confirmado |
| Analytics | Retenção detalhada | `TabGestao.tsx` | `vw_kpis_retencao_mensal` + `movimentacoes_admin` + `dados_mensais` | mistura agregado e detalhe | sim | histórico reconstrói parte do detalhe fora da view | live + histórico | KPI pai em fonte canônica; drill-down coerente em tabela detalhada | alto | P1 | confirmado |
| Analytics | Evolução histórica | `TabGestao.tsx` | `dados_mensais` | snapshot | sim | série mensal fechada | histórico | `dados_mensais` | médio | P2 | confirmado |

### Comercial

| Tela | Item | Componente/arquivo | Hook/query/RPC/view/tabela | Fonte atual | Objeto existe no banco? | Regra atual | Live ou histórico | Fonte canônica proposta | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Comercial | Cards Leads / Experimentais / Show-up | `ComercialPage.tsx`, `useKPIsComercial.ts` | `vw_kpis_comercial_mensal` com fallback `leads` + `alunos` | view live ou fallback bruto | sim | hook não filtra explicitamente `ano/mes` na query da view; consolida no frontend | live | fonte canônica comercial live | médio | P1 | confirmado |
| Comercial | Cards Conversão | `ComercialPage.tsx`, `useKPIsComercial.ts` | `vw_kpis_comercial_mensal` com fallback tabelas | view live ou fallback bruto | sim | médias consolidadas no frontend; risco de regra divergente com detalhe | live | fonte canônica comercial live | alto | P1 | confirmado |
| Comercial | Funil Visual | `ComercialFunil.tsx`, `useComercialData.ts` | `dados_comerciais` | tabela/snapshot comercial | sim | funil usa tabela separada da view live | histórico/operacional | live: fonte canônica comercial; histórico fechado: `dados_comerciais` ou snapshot oficial definido | alto | P1 | confirmado |
| Comercial | Ticket Médio Parcelas / Passaporte | `ComercialFinanceiro.tsx`, `useComercialData.ts` | `dados_comerciais` | tabela bruta/manual | sim | média calculada sobre tabela comercial importada | histórico/operacional | snapshot comercial fechado; não reaproveitar KPI executivo live sem regra explícita | alto | P1 | confirmado |
| Comercial | Faturamento Novos | `ComercialPage.tsx`, `useKPIsComercial.ts` | `vw_kpis_comercial_mensal.faturamento_novos` | view live | sim | soma no período | live | fonte canônica comercial live | médio | P1 | confirmado |

### Administrativo

| Tela | Item | Componente/arquivo | Hook/query/RPC/view/tabela | Fonte atual | Objeto existe no banco? | Regra atual | Live ou histórico | Fonte canônica proposta | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Administrativo | Cards gestão executiva | `AdministrativoPage.tsx`, `useKPIsGestao.ts` | `vw_kpis_gestao_mensal` com fallback `dados_mensais` | view live + snapshot | sim | soma/média no consolidado; fallback silencioso | live + histórico | mesma fonte canônica de gestão do Analytics | alto | P0 | confirmado |
| Administrativo | Cards retenção | `AdministrativoPage.tsx`, `useKPIsRetencao.ts` | `vw_kpis_retencao_mensal` com fallback `movimentacoes_admin` + `renovacoes` + `alunos` | view live + fallback bruto | sim | fallback recompõe retenção localmente | live | fonte canônica de retenção + detalhe operacional separado | alto | P1 | confirmado |
| Administrativo | Tabela Alunos Novos | `TabelaAlunosNovos.tsx` | `alunos` + filtros locais | tabela bruta | sim | operação do mês | live | tabela bruta | médio | P1 | provável |
| Administrativo | Alertas Retenção | `AlertasRetencao.tsx` | `useKPIsRetencao()` + cálculo local | view + frontend | sim | thresholds locais sobre agregado | live | KPI pai canônico + lógica de alerta local | médio | P2 | provável |

### Alunos

| Tela | Item | Componente/arquivo | Hook/query/RPC/view/tabela | Fonte atual | Objeto existe no banco? | Regra atual | Live ou histórico | Fonte canônica proposta | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Alunos | Card Matrículas Ativas | `AlunosPage.tsx` | `alunosRaw` + cálculo JS | tabela bruta + frontend | sim | conta linhas ativas/trancadas/aviso prévio | live | tabela operacional local | médio | P1 | confirmado |
| Alunos | Card Alunos Ativos | `AlunosPage.tsx` | `alunosRaw` + `Set(nome)` | tabela bruta + frontend | sim | conta pessoas distintas no cliente | live | fonte canônica única de gestão live | alto | P0 | confirmado |
| Alunos | Card Pagantes | `AlunosPage.tsx` | `alunosRaw` + `tipos_matricula` + cálculo JS | tabela bruta + frontend | sim | `conta_como_pagante`, sem `is_segundo_curso`, conta registros locais | live | fonte canônica única de gestão live | alto | P0 | confirmado |
| Alunos | Card Ticket Médio | `AlunosPage.tsx` | `alunosRaw` + agrupamento JS por pessoa | tabela bruta + frontend | sim | soma parcelas por pessoa no cliente e divide por pessoas | live | fonte canônica única de gestão live | alto | P0 | confirmado |
| Alunos | Card T. Permanência | `AlunosPage.tsx` | RPC `get_tempo_permanencia` + média local | RPC + frontend | sim | média de `tempo_permanencia_medio` retornada | live | detalhe coerente com KPI pai de permanência | médio | P2 | confirmado |
| Alunos | Card Média/Turma / Sozinhos | `AlunosPage.tsx` | `vw_turmas_implicitas` + cálculo local | view + frontend | sim | operação de turmas | live | `vw_turmas_implicitas` | médio | P2 | confirmado |
| Alunos | Gráfico Distribuição | `DistribuicaoAlunos.tsx` | turmas / view / cálculos locais | detalhe operacional | sim | cortes por professor, curso, dia e horário | live | tabela/view operacional | médio | P2 | provável |
| Alunos | Histórico LTV | `TabHistoricoLTV.tsx`, `useHistoricoLTV.ts` | RPC `get_historico_ltv` | RPC histórica | sim | histórico de passagens | histórico | `get_historico_ltv` | baixo | P2 | confirmado |

### Professores

| Tela | Item | Componente/arquivo | Hook/query/RPC/view/tabela | Fonte atual | Objeto existe no banco? | Regra atual | Live ou histórico | Fonte canônica proposta | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Professores | KPI cards de Performance | `TabPerformanceProfessores.tsx` | RPC `get_kpis_professor_periodo` | função parametrizada | sim | consolida carteira, ticket, presença, conversão, renovações e evasões | live + período customizado | `get_kpis_professor_periodo` como fonte canônica do domínio | alto | P1 | confirmado |
| Professores | Histórico/tendência de média/turma | `TabPerformanceProfessores.tsx` | `vw_kpis_professor_mensal` | view mensal | sim | histórico mensal por professor/unidade | histórico | snapshot/camada histórica definida do domínio professores | médio | P2 | confirmado |
| Professores | Fator de Demanda | `TabPerformanceProfessores.tsx` | `vw_fator_demanda_professor` | view live | sim | ponderação por curso/alunos | live | `vw_fator_demanda_professor` | médio | P2 | confirmado |
| Professores | Carteira | `TabCarteiraProfessores.tsx` | RPC `get_carteira_professores` | função | sim | carteira atual por professor | live | `get_carteira_professores` | médio | P1 | confirmado |
| Professores | Modal Presença | `ModalDetalhesPresenca.tsx` | tenta RPC `get_presenca_por_aluno_professor`; fallback `aluno_presenca` + `aulas_emusys` | fallback bruto na prática | não | RPC inexistente provoca fallback silencioso | live/histórico por filtro | fonte detalhada coerente do domínio presença | alto | P2 | confirmado |
| Professores | Modal Conversão | `ModalDetalhesConversao.tsx` | `leads` + classificação local | tabela bruta + frontend | sim | critérios locais podem divergir da taxa do card | live/histórico por filtro | drill-down coerente com `get_kpis_professor_periodo` | alto | P1 | provável |
| Professores | Modal Evasões / Retenção | `ModalDetalhesEvasoes.tsx`, `ModalDetalhesRetencao.tsx` | `movimentacoes_admin` + `motivos_saida` | tabela bruta + frontend | sim | score depende de FK ou match textual | live/histórico por filtro | drill-down coerente com KPI pai de professor | alto | P1 | confirmado |

### Fideliza+

| Tela | Item | Componente/arquivo | Hook/query/RPC/view/tabela | Fonte atual | Objeto existe no banco? | Regra atual | Live ou histórico | Fonte canônica proposta | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Fideliza+ | Ranking / cards trimestrais | `TabProgramaFideliza.tsx`, `useFidelizaPrograma.ts` | RPC `get_programa_fideliza_dados` | RPC baseada em `dados_mensais` + tabelas do programa | sim | usa médias trimestrais de churn, inadimplência, renovação e reajuste vindas do snapshot | trimestre/histórico fechado | histórico fechado do programa; dependência explícita de `dados_mensais` | alto | P1 | confirmado |
| Fideliza+ | Pontuação final | `useFidelizaPrograma.ts` | cálculo frontend após RPC | frontend sobre dados da RPC | sim | pontuação, bônus e ranking calculados no cliente | trimestre | manter cálculo explícito e coerente com RPC do programa | alto | P2 | confirmado |
| Fideliza+ | Penalidades | `TabProgramaFideliza.tsx` | `programa_fideliza_penalidades` + RPCs do programa | tabela + RPC | sim | operação do programa | trimestre/histórico | tabela do programa | médio | P2 | confirmado |
| Fideliza+ | Histórico trimestral | `useFidelizaPrograma.ts` | `programa_fideliza_historico` via RPC | snapshot do programa | sim | histórico fechado do programa | histórico | `programa_fideliza_historico` | médio | P2 | confirmado |
