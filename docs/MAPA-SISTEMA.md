# Mapa do Sistema — LA Music Performance Report

> **Propósito:** guia de referência rápida. Para cada página: rota, componentes, hooks, **RPCs** (funções do Postgres) e **edge functions** que ela usa. Consulte aqui antes de mexer numa página para entender de onde vêm os dados.
>
> **Manutenção (obrigatória):** ao criar/alterar uma página, hook, RPC ou edge function, **atualizar este arquivo no mesmo commit**. Critérios de cálculo de métricas ficam em [`docs/METRICAS.md`](./METRICAS.md). Ciclo Emusys em [`docs/MAPA-INTEGRACAO-EMUSYS.md`](./MAPA-INTEGRACAO-EMUSYS.md).

## Integração financeira com o Super Folha

- **Edge functions:** `sync-faturas-emusys`, `refresh-contas-receber` e `export-contas-receber`.
- **RPCs privadas:** `start_financeiro_sync_run`, `publish_financeiro_sync_run` e `fail_financeiro_sync_run`.
- **Finalidade:** atualizar as 3 unidades, publicar um snapshot imutável completo e exportar esse run exato para o espelho financeiro do Super Folha.
- **Autorização:** segredo interno dedicado no header `x-super-folha-sync-secret`; não aceita sessão de navegador nem expõe a service role do LA Report.
- **Contrato:** `emusys_faturas` continua como espelho canônico atual; `sync_run_items` congela cada competência e seus tombstones. `la_report_fatura_id` é o UUID estável da linha canônica, nunca o UUID técnico do snapshot.
- **Consistência:** um mutex parcial global permite só um run `running`; as 3 unidades são coletadas antes de uma RPC de publicação atômica. O export nunca lê a tabela mutável: aceita um `sync_run_id` live completo, valida o mais recente com `require_latest`, ou seleciona o último completo para fallback read-only.
- **Hash:** usa apenas unidade UUID, ID Emusys, competência, dados financeiros e estado/motivo de ausência; IDs de run/item e timestamps operacionais ficam fora.
- **Cron:** competências atual e anterior, sequenciais, com segredo lido do Vault.
>
> Última atualização: 2026-07-30.

## Fechamento mensal (histórico canônico)

Camada que congela o retrato de cada competência para que o passado não mude quando as
RPCs evoluem. Nasceu porque recalcular um mês encerrado devolve números diferentes: as
RPCs leem o estado **atual** do banco, não o de então.

- **Tabela:** `fechamento_mensal_snapshots` — 1 linha por `ano+mês+escopo+unidade+domínio`,
  com `payload` jsonb, `payload_hash`, `versao` e `status`
  (`preview` → `aprovado` → `fechado` → `retificado`). Auditoria em
  `fechamento_mensal_auditoria`.
- **Domínios-base gravados (7):** `alunos_admin`, `alunos_executivo`, `comercial`,
  `relatorio_gerencial`, `relatorio_coordenacao`, `programa_matriculador`,
  `programa_fideliza`. Por unidade + escopo consolidado. `relatorio_coordenacao` guarda
  **cada professor** com 19 métricas (carteira, renovações, evasões, presença, conversão).
- **Documentos mensais fechados (2 por unidade):** `relatorio_admin_mensal` e
  `relatorio_comercial_mensal`. Eles congelam também as listas e os dois tickets do
  Comercial, além de multicurso e trancamentos detalhados do Administrativo.
- **RPCs:** `preview_fechamento_mensal` (read-only, valida) →
  `gravar_snapshot_fechamento_mensal` (grava) →
  `atualizar_dados_mensais_por_snapshot` (alimenta `dados_mensais` por compatibilidade) →
  `capturar_relatorios_mensais_canonicos_v1` (materializa os dois documentos) →
  `fechar_competencia_mensal_canonica_v1` (fecha competência e snapshots).
  A leitura de tela usa exclusivamente `get_relatorio_mensal_canonico_v1`.
- **Automação (31/07/2026):** `fechar_competencia_mensal_automatico()` + cron
  `fechamento-mensal-automatico`. Até então era 100% manual — junho foi gravado à mão em
  30/06 23:05 e julho em 31/07 21:12.

### ⚠️ Armadilhas confirmadas em produção

1. **O cron é `0 1 1 * *` e isso está CERTO.** O pg_cron roda em UTC; dia 1 às 01:00 UTC
   = **último dia do mês às 22:00 BRT**, para meses de 31, 30, 28 ou 29 dias. Validado em
   14 meses seguidos + fev/2028 e fev/2032. Não "corrigir" para `L * *` nem para `0 22`.
   A função revalida o dia em BRT e aborta se não for o último.
2. **Exige `auth.role() = 'service_role'`.** `get_dados_relatorio_gerencial` alcança
   `get_kpis_professor_periodo_canonico_v2`, que **não** aceita `session_user = 'postgres'`
   como escape — só `service_role`. Rodar via MCP/psql sem
   `set_config('request.jwt.claims','{"role":"service_role"}',true)` falha com
   *"Acesso negado: usuario sem cadastro ativo"*. Aconteceu na 1ª tentativa de julho.
3. **Não dá para regravar silenciosamente.** Snapshot `aprovado` só aceita a transição
   controlada para `fechado`; snapshot `fechado` rejeita UPDATE e DELETE. Correção exige
   nova versão pelo fluxo formal de retificação.
4. **O fechamento é explícito.** `fechar_competencia_mensal_canonica_v1` exige os seis
   domínios mínimos de cada unidade, fecha as três competências no mesmo lote e promove
   todos os snapshots aprovados para `fechado`.
5. **Preview "aprovável" ≠ números auditados.** Os bloqueios cobrem disponibilidade das
   fontes, batimento `admin × canônico` (alunos ativos, matrículas ativas e de banda) e
   LTV/permanência não-zerados. **Não** há cross-check de ticket, evasão, inadimplência
   ou comercial. Payload com `{"erro": ...}` vira alerta, não bloqueio — contar chaves do
   JSON não prova que a fonte respondeu.

