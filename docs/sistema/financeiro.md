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
- **Refresh sob demanda:** uma competência com snapshot live completo e `stale_after` vigente responde 200 com o run existente. Mês fechado específico não expande `include_backlog`; job já ativo responde 202 com o mesmo UUID da fila.
- **Hash:** usa apenas unidade UUID, ID Emusys, competência, dados financeiros e estado/motivo de ausência; IDs de run/item e timestamps operacionais ficam fora.
- **Cron:** competências atual e anterior, sequenciais, com segredo lido do Vault.
>
> **Novo pipeline 14/09/2026 — espelho do fluxo de caixa Emusys (beta):** 4 endpoints
> (`/financeiro/lancamentos` + catálogos contas/plano de contas/formas de pagamento).
> Espelho imutável em `financeiro_emusys_lancamentos`/`_contas`/`_plano_contas`/
> `_formas_pagamento` (tracking por item: primeira/última vez visto, hash, alterado_em,
> sumiu_em — nunca apaga), controle diário em `financeiro_emusys_varredura_dias/_resumo`
> (janela = mês corrente + 2 anteriores; dia em erro nunca vale como vazio).
> Entrada única: edge `sync-financeiro-emusys` (cron `sync-financeiro-emusys-*`).
> Saída pro Super Folha: edge `export-financeiro-lancamentos` (segredo
> `x-super-folha-sync-secret`, mesmo padrão do contas-receber-sync).
>
> Contrato completo de consumo p/ os agentes do Super Folha:
> [`../handoffs/2026-09-14-espelho-financeiro-emusys-superfolha.md`](../handoffs/2026-09-14-espelho-financeiro-emusys-superfolha.md).
>
> Última atualização: 2026-09-14.

### Buscar as faturas de um aluno no Emusys na hora (caixa, desde 29/09/2026, LAPE-56)

No lançamento manual do caixa, depois de escolher uma fatura do aluno, o botão **"Não achou a parcela? Buscar as faturas deste aluno no Emusys agora"** traz todas as faturas daquela pessoa direto do Emusys e grava no espelho.

- **Por que existe:** meses a partir do +2 só são sincronizados uma vez por dia. Uma fatura criada hoje (matrícula nova, crédito, adiantamento) não aparecia para o caixa até o dia seguinte. Parcela não se lança sem fatura, porque sem fatura o dinheiro contaria como receita nova e depois de novo pelo sync.
- **O que ele NÃO faz:** não abre rodada do sync e não mexe no que os relatórios canônicos leem (eles leem as rodadas). A fatura trazida aparece no caixa na hora e nos relatórios na próxima rodada daquele mês.
- **Retorno para a tela:** quantas faturas novas vieram, "nada novo", Emusys limitando (`429`), Emusys sem resposta, aluno sem id do Emusys, sem permissão ou falha ao gravar. Toda falha diz que nada foi alterado.
- **Rastro:** `automacao_log`, `evento = 'faturas_aluno_sob_demanda'`.
- **Limitação:** a tela identifica o aluno pela fatura escolhida. Aluno sem nenhuma fatura no Report ainda não tem o botão.

### Caixa no celular (Administrativo › Caixa, desde 06/10/2026, LAPE-32)

No celular, a aba Caixa mostra o saldo do cofre em destaque e os lançamentos como um extrato. Lançar, editar, fechar e a mensagem do WhatsApp abrem em folhas com os **mesmos** componentes do computador.

- **O número grande:** "No cofre agora" aparece só no caixa de hoje que está aberto. Num dia fechado, mostra o valor conferido no fechamento e, se houver, a diferença para o previsto. A regra está em `destaqueDoCofre` (`src/lib/caixaMobile.ts`).
- **Excluir:** pede um segundo toque. No computador continua com um clique só, como sempre foi.
- **Histórico:** lista própria, com a mesma fonte do computador (`useCaixaHistorico`). Tocar no dia abre aquele dia. Os lançamentos de um dia antigo aparecem depois de abri-lo, e não expandindo a linha.
- **Nada novo no banco:** o celular chama os mesmos handlers da `CaixaFinanceiroTab`.

