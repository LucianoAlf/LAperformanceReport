<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-02 -->

<!-- fim do cabecalho gerado -->
# Tabelas e views

501 objetos. Uma linha cada; colunas e FKs em `detalhe/<dominio>.md`.

| Objeto | Tipo | Domínio | Colunas | Linhas | RLS | FKs | Comentário |
|---|---|---|---|---|---|---|---|
| `aluno_acoes` | tabela | aluno | 18 | 0 | sim (1) | 8 | Histórico de intervenções realizadas com alunos (ligação, WhatsApp, reunião, etc.) |
| `aluno_contatos` | tabela | aluno | 7 | 2063 | sim (4) | 1 |  |
| `aluno_feedback_professor` | tabela | aluno | 16 | 214 | sim (2) | 4 | Feedback do professor sobre cada aluno (verde/amarelo/vermelho) |
| `aluno_feedback_sessoes` | tabela | aluno | 12 | 0 | sim (1) | 3 | Sessões de coleta de feedback do professor sobre seus alunos |
| `aluno_jornada_matricula_disciplina` | tabela | aluno | 47 | 5045 | sim (2) | 4 |  |
| `aluno_metas` | tabela | aluno | 14 | 0 | sim (1) | 3 | Metas individuais definidas para cada aluno |
| `aluno_presenca` | tabela | aluno | 22 | 53728 | sim (2) | 5 | Registro de presença dos alunos (tracking via WhatsApp) |
| `aluno_presenca_administrativo` | tabela | aluno | 13 | 23124 | sim (2) | 4 | Camada administrativa read-only para o professor; justificada vem do Emusys. |
| `aluno_presenca_conflitos` | tabela | aluno | 15 | 495 | sim (0) | 2 | Divergências abertas entre decisão humana, presença positiva do Emusys ou aula gêmea. Não substitui retificações nem eventos do Fábio. |
| `aluno_presenca_retificacoes` | tabela | aluno | 11 | 149 | sim (2) | 3 | Trilha append-only de correcoes de presenca feitas pela coordenacao. |
| `aluno_presenca_revisoes_operacionais` | tabela | aluno | 12 | 0 | sim (1) | 4 | Estado auditado da revisao posterior de ausencias publicadas por politica de unidade. |
| `aluno_professor_transicoes` | tabela | aluno | 24 | 50 | sim (2) | 10 | Camada fria: registro automatico de troca de professor por matricula/disciplina. |
| `aluno_reposicoes` | tabela | aluno | 15 | 124 | sim (2) | 4 | Credito de reposicao: nasce de falta justificada ou cancelamento, morre quando a aula reposta acontece. Casamento por elo direto (reagendada) ou rede (aluno+disciplina+janela). |
| `aluno_transferencias` | tabela | aluno | 9 | 0 | sim (2) | 3 | Movimentacoes internas de alunos entre unidades. Nao contam como matricula nova comercial nem evasao. |
| `alunos` | tabela | aluno | 73 | 1694 | sim (5) | 11 |  |
| `alunos_arquivados` | tabela | aluno | 62 | 0 | sim (0) | 0 |  |
| `alunos_health_score_historico` | tabela | aluno | 6 | 0 | sim (1) | 2 |  |
| `alunos_historico` | tabela | aluno | 17 | 1422 | sim (5) | 2 | Histórico de ex-alunos para cálculo de LTV (Tempo Médio de Permanência). Só inclui alunos com 4+ meses. |
| `alunos_turmas` | tabela | aluno | 9 | 0 | sim (4) | 2 | Relacionamento entre alunos e turmas - permite histórico de turmas |
| `anamnese_convites` | tabela | aluno | 14 | 0 | sim (1) | 3 | Convites de anamnese remota. Um convite vivo por aluno; expira em 7 dias ou no uso. |
| `anamnese_respostas_perfil` | tabela | aluno | 5 | 2233 | sim (1) | 1 | Respostas individuais das 11 perguntas de perfil comportamental. Armazena posição escolhida para auditoria e recálculo. |
| `anamneses` | tabela | aluno | 51 | 220 | sim (1) | 3 | Anamnese do aluno - coleta de perfil pedagógico, saúde, temperamento comportamental. Vinculada a alunos.id (nullable para pré-matrícula). |
| `aviso_previo_veredito` | tabela | aluno | 7 | 120 | sim (1) | 1 | Veredito por aviso previo vigente, apurado ao vivo no Emusys pelo cron da Sol. Escritor unico: send-aviso-previo-sol.py. A tela LE daqui e mostra `verificado_em` -- dado parado precisa se denunciar, nao mentir com cara de fresco. |
| `banda` | tabela | aluno | 26 | 33 | sim (0) | 0 | Identidade da banda (nome/genero/descricao) por cima da turma canonica. Roster/professor/horario sao derivados do canonico via RPC; aqui fica so a identidade + ancora (turma_chave). |
| `banda_curso_depara` | tabela | aluno | 4 | 0 | sim (0) | 0 | De-para curado de quais cursos contam como banda no modulo. Fonte da definicao (Emusys nao tem conceito de banda). Editavel por Alf/Jessica. |
| `banda_evento` | tabela | aluno | 13 | 0 | sim (0) | 0 | Eventos de banda (tipo=ensaio/show). orcamento e SO planejamento — nao e ledger financeiro (banda e sem-MRR; repasse segue a maquina canonica). |
| `banda_evento_participante` | tabela | aluno | 4 | 0 | sim (0) | 2 |  |
| `banda_integrante` | tabela | aluno | 11 | 90 | sim (0) | 1 | Enriquecimento de banda por aluno (instrumento/funcao). O roster BASE vem do canonico (alunos da turma); esta tabela apenas adiciona papel. aluno_id referencia public.alunos.id (sem FK rigida de proposito). |
| `banda_repertorio` | tabela | aluno | 14 | 0 | sim (0) | 1 | Repertorio da banda. letra/cifra/cifraclub_url alimentados pela integracao Cifra Club (edge function). |
| `cursos_matriculados` | tabela | aluno | 6 | 226 | sim (4) | 0 |  |
| `evasoes_backup_20260215` | tabela | aluno | 10 | 677 | sim (0) | 0 |  |
| `evasoes_legacy_backup` | tabela | aluno | 10 | 677 | sim (0) | 0 |  |
| `evasoes_v2` | tabela | aluno | 17 | 736 | sim (4) | 7 | BACKUP - Tabela legada. Fonte unica de evasoes agora é movimentacoes_admin. Manter por 30 dias (ate 2026-03-27) para validacao. Nao dropar antes disso. |
| `evasoes_v2_backup` | tabela | aluno | 17 | 740 | sim (0) | 0 |  |
| `farmer_checklist_contatos` | tabela | aluno | 9 | 390 | sim (4) | 3 | Carteira de alunos/contatos vinculados a cada checklist, com status de contato |
| `farmer_checklist_items` | tabela | aluno | 12 | 17 | sim (4) | 4 | Itens individuais de cada checklist, com suporte a sub-itens e canais de comunicação |
| `farmer_checklist_templates` | tabela | aluno | 9 | 0 | sim (3) | 1 | Templates reutilizáveis de checklists para o Painel Farmer |
| `farmer_checklists` | tabela | aluno | 23 | 1 | sim (4) | 4 | Checklists do Painel Farmer - listas de tarefas agrupadas com prazo e alertas |
| `farmer_recados` | tabela | aluno | 13 | 0 | sim (2) | 4 | Mensagens enviadas para professores via WhatsApp |
| `farmer_recados_campanhas` | tabela | aluno | 16 | 0 | sim (1) | 3 |  |
| `farmer_recados_destinatarios` | tabela | aluno | 9 | 28 | sim (1) | 2 |  |
| `farmer_rotinas` | tabela | aluno | 12 | 42 | sim (4) | 2 | Rotinas customizáveis dos Farmers (diárias, semanais, mensais) |
| `farmer_rotinas_execucao` | tabela | aluno | 7 | 66 | sim (3) | 2 | Registro de execução diária das rotinas |
| `farmer_tarefas` | tabela | aluno | 16 | 9 | sim (4) | 3 | To-do list manual dos Farmers |
| `farmer_templates` | tabela | aluno | 10 | 0 | sim (3) | 1 | Templates de mensagens para comunicação com alunos/responsáveis |
| `jornada_curso_resolucao_log` | tabela | aluno | 12 | 51 | sim (0) | 4 | Trilha append-only das trocas de curso canonico resolvidas pela grade recorrente do Emusys. |
| `motivos_arquivamento` | tabela | aluno | 5 | 0 | sim (4) | 0 | Motivos para arquivamento de leads que não converteram |
| `motivos_saida` | tabela | aluno | 9 | 15 | sim (5) | 0 |  |
| `motivos_saida_aliases` | tabela | aluno | 7 | 0 | sim (0) | 1 | Aliases de textos legados de movimentacoes para o catalogo canonico; nao reescreve o texto historico. |
| `motivos_trancamento` | tabela | aluno | 6 | 0 | sim (4) | 0 |  |
| `movimentacoes` | tabela | aluno | 20 | 0 | sim (4) | 11 | Registro de todas as movimentações de alunos: matrículas, renovações, evasões, transferências, trocas de curso/professor. |
| `movimentacoes_admin` | tabela | aluno | 38 | 1885 | sim (2) | 4 | Tabela para registrar movimentações administrativas: renovações, não renovações, avisos prévios e evasões |
| `movimentacoes_admin_arquivadas` | tabela | aluno | 41 | 0 | sim (1) | 0 | Lixeira de movimentacoes_admin. Linha movida por arquivar_movimentacao_admin(). DELETE direto na tabela viva e bloqueado por trg_bloqueia_delete_movimentacao_admin. |
| `movimentacoes_admin_vigentes` | view | aluno | 38 | — | não | 0 | movimentacoes_admin sem as linhas anuladas. Use em KPI; a tabela crua mantem o historico completo, inclusive o que foi desconsiderado. |
| `pesquisa_evasao` | tabela | aluno | 55 | 37 | sim (1) | 12 |  |
| `pesquisa_evasao_analises` | tabela | aluno | 15 | 7 | sim (1) | 5 | Uma linha por rodada de conversa; versoes revisadas sao imutaveis. |
| `pesquisa_evasao_assinaturas` | tabela | aluno | 8 | 0 | sim (0) | 1 |  |
| `pesquisa_evasao_classificacao_categorias` | tabela | aluno | 2 | 0 | sim (1) | 1 |  |
| `pesquisa_evasao_classificacoes` | tabela | aluno | 11 | 0 | sim (1) | 4 |  |
| `pesquisa_evasao_desfechos` | tabela | aluno | 9 | 0 | sim (1) | 4 |  |
| `pesquisa_evasao_envios_fila` | tabela | aluno | 19 | 24 | sim (1) | 4 | Fila de envio dos toques da pesquisa de evasao. Grao: um toque por pesquisa. Escrita apenas por service_role e pelas RPCs SECURITY DEFINER. |
| `pesquisa_evasao_followup_acoes` | tabela | aluno | 9 | 0 | sim (0) | 2 | Decisao manual terminal e auditavel do follow-up; nao envia mensagem a familia. |
| `pesquisa_evasao_mensagens` | tabela | aluno | 17 | 166 | sim (1) | 4 |  |
| `pesquisa_evasao_previews` | tabela | aluno | 40 | 57 | sim (0) | 8 |  |
| `pesquisa_evasao_processamento` | tabela | aluno | 8 | 1 | sim (0) | 1 | Fila service-only para consolidar rajadas de respostas da pesquisa de evasão. |
| `pesquisa_evasao_publicos_internos` | tabela | aluno | 9 | 0 | sim (0) | 2 | Fonte service-only e auditavel de publico interno. tipo_aluno e financeiro e nunca classifica este vinculo. |
| `pesquisa_evasao_templates` | tabela | aluno | 8 | 4 | sim (0) | 1 |  |
| `pesquisa_evasao_transcricoes` | tabela | aluno | 9 | 0 | sim (1) | 1 |  |
| `pesquisas_whatsapp` | tabela | aluno | 16 | 158 | sim (2) | 2 |  |
| `radar_config` | tabela | aluno | 6 | 13 | sim (0) | 0 |  |
| `radar_config_historico` | tabela | aluno | 6 | 0 | sim (0) | 1 |  |
| `renovacoes_legado` | tabela | aluno | 18 | 421 | sim (4) | 5 | ARQUIVO read-only. Aposentada em 2026-07-01: a fonte de verdade de renovacoes passou a ser movimentacoes_admin. NAO usar em codigo novo. Contem historico legado (incl. ~44 renovacoes que so existiam aqui). |
| `risco_evasao` | tabela | aluno | 9 | 2311 | sim (2) | 2 |  |
| `tipos_matricula` | tabela | aluno | 10 | 0 | sim (4) | 0 |  |
| `tipos_saida` | tabela | aluno | 6 | 0 | sim (4) | 0 |  |
| `vw_absenteismo_aluno` | view | aluno | 20 | — | não | 0 | Taxa de absenteismo por aluno (matricula), calculada em tempo real a partir de aluno_presenca. Sinal #6 e #9 do health score do aluno v2. Nao usar alunos.percentual_presenca (coluna dessincronizada, sem trigger de escrita). |
| `vw_absenteismo_aluno_canonica_v2` | view | aluno | 20 | — | não | 0 |  |
| `vw_absenteismo_aluno_legado_v1` | view | aluno | 9 | — | não | 0 |  |
| `vw_aluno_estado_operacional_canonico` | view | aluno | 30 | — | não | 0 | Projecao semantica do ciclo de matricula. Somente ativa entra em bases operacionais vivas; trancada permanece separada. |
| `vw_aluno_frequencia_canonica_v1` | view | aluno | 31 | — | não | 0 | Frequencia por pessoa/unidade. Deduplica eventos entre linhas locais, usa somente presente/falta confirmada no denominador e publica a incerteza do legado Emusys. |
| `vw_aluno_identidade_unidade_canonica` | view | aluno | 21 | — | não | 0 | Uma pessoa operacional por unidade. Prioriza ID Emusys; fallback local fica explicitamente com baixa confianca. |
| `vw_aluno_pessoa_chave` | view | aluno | 3 | — | não | 0 | Fonte unica da identidade de pessoa. Comparar SEMPRE junto com unidade_id: 91 emusys_student_id se repetem entre unidades com nomes diferentes. |
| `vw_aluno_presenca_conciliacao_operacional` | view | aluno | 21 | — | não | 0 | Fila derivada de ausencias cobertas por politica com revisao posterior. Grao aluno/aula. |
| `vw_aluno_presenca_semantica_v1` | view | aluno | 36 | — | não | 0 | View canonica da presenca (semantica v1.4). A CTE `evidencia` e NOT MATERIALIZED explicito desde 28/08/2026 -- HONESTIDADE: isso NAO mudou o desempenho (medido alternado: 295ms vs 289ms; a CTE tem referencia UNICA e o planner ja a inlinava). O valor da marca e DEFENSIVO: se alguem adicionar uma segunda referencia a CTE, o default materializaria e criaria o penhasco de custo; o explicito impede. O custo residual (~290ms por consulta filtrada) vem da FUNCAO DE JANELA dentro de `evidencia` (bool_or OVER PARTITION BY aula_emusys_id): predicado nao desce por baixo de janela, entao toda leitura varre aluno_presenca inteira. Mexer nisso muda a SEMANTICA compartilhada (LA Teacher, Fabio, Sol, health-score) -- so com acordo entre os times. A troca de 28/08 foi provada inocua por hash md5 das 52k linhas na mesma transacao. |
| `vw_aluno_sucesso_lista` | view | aluno | 33 | — | não | 0 | Lista viva do Sucesso do Aluno: somente estado operacional ativo da camada canonica v1.3.1. |
| `vw_aluno_sucesso_resumo` | view | aluno | 23 | — | não | 0 | KPIs resumidos de Sucesso do Cliente por unidade |
| `vw_alunos_ativos` | view | aluno | 16 | — | não | 0 |  |
| `vw_alunos_estado_operacional_v131` | view | aluno | 27 | — | não | 0 | Projecao viva v1.3.1 otimizada: matricula exata por indice e aluno_id apenas como fallback. |
| `vw_alunos_sem_fatura_mes` | view | aluno | 19 | — | não | 0 | Replica a tela "Alunos com aula mas sem fatura por mes" do Emusys: contrato que cobre a competencia e nao tem MENSALIDADE emitida nela. Tres competencias (anterior/atual/seguinte). Exclui isento (valor 0 E sem parcelas), trancado e atividade extra; inclui quem ja saiu. Paridade conferida contra a tela em 15/08/2026 (Barra, ago): 13 de 13, sem sobra. |
| `vw_contagem_alunos` | view | aluno | 8 | — | não | 0 |  |
| `vw_distribuicao_permanencia` | view | aluno | 3 | — | não | 0 |  |
| `vw_evasao_por_motivo` | view | aluno | 4 | — | não | 0 |  |
| `vw_evasao_por_tipo` | view | aluno | 4 | — | não | 0 |  |
| `vw_evasoes_motivos` | view | aluno | 5 | — | não | 0 |  |
| `vw_evasoes_professores` | view | aluno | 6 | — | não | 0 |  |
| `vw_evasoes_resumo` | view | aluno | 12 | — | não | 0 |  |
| `vw_evolucao_alunos` | view | aluno | 5 | — | não | 0 |  |
| `vw_farmer_aniversariantes_hoje` | view | aluno | 10 | — | não | 0 |  |
| `vw_farmer_checklist_alertas` | view | aluno | 17 | — | não | 0 |  |
| `vw_farmer_inadimplentes` | view | aluno | 10 | — | não | 0 |  |
| `vw_farmer_novos_matriculados` | view | aluno | 13 | — | não | 0 |  |
| `vw_farmer_renovacoes_proximas` | view | aluno | 11 | — | não | 0 |  |
| `vw_farmer_resumo_alertas` | view | aluno | 8 | — | não | 0 |  |
| `vw_jornada_aluno_atual` | view | aluno | 35 | — | não | 0 |  |
| `vw_jornada_aluno_com_presenca` | view | aluno | 40 | — | não | 0 |  |
| `vw_jornada_aluno_trancado` | view | aluno | 35 | — | não | 0 |  |
| `vw_jornada_aluno_trancado_com_presenca` | view | aluno | 40 | — | não | 0 |  |
| `vw_jornada_marcos` | view | aluno | 41 | — | não | 0 |  |
| `vw_jornada_professor_atual` | view | aluno | 40 | — | não | 0 |  |
| `vw_jornada_professor_trancado` | view | aluno | 40 | — | não | 0 |  |
| `vw_kpis_retencao_mensal` | view | aluno | 17 | — | não | 0 |  |
| `vw_ltv_por_categoria` | view | aluno | 3 | — | não | 0 |  |
| `vw_ltv_por_unidade` | view | aluno | 5 | — | não | 0 |  |
| `vw_ltv_rede` | view | aluno | 4 | — | não | 0 |  |
| `vw_ltv_unidade` | view | aluno | 6 | — | não | 0 |  |
| `vw_movimentacoes_mensal` | view | aluno | 6 | — | não | 0 |  |
| `vw_movimentacoes_recentes` | view | aluno | 9 | — | não | 0 |  |
| `vw_prontuario_aluno` | view | aluno | 13 | — | não | 0 |  |
| `vw_radar_aluno_sinais` | view | aluno | 27 | — | não | 0 | Sinais do Radar da coordenação, grão de ALUNO. Presença vem de vw_aluno_presenca_semantica_v1 no grão de AULA (aluno,dia,hora), janela desde 01/08/2026, só coorte de professor com login liberado. absenteismo_pct é NULO sem base — nunca zero. faltas_consecutivas é a sequência aberta a partir da aula mais recente (0 = sem falta ativa). aluno_foto_url é identidade, não sinal: nao entra na nota nem em media. |
| `vw_radar_aluno_sinais_canonica_v2` | view | aluno | 27 | — | não | 0 |  |
| `vw_radar_aluno_sinais_legado_v1` | view | aluno | 22 | — | não | 0 |  |
| `vw_renovacao_ciclos` | view | aluno | 24 | — | não | 0 | Ciclos de matricula-disciplina com os dois lados da renovacao (renovou / nao renovou), para calcular cobertura por competencia. Consumidores DEVEM filtrar atividade_extra = false (regra 3.5). Nao confundir com vw_contratos_vencendo, que so mostra ciclo vigente. |
| `vw_renovacoes_duplicadas_suspeitas` | view | aluno | 17 | — | não | 0 | Renovacoes possivelmente duplicadas, ja descontadas as anuladas. SUSPEITA, nao veredito: aluno com dois tempos do mesmo curso, ou com duas matriculas reais no Emusys, aparece aqui legitimamente (caso Perola Madeira, matriculas 519 e 520). Conferir contra o Emusys antes de anular -- o criterio canonico e o contrato: o Emusys abre um contrato_id novo a cada renovacao. |
| `vw_renovacoes_proximas` | view | aluno | 17 | — | não | 0 |  |
| `vw_risco_atual` | view | aluno | 9 | — | não | 0 |  |
| `vw_risco_evasao_atual` | view | aluno | 9 | — | não | 0 | Ultimo score de risco por aluno. Scores atuais ficam preservados, mas com baixa confianca ate o cutover da presenca canonica. |
| `agente_conversas` | tabela | comercial | 15 | 203 | sim (1) | 3 |  |
| `agente_fila_mensagens` | tabela | comercial | 8 | 1 | sim (1) | 2 |  |
| `agentes` | tabela | comercial | 22 | 0 | sim (4) | 2 |  |
| `campanha_contatos` | tabela | comercial | 10 | 10040 | sim (1) | 1 |  |
| `campanhas` | tabela | comercial | 24 | 7 | sim (4) | 4 |  |
| `campanhas_config` | tabela | comercial | 5 | 0 | sim (2) | 1 |  |
| `canais_origem` | tabela | comercial | 5 | 0 | sim (4) | 0 |  |
| `contatos_bloqueados_campanha` | tabela | comercial | 5 | 0 | sim (2) | 1 |  |
| `conversas_campanha` | tabela | comercial | 10 | 2512 | sim (1) | 2 |  |
| `crm_conversas` | tabela | comercial | 16 | 12 | sim (4) | 3 |  |
| `crm_etiquetas` | tabela | comercial | 8 | 0 | sim (2) | 0 |  |
| `crm_followups` | tabela | comercial | 14 | 0 | sim (4) | 2 |  |
| `crm_lead_etiquetas` | tabela | comercial | 5 | 0 | sim (2) | 2 |  |
| `crm_lead_historico` | tabela | comercial | 7 | 139 | sim (4) | 2 |  |
| `crm_mensagens` | tabela | comercial | 21 | 0 | sim (4) | 4 |  |
| `crm_mensagens_agendadas` | tabela | comercial | 11 | 0 | sim (1) | 2 | Mensagens agendadas para envio futuro via WhatsApp |
| `crm_metas_andreza` | tabela | comercial | 9 | 3 | sim (4) | 1 |  |
| `crm_motivos_nao_comparecimento` | tabela | comercial | 5 | 10 | sim (4) | 0 |  |
| `crm_pipeline_etapas` | tabela | comercial | 8 | 11 | sim (5) | 0 |  |
| `crm_templates_whatsapp` | tabela | comercial | 8 | 8 | sim (1) | 0 |  |
| `experimentais_mensal_unidade` | tabela | comercial | 7 | 88 | sim (4) | 1 |  |
| `experimentais_professor_mensal` | tabela | comercial | 7 | 280 | sim (4) | 2 |  |
| `lead_conciliacao_decisoes` | tabela | comercial | 10 | 318 | sim (1) | 1 |  |
| `lead_experimentais` | tabela | comercial | 19 | 1061 | sim (1) | 6 |  |
| `lead_experimentais_arquivadas` | tabela | comercial | 23 | 174 | não | 0 | Lixeira de lead_experimentais, no padrao de alunos_arquivados. Guarda a linha inteira + quem absorveu (consolidado_no_id). A duplicata nasceu porque a API do Emusys so passou a devolver id_lead em 21/06/2026. |
| `lead_experimentais_decisoes_humanas` | tabela | comercial | 12 | 49 | sim (3) | 2 | P02Q: decisões humanas de auditoria para reconciliar experimentais sem alterar histórico operacional original. |
| `lead_experimental_aulas` | tabela | comercial | 19 | 328 | sim (0) | 3 | Vinculo lead<->aula da experimental. RLS ligada e SEM policy: so security definer (dono postgres) e service_role entram. O cliente fala com app_experimental_do_professor / app_minha_agenda_sessao. |
| `lead_experimental_aulas_arquivadas` | tabela | comercial | 22 | 0 | não | 0 | Filhas descartadas na consolidacao, quando o sobrevivente ja tinha a sua. So entra aqui filha SEM aula_local_id — vinculo real nunca e descartado. |
| `lead_experimental_registros` | tabela | comercial | 15 | 5 | sim (0) | 5 | Prontuario da experimental ditado pelo professor. RLS ligada e SEM policy — mesma razao da lead_experimental_aulas. A fronteira family-safe mora nas RPCs, nao na tabela. |
| `leads` | tabela | comercial | 64 | 9649 | sim (5) | 15 | Leads comerciais - do primeiro contato até a conversão ou arquivamento |
| `leads_automacao_log` | tabela | comercial | 11 | 90797 | sim (1) | 0 |  |
| `leads_backup_flags_20260601` | tabela | comercial | 7 | 0 | sim (0) | 0 |  |
| `leads_campanhas` | tabela | comercial | 6 | 45 | sim (1) | 2 | Historico de campanhas que trouxeram cada lead (1 linha por lead+campanha). Gravado pela tool transfer do agente-webhook no momento da transferencia. Snapshot: campanha_nome congela agentes.nome da epoca. |
| `leads_diarios_backup` | tabela | comercial | 29 | 100 | sim (0) | 0 |  |
| `mensagens_campanha` | tabela | comercial | 24 | 11076 | sim (1) | 4 |  |
| `meta_ads_cache` | tabela | comercial | 11 | 37 | sim (1) | 0 | Metadados de anuncios Meta (nome, campanha, adset) por source_id, enriquecidos via Graph API pela edge enriquecer-meta-ads. Join: leads.meta_ad_source_id = meta_ads_cache.source_id. Metricas vivas (gasto/CTR) NAO ficam aqui — consultar a Ads API na hora (edge meta-ads-insights). |
| `mila_config` | tabela | comercial | 21 | 0 | sim (3) | 1 | Configuração do agente Mila por unidade |
| `mila_message_buffer` | tabela | comercial | 8 | 0 | sim (2) | 0 | Buffer de mensagens para debounce do agente Mila |
| `motivos_nao_matricula` | tabela | comercial | 4 | 0 | sim (4) | 0 |  |
| `numeros_meta` | tabela | comercial | 18 | 0 | sim (4) | 1 |  |
| `origem_leads_legado` | tabela | comercial | 7 | 1075 | sim (4) | 0 | LEGADO (aposentada 2026-07-05). Agregacao por canal inflada pelo mesmo trigger bugado. Nunca teve leitor no frontend. Nao usar. |
| `professores_experimentais` | tabela | comercial | 6 | 284 | sim (4) | 0 |  |
| `respostas_rapidas_campanha` | tabela | comercial | 6 | 0 | sim (2) | 1 |  |
| `templates_meta` | tabela | comercial | 16 | 30 | sim (3) | 1 |  |
| `transferencias_mila` | tabela | comercial | 7 | 0 | sim (0) | 2 |  |
| `unidade_contato_comercial` | tabela | comercial | 5 | 3 | não | 1 | Quem recebe o aviso comercial de cada unidade. Em tabela, nao no fluxo: a pessoa muda (Recreio trocou em um mes) e o no do n8n continua com o nome antigo. |
| `vw_experimental_faltou_sem_afirmacao` | view | comercial | 5 | — | não | 0 | Regua UNICA do 'faltou' de procedencia comercial que ninguem afirmou. Lida por fn_desfaz_faltou_sem_afirmacao (conserta) e por fn_diag_saude_experimental (conta). Nunca duplicar o predicado: dois leitores, uma regua. |
| `vw_experimental_pendencia` | view | comercial | 13 | — | não | 0 | Experimental realizada, do corte pra frente, cujo professor tem o app e ainda nao CONFIRMOU a devolutiva. Fecha por ALLOWLIST (so status=confirmado fecha) de proposito: rascunho e o DEFAULT da tabela, e um denylist trataria omissao de status como devolutiva feita. Regua propria: a de aluno (vw_registro_pendencia) nao e tocada. |
| `vw_experimental_realizada_sem_ficha` | view | comercial | 4 | — | não | 0 | Experimentais que aconteceram e seguem sem ficha confirmada, nos ultimos 30 dias. O prazo em dias NAO mora aqui: quem filtra por data e fn_diag_saude_experimental, para o prazo ser parametro e nao dogma. |
| `vw_experimental_registro_comercial` | view | comercial | 17 | — | não | 0 | Registro da experimental para o circulo interno: inclui leitura_de_conversao. So service_role. |
| `vw_experimental_registro_family_safe` | view | comercial | 10 | — | não | 0 | Registro da experimental sem NENHUMA coluna de conversao — a garantia e estrutural, nao um flag. So service_role: o nome descreve o conteudo, nao a autorizacao. |
| `vw_funil_conversao_mensal` | view | comercial | 13 | — | não | 0 |  |
| `vw_leads_comercial` | view | comercial | 50 | — | não | 0 | View de compatibilidade que emula a estrutura de leads_diarios. Inclui campos resolvidos (nomes) para evitar JOINs via PostgREST. |
| `vw_leads_por_canal` | view | comercial | 6 | — | não | 0 |  |
| `vw_matriculas_por_canal` | view | comercial | 4 | — | não | 0 |  |
| `vw_motivos_nao_matricula` | view | comercial | 4 | — | não | 0 |  |
| `vw_observador_leads_orfaos` | view | comercial | 16 | — | não | 0 | Webhooks de lead recebidos pelo observador, classificados: ok (existe por emusys_lead_id), vinculo_faltando (existe por telefone, so falta o emusys_lead_id) e perdido (nao existe de jeito nenhum — payload salvo, recuperavel via upsert_lead). Alerta = situacao perdido em lead_criado. |
| `vw_performance_professor_experimental` | view | comercial | 6 | — | não | 0 |  |
| `caixa_categorias` | tabela | financeiro | 9 | 0 | sim (3) | 0 | Categorias operacionais do caixa diario. Substitui lista fixa do frontend e permite novas categorias pela UI. |
| `caixa_financeiro_grupos_whatsapp` | tabela | financeiro | 8 | 0 | sim (2) | 1 | JIDs dos grupos financeiros por unidade para envio manual do fechamento de caixa. |
| `caixa_movimentacoes` | tabela | financeiro | 19 | 445 | sim (4) | 4 | Lancamentos manuais do caixa diario/cofre. Ambiente cofre afeta saldo fisico em dinheiro; ambiente venda alimenta resumo. |
| `caixa_reaberturas_log` | tabela | financeiro | 15 | 0 | sim (1) | 2 | Log auditavel de reaberturas do caixa diario. Guarda snapshot do cabecalho e das movimentacoes antes da reabertura. |
| `caixas_diarios` | tabela | financeiro | 18 | 161 | sim (3) | 1 | Cabecalho do fechamento de caixa diario por unidade. Fase 1 manual. |
| `fechamento_mensal_auditoria` | tabela | financeiro | 10 | 189 | sim (1) | 2 | Auditoria das acoes de preview, aprovacao, fechamento, retificacao e compatibilidade mensal. |
| `fechamento_mensal_retificacoes` | tabela | financeiro | 9 | 0 | sim (0) | 1 | Retificacoes append-only aplicadas somente na leitura de relatorios mensais fechados; o snapshot original permanece imutavel. |
| `fechamento_mensal_snapshots` | tabela | financeiro | 21 | 98 | sim (1) | 1 | Snapshot mensal imutavel por dominio do LA Report. Fonte oficial para competencias fechadas. |
| `fechamento_snapshots_backup_20260808` | tabela | financeiro | 22 | 0 | não | 0 |  |
| `financeiro_fatura_reconciliacao_decisoes` | tabela | financeiro | 13 | 0 | sim (0) | 2 | Auditoria append-only das decisoes operacionais da conciliacao de faturas. Nunca altera o status do snapshot Emusys. |
| `financeiro_sync_queue` | tabela | financeiro | 20 | 3172 | sim (0) | 1 | Fila unica do sync financeiro Emusys. Um job publica uma competencia completa das tres unidades. |
| `formas_pagamento` | tabela | financeiro | 5 | 0 | sim (4) | 0 |  |
| `historico_pagamentos` | tabela | financeiro | 10 | 0 | sim (4) | 2 | Histórico mensal de status de pagamento dos alunos (snapshot antes do reset) |
| `inadimplencia_emusys_cache_legado` | tabela | financeiro | 6 | 1209 | sim (1) | 1 | APOSENTADA 2026-07-28. Cache de inadimplencia por matricula. Os 9 crons nunca funcionaram (401 no gateway: mandavam so x-sync-token contra edge com verify_jwt=true). Dados congelados em 15/07/2026 e Campo Grande sempre vazia. Fonte viva = aluno_jornada_matricula_disciplina.inadimplente_emusys. NAO USAR. |
| `matriculas_campos_fixados` | tabela | financeiro | 6 | 32 | sim (0) | 1 | Campos editados manualmente que o sync deve respeitar (não sobrescrever). |
| `sol_caixa_abertura_pendente` | tabela | financeiro | 10 | 60 | sim (0) | 0 |  |
| `sol_caixa_autorizados` | tabela | financeiro | 10 | 0 | sim (0) | 0 |  |
| `sol_caixa_ingestao_recebimentos` | tabela | financeiro | 21 | 213 | sim (0) | 0 |  |
| `sol_caixa_lancamento_auditoria` | tabela | financeiro | 15 | 196 | sim (0) | 0 |  |
| `sol_caixa_lote_itens_v1` | tabela | financeiro | 12 | 0 | sim (0) | 2 |  |
| `sol_caixa_lotes_v1` | tabela | financeiro | 13 | 0 | sim (0) | 4 |  |
| `sol_caixa_operacoes_auditoria_v1` | tabela | financeiro | 21 | 0 | sim (0) | 0 |  |
| `sol_caixa_shadow_approvals_v1` | tabela | financeiro | 7 | 51 | sim (0) | 1 | Sol Caixa V3 shadow privado: decisões de aprovação observadas, sem acionar write financeiro. |
| `sol_caixa_shadow_eventos_v1` | tabela | financeiro | 15 | 450 | sim (0) | 1 | Sol Caixa V3 shadow privado: eventos reais observados sem resposta pública e sem mutação financeira. |
| `sol_caixa_shadow_previews_v1` | tabela | financeiro | 11 | 939 | sim (0) | 2 | Sol Caixa V3 shadow privado: previews calculados para auditoria, nunca enviados ao WhatsApp por esta tabela. |
| `sol_caixa_unidade_policy` | tabela | financeiro | 3 | 0 | sim (0) | 0 |  |
| `sol_caixa_v3_approval_consumos_v1` | tabela | financeiro | 7 | 51 | sim (0) | 2 |  |
| `sol_caixa_v3_caixa_operacoes_v1` | tabela | financeiro | 11 | 0 | sim (0) | 4 | Ledger V3 de abrir/fechar. Reabertura fica explicitamente fora deste contrato; fluxo humano usa caixa_reaberturas_log. |
| `vw_contratos_vencendo` | view | financeiro | 21 | — | não | 0 | Matriculas ativas com data da ultima aula do contrato, aulas restantes e vencimento da ultima fatura derivado. Grao = matricula/disciplina. Join com alunos por a.id = j.aluno_id (mesma chave que vw_jornada_aluno_atual usa internamente) -- garante que todas as colunas de alunos vem da mesma pessoa que aluno_nome/telefone/whatsapp da jornada. |
| `bi_agent_config_lamusic` | tabela | gestao | 11 | 0 | sim (1) | 0 |  |
| `bi_ai_query_playbooks` | tabela | gestao | 19 | 19 | sim (4) | 0 |  |
| `bi_conversations_lamusic` | tabela | gestao | 11 | 0 | sim (4) | 3 |  |
| `bi_messages_lamusic` | tabela | gestao | 20 | 4 | sim (4) | 1 |  |
| `bi_query_cache_lamusic` | tabela | gestao | 9 | 0 | sim (1) | 0 |  |
| `bi_query_templates_lamusic` | tabela | gestao | 9 | 0 | sim (1) | 0 |  |
| `competencias_bloqueios_log` | tabela | gestao | 12 | 56 | sim (0) | 1 | Log persistente de tentativas bloqueadas ou pendencias de retificacao em competencias fechadas. |
| `competencias_mensais` | tabela | gestao | 11 | 0 | sim (1) | 1 | Governanca de fechamento mensal por unidade/ano/mes. dados_mensais continua sendo o snapshot historico. |
| `dados_comerciais_legado` | tabela | gestao | 17 | 105 | sim (4) | 0 | LEGADO (aposentada 2026-07-05). Agregacao comercial mensal inflada por trigger incremental bugado (3-17x). Substituida por calculo vivo de leads no Dashboard e alerta CONVERSAO_BAIXA. Historico canonico mensal = dados_mensais + fechamento_mensal_snapshots. Nao usar. |
| `dados_mensais` | tabela | gestao | 25 | 126 | sim (3) | 1 |  |
| `dados_mensais_retificacoes` | tabela | gestao | 17 | 2 | sim (0) | 1 | Auditoria de retificações em dados_mensais. Cada registro representa uma retificação aplicada com antes/depois/diff. |
| `dashboard_config` | tabela | gestao | 6 | 0 | sim (2) | 0 |  |
| `insights_salvos` | tabela | gestao | 10 | 0 | sim (4) | 2 |  |
| `metas` | tabela | gestao | 26 | 0 | sim (4) | 1 | Metas e OKRs unificados por unidade - mensais, trimestrais e anuais. |
| `metas_comerciais` | tabela | gestao | 10 | 0 | sim (4) | 0 | BACKUP: Metas comerciais originais. Dados consolidados na nova tabela metas em 2026-01-16. Pode ser removida após 30 dias de validação. |
| `metas_kpi` | tabela | gestao | 8 | 552 | sim (4) | 1 |  |
| `metas_legado` | tabela | gestao | 14 | 0 | sim (2) | 1 | BACKUP: Tabela metas original (estrutura anual). Dados migrados para nova tabela metas em 2026-01-16. Pode ser removida após 30 dias de validação. |
| `metas_professor_turma` | tabela | gestao | 13 | 0 | sim (1) | 2 |  |
| `projecao_aulas` | tabela | gestao | 12 | 50298 | não | 2 |  |
| `projecao_recaculo_log` | tabela | gestao | 8 | 0 | não | 0 |  |
| `relatorios_diarios` | tabela | gestao | 37 | 0 | sim (4) | 2 | Snapshot diário dos números de cada unidade - histórico para análise |
| `relatorios_pedagogicos` | tabela | gestao | 15 | 0 | sim (4) | 1 | Historico de relatorios pedagogicos gerados por IA (Gemini) a partir das anotacoes de aula. Rascunho editavel + reuso pelo agente Fabio. |
| `simulacoes_metas` | tabela | gestao | 29 | 0 | sim (4) | 0 |  |
| `simulacoes_turma` | tabela | gestao | 25 | 0 | sim (1) | 1 |  |
| `vw_alertas` | view | gestao | 5 | — | não | 0 |  |
| `vw_alertas_inteligentes` | view | gestao | 10 | — | não | 0 | Alertas do Dashboard. Desde 2026-07-05, o alerta CONVERSAO_BAIXA e calculado ao vivo de leads (formula do Dashboard: exp realizadas -> convertidos), nao mais de dados_comerciais (tabela legado, inflada por trigger incremental bugado). |
| `vw_consolidado_anual` | view | gestao | 10 | — | não | 0 |  |
| `vw_dashboard_unidade` | view | gestao | 14 | — | não | 0 |  |
| `vw_kpis_comercial_historico` | view | gestao | 17 | — | não | 0 |  |
| `vw_kpis_comercial_mensal` | view | gestao | 16 | — | não | 0 |  |
| `vw_kpis_gestao_mensal` | view | gestao | 27 | — | não | 0 |  |
| `vw_kpis_mensais` | view | gestao | 6 | — | não | 0 |  |
| `vw_metas_vs_realizado` | view | gestao | 19 | — | não | 0 |  |
| `vw_projecao_metas` | view | gestao | 13 | — | não | 0 |  |
| `vw_ranking_professores_evasoes` | view | gestao | 9 | — | não | 0 |  |
| `vw_ranking_professores_retencao` | view | gestao | 8 | — | não | 0 |  |
| `vw_ranking_unidades` | view | gestao | 9 | — | não | 0 |  |
| `vw_sazonalidade` | view | gestao | 8 | — | não | 0 |  |
| `admin_conversas` | tabela | integracao | 15 | 258 | sim (1) | 3 | Conversas administrativas com alunos via WhatsApp - uma por aluno por unidade |
| `admin_mensagens` | tabela | integracao | 17 | 1643 | sim (1) | 2 | Mensagens das conversas administrativas com alunos |
| `alunos_emusys_atributos_decisoes` | tabela | integracao | 13 | 929 | sim (1) | 2 |  |
| `alunos_emusys_atributos_divergencias` | tabela | integracao | 18 | 7881 | sim (1) | 2 |  |
| `automacao_invariantes` | tabela | integracao | 8 | 1518 | sim (2) | 1 | Registra violações de invariantes de negócio detectadas nos webhooks Emusys (matrícula em tempo real) ou via cron auditor (lead/experimental/alunos). |
| `automacao_log` | tabela | integracao | 14 | 26742 | sim (4) | 0 |  |
| `automacoes_config` | tabela | integracao | 3 | 0 | sim (3) | 0 |  |
| `base_conhecimento_blocos` | tabela | integracao | 9 | 0 | sim (1) | 1 | Base de conhecimento da LA Music, em blocos. Consumida pelos agentes SDR Mila (via RPC get_base_conhecimento + edge base-conhecimento) e pela equipe, na subaba Conhecimento em Pré-Atendimento > Configurações. |
| `boas_vindas_enviadas` | tabela | integracao | 9 | 142 | sim (0) | 0 | Idempotencia da boas-vindas de matricula (1 envio por matricula). Ver edge function enviar-boas-vindas-matricula. |
| `conversa_estado_whatsapp` | tabela | integracao | 7 | 20 | sim (1) | 0 |  |
| `curso_emusys_depara` | tabela | integracao | 6 | 86 | sim (0) | 2 | De-para (unidade, disciplina_id Emusys) -> curso. Casamento por ID, imune a renomeação. Fonte: GET /disciplinas. |
| `emusys_api_payload` | tabela | integracao | 12 | 4755 | sim (1) | 0 | Espelho de debug do payload bruto da API Emusys. Sem FK e sem vínculo com o sistema. Uso: comparar Emusys x base manualmente. Não alimenta nada. |
| `emusys_aula_alunos_historico_staging_v1` | tabela | integracao | 15 | 437315 | sim (0) | 3 | Linhas distintas de roster observadas no historico; registros existentes nunca sao apagados pelo coletor. |
| `emusys_aulas_historico_revisoes_v1` | tabela | integracao | 10 | 434257 | sim (0) | 3 | Evidencia append-only das versoes distintas observadas para uma aula do Emusys. |
| `emusys_aulas_historico_staging_v1` | tabela | integracao | 21 | 415077 | sim (0) | 2 | Ultima versao observada de cada aula historica; versoes anteriores ficam na tabela de revisoes. |
| `emusys_disciplinas_catalogo` | tabela | integracao | 14 | 88 | sim (0) | 2 |  |
| `emusys_experimentais_raw` | tabela | integracao | 32 | 197136 | sim (1) | 8 | Bruto por aluno das aulas experimentais do Emusys. Nao altera lead_experimentais, status, presenca ou KPI canonico. |
| `emusys_experimentais_refresh_admissoes` | tabela | integracao | 14 | 161 | sim (0) | 1 | Single-flight e janela de frescor do refresh Emusys por unidade, intervalo e origem. |
| `emusys_experimentais_snapshot_execucoes` | tabela | integracao | 10 | 18843 | não | 1 |  |
| `emusys_experimentais_snapshot_publicacoes_vigentes` | tabela | integracao | 6 | 3 | sim (0) | 2 | Ponteiro transacional da ultima publicacao completa por unidade para validar leituras admitidas. |
| `emusys_fatura_source_events` | tabela | integracao | 12 | 3251910 | sim (1) | 4 | Trilha append-only das confirmacoes, ausencias e resolucoes observadas por competencia. |
| `emusys_faturas` | tabela | integracao | 22 | 5297 | sim (1) | 1 |  |
| `emusys_historico_backfill_execucoes_v1` | tabela | integracao | 20 | 81 | sim (0) | 2 | Checkpoint retomavel do coletor historico Emusys do Health Score Professor V3. |
| `emusys_matriculas_estado_atual` | tabela | integracao | 23 | 4909 | sim (1) | 2 | Fonte bruta backend-only do estado atual de cada matricula Emusys, escopada por unidade. |
| `emusys_matriculas_sync_execucoes` | tabela | integracao | 13 | 150 | sim (1) | 1 | Manifesto auditavel das fotografias Emusys. Somente execucao operacional concluida e fresca pode alimentar KPIs vivos. |
| `emusys_professor_disciplinas` | tabela | integracao | 13 | 467 | sim (0) | 4 |  |
| `emusys_professor_disciplinas_sync_execucoes` | tabela | integracao | 14 | 217 | sim (0) | 2 |  |
| `emusys_sync_log` | tabela | integracao | 16 | 6969 | sim (1) | 1 |  |
| `fila_anamnese_sol_hermes` | tabela | integracao | 18 | 177 | sim (0) | 3 | Outbox Sol/Hermes para anamnese_professor. Substitui envio direto WAHA legado. |
| `fila_relatorios_sol_hermes` | tabela | integracao | 20 | 138 | sim (0) | 1 |  |
| `fila_relatorios_whatsapp` | tabela | integracao | 15 | 281 | sim (0) | 1 | Fila de envio dos relatórios diários por unidade — processada pelo cron processar-mensagens-agendadas com 1 min de intervalo entre cada envio |
| `hermes_patch_status` | tabela | integracao | 5 | 5 | não | 0 | Estado do patch local do Hermes por agente (Fabio/Mila/Lia/...). Escrito por um cron root (hermes-patch-guard.sh) e lido por monitor-saude-fabio. Se patched=false ou checado_em velho, alerta no WhatsApp. |
| `integracao_tokens` | tabela | integracao | 5 | 0 | sim (0) | 0 | Tokens de escopo mínimo para integrações que chamam edges por URL. RLS sem policy: só service_role acessa. Rotacionar = UPDATE, sem redeploy. |
| `lia_alertas_configuracao` | tabela | integracao | 5 | 0 | sim (0) | 0 |  |
| `lia_alertas_privados` | tabela | integracao | 22 | 5 | sim (0) | 5 | Outbox privada da Lia. Producao nasce bloqueada ate piloto aceito pelo Alf. |
| `lia_destinos_privados` | tabela | integracao | 9 | 0 | sim (0) | 1 | Destinos privados governados da Lia; nunca resolvidos de cadastro operacional em runtime. |
| `lia_followup_resumo_itens` | tabela | integracao | 8 | 0 | sim (0) | 2 | Vinculo auditavel dos casos incluidos no resumo, sem duplicar telefone ou resposta. |
| `lia_followup_resumos` | tabela | integracao | 7 | 5 | sim (0) | 1 | Resumo privado diario por operador, produzido as 09:00 BRT e entregue pela outbox da Lia. |
| `lia_pesquisa_eventos` | tabela | integracao | 12 | 0 | sim (0) | 3 | Fatos imutaveis e sem conteudo da resposta para alertas da pesquisa de evasao. |
| `matriculas_divergencias` | tabela | integracao | 15 | 2086 | sim (0) | 2 |  |
| `matriculas_divergencias_decisoes` | tabela | integracao | 11 | 722 | sim (0) | 1 |  |
| `matriculas_emusys_decisoes_canonicas` | tabela | integracao | 16 | 0 | sim (1) | 2 | Decisoes canonicas por unidade + matricula Emusys. Usada para blindar o sync contra excecoes validadas: bolsista, responsavel, banda, bloqueios e revisoes. |
| `notificacao_config` | tabela | integracao | 9 | 0 | sim (3) | 0 |  |
| `notificacao_destinatarios` | tabela | integracao | 6 | 0 | sim (3) | 1 |  |
| `notificacao_log` | tabela | integracao | 13 | 234 | sim (4) | 3 |  |
| `orquestracao_locks_v1` | tabela | integracao | 4 | 1 | sim (0) | 0 | Trava com TTL para orquestradores re-entrantes (cron → edge que precisa de N chamadas). Primeiro uso: orquestrar-historico-professor. |
| `sync_run_items` | tabela | integracao | 27 | 3225333 | sim (1) | 3 | Snapshot imutavel por run/competencia/unidade/fatura, incluindo tombstones de nao confirmacao pela origem. |
| `sync_run_overrides` | tabela | integracao | 10 | 0 | sim (1) | 2 |  |
| `sync_runs` | tabela | integracao | 20 | 3379 | sim (1) | 0 | Execucoes preservadas do sync financeiro. Somente live completo prova frescor; baseline serve apenas para comparacao. |
| `vcards_unidade` | tabela | integracao | 11 | 0 | sim (4) | 1 |  |
| `vw_fila_audio_sem_roster` | view | integracao | 18 | — | não | 0 | Áudio de aula COMUM parado porque a aula operacional não tem nenhum aluno no roster. Régua de FATO (ausência de linha em aula_alunos_emusys), nunca o texto do campo erro — aquele é escrito pelo agente. Buraco conhecido: fn_aula_operacional_id devolve NULL quando não há candidata NÃO cancelada, então quem gravou sobre aula cancelada e sem gêmeo cai fora deste join. Medido em 15/08: 0 linhas nessa situação — buraco teórico hoje, não perda em curso. |
| `vw_whatsapp_caixas_departamento` | view | integracao | 2 | — | não | 0 | Projecao somente-leitura de whatsapp_caixas (id + departamento), sem credenciais. Existe para RPCs SECURITY INVOKER poderem filtrar por departamento sem destrancar a tabela base. |
| `webhook_debug_log` | tabela | integracao | 3 | 2091 | sim (0) | 0 |  |
| `whatsapp_caixas` | tabela | integracao | 16 | 0 | sim (0) | 1 | Caixas de WhatsApp configuradas para cada unidade |
| `whatsapp_caixas_credenciais_auditoria` | tabela | integracao | 5 | 0 | sim (0) | 1 | Auditoria sem valor secreto para rotações write-only de credenciais WhatsApp. |
| `whatsapp_config` | tabela | integracao | 7 | 0 | sim (1) | 0 |  |
| `whatsapp_destinatarios_relatorio` | tabela | integracao | 8 | 0 | sim (2) | 2 |  |
| `calendario_escolar` | tabela | operacao | 11 | 0 | não | 1 |  |
| `catalogo_treinamentos` | tabela | operacao | 9 | 0 | sim (1) | 0 |  |
| `colaborador_rider` | tabela | operacao | 6 | 0 | sim (3) | 1 | Bloco autodeclarado da Ficha Tecnica LA. A pessoa e dona do conteudo e edita quando quiser; historico em colaborador_rider_versoes. |
| `colaborador_rider_versoes` | tabela | operacao | 5 | 0 | sim (1) | 1 |  |
| `colaboradores` | tabela | operacao | 24 | 60 | sim (3) | 3 |  |
| `cursos` | tabela | operacao | 11 | 40 | sim (5) | 0 |  |
| `feriados` | tabela | operacao | 9 | 14 | sim (3) | 0 | Feriados nacionais (BrasilAPI), municipais e recessos. Campo ativo permite desativar manualmente. |
| `horarios` | tabela | operacao | 6 | 0 | sim (4) | 0 | Faixas de horário para aulas (manhã, tarde, noite) |
| `inventario` | tabela | operacao | 26 | 272 | sim (5) | 3 |  |
| `inventario_manutencoes` | tabela | operacao | 12 | 0 | sim (5) | 2 |  |
| `inventario_movimentacoes` | tabela | operacao | 8 | 0 | sim (5) | 4 |  |
| `inventario_pendencias` | tabela | operacao | 16 | 0 | sim (1) | 3 |  |
| `loja_carteira` | tabela | operacao | 8 | 0 | sim (2) | 3 |  |
| `loja_carteira_movimentacoes` | tabela | operacao | 9 | 0 | sim (2) | 1 |  |
| `loja_categorias` | tabela | operacao | 6 | 0 | sim (3) | 0 |  |
| `loja_configuracoes` | tabela | operacao | 5 | 0 | sim (2) | 0 |  |
| `loja_estoque` | tabela | operacao | 6 | 30 | sim (3) | 3 |  |
| `loja_movimentacoes_estoque` | tabela | operacao | 11 | 3 | sim (2) | 4 |  |
| `loja_optin_novidades` | tabela | operacao | 6 | 0 | sim (2) | 2 |  |
| `loja_produtos` | tabela | operacao | 14 | 0 | sim (3) | 1 |  |
| `loja_reservas` | tabela | operacao | 16 | 0 | sim (0) | 5 |  |
| `loja_responsaveis_reposicao` | tabela | operacao | 6 | 0 | sim (2) | 1 |  |
| `loja_variacoes` | tabela | operacao | 7 | 0 | sim (2) | 1 |  |
| `loja_vendas` | tabela | operacao | 23 | 5 | sim (2) | 6 |  |
| `loja_vendas_itens` | tabela | operacao | 10 | 5 | sim (2) | 3 |  |
| `planos_acao` | tabela | operacao | 17 | 0 | sim (4) | 2 | Planos de ação gerados pela IA Gemini para cada unidade/período |
| `projeto_anexos` | tabela | operacao | 12 | 0 | sim (3) | 2 |  |
| `projeto_comentarios` | tabela | operacao | 9 | 0 | sim (4) | 2 |  |
| `projeto_config_permissoes` | tabela | operacao | 6 | 0 | sim (1) | 0 |  |
| `projeto_equipe` | tabela | operacao | 6 | 0 | sim (6) | 1 | Pessoas envolvidas em cada projeto (coordenadores, assistentes, professores) |
| `projeto_equipe_membros` | tabela | operacao | 9 | 0 | sim (1) | 1 |  |
| `projeto_fases` | tabela | operacao | 10 | 0 | sim (7) | 1 | Fases de cada projeto (Planejamento, Divulgação, Preparação, etc.) |
| `projeto_log_alteracoes` | tabela | operacao | 11 | 62 | sim (2) | 2 |  |
| `projeto_tarefas` | tabela | operacao | 17 | 0 | sim (7) | 5 | Tarefas e subtarefas dos projetos pedagógicos |
| `projeto_tipo_fases_template` | tabela | operacao | 7 | 34 | sim (5) | 1 | Template de fases padrão para cada tipo de projeto |
| `projeto_tipo_tarefas_template` | tabela | operacao | 6 | 80 | sim (5) | 1 | Tarefas padrão de cada fase do template |
| `projeto_tipos` | tabela | operacao | 8 | 0 | sim (5) | 0 | Tipos de projeto cadastráveis (Semana Temática, Recital, Show de Banda, etc.) |
| `projetos` | tabela | operacao | 16 | 1 | sim (7) | 3 | Projetos pedagógicos da escola (Semanas Temáticas, Recitais, Shows, etc.) |
| `salas` | tabela | operacao | 13 | 46 | sim (6) | 1 | Salas de aula de cada unidade com capacidade máxima |
| `staff_unidade` | tabela | operacao | 9 | 0 | sim (2) | 1 | Equipe por unidade para o carrossel de boas-vindas. unidade_id NULL = global (aparece em todas). |
| `templates_cenario` | tabela | operacao | 14 | 0 | sim (4) | 0 |  |
| `templates_cenario_unidade` | tabela | operacao | 11 | 0 | sim (4) | 1 |  |
| `visitas` | tabela | operacao | 13 | 105 | sim (4) | 2 | Visitas presenciais agendadas por lead. Alternativa a aula experimental. |
| `visitas_config` | tabela | operacao | 14 | 0 | sim (3) | 1 | Configuracao do sistema de visitas por unidade (limite, horarios). |
| `vw_disciplinas_modalidade` | view | operacao | 4 | — | não | 0 | Somente disciplina -> modalidade (individual\|turma), para consumo por RPC SECURITY INVOKER. security_invoker=false de proposito: evita abrir emusys_disciplinas_catalogo, que tem RLS sem policy. |
| `_auditoria_chave_natural_20260809` | tabela | plataforma | 17 | 597 | não | 0 |  |
| `_auditoria_reconstrucao_20260809` | tabela | plataforma | 13 | 88 | não | 0 |  |
| `assistente_ia_config` | tabela | plataforma | 4 | 0 | sim (2) | 0 |  |
| `audit_log` | tabela | plataforma | 11 | 123064 | sim (2) | 0 |  |
| `auditoria_acesso` | tabela | plataforma | 10 | 0 | sim (2) | 1 | Log de auditoria para ações de acesso e permissões |
| `ficha_tokens` | tabela | plataforma | 8 | 5 | sim (0) | 1 | Token pessoal por colaborador. Uso unico: usado_em preenchido trava o reenvio. RLS sem policy por design — so service_role le; token nunca vai para o client. |
| `migrations_audit_data_nascimento` | tabela | plataforma | 7 | 79 | não | 0 |  |
| `perfil_permissoes` | tabela | plataforma | 4 | 144 | sim (2) | 2 | Relacionamento N:N entre perfis e permissoes |
| `perfis` | tabela | plataforma | 10 | 0 | sim (2) | 0 | Perfis de acesso do sistema (Admin, Gerente, Farmer, Hunter, etc.) |
| `permissoes` | tabela | plataforma | 9 | 0 | sim (2) | 0 | Permissões granulares do sistema (ex: alunos.ver, alunos.editar) |
| `rbac_piloto_usuarios` | tabela | plataforma | 3 | 0 | sim (0) | 1 |  |
| `sol_permissoes` | tabela | plataforma | 12 | 0 | sim (0) | 2 |  |
| `unidades` | tabela | plataforma | 20 | 3 | sim (6) | 0 |  |
| `unidades_cursos` | tabela | plataforma | 6 | 69 | sim (2) | 2 | Relacionamento entre unidades e cursos - define quais cursos cada unidade oferece |
| `usuario_onboarding` | tabela | plataforma | 20 | 21 | sim (4) | 1 | Tracking do progresso de onboarding de cada usuário |
| `usuario_perfis` | tabela | plataforma | 7 | 35 | sim (2) | 3 | Relacionamento N:N entre usuários e perfis, com escopo opcional de unidade |
| `usuarios` | tabela | plataforma | 15 | 39 | sim (4) | 1 | Usuários do sistema com controle de acesso por unidade |
| `vw_saude_jornada_ciclos` | view | plataforma | 8 | — | não | 0 |  |
| `vw_saude_presenca_professor` | view | plataforma | 7 | — | não | 0 | Saude service-only da protecao humana na ocorrencia vigente. Revertidas e cancelamentos_humanos_desfeitos devem permanecer 0. |
| `vw_saude_professor_experimental` | view | plataforma | 10 | — | não | 0 | Saude do campo alunos.professor_experimental_id por competencia/unidade. campo_confere/pct_acerto = acerto contra a experimental real (lead_experimentais); copia_sem_lastro = sintoma do bug corrigido na v33 do webhook de matricula (06/08/2026). |
| `vw_totais_unidade_performance` | view | plataforma | 10 | — | não | 0 |  |
| `vw_unidade_anual` | view | plataforma | 12 | — | não | 0 |  |
| `anotacoes` | tabela | professor | 11 | 0 | sim (2) | 1 |  |
| `anotacoes_alunos` | tabela | professor | 8 | 6 | sim (4) | 1 | Anotações e observações sobre alunos |
| `app_audio_preso_no_aparelho` | tabela | professor | 5 | 9 | sim (0) | 1 | Farol do app (20260827170000): estado ATUAL da fila local de audios de cada professor. Uma linha por professor, sobrescrita — e o zero tambem e reportado, senao o alarme de ontem nunca apaga. Sem isto, audio recusado fica so no aparelho e nenhuma auditoria pode ve-lo (caso Valdo/Bruno, 26/08/2026). |
| `aula_alunos_emusys` | tabela | professor | 16 | 34625 | sim (3) | 3 | Roster operacional de aulas do Emusys, sem contato ou dados financeiros. |
| `aula_registros_fabio_log` | tabela | professor | 8 | 466 | sim (0) | 1 | Auditoria das gravações do Fábio em aulas_emusys.anotacoes_fabio. É trilha de rastreabilidade, não o lar do registro (o registro vive em anotacoes_fabio). |
| `aula_roster_sync_estado` | tabela | professor | 9 | 16309 | sim (0) | 2 |  |
| `aulas_emusys` | tabela | professor | 35 | 61614 | sim (4) | 3 | Metadados completos de cada aula importada do Emusys (turma, curso, sala, professor, horários) |
| `config_health_score` | tabela | professor | 13 | 0 | sim (2) | 1 | Configuração dos pesos e limites do Health Score do Professor |
| `config_health_score_aluno` | tabela | professor | 11 | 0 | sim (2) | 1 | Configuração de pesos do Health Score de Alunos - ajustável por unidade |
| `config_health_score_professor` | tabela | professor | 12 | 1 | sim (2) | 1 | Configuração de pesos do Health Score de Professores - ajustável por unidade |
| `disponibilidade_professor_propostas` | tabela | professor | 16 | 0 | sim (1) | 5 | Propostas de disponibilidade. Aprovar nao altera o espelho; efetivar exige confirmacao da operacao no Emusys. |
| `fabio_acao_eventos` | tabela | professor | 7 | 107 | sim (0) | 2 | Ledger idempotente por wa_message_id das transicoes da acao. |
| `fabio_acoes_pendentes` | tabela | professor | 20 | 28 | sim (0) | 4 | Estado duravel e auditavel das acoes iniciadas pelo professor no WhatsApp. |
| `fabio_audios_parqueados` | tabela | professor | 11 | 0 | sim (0) | 0 | Áudio que chegou pelo WhatsApp enquanto o professor tinha uma ação aberta. Fila de espera FIFO por professor, do lado de fora da trava de uma-ação-por-professor. Sai por consumo (virou ação) ou por descarte explícito — nunca some sozinho. |
| `fabio_chat_mensagens` | tabela | professor | 16 | 676 | sim (3) | 2 | Chat 1:1 professor<->Fabio, dual channel (app+whatsapp), mesma conversa. Espelha o padrao ja provado em producao no LA Organizer (Tom / group_chat_messages). App insere direto (RLS); Hermes (service_role) faz polling em fabio_seen_at IS NULL e escreve as respostas. |
| `fabio_correcoes_acoes` | tabela | professor | 10 | 0 | sim (0) | 1 | Ledger idempotente das correcoes finais por tipo e p_acao_id; sem acesso direto do bridge. |
| `fabio_devolutiva_edicoes` | tabela | professor | 9 | 0 | sim (0) | 3 |  |
| `fabio_devolutivas` | tabela | professor | 31 | 420 | sim (0) | 2 |  |
| `fabio_fila_audios` | tabela | professor | 15 | 432 | sim (2) | 4 |  |
| `fabio_notificacoes` | tabela | professor | 23 | 625 | sim (2) | 1 | Notificacoes proativas do Fabio (Fase 2). O AGENDAMENTO nao mora aqui — decidido pelo Hermes/VPS via cron, sem pg_cron (mesmo padrao do Tom). tipo=pendencia_registro/reagendamento sao SEMPRE categoria=governanca. Os demais sao informativa. |
| `fabio_participacao_ocorrencia_eventos` | tabela | professor | 8 | 0 | não | 1 | Ciclo de vida da ocorrencia (append-only). Estado atual = ultimo evento. registrada->candidata na view. |
| `fabio_participacao_ocorrencias` | tabela | professor | 16 | 0 | não | 1 | Quem participou no lugar de quem (substituicao), separado do roster esperado. Append-only: fatos nunca mudam; correcao e linha nova com supersede_ocorrencia_id. SHADOW: nao toca presenca/falta/financeiro/Emusys. |
| `fabio_professor_preferences` | tabela | professor | 12 | 0 | sim (0) | 1 |  |
| `fabio_protecao_log` | tabela | professor | 5 | 0 | sim (0) | 0 | Auditoria de updates que tentaram esvaziar aulas_emusys.anotacoes_fabio e foram neutralizados. |
| `fabio_registro_correcoes` | tabela | professor | 9 | 0 | sim (0) | 3 |  |
| `fabio_registros_aula` | tabela | professor | 19 | 1083 | sim (3) | 7 |  |
| `fabio_skills` | tabela | professor | 8 | 2 | sim (0) | 0 |  |
| `health_score_professor_v3_carteira_politicas_unidade` | tabela | professor | 14 | 0 | sim (0) | 1 | Politica temporal do pilar numero_alunos: meta total proporcional a disponibilidade canonica salva no LA Report. |
| `health_score_professor_v3_ciclos` | tabela | professor | 12 | 0 | sim (0) | 1 | Calendario versionado do Health Score V3: Jun-Ago, Set-Nov, Dez-Fev e Mar-Mai. Ranking somente depois do fechamento oficial. |
| `health_score_professor_v3_config_metas_curso_modalidade` | tabela | professor | 12 | 277 | sim (0) | 3 | Matriz versionada de metas V3 por configuracao, unidade, curso e modalidade. |
| `health_score_professor_v3_config_metricas` | tabela | professor | 10 | 36 | sim (0) | 1 | Metricas versionadas do Health Score V3. A V2 recebeu em 19/07/2026 reparo apenas do meta_status omitido; metas e pesos homologados nao foram alterados. |
| `health_score_professor_v3_config_simulacoes` | tabela | professor | 7 | 0 | sim (0) | 2 | Gate 7: trilha append-only das simulacoes de configuracao V3, sem publicar snapshots. |
| `health_score_professor_v3_config_substituicoes` | tabela | professor | 8 | 0 | sim (0) | 3 | Trilha append-only das substituicoes governadas de configuracao do Health Score Professor V3. |
| `health_score_professor_v3_config_versoes` | tabela | professor | 17 | 3 | sim (0) | 2 | Gate 5: configuracoes temporais e versionadas do Health Score Professor V3. |
| `health_score_professor_v3_materializacao_execucoes` | tabela | professor | 22 | 100 | não | 1 |  |
| `health_score_professor_v3_snapshot_metrica_diagnosticos` | tabela | professor | 12 | 260 | sim (0) | 2 | Diagnosticos estruturados de escopos sem curso ou modalidade oficialmente resolvidos. |
| `health_score_professor_v3_snapshot_metrica_segmentos` | tabela | professor | 31 | 63610 | sim (0) | 12 | Detalhamento por curso/modalidade da metrica numero_alunos. ATENCAO (decisao Alf 09/08/2026): so o caminho do PERIODO escreve aqui; o caminho DIARIO nao escreve, e por isso numero_alunos sai com nota NULL e peso_disponivel=false no score vivo. Isso e INTENCIONAL — numero_alunos nao pontua no V3. Nao "corrigir" escrevendo segmentos no diario para destravar a nota. |
| `health_score_professor_v3_snapshot_metricas` | tabela | professor | 23 | 56406 | sim (0) | 1 |  |
| `health_score_professor_v3_snapshots` | tabela | professor | 30 | 9445 | sim (0) | 5 | Gate 5: snapshots mensais/trimestrais em sombra; fechado e imutavel. |
| `health_score_v3_experimental_lead_conciliacoes` | tabela | professor | 9 | 69 | sim (0) | 3 | Camada aditiva e auditavel que liga a experimental bruta a um lead. Nao altera o payload raw nem fabrica aluno canonico. |
| `la_teacher_coordenacao` | tabela | professor | 3 | 4 | sim (0) | 1 | Quem cuida dos professores no LA Teacher. NAO e o mesmo que usuarios.perfil=admin (que e do LA Report e inclui Marketing/Comercial). Entrar aqui e um ato explicito. |
| `presenca_acao_eventos` | tabela | professor | 15 | 3859 | sim (0) | 1 | Recibo append-only por request_id: recebido, resultado por item e conclusao. |
| `presenca_comando_itens` | tabela | professor | 9 | 1283 | sim (0) | 1 |  |
| `presenca_comando_nao_recebidos` | tabela | professor | 3 | 0 | sim (0) | 0 | Tombstone durável de request_id confirmado como não recebido; impede escrita tardia após reconciliação. |
| `presenca_comandos` | tabela | professor | 18 | 1291 | sim (0) | 0 | Intencao duravel e idempotente de escrita humana de presenca; sem nomes ou payload bruto. |
| `presenca_politicas_confiabilidade` | tabela | professor | 12 | 0 | sim (1) | 1 | Decisoes temporais e versionadas que qualificam evidencia de presenca por unidade. |
| `presenca_rollout_config` | tabela | professor | 7 | 0 | sim (0) | 1 | Estado atual governado por unidade e superficie. Sombra nao ativa consumidor. |
| `presenca_rollout_eventos` | tabela | professor | 10 | 0 | sim (0) | 1 | Trilha append-only das transicoes e rollbacks de presenca canonica. |
| `presenca_sync_cobertura` | tabela | professor | 14 | 111 | sim (0) | 2 | Estado atual por unidade, modo e data; somente concluida com hash e publicavel. |
| `presenca_sync_eventos` | tabela | professor | 5 | 11131 | sim (0) | 1 | Transicoes append-only do sync; a aplicacao nao possui UPDATE nem DELETE. |
| `presenca_sync_execucoes` | tabela | professor | 15 | 5270 | sim (0) | 1 | Uma linha por tentativa de sync; inclui tentativas deduplicadas como abortadas. |
| `professor_360_avaliacoes` | tabela | professor | 27 | 0 | sim (2) | 2 |  |
| `professor_360_config` | tabela | professor | 5 | 0 | sim (2) | 0 |  |
| `professor_360_criterios` | tabela | professor | 14 | 0 | sim (2) | 0 |  |
| `professor_360_ocorrencias` | tabela | professor | 20 | 150 | sim (2) | 3 |  |
| `professor_360_ocorrencias_log` | tabela | professor | 9 | 168 | sim (2) | 0 |  |
| `professor_acesso_codigos` | tabela | professor | 9 | 23 | sim (0) | 1 | Rastro de cada pedido de código de acesso. Serve de auditoria e de base pro limite: sem ele, quem souber o número de um professor enche o WhatsApp dele. |
| `professor_acoes` | tabela | professor | 20 | 7 | sim (4) | 5 |  |
| `professor_acoes_participantes` | tabela | professor | 5 | 0 | sim (4) | 2 |  |
| `professor_carteira_mensal_canonica` | tabela | professor | 10 | 225 | sim (0) | 2 | Fechamento imutavel da carteira por professor/unidade/competencia, com proveniencia de auditoria. |
| `professor_carteira_mensal_detalhe` | tabela | professor | 9 | 2363 | sim (0) | 4 |  |
| `professor_checkpoints` | tabela | professor | 9 | 0 | sim (2) | 3 |  |
| `professor_matricula_disciplina_periodos_v1` | tabela | professor | 34 | 8723 | sim (0) | 7 | Camada canonica em sombra dos periodos continuos por professor, matricula e disciplina. |
| `professor_metas` | tabela | professor | 13 | 0 | sim (4) | 3 |  |
| `professor_passagem_bastao` | tabela | professor | 15 | 51 | sim (2) | 5 | Camada quente: pendencia humana de passagem de bastao para LA Teacher/Fabio. |
| `professor_perfil_respostas` | tabela | professor | 7 | 359 | sim (1) | 1 | Respostas individuais por aplicação. opcao_canonica (A/B/C/D do gabarito) preserva o recálculo mesmo com opções embaralhadas na exibição. 1-13 fixas; 14-15 desempate (presença = houve empate). |
| `professor_perfil_testes` | tabela | professor | 26 | 11 | sim (1) | 4 | Aplicações do teste de perfil comportamental do professor (13+2 cenários). Histórico preservado; o vigente desnormaliza em professores.temperamento_codinome. |
| `professor_periodos_reconstrucao_manifesto_v1` | tabela | professor | 13 | 0 | sim (0) | 5 | Manifesto privado e imutavel por versao do recorte. Calcula uma vez a particao da pessoa canonica. |
| `professor_periodos_reconstrucao_particoes_v1` | tabela | professor | 20 | 0 | sim (0) | 2 | Resultados intermediarios, idempotentes e privados da reconstrucao V3. O detalhe diagnostico fica aqui; a camada final so nasce apos todas as particoes. |
| `professor_periodos_reconstrucoes_v1` | tabela | professor | 19 | 166 | sim (0) | 2 | Execucao versionada e idempotente do reconstrutor historico de periodos professor-matricula-disciplina. |
| `professor_periodos_revisoes_v1` | tabela | professor | 16 | 382 | sim (0) | 5 | Trilha append-only de revisoes humanas e promocoes automaticas estruturadas sobre periodos reconstruidos. |
| `professor_ponto_confirmacoes` | tabela | professor | 9 | 3098 | sim (1) | 3 |  |
| `professor_unidade_curso_modalidade` | tabela | professor | 15 | 539 | sim (0) | 4 | Historico temporal canonico das atribuicoes de professor por unidade, curso e modalidade. |
| `professor_videos` | tabela | professor | 9 | 141 | sim (2) | 2 |  |
| `professores` | tabela | professor | 21 | 60 | sim (5) | 2 |  |
| `professores_cursos` | tabela | professor | 4 | 212 | sim (4) | 2 | Relacionamento N:N entre professores e cursos que lecionam (especialidades) |
| `professores_emusys_divergencias` | tabela | professor | 18 | 23 | sim (0) | 3 |  |
| `professores_performance` | tabela | professor | 12 | 78 | sim (4) | 0 |  |
| `professores_sync_log` | tabela | professor | 8 | 0 | sim (0) | 2 | Auditoria do sync semanal de professores com o Emusys (edge: sync-professores-emusys) |
| `professores_unidades` | tabela | professor | 18 | 83 | sim (4) | 2 | Relacionamento N:N entre professores e unidades onde atuam |
| `programa_fideliza_config` | tabela | professor | 19 | 0 | sim (2) | 0 |  |
| `programa_fideliza_experiencias` | tabela | professor | 9 | 0 | sim (2) | 0 |  |
| `programa_fideliza_historico` | tabela | professor | 22 | 0 | sim (2) | 1 |  |
| `programa_fideliza_penalidades` | tabela | professor | 11 | 0 | sim (2) | 1 |  |
| `programa_matriculador_config` | tabela | professor | 30 | 0 | sim (2) | 0 |  |
| `programa_matriculador_historico` | tabela | professor | 22 | 0 | sim (2) | 1 |  |
| `programa_matriculador_penalidades` | tabela | professor | 10 | 0 | sim (2) | 1 |  |
| `turmas` | tabela | professor | 15 | 0 | sim (5) | 4 | Turmas de aula - combinação de professor, dia, horário e sala |
| `turmas_alunos` | tabela | professor | 4 | 1 | sim (4) | 2 | Relacionamento entre turmas explícitas e alunos |
| `turmas_explicitas` | tabela | professor | 13 | 359 | sim (4) | 4 | Turmas explícitas criadas manualmente (turmas regulares e bandas) |
| `turmas_historico` | tabela | professor | 10 | 0 | sim (4) | 5 | Histórico de mudanças em turmas: adições, remoções e movimentações de alunos |
| `vw_aderencia_registro_professor` | view | professor | 14 | — | não | 0 | Aderencia ao registro. pct_cobertura = tem texto (legado). pct_north_star = registrado em <=24h, medido a partir de 13/07 (piloto). aulas_cobraveis = o que o bot pode cobrar (pos 21/07). NAO confundir as tres. |
| `vw_aula_roster_operacional_v1` | view | professor | 14 | — | não | 0 | Roster nominal somente quando a ultima fotografia e completa; estados inseguros nao expoem nomes. |
| `vw_aula_roster_operacional_v2` | view | professor | 14 | — | não | 0 | Roster nominal fail-closed: run atual concluido com hash/contagens iguais, identidade local completa e uma unica proveniencia de publicacao. |
| `vw_aulas_sem_professor` | view | professor | 11 | — | não | 0 |  |
| `vw_disponibilidade_professores` | view | professor | 12 | — | não | 0 | Espelho operacional da disponibilidade oficial mantida no Emusys, sem contato ou financeiro. |
| `vw_fabio_aulas_contexto` | view | professor | 40 | — | não | 0 | Contexto de aula para o Fábio (roster do normalizador de áudio, bridge, consultas). presenca_status carrega SÓ presença afirmada (fn_presenca_e_forte); chamada não lançada / "ausente" cru do Emusys vira NULL — regra de 24/08 depois do caso Isaque: o fantasma "ausente" fez o normalizador recusar áudio legítimo como transcricao_incompativel. presenca_forte expõe o próprio flag. |
| `vw_fabio_carteira_professor` | view | professor | 32 | — | não | 0 | Carteira do professor que o Fabio le. Desde a 026 diz tambem HA QUANTO TEMPO o aluno esta na casa (data_matricula, dias_desde_matricula, e_aluno_novo) e quantas aulas dele ja foram registradas. |
| `vw_fabio_contexto_experimental` | view | professor | 6 | — | não | 0 | Contexto da experimental que o Fabio pode ver. Lista de permissao: dinheiro, negociacao e recado interno nao atravessam. Idade sempre calculada de data_nascimento. |
| `vw_fabio_experimental_agendada` | view | professor | 8 | — | não | 0 | Experimentais agendadas com contexto extraido, por professor que vai dar a aula. Nao exige matricula: lead pre-matricula aparece aqui. |
| `vw_fabio_participacao_ocorrencia_estado` | view | professor | 4 | — | não | 0 | Fonte unica do estado atual de cada ocorrencia. registrada->candidata; o resto 1:1. |
| `vw_fator_demanda_professor` | view | professor | 6 | — | não | 0 | Calcula o Fator de Demanda Ponderado de cada professor baseado na composição da carteira de alunos |
| `vw_health_score_professor_v3_parcial_observado` | view | professor | 40 | — | não | 0 | Leitura operacional V3: usa somente valores brutos reais e metas versionadas; nao altera snapshots nem libera ranking. |
| `vw_health_score_professor_v3_parcial_operacional` | view | professor | 40 | — | não | 0 | Leitura operacional V3 set-based. Presenca de Barra/Recreio e calculada uma vez por recorte; Campo Grande permanece fora do score. |
| `vw_kpis_professor_completo` | view | professor | 9 | — | não | 0 |  |
| `vw_kpis_professor_historico` | view | professor | 13 | — | não | 0 |  |
| `vw_kpis_professor_mensal` | view | professor | 26 | — | não | 0 |  |
| `vw_kpis_professor_por_unidade` | view | professor | 10 | — | não | 0 |  |
| `vw_ponto_professor_aulas` | view | professor | 14 | — | não | 0 | Ponto do professor por ocorrencia vigente. Confirmacoes anteriores ao ultimo reagendamento nao creditam a nova ocorrencia. |
| `vw_ponto_professor_diario` | view | professor | 8 | — | não | 0 | NAO E MAIS CAMINHO DO APP (28/08/2026) -- o app usa fn_ponto_professor_diario. Esta view monta a escola inteira pra filtrar depois (~4s). Fica como ORACULO do teste diferencial do conserto. Nao usar em tela. |
| `vw_presenca_ocorrencia_canonica_v2` | view | professor | 16 | — | não | 0 | Read model v2.7: raw Emusys ausente nao e terminal; gemeas presente + ausente nao geram conflito; positiva so contradiz falta humana quando o snapshot publicavel de presenca e coerente, atual, vinculado a roster ativo e dentro da janela de execucao. Experimental segue contrato proprio. |
| `vw_presenca_ocorrencia_metrica_v2` | view | professor | 20 | — | não | 0 | Kernel metrico service-only. Agentes consomem exclusivamente as RPCs governadas por finalidade; ausencia Emusys nunca e inferida como falta. |
| `vw_presenca_pendencia` | view | professor | 17 | — | não | 0 | Governanca operacional (Fase 3): alunos sem presenca FORTE por aula/unidade/dia (fn_presenca_e_forte), roster-gap-aware, janela 45d. Fonte unica p/ Fabio (professor), Sol/Hugo (unidade), coordenacao (dias>=3). Nao e o canon analitico. |
| `vw_presenca_slot_canonica_v1` | view | professor | 39 | — | não | 0 | FONTE ÚNICA de presença por slot real: uma linha por (aluno, aula que aconteceu). Colapsa a duplicata turma/individual que o Emusys emite (85-91% da grade) e resolve pela decisão mais forte, então linha órfã nunca aparece como "sem rumo". presenca_afirmada carrega SÓ decisão declarada — o "ausente" cru do Emusys é default de sistema e vira NULL. Criada em 24/08/2026 depois que a Sol dizia "tudo fechado" e o LA Teacher dizia "Faltou" para a mesma aula. |
| `vw_professor_carteira_pessoa_canonica_sombra` | view | professor | 20 | — | não | 0 | Carteira atual por pessoa/professor/unidade. Resolve ID Emusys pela jornada ou linha local e nao usa presenca. |
| `vw_professor_periodos_baseline_v3_sombra` | view | professor | 32 | — | não | 0 | Baseline imutavel efetivo do Gate 4, antes da aplicacao de revisoes humanas. |
| `vw_professor_periodos_diagnostico_v1` | view | professor | 17 | — | não | 0 | Fila tecnica em sombra. Nao contem payload bruto e nao e concedida a usuarios finais nesta fase. |
| `vw_professor_periodos_efetivos_v3_sombra` | view | professor | 31 | — | não | 0 | Baseline e transicoes com overlay append-only; promocoes automaticas preservam confianca alta e revisoes humanas usam revisado_aprovado. |
| `vw_professores_carteira_resumo` | view | professor | 9 | — | não | 0 |  |
| `vw_professores_emusys_vinculos` | view | professor | 21 | — | não | 0 |  |
| `vw_professores_performance_atual` | view | professor | 13 | — | não | 0 |  |
| `vw_registro_pendencia` | view | professor | 20 | — | não | 0 | Aulas encerradas sem conteudo registrado. cobravel = dentro da data de corte E professor com o app liberado (fn_professor_usa_app). |
| `vw_taxa_crescimento_professor` | view | professor | 13 | — | não | 0 | Calcula a Taxa de Crescimento por Professor com Fator de Demanda Ponderado |
| `vw_turmas_completa` | view | professor | 18 | — | não | 0 | View com informações completas das turmas incluindo contagem de alunos |
| `vw_turmas_implicitas` | view | professor | 17 | — | não | 0 | View de turmas baseada nos dados existentes de alunos (professor + dia + horário) |
| `vw_turmas_professor_periodo` | view | professor | 14 | — | não | 0 | Turmas reconstruidas a partir de aulas_emusys+aluno_presenca. turma_chave usa COALESCE para nao perder turmas com turma_nome NULL. |
