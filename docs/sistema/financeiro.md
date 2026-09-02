# Mapa do sistema — financeiro

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/financeiro.md`](../banco/detalhe/financeiro.md)

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

O contrato de integridade separa `metas.operacionais` (fonte `metas_kpi`),
`metas.fideliza` e `metas.matriculador`, publica cobertura de curso de interesse
(`297/296/1/120/176`) e reapresenta as listas já existentes de leads por canal e
matrículas por curso. Comparativos só são habilitados por fechamentos
equivalentes e fingerprint compatível. No ciclo aberto, o bloco de professores
é `destaques_mensais_parciais` sem ordinalidade; `rankings.oficiais` só recebe
snapshots oficiais, fechados e comparáveis.

O sync de matrículas captura `mat.aluno.lead_id` no campo
`alunos.emusys_lead_id`, sempre escopado pela unidade. O sync de presença usa o
ID da aula como chave primária de experimental e não remove aula, roster ou
presença histórica quando a fotografia atual do Emusys não a contém.

Cobertura histórica: snapshot completo só existe de **junho/2026 em diante**. Antes disso
há apenas `dados_mensais` (~12 campos).

## Administrativo (`/app/administrativo`)
`Administrativo/AdministrativoPage.tsx`; abas Lançamentos (renovações, não-renovação, avisos, cancelamentos, trancamentos, alunos novos), **Contratos** (2ª posição), Fideliza, Lojinha, Farmer, Caixa Financeiro, Caixa de Entrada.
- **Contratos (`TabContratosVencendo.tsx`):** hook `useContratosVencendo`. Replica a aba "Matrículas Vencendo" do Emusys. **RPC:** nenhuma — leitura direta da view. **View:** `vw_contratos_vencendo` (join `vw_jornada_aluno_atual` + `alunos` por `unidade_id, emusys_matricula_id`).
- **Hooks (demais abas):** `useCompetenciaFiltro`, `useFidelizaPrograma`, `fetchKPIsAlunosCanonicos`, PainelFarmer (`useRotinas`, `useChecklists`, `useChecklistDetail`, `useDashboardStats`, `useAlertas`, `useFeedbackPendente`, `useSucessoAlunoAlertas`), CaixaEntrada (`useAdminConversas`, `useAdminMensagens`)
- **Inadimplência do Farmer (16/08/2026):** `useAlertas` não consulta mais `vw_farmer_inadimplentes`; chama `get_inadimplencia_canonica`, cruza por `(unidade_id, emusys_matricula_id)` e agrega faturas por um único vínculo ativo. Somente `status='ok'` habilita o botão manual de cobrança. `stale`, `incomplete` e erro exibem bloqueio explícito; nenhuma automação ou envio nasce desse hook.
- **Ciclo atual:** `get_kpis_alunos_admin_operacional` separa **Ativos agora**
  de **Trancados agora**. A aba de movimentações mantém **Trancamentos no
  período** como evento histórico distinto.
- **RPCs:** `get_inadimplencia_canonica`, `get_financeiro_faturas_emusys`, `get_resumo_renovacoes_proximas`, `toggle_relatorio_cron`, `get_relatorio_gerencial_canonico_v1`, `get_dados_retencao_ia`, `vincular_alunos_checklist`, `get_historico_rotinas`, `get_checklist_detail`, `marcar_checklist_item`, `get_checklists_farmer`, `criar_checklist_from_template`, `get_rotinas_do_dia`, `get_progresso_rotinas_hoje`, `marcar_rotina_concluida`
- **Edge functions:** `gemini-relatorio-gerencial`, `relatorio-admin-whatsapp`, `gemini-insights-retencao`, `enviar-pesquisa-pos-primeira-aula`, `buscar-foto-perfil`, `deletar-mensagem-admin`, `editar-mensagem-admin`