### Lote de cheques para depósito → caixa da Sol (desde 26/09/2026)

A unidade posta no grupo do financeiro o PDF do lote ("2 CH - 20SETEMBRO2026 - C.GRANDE"). A Sol lê cada cheque, acha a parcela e lança o cheque no **caixa da Sol do dia** (forma `cheque`), pelo card e "pode" de sempre. Decisão do Alf (26/09): o Super Folha já puxa o caixa da Sol (`export-caixa-movimentacoes`); a Sol **não** chama o Super Folha.

- **Runtime:** `vps/la-hq/sol/runtime/caixa-cheques.cjs` (desvio no início do `handle` do caixa, antes de agente e comprovante) + `cheques-lote-cli.cjs` para ler um lote fora do grupo (só leitura e decisão). Modo em `caixa-ingestao/cheques.json` (`off` | `sombra` | `grupo`, sem reinício).
- **Leitura:** visão (`gemini-3.8-flash` pelo OpenCode Zen, API `generateContent`). O PDF é escaneado, então `pdftotext` não serve. A leitura só vale se for **provada por código**: os 3 dígitos verificadores da CMC-7, CMC-7 batendo com banco/agência/número impressos e valor numérico batendo com o extenso. Leitura não provada vira ❓ e **não entra no caixa**.
- **Parcela:** RPC `sol_cheque_resolver_fatura_v1` (emitente → pessoa → fatura). CPF/CNPJ vira HMAC em `sol_cheque_documento_hash_v1` (só `service_role`, não grava) e só o hash segue.
- **Decisão por cheque, com a fatura real (`emusys_faturas`) e os vínculos do caixa (`vw_caixa_movimentacao_fatura_links`):** ✅ vai para o caixa (paga em cheque, ou em aberto, com o valor batendo) · ⚠️ retirar do malote (paga por outra forma, ou cancelada) · ❓ não entra (fatura já no caixa, valor diverge, emitente desconhecido/empate, leitura não provada). Dois cheques na mesma parcela: nenhum entra.
- **Lançamento:** 2+ ✅ = um card de lote (`abrirFluxoMultiAluno` com os itens já resolvidos → `sol_caixa_lancar_recebimento_lote_v1`); 1 ✅ = lançamento simples (`sol_caixa_lancar_recebimento`). As RPCs de lote exigem 2 itens, por isso a bifurcação. O número do cheque vai na descrição ("· cheque Santander nº 000212") pelo campo `complemento_descricao`, que a RPC do lote anexa (`20260927000000`).
- **No grupo:** UMA mensagem organizada, que é o próprio card (preview V3): cabeçalho do lote, placar, seções ✅ VAI PARA O CAIXA / ⚠️ RETIRAR DO MALOTE / ❓ PRECISA DE VOCÊ e um bloco por cheque (banco e nº, emitente, aluno, resp. financeiro, parcela). "pode" citando ela lança os ✅; "3 é da Fulana" citando ela resolve um ❓ e abre o card daquele cheque.
- **Escala:** lotes reais de 10-15 cheques. Até 20 páginas, 3 páginas lidas em paralelo; o teto de 12 alunos do lote de Pix não vale para cheques (`tetoItens: 60` — ele protege o resolvedor de Pix, que o lote de cheques não usa); 15 cheques ≈ 3,6 mil caracteres.
- **Handoff completo:** [`../handoffs/2026-09-27-sol-caixa-incidentes-e-cheques.md`](../handoffs/2026-09-27-sol-caixa-incidentes-e-cheques.md).
- **Contrato original (Super Folha):** `Docs/handoffs/2026-09-26-sol-cheques-lote-deposito.md` no repositório do Super Folha — o trecho de `conferir/registrar` direto foi substituído pela decisão do Alf acima. Teste: `tests/sol-runtime/cheques-lote-e2e.cjs` (dados inventados).

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
- **Automação parcial (31/07/2026, SUPERADA):** `fechar_competencia_mensal_automatico()` +
  cron `fechamento-mensal-automatico` (jobid 83). Ela só **capturava 7 domínios** como
  `aprovado` — nunca fechou nada, e não incluía os dois documentos mensais. Junho foi
  gravado à mão em 30/06 23:05 e julho em 31/07 21:12.