### Leitura dos relatórios mensais

Os geradores mensais de `ModalRelatorio.tsx` e `ComercialPage.tsx` enviam apenas unidade,
ano e mês para `relatorio-admin-whatsapp`. A edge valida o usuário, lê o documento
`fechado` por `get_relatorio_mensal_canonico_v1` e devolve o texto pronto. Não existe
fallback vivo no caminho executado do botão.

O botão Gerencial também envia somente unidade, ano e mês, agora diretamente
para `gemini-relatorio-gerencial`. A edge busca
`get_relatorio_gerencial_canonico_v1`, que exige os fechamentos mensais
Administrativo e Comercial da mesma competência, agrega metas e rankings V3 e
mantém os metadados de auditoria fora do texto público. A IA participa apenas
dos cinco blocos qualitativos; não recebe autoridade para alterar KPIs.

Cobertura histórica: snapshot completo só existe de **junho/2026 em diante**. Antes disso
há apenas `dados_mensais` (~12 campos).

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
| `/app/agenda` | Agenda (grade do dia) | [#agenda](#agenda-appagenda) |
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
- **Hooks:** `useMetasKPI`, `useComercialOperacionalResumoV2`, `useHealthScoreProfessorV3Performance`
- **RPCs:** `get_kpis_alunos_canonicos` para a base viva de alunos e
  `get_health_score_professor_v3_performance` para o card de professores; os
  demais cards preservam suas fontes próprias.
- **Edge functions:** nenhuma
- **Tabelas/views:** `alunos`, `movimentacoes_admin`, `leads`, `vw_alertas_inteligentes`, `professores`, `vw_turmas_implicitas`, `professores_performance`, `dados_mensais`, `unidades`; o Health Score usa somente snapshots V3 por RPC.
- **Health Score V3:** exibe média parcial no mês ou no ciclo fixo selecionado. Resultado parcial nunca gera ranking ou premiação; falha V3 é explícita e não retorna silenciosamente para a V2.

## Gestão Mensal (`/app/gestao-mensal`)
Orquestrador `GestaoMensal/GestaoMensalPage.tsx`. Abas: **Gestão**, **Comercial**, **Professores**.
- **Gestão (`TabGestao.tsx`):** hook `useMetasKPI`, `useCompetenciaMensalStatus`, `fetchKPIsAlunosCanonicos`. **RPC:** `recalcular_dados_mensais`. Tabelas: `alunos`, `movimentacoes_admin`, `dados_mensais`, `motivos_saida`.
- **Comercial (`TabComercialNew.tsx`):** `fetchComercialOperacionalResumoV2`, `fetchExperimentaisDiagnosticoComercialV2`. RPCs: nenhuma direta. Tabelas: `leads`, `alunos`, `dados_mensais`.
- **Professores (`TabProfessoresNew.tsx`):** **RPCs** `get_experimentais_professor_canonicos_v1`, `get_health_score_professor_v3_performance`. O resumo V3 alterna entre mês e ciclos `Jun-Ago`, `Set-Nov`, `Dez-Fev`, `Mar-Mai`; rankings ficam reservados ao fechamento oficial. As views V2 permanecem somente para indicadores operacionais ainda não migrados e rollback controlado.
- **Modal Permanência (`ModalPermanenciaDetalhe.tsx`):** **RPC** `get_historico_ltv`.

## Comercial (`/app/comercial`)
- **Componentes:** `Comercial/ComercialPage.tsx` (+ `ComercialConciliacaoExperimentais`, `PlanilhaComercial`, `PlanoAcaoComercial`, `TabProgramaMatriculador`, `AlertasComercial`, `FunnelPipelineNav`)
- **Hooks:** `useCompetenciaFiltro`, `useCheckLeadDuplicado`, `useCheckAlunoDuplicado`, `useMatriculadorPrograma`
- **RPCs:** `get_kpis_comercial_canonicos_v2`, `get_conciliacao_experimentais_v2`, `get_experimentais_emusys_operacional_v1`, `pode_gerar_relatorio_comercial_v1`, `buscar_anamnese_pendente`. A aplicação do espelho Emusys usa RPCs privadas: `aplicar_snapshot_experimentais_emusys_admitido_v1` publica a execução cercada do relatório e `aplicar_snapshot_experimentais_emusys_metadados_v1` publica a atualização recorrente somente fora de uma janela protegida. `admitir_refresh_snapshot_experimentais_v1`, `proteger_leitura_snapshot_experimentais_v1` e `finalizar_refresh_snapshot_experimentais_v1` governam o single-flight e a leitura; a conciliação vigente fica no núcleo privado `get_conciliacao_experimentais_snapshot_v1`. Essas RPCs de escrita e coordenação são executáveis somente por `service_role`, enquanto a fachada pública preserva a assinatura e a ACL de `get_conciliacao_experimentais_v2`.
- **Snapshot de experimentais:** `emusys_experimentais_raw` mantém o histórico recebido e marca somente uma linha vigente por `unidade + aula Emusys + participante`. `emusys_experimentais_snapshot_execucoes` registra intervalo, contagens e conclusão de cada lote completo; `emusys_experimentais_refresh_admissoes` serializa atualizações equivalentes por unidade, intervalo, origem e bucket de cinco minutos; `emusys_experimentais_snapshot_publicacoes_vigentes` aponta, sob o lock da unidade, qual execução e cobertura foram publicadas por último. Leituras operacionais e relatórios usam apenas `snapshot_ativo=true`; linhas inativas permanecem exclusivamente como trilha de auditoria. O `payload` versionado contém somente `schema_version`, data, horário, cancelamento, ID da aula e IDs externos do participante. O objeto extensível do Emusys e PII legada são descartados. Usuários authenticated podem ler apenas `id`, `aluno_nome`, `data_aula`, `horario_aula` e `situacao_operacional`, ainda sob RLS de unidade/versão ativa; payload e demais colunas ficam privados ao `service_role`.
- **Conciliação vigente:** os acessos raw do núcleo P24 filtram `snapshot_ativo=true` e vinculam somente por `emusys_lead_id`/`emusys_aluno_id` ou chaves relacionais legadas já materializadas; payload, nome e telefone não criam identidade. `presenca_emusys='ausente'` só é falta quando a situação normalizada é `faltou` (ou no fallback legado sem status), nunca quando `agendada` ou `cancelada`. Reagendamento compara `data + horário` e aceita qualquer estado posterior conhecido; a linha anterior só é ignorada quando não existe presença nem falta raw ativa. A fachada mantém a autorização P23, o cap comercial P21 e a correção de sobra pequena P22, acrescentando a fonte `snapshot_ativo_p24`.
- **Atualização sob demanda:** `sync-presenca-emusys` aceita o modo leve `experimentais` com `unidade_id`, `data_inicio` e `data_fim` explícitos (UUID conhecido e no máximo 45 dias). Somente o bearer interno pode executar `experimentais`, `agenda` ou `metadados`; usuários comuns ficam limitados a `presenca`, uma unidade exata e à RPC `pode_sincronizar_presenca_emusys_v1` (`alunos.ver` fora do perfil da própria unidade). Corpo, modo e alvo são validados antes de criar cliente administrativo ou carregar token Emusys. O modo experimental pagina o intervalo inteiro, aplica uma única fotografia pela RPC privada e somente depois reconcilia por IDs Emusys escopados pela unidade. Quando o relatório fornece a execução já admitida, o sync usa exatamente esse UUID e não cria uma segunda versão. O modo `metadados` continua atualizando `aulas_emusys`; sua publicação raw é adiada, sem reconciliação parcial, quando coincide com a janela de leitura de um relatório, e volta a ocorrer normalmente depois dela. Curso vem do de-para canônico da própria unidade e o horário é normalizado antes das chaves de negócio. A orquestração pura e injetável fica em `_shared/sync-experimentais-mode.ts`; a edge mantém apenas os adapters Emusys/Supabase. A resposta expõe apenas unidade, intervalo, execução e contagens; não inclui nomes, telefones, nascimento ou payload bruto.
- **Documento comercial unificado:** `_shared/relatorio-comercial.ts` é o contrato puro do texto diário consumido pelo gerador. Ele reúne as dez seções aprovadas — cabeçalho, resumo diário, mês/metas, funil, registros do dia, canais/cursos, agenda futura, alertas, lista detalhada e fontes/snapshot — sem consultar banco nem Emusys. Os dois tickets são calculados sobre a mesma coorte agrupada da lista detalhada, com parser monetário único, valores brutos até a média final e denominadores positivos independentes; a meta `ticket_medio` pertence somente às parcelas. A agenda converte data/hora pelo fuso IANA `America/Sao_Paulo`, considera apenas snapshot ativo, situação `agendada`, início estritamente futuro e até D+7, limita a dez itens e nunca admite evento do mesmo dia sem horário. Duplicata só é removida quando `emusysAulaId + participanteChave` coincidem; nome e curso não são identidade. Textos dinâmicos são normalizados antes de entrar na marcação WhatsApp e números não finitos viram zero. Pendências de conciliação acrescentam aviso à taxa e não bloqueiam sua publicação.
- **Orquestração do relatório diário:** `relatorio-admin-whatsapp` admite primeiro o refresh por `unidade + intervalo + origem + bucket de cinco minutos`. A primeira chamada recebe `atualizar`; chamadas equivalentes aguardam ou reutilizam a mesma execução completa, sem novo GET nem nova versão. Antes de qualquer leitura, atualização e reuso passam pelo mesmo lock do writer: a execução ainda vigente recebe lease de sessenta segundos; uma execução já substituída é promovida para novo refresh. Writers admitidos sobrepostos são ordenados no mesmo lock, de modo que prévia e cron não substituem uma leitura em curso; o lote em espera é reaplicado sem novo GET. Uma falha bloqueia novo acesso ao provedor até o lease vencer. Lease expirado é recuperável; se o snapshot já foi aplicado antes de uma interrupção do chamador, a admissão se autocorrige para `completo` e reutiliza o UUID. Prévia e cron usam origens separadas para que um preview recente não substitua a coleta programada. Depois desse gate, o relatório atualiza o snapshot Emusys da unidade, do primeiro dia da competência até D+7, e falha fechado se HTTP, JSON, status, unidade, intervalo ou execução não forem confirmados. Só então lê, em paralelo e com timeout inferior ao lease, KPIs, conciliação, operação Emusys, metas, agenda futura, lançamentos do dia e matrículas detalhadas nas fontes canônicas; joins por IDs externos permanecem escopados por `unidade_id`, inclusive sob `service_role`, e não há uso de `get_dados_comercial_ia`. Os limites diários de `created_at` são instantes UTC calculados a partir do início de cada data civil em `America/Sao_Paulo`, sem offset `-03` fixo e com suporte ao horário de verão histórico. A agenda raw seleciona exclusivamente o `snapshot_execucao_id` confirmado pelo preflight e repete a confirmação operacional após a leitura para detectar substituição concorrente. Prévia e cron chamam o mesmo gerador: a prévia exige JWT válido e `pode_gerar_relatorio_comercial_v1` para uma única unidade, enquanto o cron exige `service_role` e grava somente em `fila_relatorios_whatsapp`. A fila identifica `relatorio_admin` e `relatorio_comercial` em `tipo_relatorio`; sua unicidade por `tipo + unidade + JID + dia` permite os dois documentos no mesmo destino e deduplica cada tipo separadamente. A fila manual `fila_relatorios_sol_hermes` não participa desse fluxo.
- **Consumo na tela:** o gerador diário de `ComercialPage.tsx` exige uma unidade específica e chama somente `relatorio-admin-whatsapp` em `dry_run_comercial`, com `unidade` e `data_referencia`. A edge exige uma data de calendário estrita em `YYYY-MM-DD` e devolve `400` para ausência, timestamp, offset ou data impossível. Essa data civil governa o cabeçalho, o dia consultado e a janela do primeiro dia do mês até D+7; ela não injeta nem substitui o relógio. O instante real de geração do servidor, resolvido em `America/Sao_Paulo`, governa `referencia.hora`, o rodapé `Gerado em` e o corte estritamente futuro da agenda. A injeção de instante existe apenas na assinatura interna para testes determinísticos e não é aceita no payload. O cron não recebe data externa e deriva também a data civil do instante atual. A tela não chama o sync nem as três RPCs comerciais para montar esse documento; exibe exatamente o `texto` devolvido pela edge e o associa a uma origem imutável com tipo, unidade, período, datas e competência. Copiar e enfileirar só ficam disponíveis enquanto essa origem coincide com o contexto atual, e o enqueue usa a unidade armazenada com o texto. IDs independentes de geração e envio invalidam respostas atrasadas, inclusive após regeneração na mesma origem; sucesso/erro de envio são limpos em nova geração, troca de contexto, retorno ou fechamento. O gerador mensal também é servidor: usa `dry_run_mensal_comercial` e o snapshot fechado. Apenas semanal, matrículas e comparativos permanecem locais.
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
- **RPCs:** `get_kpis_alunos_canonicos`,
  `get_alunos_ativos_atuais_canonicos`, `recalcular_dados_mensais`,
  `get_tempo_permanencia`, `buscar_anamnese_pendente`,
  `buscar_anamneses_pendentes`, `vincular_anamnese_aluno`,
  `get_conciliacao_matriculas`, `execute_bi_query_lamusic` (auditoria IA),
  `get_timeline_pesquisas_aluno`/`registrar_resposta_pesquisa_manual` (aba
  Pesquisas — ver Sucesso do Aluno), `get_historico_aulas_aluno` (aba Aulas),
  `get_relatorio_pedagogico_aluno(p_aluno_id, p_data_inicio, p_data_fim)`
  (Histórico Pedagógico; período opcional).
- **Estado vivo:** `vw_alunos_estado_operacional_v131`. Somente `ativa` entra
  em ativos, pagantes, carteira, presença, Health Score e churn atual.
  `trancada` aparece separada em **Trancados agora**.
- **Edge functions:** `gerar-relatorio-pedagogico` (Gemini 3 Flash; gera o relatório pedagógico a partir das anotações e persiste em `relatorios_pedagogicos`). Auditoria IA usa `execute_bi_query_lamusic` via RPC.
- **Tabelas:** `relatorios_pedagogicos` (histórico de relatórios pedagógicos gerados por IA; RLS por unidade padrão `metas`).

## Sucesso do Aluno (`/app/sucesso-aluno`)
`SucessoCliente/SucessoClientePage.tsx`. Abas: **Caixa de Entrada** (`CaixaEntradaTab`, departamento `sucesso_aluno`) e **Acompanhamento** (`TabSucessoAluno` → tabela, jornada, pesquisa, presença, faltas, marcos, análise, **cartões**). Subaba **Cartões** = `CartoesContatoTab` (hook `useVcardsUnidade`, `VcardPreview`) → CRUD de `vcards_unidade` + envio de teste via edge `enviar-vcard` (UAZAPI `/send/contact`, caixa id 3).
- **Hooks:** `useFaltasPeriodo`, `useMarcosJornada`, `usePesquisaPrimeiraAula`, `useAnalisePesquisas`, `useAnaliseTurmas`
- **RPCs:** `calcular_health_score_alunos_batch`, `get_faltas_periodo`, `get_candidatos_pesquisa_primeira_aula`, `get_analise_pesquisas`, `get_respostas_pesquisa`, `get_timeline_pesquisas_aluno`, `registrar_resposta_pesquisa_manual`, `listar_evadidos_para_pesquisa`, `stats_pesquisa_evasao`, `listar_pesquisas_evasao_revisao`, `get_conversa_pesquisa_evasao`, `iniciar_revisao_pesquisa_evasao` e `concluir_revisao_pesquisa_evasao`
- **Edge functions:** `enviar-pesquisa-pos-primeira-aula`, `disparar-pesquisa-1a-aula-auto` (auto-disparo opt-in, cron 11h BRT `disparar-pesquisa-1a-aula-diario`, teto 15/dia), `notificar-primeira-aula-fabi` (aviso 8h), `enviar-pesquisa-evasao` (V2 publicada: JWT obrigatório, ações `previsualizar`/`confirmar`, `movimentacoes_admin` canônica, preview imutável de 10 min e claim service-only; produção usa o snapshot e, para menor, exige correspondência com `responsavel_telefone`, template e nome do responsável; nunca cai para o telefone do menor; `enviando` antigo vira `incerto` sem retry automático), `webhook-whatsapp-inbox` (recebe o retorno; encaminha `buttonOrListid` para a pesquisa pós-1ª aula antes da evasão, sem interromper a Caixa; o repositório contém motor append-only opt-in por pesquisa, que resolve por mensagem citada ou telefone+caixa e mantém linhas anteriores em `legado_v1`; sua migration e Edge ainda exigem rollout autorizado; diagnósticos de execução passam por logger tipado que não aceita payload, telefone, texto, mídia, transcrição, URL ou segredo), `processar-resposta-pesquisa` (captura, via webhook, com JWT obrigatório), `enviar-mensagem-lead` (feedback), `gerar-plano-aluno`, `gerar-relatorio-aluno`, `sync-presenca-emusys`, `marcos-jornada`, `enviar-boas-vindas-equipe` (carrossel)
- **Subaba Pós-1ª Aula** (`PesquisaPrimeiraAulaTab` + `usePesquisaPrimeiraAula`): lista **travada em "ontem"** (RPC `get_candidatos_pesquisa_primeira_aula` com `p_apenas_ontem=true`; MIN da 1ª aula real). Disparo manual em lote (1 clique) OU auto-disparo opt-in via cron (kill switch = toggle no cabeçalho da própria aba, `usePesquisaPrimeiraAula.toggleAutoPesquisa`, tabela `automacoes_config` slug `auto_pesquisa_1a_aula`, começa OFF). Textos editáveis (aluno/responsável) ficam em **Mensagens Automáticas** (`AutomacoesTab`).
- **Subaba Respostas** (`RespostasPesquisaTab`) atende **as duas pesquisas** por um seletor (Pós-1ª aula | Evasão), com **layouts próprios** — ver abaixo.
- **Análise da pesquisa de evasão (03\08\2026)** — `RespostasEvasaoTab` + `useRespostasEvasao` + `src/lib/pesquisaEvasao.ts`; RPCs `get_respostas_evasao` (SECURITY INVOKER, exclui `modo_teste`) e `classificar_resposta_evasao` (SECURITY DEFINER, única escrita, valida contra lista fechada de 7 temas).
  - ⚠️ **Não copiar o painel da pós-1ª aula.** Aquela devolve nota 1–5 e rende média/distribuição/evolução; a de evasão devolve **texto livre ou áudio** e não tem número para agregar. A análise é de **tema**, e o KPI central é **motivo registrado × motivo declarado** — importa porque 3 dos 16 `motivos_saida` penalizam o professor no score, então motivo errado = score errado.
  - A tradução `motivos_saida` → tema é **por nome, não por `categoria`**: "Saúde" e "Problema de Saúde" têm `categoria` NULL, e "Insatisfação"/"Desânimo" caem em `'outro'` junto com "Problemas familiares". ⚠️ **`professor_metodo` não existe no catálogo** — fica escondido em `'outro'`; é a lacuna que a pesquisa enxerga e o registro não.
  - **Limiar honesto:** abaixo de 5 respostas classificadas o painel de divergência **não é renderizado**; de 5 a 29 vem com aviso de leitura indicativa (`nivelDeConfianca`). O denominador do % é `comparáveis`, não `total` — dividir pelo total trataria "ainda não classificado" como "não confirmou".
  - A RPC cai para `resposta_texto` bruto quando não há `texto_consolidado`: a fila de revisão **nunca foi concluída** (0 `revisada` em 03\08\2026), então sem o fallback a tela nasceria vazia.
  - ⚠️ **Privacidade, não resolvido:** a policy `pesquisa_evasao_leitura_interna` libera **qualquer usuário interno ativo** (inclusive perfil `professor`) a ler todas as respostas de todas as unidades — texto livre de quem acabou de sair, que pode citar o próprio professor que está lendo. Policy pré-existente; precisa de decisão.
- **Views:** `vw_aluno_sucesso_lista` (health score, fase jornada, presença, pagamento), `vw_renovacoes_proximas`
- **Tabelas:** `automacoes_config` (toggles de automação, ex. `auto_pesquisa_1a_aula`); `pesquisa_evasao`, `pesquisa_evasao_previews`, `pesquisa_evasao_templates` e `pesquisa_evasao_assinaturas` (fundação V2 e snapshots privados da pesquisa de evasão); `pesquisa_evasao_mensagens`, `pesquisa_evasao_transcricoes` e `pesquisa_evasao_analises` guardam a conversa append-only. No motor `multipartes_v2`, cada silêncio de 15 minutos delimita uma rodada/versão; uma continuação após revisão cria versão nova, preserva a anterior e religa o caso na fila com `conteudo_novo_desde_revisao`. `movimentacoes_admin.telefone_snapshot_origem` distingue snapshot real de contato recuperado por backfill. A fila V2 bloqueia menor sem responsável apto ou com snapshot divergente antes do envio.
- **Lia — Fase A, fundação aplicada e transporte local ainda não publicado:** a
  migration `20260803090000_lia_alertas_privados_fase_a.sql`, registrada
  remotamente como `20260803124754`, mantém a produção bloqueada e cria outbox
  privada para resposta nova, rodada pós-revisão e opt-out, destinada somente a
  quem enviou a pesquisa. A adaptação `20260803210000` e a Edge
  `processar-alertas-lia` estão implementadas/testadas localmente para enviar
  exclusivamente pela caixa 3, mas não foram aplicadas ou publicadas. Não há
  worker, bridge novo, cron de consumo nem migration de ativação. Dois envios
  produtivos de Jéssica em 03/08/2026 já estão no motor V2; o primeiro retorno
  gerou uma entrega retida em `aguardando_liberacao`, sem envio. Até o piloto e
  a ativação, a equipe acompanha as respostas pela tela. Este pacote não altera
  `webhook-whatsapp-inbox`. O alerta abre a tela geral; deep link para o caso
  exato permanece melhoria posterior.

## Professores (`/app/professores`)
`Professores/ProfessoresPage.tsx`; abas Cadastro, Performance, Carteira, Agenda, 360°, Checklists, Configurações.
- **Hooks:** `useCompetenciaFiltro`, `useHealthScoreProfessorV3`, `useHealthScoreProfessorV3Performance`, `useHealthScoreProfessorV3Config`, `useProfessor360`/`useConfig360`/`useOcorrenciasComLog`, `useProfessorDependencies`, `useProfessoresPerformance`.
- **RPCs V3:** `get_health_score_professor_v3_snapshot_modal`, `get_health_score_professor_v3_performance`, `get_health_score_professor_v3_config_ui`, `criar_health_score_professor_v3_config_rascunho`, `salvar_health_score_professor_v3_config_rascunho`, `simular_health_score_professor_v3_config`, `ativar_health_score_professor_v3_config`, `get_health_score_professor_v3_metricas_segmentadas_v1`, `get_health_score_professor_v3_metricas_segmentadas_agregadas_v1`, `get_health_score_professor_v3_totais_carteira_canonica_v1` e `get_professor_curso_modalidade_excecoes_v2`. A fila V2 usa catálogo, de-para, identidade formal e jornada por unidade; a reconciliação V1 é apenas diagnóstico histórico e não alimenta a interface. Todas as leituras preservam `null/sem_base`, fonte, amostra, cobertura e versão da regra.
- **RPCs operacionais/V2:** `get_kpis_professor_periodo`, `get_carteira_professores`, `get_presenca_por_aluno_professor`, `get_dados_relatorio_coordenacao`, `reverter_ocorrencia`, `restaurar_ocorrencia`, `editar_ocorrencia`, `registrar_log_ocorrencia`. A V2 fica visível somente no histórico de configuração/rollback durante a observação.
- **Aba Carteira (31/07/2026):** `get_carteira_professores` devolve `alunos_ticket`/`mrr_ticket` além de `mrr_total`. O ticket vem **pronto da RPC** (critério `tipos_matricula.entra_ticket_medio`) — `TabCarteiraProfessores.tsx` não recalcula mais dividindo MRR pelo headcount. Ver `docs/METRICAS.md` → "Ticket médio da carteira do professor".
- **Edge functions:** `gemini-insights-professor`, `gemini-insights-equipe`, `gemini-relatorio-coordenacao`, `gemini-ranking-professores`, `gemini-relatorio-professor-individual`, `professor-360-whatsapp`, `relatorio-coordenacao-whatsapp`. Os cinco consumidores Gemini de desempenho recebem snapshot V3 estruturado; não recalculam score nem fabricam base. Ranking falha fechado enquanto o ciclo não estiver oficial.
- **Views/fontes V3:** identidade `vw_aluno_identidade_unidade_canonica`; jornada `aluno_jornada_matricula_disciplina`; períodos `vw_professor_periodos_efetivos_v3_sombra`; presença `vw_aluno_presenca_semantica_v1`; roster `aula_alunos_emusys`; experimentais `emusys_experimentais_raw`; saídas `movimentacoes_admin` + `motivos_saida`; atribuição formal `professor_unidade_curso_modalidade`; metas por segmento `health_score_professor_v3_config_metas_curso_modalidade`; evidência por snapshot `health_score_professor_v3_snapshot_metrica_segmentos`; snapshots e configurações `health_score_professor_v3_*`.
- **Metas segmentadas:** Média/Turma e Número de alunos são resolvidos por `unidade + curso + modalidade`. A matriz não altera `cursos`, `professores` ou o cadastro legado. O catálogo Emusys materializa automaticamente os vínculos; a interface mostra somente exceções reais que permaneceram após o sync. Curso atribuído com carteira vazia permanece visível e não pontuável; regra ausente bloqueia o rascunho em vez de usar meta global silenciosa.
- **Autoridade dos vínculos:** o catálogo formal governado no LA Report (`professor_unidade_curso_modalidade`) é a fonte de verdade para atribuição professor/curso/unidade. A grade atual do Emusys é usada para reconciliar a jornada operacional e produzir evidência; não recria o catálogo formal nem transforma divergência histórica em pendência atual.
- **Nota versus diagnóstico (02/08/2026):** retenção atribuível, permanência, conversão experimental com amostra mínima, média/turma e presença formam a nota. Carteira/número de alunos e capacidade física permanecem diagnósticos e sinais operacionais com peso zero. Pilares não aplicáveis saem do denominador e os pesos válidos são normalizados para 100% por professor.
- **Cobertura da equipe:** `get_health_score_professor_v3_performance` parte do roster de professores ativos e anexa a evidência V3. Professor sem score continua visível com motivo estruturado; score parcial não produz ranking ou premiação.
- **Laboratório de configuração:** a tela oferece edição, desfazer, restauração, simulação e aplicação sem expor o fluxo interno de rascunhos. O banco mantém versões append-only, autorização `professores.editar` e imutabilidade de configurações vigentes e snapshots fechados.
- **Relatório mensal da Coordenação:** `ModalRelatorioCoordenacao.tsx` envia somente unidade, ano e mês para `gemini-relatorio-coordenacao`. A Edge valida o JWT, consulta `get_relatorio_coordenacao_canonico_v2` e renderiza deterministicamente todos os números. A IA só redige narrativa sobre o contrato pronto; não recebe financeiro, não recalcula métricas e não remove professores.
- **Mapa público da Coordenação:** o `mapa_sinais` bruto permanece no contrato V2 para auditoria. A Edge produz uma projeção pública única e determinística, compartilhada pelo renderizador e pela IA: no máximo cinco prioridades, três oportunidades e um resumo agregado de capacidade estimada em Qualidade dos dados. Pendência de turma/sala não altera Health Score nem gera prioridade pedagógica.
- **Fronteiras pedagógicas:** o relatório mensal é manual pelo botão, inclui todos os professores ativos, não contém financeiro nem termos internos e não usa paginação artificial. Fábio e LA Teacher permanecem fora desta entrega e, quando integrados, deverão consumir apenas recortes escopados do mesmo contrato, sem score bruto ou ranking público.
- **Resolução de curso da jornada:** `fn_resolver_jornada_curso_grade_atual_v1` resolve o curso atual por `unidade + emusys_matricula_disciplina_id` usando somente aulas normais recorrentes e não reagendadas; uma aula movida preserva sua evidência histórica, mas nunca redefine a disciplina atual. O trigger de `aluno_jornada_matricula_disciplina` impede que payload antigo de `/matriculas` sobrescreva a grade recorrente atual e resolve o curso de origem pelo de-para oficial escopado por unidade. O valor bruto fica nas colunas `*_origem`, e cada correção é auditada em `jornada_curso_resolucao_log`. O backfill é retomável por `backfill_jornada_curso_grade_atual_v1`.
- **Configuração ativa:** a versão V3 número 3 foi ativada em 21/07/2026, com vigência a partir de 01/09/2026, 63 metas segmentadas configuradas e 7 combinações realmente não ofertadas. A versão 2 permanece vigente até 31/08/2026. Ativar a configuração não fecha snapshots, não reescreve julho e não libera ranking/premiação; cada consumidor ainda obedece ao estado de publicação do ciclo.
- **Publicação:** o score parcial é visível quando cobertura e fidelização permitem, porém sem ranking/premiação. O oficial só nasce após fechamento do ciclo. Campo Grande mantém Presença em auditoria e fora do score; Barra/Recreio usam a política confiável versionada.

## Agenda (`/app/agenda`)
Grade do dia por unidade, calendário de aulas do Emusys. `Agenda/AgendaPage.tsx` (+ `AgendaTimeline`, `AgendaCard`, `AgendaDrawer`).
- **Hook:** `useAgendaDia`
- **RPC:** `get_agenda_dia` — **agrupa** porque `aulas_emusys` guarda uma linha por aluno em turmas e o Emusys duplica cada slot em `tipo=turma` (`matricula_disciplina_id=0`, o "container") + `tipo=individual` (uma por contrato de aluno); a RPC funde as linhas num único card por aula/horário.
- **Tabelas:** `aulas_emusys` (grade — é aqui que o slot vem multiplicado por aluno/tipo), `aula_alunos_emusys` (vínculo aula↔aluno, tabela canônica — 18 RPCs consumem, ver "Módulo de Agenda" no `CLAUDE.md`), `aluno_presenca` (presença já registrada).
- **RLS (02\08\2026):** `get_agenda_dia` é **SECURITY INVOKER**, então quem lê precisa de acesso próprio a `aula_alunos_emusys`. A tabela só tinha policy `TO service_role` e nenhum `GRANT SELECT` para `authenticated` — a tela quebrava com `permission denied` para todo mundo. Corrigido com `GRANT SELECT` **mais** a policy `aula_alunos_emusys_leitura_escopada` (mesma forma de `aluno_presenca`: `is_admin() OR unidade_id IN (get_user_unidade_ids()) OR professor da aula`). ⚠️ `GRANT` sem policy não resolve: leria zero linhas e toda aula viraria "Sem aluno vinculado" — falha silenciosa. Validar sempre com `set local role authenticated`, nunca como `service_role`.
- **Edge functions:** nenhuma direta na tela; alimentada por `sync-grade-futura-emusys` (grade futura) e `sync-presenca-emusys` (presença + reconciliação de vínculos), ambas via cron já existente (`sync-metadados-aulas-15m-u0/u1/u2`, 15 min).
- **Performance (02\08\2026):** a RPC levava **1175 ms** como `authenticated` contra ~40 ms como `service_role`, porque as policies de RLS chamavam `is_admin()`/`auth.role()`/`fn_professor_do_usuario()` **fora de `(select …)`**, uma vez por linha. Envolvidas em `(select …)` (migration `20260802145546`), caiu para **95 ms** com as mesmas 186 aulas. Ver a regra em "Regras Importantes" do `CLAUDE.md` — o mesmo padrão persiste em ~90 policies de outros módulos.
- **~~Janela 19/07–01/08/2026 incompleta~~ — diagnóstico ERRADO, corrigido em 02\08\2026.** Era **recesso escolar**, não perda de dados: 89% dos contratos vão da aula N direto para a N+1 sem salto, não há FK órfã em nenhuma tabela, as 3 unidades zeraram idêntico (incompatível com sync, que é por unidade) e a semana de reabertura tem o dobro de experimentais. O banner de alerta foi removido. Detalhes no `CLAUDE.md`, seção "Módulo de Agenda".
- **Filtros:** busca livre (aluno/professor/turma/sala, normalizada sem acento) e agrupamento Professores|Salas ficam **na barra**; professor/curso/turma/categoria/modalidade e "ocultar canceladas" ficam no **popover "Filtros"**, com badge de quantos estão ligados (`contarFiltrosAvancados` — a busca não entra na conta porque está visível). Tudo no cliente, em `lib/agenda.ts` (`filtrarAulas`, `opcoesDoCampo`), sem ida ao banco. Período pelo `CompetenciaFilter` compartilhado (componente intocado), sincronizado nos dois sentidos com o dia exibido.
- **Linguagem visual (03\08\2026):** cor é vocabulário de **exceção**, não de estado comum. Aula normal fica neutra; a borda esquerda colorida marca acontecendo agora (emerald) / experimental (violet) / reagendada (amber) / cancelada (rose) / sem aluno (tracejado). O estado é **um único valor** (`estadoDaAula`), não condições independentes — `cn()` usa twMerge e a última classe conflitante vence, o que já produziu bug real aqui. As marcas `E`/`✕`/`R`/`!` foram substituídas por pontos (âmbar = risco ≥ 40%, rose = inadimplente), estrela (aluno novo) e contador de turma, com **legenda permanente** no rodapé da grade — fora do bloco rolável, para as gridlines não a cruzarem.
- **Leitura do dia:** véu sobre as horas já vencidas + hora corrente destacada no cabeçalho, além da régua de segundos. O rótulo do trilho carrega iniciais (`iniciaisDoNome`, primeiro + último nome), curso predominante (`cursoPredominante`, só ao agrupar por professor), contagem de aulas vivas e barra de ocupação (`ocupacaoPct` — **união** de intervalos, não soma, senão duas aulas sobrepostas dariam "120%"). Sobreposição ganha etiqueta âmbar no rótulo (`resumoSobreposicao`): o empilhamento em faixas já existia mas só deixava o trilho mais alto, o que ninguém nota varrendo a grade.
- **Painel de detalhe sob demanda:** o `AgendaDrawer` só é montado com aula selecionada (antes ocupava 296 px permanentes para dizer "selecione uma aula"). Tem botão de fechar e sai no `Esc`.
- **Fase 2 (pendente):** cancelar/reagendar aula (API já suporta `POST /aulas/cancelar` e `PATCH /aulas/reagendar`) e visão Semana.

## Retenção (`/app/retencao`)
Planilha operacional (`Retencao/PlanilhaRetencao.tsx`) + dashboard analítico (`components/Retencao/RetencaoDashboard.tsx` e seções).
- **Hooks:** `useEvasoesData`, `useProfessoresPerformance`, `useMotivosScoreProfessor`
- **RPCs:** nenhuma (queries diretas a `evasoes` + view `professores_performance`)
- **Edge functions:** nenhuma

## Administrativo (`/app/administrativo`)
`Administrativo/AdministrativoPage.tsx`; abas Lançamentos (renovações, não-renovação, avisos, cancelamentos, trancamentos, alunos novos), **Contratos** (2ª posição), Fideliza, Lojinha, Farmer, Caixa Financeiro, Caixa de Entrada.
- **Contratos (`TabContratosVencendo.tsx`):** hook `useContratosVencendo`. Replica a aba "Matrículas Vencendo" do Emusys. **RPC:** nenhuma — leitura direta da view. **View:** `vw_contratos_vencendo` (join `vw_jornada_aluno_atual` + `alunos` por `unidade_id, emusys_matricula_id`).
- **Hooks (demais abas):** `useCompetenciaFiltro`, `useFidelizaPrograma`, `fetchKPIsAlunosCanonicos`, PainelFarmer (`useRotinas`, `useChecklists`, `useChecklistDetail`, `useDashboardStats`, `useAlertas`, `useFeedbackPendente`, `useSucessoAlunoAlertas`), CaixaEntrada (`useAdminConversas`, `useAdminMensagens`)
- **Ciclo atual:** `get_kpis_alunos_admin_operacional` separa **Ativos agora**
  de **Trancados agora**. A aba de movimentações mantém **Trancamentos no
  período** como evento histórico distinto.
- **RPCs:** `get_resumo_renovacoes_proximas`, `toggle_relatorio_cron`, `get_relatorio_gerencial_canonico_v1`, `get_dados_retencao_ia`, `vincular_alunos_checklist`, `get_historico_rotinas`, `get_checklist_detail`, `marcar_checklist_item`, `get_checklists_farmer`, `criar_checklist_from_template`, `get_rotinas_do_dia`, `get_progresso_rotinas_hoje`, `marcar_rotina_concluida`
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

## Health Score Professor V3 — mês vivo

Na aba Performance de `/app/professores`, a competência mensal atual consome `get_health_score_professor_v3_performance`. A RPC escolhe snapshot oficial quando existir; caso contrário, entrega uma projeção viva calculada no servidor. O modal individual consome o mesmo contrato por `get_health_score_professor_v3_snapshot_modal`.

A projeção reutiliza `get_health_score_professor_v3_metricas_periodo`, a agregação segmentada canônica e o motor de nota diagnóstica. Referências anteriores são apenas visuais, não pontuam e carregam a competência de origem. Falha na consulta auxiliar de cursos não derruba a lista principal de professores. Histórico e snapshots fechados continuam append-only e não são recalculados pela leitura.

---

## Apêndice — Edge functions por categoria (uso no frontend)

- **IA (Gemini/OpenAI):** `gemini-insights`, `gemini-insights-comercial`, `gemini-insights-retencao`, `gemini-insights-turma`, `gemini-relatorio-gerencial`, `gemini-relatorio-coordenacao`, `gemini-ranking-professores`, `gemini-relatorio-professor-individual`, `gemini-fabio-chat`, `gerar-plano-aluno`, `gerar-relatorio-aluno`, `gerar-prompt-agente`
- **WhatsApp UAZAPI:** `enviar-mensagem-lead`, `enviar-mensagem-admin`, `whatsapp-status`, `whatsapp-connect`, `listar-instancias-uazapi`, `configurar-webhook-caixa`, `buscar-foto-perfil`, `deletar-mensagem-admin`, `editar-mensagem-admin`, `relatorio-admin-whatsapp`, `professor-360-whatsapp`, `relatorio-coordenacao-whatsapp`, `projeto-alertas-whatsapp`
- **WhatsApp Meta (Campanhas):** `enviar-campanha`, `controle-campanha`, `enviar-mensagem-meta`, `gerenciar-templates`, `sincronizar-templates`
- **Pesquisas:** `enviar-pesquisa-pos-primeira-aula`, `enviar-pesquisa-evasao`, `processar-resposta-pesquisa`
- **Emusys/dados:** `sync-presenca-emusys`, `marcos-jornada`, `auditor-divergencias-emusys`, `sync-feriados`. O contrato puro `_shared/experimental-snapshot.ts` pagina `/aulas` até o fim e normaliza o snapshot de experimentais por `unidade + aula Emusys + participante externo + execução`, sem conciliar por nome/telefone. A aplicação no banco é uma única transação: atualiza/insere vigentes, inativa ausentes do mesmo intervalo e só então registra a execução como completa. No modo `metadados`, a mesma lista de aulas obtida uma vez alimenta tanto o upsert de `aulas_emusys` quanto o snapshot; falha de qualquer unidade encerra a chamada sem resposta parcial de sucesso.
- **Admin/usuários:** `admin-create-user`, `admin-update-email`, `admin-update-password`, `validar-token-feedback`

> Lista de edge functions **disparada pelo frontend**. Edges de webhook/cron (ex: `processar-matricula-emusys`, `sync-matriculas-emusys`, `enviar-boas-vindas-matricula`, `meta-webhook-campanhas`) não aparecem aqui — ver `.claude/memory/integracao-infra.md`.
