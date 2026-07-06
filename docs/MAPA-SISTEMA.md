# Mapa do Sistema — LA Music Performance Report

> **Propósito:** guia de referência rápida. Para cada página: rota, componentes, hooks, **RPCs** (funções do Postgres) e **edge functions** que ela usa. Consulte aqui antes de mexer numa página para entender de onde vêm os dados.
>
> **Manutenção (obrigatória):** ao criar/alterar uma página, hook, RPC ou edge function, **atualizar este arquivo no mesmo commit**. Critérios de cálculo de métricas ficam em [`docs/METRICAS.md`](./METRICAS.md). Ciclo Emusys em [`docs/MAPA-INTEGRACAO-EMUSYS.md`](./MAPA-INTEGRACAO-EMUSYS.md).
>
> Última atualização: 2026-06-23.

## Índice de rotas

| Rota | Página | Seção |
|---|---|---|
| `/app` | Dashboard | [#dashboard](#dashboard-app) |
| `/app/gestao-mensal` | Gestão Mensal | [#gestão-mensal](#gestão-mensal-appgestao-mensal) |
| `/app/comercial` | Comercial | [#comercial](#comercial-appcomercial) |
| `/app/pre-atendimento` | Pré-Atendimento (CRM/WhatsApp) | [#pré-atendimento](#pré-atendimento-apppre-atendimento) |
| `/app/campanhas` | Campanhas (Meta) | [#campanhas](#campanhas-appcampanhas) |
| `/app/alunos` | Alunos | [#alunos](#alunos-appalunos) |
| `/app/sucesso-aluno` | Sucesso do Aluno | [#sucesso-do-aluno](#sucesso-do-aluno-appsucesso-aluno) |
| `/app/professores` | Professores | [#professores](#professores-appprofessores) |
| `/app/retencao` | Retenção | [#retenção](#retenção-appretencao) |
| `/app/administrativo` | Administrativo | [#administrativo](#administrativo-appadministrativo) |
| `/app/metas` | Metas (simuladores) | [#metas](#metas-appmetas) |
| `/app/salas` | Salas / Inventário | [#salas](#salas-appsalas) |
| `/app/projetos` | Projetos | [#projetos](#projetos-appprojetos) |
| `/app/automacoes` | Automações (saúde) | [#automações](#automações-appautomacoes) |
| `/app/config` | Configurações | [#config](#config-appconfig) |
| `/app/admin/usuarios`, `/admin/permissoes` | Admin | [#admin](#admin-appadmin) |
| `/app/entrada/*`, `/relatorios/diario` | Entrada (formulários) | [#entrada](#entrada-appentrada) |
| `/app/apresentacoes-2025` | Histórico (apresentações) | [#histórico](#histórico-appapresentacoes-2025) |
| `/feedback/:token` | Feedback do professor (público) | [#feedback-público](#feedback-do-professor-público-feedbacktoken) |

---

## Dashboard (`/app`)
- **Componentes:** `Dashboard/DashboardPage.tsx`, `Dashboard/ModalDetalheKPI.tsx`
- **Hooks:** `useMetasKPI`, `useComercialOperacionalResumoV2`
- **RPCs:** nenhuma (queries diretas)
- **Edge functions:** nenhuma
- **Tabelas/views:** `alunos`, `movimentacoes_admin`, `leads`, `vw_alertas_inteligentes`, `professores`, `vw_turmas_implicitas`, `professores_performance`, `dados_mensais`, `unidades`

## Gestão Mensal (`/app/gestao-mensal`)
Orquestrador `GestaoMensal/GestaoMensalPage.tsx`. Abas: **Gestão**, **Comercial**, **Professores**.
- **Gestão (`TabGestao.tsx`):** hook `useMetasKPI`, `useCompetenciaMensalStatus`, `fetchKPIsAlunosCanonicos`. **RPC:** `recalcular_dados_mensais`. Tabelas: `alunos`, `movimentacoes_admin`, `dados_mensais`, `motivos_saida`.
- **Comercial (`TabComercialNew.tsx`):** `fetchComercialOperacionalResumoV2`, `fetchExperimentaisDiagnosticoComercialV2`. RPCs: nenhuma direta. Tabelas: `leads`, `alunos`, `dados_mensais`.
- **Professores (`TabProfessoresNew.tsx`):** **RPC** `get_experimentais_professor_canonicos_v1`. Views: `vw_kpis_professor_mensal` (mês vivo) / `vw_kpis_professor_historico` (passado), `professores_performance`, `vw_evasoes_professores`, `vw_turmas_implicitas`.
- **Modal Permanência (`ModalPermanenciaDetalhe.tsx`):** **RPC** `get_historico_ltv`.

## Comercial (`/app/comercial`)
- **Componentes:** `Comercial/ComercialPage.tsx` (+ `ComercialConciliacaoExperimentais`, `PlanilhaComercial`, `PlanoAcaoComercial`, `TabProgramaMatriculador`, `AlertasComercial`, `FunnelPipelineNav`)
- **Hooks:** `useCompetenciaFiltro`, `useCheckLeadDuplicado`, `useCheckAlunoDuplicado`, `useMatriculadorPrograma`
- **RPCs:** `get_kpis_comercial_canonicos_v2`, `get_conciliacao_experimentais_v2`, `get_experimentais_emusys_operacional_v1`, `buscar_anamnese_pendente`
- **Edge functions:** `gemini-insights-comercial` (plano de ação IA), `relatorio-admin-whatsapp`

## Pré-Atendimento (`/app/pre-atendimento`)
CRM de leads + inbox WhatsApp (UAZAPI). Orquestrador `PreAtendimento/PreAtendimentoPage.tsx`; abas Leads, Pipeline (kanban), Agenda, Dashboard, Metas, Relatórios, Conversas, Mila, Automação, Config.
- **Hooks:** `useLeadsCRM` (central), `useConversas`, `useMensagens`, `useWhatsAppStatus`, `useWhatsAppCaixas`, `useNotificacoes`, `useVisitas`, `useCheckLeadDuplicado`
- **RPCs:** `marcar_conversa_lida`, `toggle_mila_conversa`, `calcular_tempo_medio_resposta_crm`
- **Edge functions:** `enviar-mensagem-lead`, `whatsapp-status`, `whatsapp-connect`, `listar-instancias-uazapi`, `configurar-webhook-caixa`, `buscar-foto-perfil`, `relatorio-admin-whatsapp`, `sync-feriados`

## Campanhas (`/app/campanhas`)
Disparo de templates Meta (WhatsApp Cloud API) + conversas + agentes IA. `Campanhas/CampanhasPage.tsx`; abas Campanhas, Dashboard, Conversas, Analytics, Agentes, Templates, Config.
- **Hooks:** `useCampanhas`, `useKPIsCampanha`, `useConversasCampanha`, `useContatosCampanha`, `useAgentes`, `useNumerosMeta`, `useTemplatesMeta`, `useCampanhasConfig`
- **RPCs:** nenhuma
- **Edge functions:** `enviar-campanha`, `controle-campanha` (pausa/retoma), `enviar-mensagem-meta`, `gerenciar-templates`, `sincronizar-templates`, `gerar-prompt-agente`

## Alunos (`/app/alunos`)
- **Componentes:** `Alunos/AlunosPage.tsx` (+ `TabelaAlunos`, `GestaoTurmas`, `DistribuicaoAlunos`, `ConciliacaoMatriculas`, `ImportarAlunos`, `TabHistoricoLTV`, `Automacao/TabAutomacao`, sub-módulo `Auditoria/`). Modais: `ModalNovoAluno`, `ModalFichaAluno` (com abas Pesquisas, Aulas e **Histórico Pedagógico**), `ModalNovaTurma`, `ModalPassagensAluno`, etc.
- **Aba Histórico Pedagógico (`ModalFichaAluno`):** mostra o conteúdo das aulas (`aulas_emusys.anotacoes`, via RPC `get_relatorio_pedagogico_aluno`) e o painel **Relatório Pedagógico com IA** (`RelatorioPedagogicoIA`): seletor de período (mensal/semestral/anual/personalizado) → edge `gerar-relatorio-pedagogico` (Gemini) gera um **rascunho editável** → coordenador ajusta → imprime (template com logo/equipe). Rascunhos salvos em `relatorios_pedagogicos` (histórico + reuso futuro pelo agente Fábio no WhatsApp).
- **Hooks:** `useCompetenciaFiltro`, `useCompetenciaMensalStatus`, `fetchKPIsAlunosCanonicos`, `Auditoria/useAuditoriaEmusys`, `Auditoria/useAgentChat`
- **RPCs:** `recalcular_dados_mensais`, `get_tempo_permanencia`, `buscar_anamnese_pendente`, `buscar_anamneses_pendentes`, `vincular_anamnese_aluno`, `get_conciliacao_matriculas`, `execute_bi_query_lamusic` (auditoria IA), `get_timeline_pesquisas_aluno`/`registrar_resposta_pesquisa_manual` (aba Pesquisas — ver Sucesso do Aluno), `get_historico_aulas_aluno` (aba Aulas), `get_relatorio_pedagogico_aluno(p_aluno_id, p_data_inicio, p_data_fim)` (Histórico Pedagógico; período opcional)
- **Edge functions:** `gerar-relatorio-pedagogico` (Gemini 3 Flash; gera o relatório pedagógico a partir das anotações e persiste em `relatorios_pedagogicos`). Auditoria IA usa `execute_bi_query_lamusic` via RPC.
- **Tabelas:** `relatorios_pedagogicos` (histórico de relatórios pedagógicos gerados por IA; RLS por unidade padrão `metas`).

## Sucesso do Aluno (`/app/sucesso-aluno`)
`SucessoCliente/SucessoClientePage.tsx`. Abas: **Caixa de Entrada** (`CaixaEntradaTab`, departamento `sucesso_aluno`) e **Acompanhamento** (`TabSucessoAluno` → tabela, jornada, pesquisa, presença, faltas, marcos, análise, **cartões**). Subaba **Cartões** = `CartoesContatoTab` (hook `useVcardsUnidade`, `VcardPreview`) → CRUD de `vcards_unidade` + envio de teste via edge `enviar-vcard` (UAZAPI `/send/contact`, caixa id 3).
- **Hooks:** `useFaltasPeriodo`, `useMarcosJornada`, `usePesquisaPrimeiraAula`, `useAnalisePesquisas`, `useAnaliseTurmas`
- **RPCs:** `calcular_health_score_alunos_batch`, `get_faltas_periodo`, `get_candidatos_pesquisa_primeira_aula`, `get_analise_pesquisas`, `get_respostas_pesquisa`, `get_timeline_pesquisas_aluno`, `registrar_resposta_pesquisa_manual`, `listar_evadidos_para_pesquisa`, `stats_pesquisa_evasao`
- **Edge functions:** `enviar-pesquisa-pos-primeira-aula`, `disparar-pesquisa-1a-aula-auto` (auto-disparo opt-in, cron 11h BRT `disparar-pesquisa-1a-aula-diario`, teto 15/dia), `notificar-primeira-aula-fabi` (aviso 8h), `enviar-pesquisa-evasao`, `processar-resposta-pesquisa` (captura, via webhook), `enviar-mensagem-lead` (feedback), `gerar-plano-aluno`, `gerar-relatorio-aluno`, `sync-presenca-emusys`, `marcos-jornada`, `enviar-boas-vindas-equipe` (carrossel)
- **Subaba Pós-1ª Aula** (`PesquisaPrimeiraAulaTab` + `usePesquisaPrimeiraAula`): lista **travada em "ontem"** (RPC `get_candidatos_pesquisa_primeira_aula` com `p_apenas_ontem=true`; MIN da 1ª aula real). Disparo manual em lote (1 clique) OU auto-disparo opt-in via cron (kill switch = toggle no cabeçalho da própria aba, `usePesquisaPrimeiraAula.toggleAutoPesquisa`, tabela `automacoes_config` slug `auto_pesquisa_1a_aula`, começa OFF). Textos editáveis (aluno/responsável) ficam em **Mensagens Automáticas** (`AutomacoesTab`).
- **Views:** `vw_aluno_sucesso_lista` (health score, fase jornada, presença, pagamento), `vw_renovacoes_proximas`
- **Tabelas:** `automacoes_config` (toggles de automação, ex. `auto_pesquisa_1a_aula`)

## Professores (`/app/professores`)
`Professores/ProfessoresPage.tsx`; abas Cadastro, Performance, Carteira, Agenda, 360°, Checklists, Configurações.
- **Hooks:** `useCompetenciaFiltro`, `useHealthScore`/`useHealthScoreConfig`, `useProfessor360`/`useConfig360`/`useOcorrenciasComLog`, `useMotivosScoreProfessor`, `useProfessorDependencies`, `useProfessoresPerformance`
- **RPCs:** `get_kpis_professor_periodo`, `get_carteira_professores`, `get_presenca_por_aluno_professor`, `get_dados_relatorio_coordenacao`, `reverter_ocorrencia`, `restaurar_ocorrencia`, `editar_ocorrencia`, `registrar_log_ocorrencia`
- **Edge functions:** `gemini-relatorio-coordenacao`, `gemini-ranking-professores`, `gemini-relatorio-professor-individual`, `professor-360-whatsapp`, `relatorio-coordenacao-whatsapp`
- **Views:** `vw_kpis_professor_completo`, `vw_evasoes_professores`, `professores_performance`

## Retenção (`/app/retencao`)
Planilha operacional (`Retencao/PlanilhaRetencao.tsx`) + dashboard analítico (`components/Retencao/RetencaoDashboard.tsx` e seções).
- **Hooks:** `useEvasoesData`, `useProfessoresPerformance`, `useMotivosScoreProfessor`
- **RPCs:** nenhuma (queries diretas a `evasoes` + view `professores_performance`)
- **Edge functions:** nenhuma

## Administrativo (`/app/administrativo`)
`Administrativo/AdministrativoPage.tsx`; abas Lançamentos (renovações, não-renovação, avisos, cancelamentos, trancamentos, alunos novos), Fideliza, Lojinha, Farmer, Caixa Financeiro, Caixa de Entrada.
- **Hooks:** `useCompetenciaFiltro`, `useFidelizaPrograma`, `fetchKPIsAlunosCanonicos`, PainelFarmer (`useRotinas`, `useChecklists`, `useChecklistDetail`, `useDashboardStats`, `useAlertas`, `useFeedbackPendente`, `useSucessoAlunoAlertas`), CaixaEntrada (`useAdminConversas`, `useAdminMensagens`)
- **RPCs:** `get_resumo_renovacoes_proximas`, `toggle_relatorio_cron`, `get_dados_relatorio_gerencial`, `get_dados_retencao_ia`, `vincular_alunos_checklist`, `get_historico_rotinas`, `get_checklist_detail`, `marcar_checklist_item`, `get_checklists_farmer`, `criar_checklist_from_template`, `get_rotinas_do_dia`, `get_progresso_rotinas_hoje`, `marcar_rotina_concluida`
- **Edge functions:** `gemini-relatorio-gerencial`, `relatorio-admin-whatsapp`, `gemini-insights-retencao`, `enviar-pesquisa-pos-primeira-aula`, `buscar-foto-perfil`, `deletar-mensagem-admin`, `editar-mensagem-admin`

## Metas (`/app/metas`)
`Metas/MetasPageNew.tsx`; abas Gestão/Comercial/Professores + **Simulador de Metas** e **Simulador de Turma**.
- **Hooks:** `useSimulador`, `useSimuladorTurma`, `useDadosHistoricos`, `useMetasKPI`
- **RPCs:** `get_dados_turma_unidade`
- **Edge functions:** `gemini-insights` (plano IA), `gemini-insights-turma`
- **Tabelas:** `metas_kpi` (upsert por unidade+ano+mes+tipo), `metas`, `templates_cenario`, `planos_acao`, `simulacoes_turma`, `metas_professor_turma`

## Salas (`/app/salas`)
`Salas/SalasPage.tsx`; abas Ocupação, Inventário, Pendências.
- **Hooks:** nenhum customizado (lógica inline)
- **RPCs:** nenhuma · **Edge functions:** nenhuma
- **Tabelas:** `salas`, `turmas`, `inventario`, `inventario_pendencias`

## Projetos (`/app/projetos`)
`Projetos/ProjetosPage.tsx`; views Dashboard, Lista, Kanban, Calendário, Timeline, Por Pessoa, Configurações + chat IA Fábio.
- **Hooks:** `useProjetos`, `useProjeto`, `useProjetoTipos`, `useProjetoTipoFases`, `useTarefasPorPessoa`, `useToggleTarefaConcluida`
- **RPCs:** nenhuma
- **Edge functions:** `gemini-fabio-chat` (assistente IA), `projeto-alertas-whatsapp`

## Automações (`/app/automacoes`)
Saúde das automações de dados. `Automacoes/AutomacoesPage.tsx`; abas Jornadas, Feed de Eventos, Saúde dos Crons, Divergências.
- **Hooks:** `useAutomacoesData` (polling 30s), `useSaudeCrons` (polling 60s), `useDivergencias`
- **RPCs:** `get_cron_health`, `get_divergencias_alunos`
- **Edge functions:** `auditor-divergencias-emusys`
- **Tabelas:** `automacao_log`, `automacao_invariantes`

## Config (`/app/config`)
`Config/ConfigPage.tsx`. CRUD de `unidades`, `canais_origem`, `motivos_saida`, `tipos_saida`, `cursos` (flag `is_projeto_banda`), `professores`, `unidades_cursos`, destinatários de relatório, config IA/BI.
- **RPCs:** nenhuma · **Edge functions:** nenhuma direta

## Admin (`/app/admin/*`)
- **Usuários (`Admin/GerenciarUsuarios.tsx`):** edge functions `admin-create-user`, `admin-update-email`, `admin-update-password`. Perfis: `admin` | `unidade`.
- **Permissões (`Admin/PainelPermissoes/`):** RPC `usuario_perfis_lista`. Tabelas `perfis`, `permissoes`, `perfil_permissoes`, `usuario_perfis`, `audit_log`/`auditoria_acesso` (toda alteração audita).

## Entrada (`/app/entrada/*`)
Formulários de lançamento manual (React Hook Form + Zod). Escrevem direto nas tabelas (sem edge/RPC).
- **FormLead** (`/entrada/lead`): escreve `leads` + `leads_automacao_log`. Status inicial `novo`/`agendado`, `etapa_pipeline_id` 1 ou 5. Hook `useCheckLeadDuplicado` (forte por telefone, fraca por nome).
- **FormMatricula** (`/matricula`): escreve `alunos` (status `ativo`, `tipo_matricula_id=1`) + `movimentacoes` (`tipo='matricula'`) + atualiza lead (`status='matriculado'`).
- **FormEvasao** (`/evasao`): atualiza `alunos` (status `inativo`) + `movimentacoes` (`tipo='evasao'`) + `evasoes`.
- **FormRenovacao** (`/renovacao`): atualiza `alunos` + `renovacoes` (status `renovado`) + `movimentacoes` (`tipo='renovacao'`).
- **RelatorioDiario** (`/relatorios/diario`): upsert `relatorios_diarios`. Lê `alunos`/`movimentacoes`/`renovacoes`.
> ⚠️ Estes forms gravam em tabelas legadas (`movimentacoes`, `renovacoes`, `evasoes`). O fluxo canônico atual usa `movimentacoes_admin` + edges Emusys. Ver `docs/MAPA-INTEGRACAO-EMUSYS.md`.

## Histórico (`/app/apresentacoes-2025`)
`Historico/Apresentacoes2025Page.tsx` — shell de abas que embute Gestão/Comercial/Retenção (apresentações 2025). Sem queries próprias.

## Feedback do professor (público) (`/feedback/:token`)
`Feedback/FeedbackProfessorPage.tsx` — página pública (sem auth) acessada por token único.
- **RPCs:** nenhuma · **Edge functions:** `validar-token-feedback`
- **Tabelas:** `aluno_feedback_sessoes`, `aluno_feedback_professor` (upsert por `aluno_id+professor_id+competencia`). Escala verde/amarelo/vermelho.

---

## Apêndice — Edge functions por categoria (uso no frontend)

- **IA (Gemini/OpenAI):** `gemini-insights`, `gemini-insights-comercial`, `gemini-insights-retencao`, `gemini-insights-turma`, `gemini-relatorio-gerencial`, `gemini-relatorio-coordenacao`, `gemini-ranking-professores`, `gemini-relatorio-professor-individual`, `gemini-fabio-chat`, `gerar-plano-aluno`, `gerar-relatorio-aluno`, `gerar-prompt-agente`
- **WhatsApp UAZAPI:** `enviar-mensagem-lead`, `enviar-mensagem-admin`, `whatsapp-status`, `whatsapp-connect`, `listar-instancias-uazapi`, `configurar-webhook-caixa`, `buscar-foto-perfil`, `deletar-mensagem-admin`, `editar-mensagem-admin`, `relatorio-admin-whatsapp`, `professor-360-whatsapp`, `relatorio-coordenacao-whatsapp`, `projeto-alertas-whatsapp`
- **WhatsApp Meta (Campanhas):** `enviar-campanha`, `controle-campanha`, `enviar-mensagem-meta`, `gerenciar-templates`, `sincronizar-templates`
- **Pesquisas:** `enviar-pesquisa-pos-primeira-aula`, `enviar-pesquisa-evasao`, `processar-resposta-pesquisa`
- **Emusys/dados:** `sync-presenca-emusys`, `marcos-jornada`, `auditor-divergencias-emusys`, `sync-feriados`
- **Admin/usuários:** `admin-create-user`, `admin-update-email`, `admin-update-password`, `validar-token-feedback`

> Lista de edge functions **disparada pelo frontend**. Edges de webhook/cron (ex: `processar-matricula-emusys`, `sync-matriculas-emusys`, `enviar-boas-vindas-matricula`, `meta-webhook-campanhas`) não aparecem aqui — ver `.claude/memory/integracao-infra.md`.