- **Automação completa (02/09/2026, LAPE-14):** cron **`fechamento-mensal-dia1`**
  (jobid 189, `0 1 1 * *` = 22h BRT do último dia do mês desde 01/10/2026 — o dia 1º recebe matrícula e mudança de status que a equipe lê como do mês passado; no último dia fecha o mês corrente, rerun manual no dia 1º fecha o anterior) → **`fechar_competencia_mensal_dia1_v1()`**, que
  por unidade, em bloco protegido: valida a fonte financeira →
  **`garantir_bloco_financeiro_gerencial_v1`** → `capturar_relatorios_mensais_canonicos_v1`
  → **`fechar_competencia_mensal_canonica_v2`** (fecha **uma** unidade). Placar em
  **`fechamento_mensal_execucoes`**; vigia `verifica-fechamento-mensal.py` na la-hq
  (`0 14 1 * *` = 11h BRT) alarma no tópico Logs via `cron-alerta.py`.
  O **jobid 83 foi desativado** (não deletado): ele fotografava o mês com 2h por correr,
  e o orquestrador já o chama como passo 0.

### ⚠️ Armadilhas confirmadas em produção

1. **O cron 83 era `0 1 1 * *` e isso estava CERTO** — pg_cron roda em UTC; dia 1 às
   01:00 UTC = último dia do mês às 22:00 BRT. Validado em 14 meses seguidos + fev/2028 e
   fev/2032. **Desde 02/09/2026 ele está desativado** e a guarda de
   `fechar_competencia_mensal_automatico()` passou a exigir o **dia 1º** (competência = mês
   anterior): fechar às 22h deixava 2 horas do mês de fora e rodava antes dos syncs
   noturnos do Emusys. Não reativar o 83 sem antes reverter a guarda.
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
   todos os snapshots aprovados para `fechado`. Ela é **tudo-ou-nada**: em ago/2026 um
   único aluno de Campo Grande deixou Barra e Recreio sem relatório. Para fechar **uma**
   unidade existe a **`_v2`** (02/09/2026), que filtra `escopo='unidade'` no UPDATE —
   sem esse filtro, fechar uma unidade carimbaria junto os snapshots `consolidado`.
   ⚠️ Há ainda `fechar_relatorio_mensal_canonico_unidade_v1` (11/08/2026), que exige e
   carimba **só os 2 domínios mensais** — feita para retificação histórica isolada, e
   **não** serve ao orquestrador. Ao corrigir bug de fechamento por unidade, checar as três.
6. **Retificação NÃO conserta o relatório mensal.**
   `get_relatorio_admin_mensal_rico_base_v1` lê `v_gerencial.payload` **cru** e nunca
   consulta `fechamento_mensal_retificacoes` — em 01/09/2026 três retificações financeiras
   ficaram corretas e **inertes**. O que destrava é gravar nova versão do snapshot, que é o
   que `garantir_bloco_financeiro_gerencial_v1` faz: sem
   `financeiro_faturas_emusys.totais` em `kpis_gestao[0]`, os indicadores `ticket_medio`,
   `faturamento_previsto` e `mrr_atual` vêm nulos e a leitura levanta
   `RELATORIO_ADMIN_MENSAL_INDICADORES_AUSENTES`.
7. **`capturar_relatorios_mensais_canonicos_v1` contava LINHAS, não domínios distintos**
   (corrigido em `20260902130000`). Snapshots são versionados: competência já retificada
   tem 3 linhas mensais por unidade para 2 domínios, e ela abortava com
   `SNAPSHOT_MENSAL_PARCIAL`. Só aparecia no **rerun sobre mês retificado** — o cenário de
   quem vê o alarme no dia seguinte. Oito revisões de código não pegaram; o ensaio contra
   o banco pegou na 1ª execução.
8. **O passo 0 do orquestrador é tudo-ou-nada.** `preview_fechamento_mensal` levanta
   exceção com bloqueio em QUALQUER unidade, abortando a captura das três — a promessa
   "fecha as que passam" vale dos passos 2-4 em diante. Conferir antes com
   `select preview_fechamento_mensal(ano,mes,null,true)->>'status_geral'`.
9. **`dados_mensais` fica com a inadimplência "vivo", não a do Emusys** (0,31 × 0,92 em
   Recreio/ago-2026), porque `atualizar_dados_mensais_por_snapshot` roda no passo 0, antes
   de o bloco financeiro ser escrito. A divergência nasceu no fechamento manual de 01/09.
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
- **Renovações de bolsista e banda APARECEM, marcadas (03/10/2026):** as abas Renovações, Pendentes e Antecipadas listam também bolsista e banda, com selo "Bolsista/Banda · não entra na taxa". Antes elas sumiam (`filtrarRetencaoCanonica`) e a equipe de CG concluiu que faltavam, chegando a criar cópias pelo modal. **Os números não mudam:** contador da aba ("N · +M bolsista/banda"), cards, taxa e o rodapé da tabela (reajuste, soma de parcelas) continuam pela regra do Alf de 27/08. Fonte única: `motivoForaDosKpis` em `src/lib/atividadesExtras.ts`, da qual `contaNosKpis` passou a derivar — as duas não podem divergir (travado por `tests/renovacaoBolsistaVisivel.test.mjs`). O relatório mensal ainda não lista essas linhas (próxima etapa: bloco "não entram no total").
- **Ciclo atual:** `get_kpis_alunos_admin_operacional` separa **Ativos agora**
  de **Trancados agora**. A aba de movimentações mantém **Trancamentos no
  período** como evento histórico distinto.
- **RPCs:** `get_inadimplencia_canonica`, `get_financeiro_faturas_emusys`, `get_resumo_renovacoes_proximas`, `toggle_relatorio_cron`, `get_relatorio_gerencial_canonico_v1`, `get_dados_retencao_ia`, `vincular_alunos_checklist`, `get_historico_rotinas`, `get_checklist_detail`, `marcar_checklist_item`, `get_checklists_farmer`, `criar_checklist_from_template`, `get_rotinas_do_dia`, `get_progresso_rotinas_hoje`, `marcar_rotina_concluida`
- **Edge functions:** `gemini-relatorio-gerencial`, `relatorio-admin-whatsapp`, `gemini-insights-retencao`, `enviar-pesquisa-pos-primeira-aula`, `buscar-foto-perfil`, `deletar-mensagem-admin`, `editar-mensagem-admin`

## Faturas de alunos (`/app/faturas`)

- **Componentes:** `FaturasAlunosPage.tsx`, `FaturasAlunosFinanceirasPage.tsx`
- **Libs canônicas:** `@/lib/faturasAlunosFinanceiras`, `@/lib/faturasAlunosReconciliacao`
- **RPCs:** `get_faturas_alunos_financeiro_v1`, `get_inadimplencia_canonica`,
  `resolver_reconciliacao_fatura`
- **Edge functions:** `atualizar-inadimplencia-emusys` (refresh sob demanda)
- **Tabelas:** `emusys_faturas`, `financeiro_sync_queue`, `sync_runs`,
  `financeiro_fatura_reconciliacao_decisoes`

Na rota `/app/alunos`, `get_faturas_alunos_financeiro_v1` também entrega o bloco
`inadimplencia_canonica`. Essa tela reutiliza o bloco e não chama
`get_inadimplencia_canonica` uma segunda vez. A rota `/app/faturas` conserva seu
contrato próprio. Se o bloco vier ausente ou inválido, a cobrança permanece
bloqueada; não há fallback para uma leitura menos confiável.

**Custo da leitura (medido 06/10/2026, Consolidado).** `get_faturas_alunos_financeiro_v1` = inadimplência canônica + canônica de faturas (~2 s) + enriquecimento (~0,6 s), atrás de cache por versão **e** TTL de 10 min (`faturas_leitura_cache` / `paginas_rpc_cache`), que cai a cada escrita em `sync_runs` (~16/h) e `emusys_faturas`. A inadimplência levava ~2 s **de CPU** por duas buscas `EXISTS` correlacionadas em `get_inadimplencia_canonica_v3_base`; desde `20261006123611` são `IN` não correlacionado (hash): **2,3 s → 0,09 s**, saída idêntica (19.421 faturas comparadas linha a linha, md5 da função inteira). ⚠️ Forçar índice em `sync_run_items` na canônica de faturas foi testado e **não** ganha com cache quente.

**Retenção de `emusys_fatura_source_events` (06/10/2026, `20261006214128`).** A trilha que `publish_financeiro_sync_run` grava (uma linha por fatura a cada execução, 94% `confirmed`) não tinha retenção: 10,6 mi de linhas, 3,7 GB, 38% do banco. **Ninguém lê** (contadores do Postgres zerados desde 28/09; Super Folha confirmou pelo código que não usa). Desde então a rotina que já existia (`sync_run_items_expurgar_v1`, cron 304) apaga também os `confirmed` de cada execução que expurga — só quando existe o índice `emusys_fatura_source_events_run_idx`. O acumulado sai UMA vez por `emusys_fatura_source_events_compactar_v1(true)` (TRUNCATE + reinserção do que fica, devolvendo o disco na hora), agendada para 07/10 07h05 BRT com o worker financeiro parado (job `compactar-source-events-uma-vez`, que se desagenda). Ensaio: apaga 10.013.864, mantém 591.077 (todas as transições `missing_*` e os `confirmed` de execuções ainda não expurgadas). Rastro em `automacao_log` (`evento=retencao_financeira`).

⚠️ O espelho `emusys_faturas` cobre apenas as competências sincronizadas (a partir de
jun/2026) — número de faturas vencidas é **piso, não valor exato**. Ver `CLAUDE.md`.

⚠️ **Os cartões do topo contam a VISÃO, não a competência (desde 2026-09-03, LAPE-22).** Eles
são o seletor de situação — facetas — e passaram a somar `itemsDaVisao`, o recorte de
tipo/curso/forma/professor/busca **sem** a situação (aplicá-la ali zeraria os outros quatro
assim que um fosse escolhido). Quando há filtro, o cartão mostra o total da competência como
linha secundária. Antes eles liam `state.totals` direto e contradiziam a lista: com
`tipo=parcela` em CG/ago-2026 a tabela dizia "394 faturas nesta visão" e o cartão seguia em
480 / R$ 166.223,59.
⚠️ **`p_status` não vai mais ao servidor** (`situacao: 'todas'` fixo). A RPC filtra os `items`
por ele, então ao escolher "Pagas" o cliente recebia só as pagas e não teria linhas para somar
as outras quatro situações. Com `'todas'` vem o CTE `itens_normais` inteiro — que é
exatamente o conjunto sobre o qual a RPC calcula os totais, e é o que garante paridade da soma
local (medido: 480 / R$ 166.223,59 nos dois). Efeito: trocar de cartão não tem round-trip, e a
página sempre carrega o payload completo da competência.
⚠️ **Valor da fatura vem de `valorPrincipalDaFatura()`** (`@/lib/faturasAlunosFinanceiras`) —
`paga → valor_pago`, senão `valor_hoje`. A regra já esteve copiada em 6 lugares e em dois tipos
de item (o de reconciliação tem `status` string livre, daí a tipagem estrutural). Consumidor
novo lê dali: a soma do cartão e a célula da linha têm que sair da mesma fonte.
