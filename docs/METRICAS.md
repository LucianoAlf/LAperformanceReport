# Métricas e Critérios — LA Music Performance Report

> **Propósito:** dicionário canônico das métricas do sistema — o que cada número significa e **exatamente quais filtros** entram no cálculo. Use antes de escrever query/RPC, montar KPI ou relatório.
>
> **Manutenção (obrigatória):** ao mudar a regra de cálculo de qualquer métrica, atualizar aqui no mesmo commit. Onde a página usa cada métrica → [`docs/MAPA-SISTEMA.md`](./MAPA-SISTEMA.md). Regras de negócio detalhadas → `.claude/memory/regras-negocio.md` e skill `sol-la-report-business-rules`.
>
> ⚠️ **Antes de "corrigir" qualquer critério aqui:** mudança em métrica afeta dashboards e metas. Validar com SELECT-only e confirmar com o Hugo (regra de colaborador). Ver seção [Inconsistências percebidas](#inconsistências-percebidas-a-decidir) no fim.
>
> Última atualização: 2026-06-23.

## Conceitos-base

- **`alunos` = matrículas, não pessoas.** Uma pessoa = `nome` + `unidade_id`. 2 cursos = 2 linhas (1 com `is_segundo_curso=false` + N com `true`). Contagens "por pessoa" deduplicam por `nome` (+`unidade_id`/`data_nascimento`).
- **Unidades:** CG (`2ec861f6…`), Recreio (`95553e96…`), Barra (`368d47f5…`).
- **Timezone:** BRT (UTC-3).

---

## Valor da parcela (mensalidade) — regra comercial

**Fórmula canônica (desde 2026-06-23, commits do Luciano `befdbbc`/`dfe349e`):**
```
valor_parcela = valor_cheio − desconto_condicional
```
- `valor_cheio` = `contrato_atual.valor_mensalidade` da API Emusys.
- `desconto_condicional` = subtraído (inclui a bolsa, no caso de bolsista parcial).
- **`desconto_fixo` NÃO entra na parcela** — fica gravado/auditado na coluna `alunos.desconto_fixo`, separado. É um desconto de pontualidade tratado à parte.
- Existe `liquido_financeiro = cheio − fixo − cond` **só para auditoria/divergência** (não é a parcela comercial).
- Aplicado nas edges `sync-matriculas-emusys` e `processar-matricula-emusys` (carimba `regra_valor_parcela='valor_mensalidade_menos_desconto_condicional'`). Se a parcela der ≤ 0 ou cheio ≤ 0 → fila `valor_divergente` (revisão humana).
- **Backfill 2026-06-23:** 535 alunos ativos/trancados (CG 399, Barra 116, Recreio 20) estavam na fórmula antiga (`cheio − fixo − cond`) e foram recalculados — `desconto_fixo` preservado. Nenhum de banda, nenhum travado, nenhum zerado.
- ⚠️ Regra **anterior** (até 22/06) era `cheio − fixo − cond` — obsoleta.

---

## Alunos

### Aluno pagante
`conta_como_pagante = true` **E** `is_segundo_curso != true` **E** `status ∈ {ativo, trancado}`.
- Implementação: `AlunosPage.tsx:623-627`. RPC canônica: `get_kpis_alunos_canonicos` / `fetchKPIsAlunosCanonicos`.
- Bolsista integral **não** é pagante; bolsista parcial conta conforme `conta_como_pagante`.

### Aluno ativo / Carteira viva
`status ∈ {ativo, trancado}`, deduplicado por pessoa (nome). `aviso_previo` **não** entra na carteira ativa (mas aparece em listas operacionais de contato).
- `TabGestao.tsx:249/265`, `TabProfessoresNew.tsx:318` (tooltip: "alunos com status ativo ou trancado").

### Bolsista
`tipo_matricula.codigo ∈ {BOLSISTA_INT (id 3), BOLSISTA_PARC (id 4)}`. Bolsista de **banda/projeto** é tratado à parte (não infla bolsistas regulares): bolsista real exige `is_projeto_banda != true` (`AlunosPage.tsx:630-633`).

### Segundo curso
`is_segundo_curso = true`. Mesma pessoa, curso adicional. **Excluído** de: pagantes, matrículas novas canônicas, ticket médio (dedup por pessoa). Conta separado (`total_bolsistas_integrais_segundo_curso` em `TabGestao`).

### Banda / Projeto
`cursos.is_projeto_banda = true`. **Exclui** o aluno de: médias de turma, carteira, score do professor, matrículas canônicas, LTV.

### Ticket médio (mensalidade)
Média de `valor_parcela` dos alunos com `tipo_matricula.entra_ticket_medio = true` **E** `valor_parcela > 0`, deduplicado por pessoa (`nome+data_nascimento+unidade_id`).
- `AlunosPage.tsx:639-653`.

### Ticket médio (passaporte / matrícula)
Média de `valor_passaporte > 0` das matrículas novas canônicas do período (exclui 2º curso, banda).
- `DashboardPage.tsx:435`, `ComercialPage.tsx:350`.

### Status de pagamento
`status_pagamento ∈ {em_dia, inadimplente, parcial, sem_parcela}`. Aberto/indefinido = `null`/`'-'`. Governança de `sem_parcela` em `Alunos/statusPagamentoGovernanca.ts` (considera presença recente ≤30 dias).

### Kids vs School
Por idade: `idade ≤ 11` → **LA Music Kids**; `idade ≥ 12` → **LA Music School**. `TabGestao.tsx:811-812`. (Apenas alunos regulares — exclui banda e 2º curso.)

---

## Matrículas (novas)

**Matrícula nova canônica** = matrícula do período que **NÃO** é: 2º curso (`is_segundo_curso`), bolsista (`BOLSISTA_INT/PARC`), banda (`is_projeto_banda`), nem Canto Coral (`cursos.nome` contém "canto coral").
- `DashboardPage.tsx:207-209`, `TabGestao.tsx:736-739`, lib `comercialMatriculasCanonicas`.
- Fonte canônica atual: conciliação Emusys (`movimentacoes_admin` + `sync-matriculas-emusys`). Forms de Entrada gravam em `movimentacoes` legada.

---

## Comercial / Funil

### Etapas do lead (pipeline)
`status`: `novo → agendado/experimental_agendada → experimental_realizada / experimental_faltou → convertido/matriculado` (ou `arquivado`). Posição no pipeline dinâmico: `etapa_pipeline_id` (tabela `crm_pipeline_etapas`). Conciliação tem `etapa_canonica`.

### Experimental realizada
Depende do contexto:
- **Operacional/canal (inclui visita):** `status ∈ {experimental_realizada, compareceu, visita_escola}` (`DashboardPage.tsx:275`, `TabComercialNew.tsx:407`).
- **Por professor (estrito):** apenas `status = 'experimental_realizada'` (`TabComercialNew.tsx:387`).
- **Faltou:** `status = 'experimental_faltou'`.

### Taxa de conversão Experimental → Matrícula
- **No Dashboard/Comercial (frontend):** denominador `experimental_realizada = true`; numerador `status ∈ {matriculado, convertido}` (`DashboardPage.tsx:316-327`).
- **Canônica (professor):** RPC `get_experimentais_professor_canonicos_v1` + fonte `lead_experimentais` (1 linha por aula, presença real) — substituiu a contagem por `leads` que inflava a taxa. Denominador = `status ∈ {experimental_realizada, convertido}`; numerador = realizadas cujo lead converteu. Ver CLAUDE.md (Módulo de Professores).
- ⚠️ `taxa_exp_mat` e `taxa_conversao_exp` estão **bloqueadas** em Metas até unificar a regra canônica (`MetasPageNew.tsx:65/75`).

### Taxa Lead → Experimental
Leads que agendaram/realizaram experimental ÷ total de leads do período.

---

## Retenção / Evasão

### Evasão (contagem e MRR perdido)
`movimentacoes_admin.tipo ∈ {evasao, nao_renovacao}` — **sem** `aviso_previo` nem `trancamento`.
- `DashboardPage.tsx:238`, `TabGestao.tsx:842`, `TabProfessoresNew.tsx:284` (MRR perdido = soma `valor_parcela`).

### Taxa de renovação
`renovacoes / (renovacoes + nao_renovacoes) × 100`. Renovação só conta se **confirmada** (`isRenovacaoConfirmadaOperacional`, exclui `pendente_validacao`). Renovação antecipada: `renovacao_antecipada=true` ou status `antecipada_*`.
- `AdministrativoPage.tsx:508/617`, `TabPerformanceProfessores.tsx:325`.
- Por professor: `renovacoes / contratos_a_vencer × 100` (`useProfessoresPerformance.ts:140`).

### Evasões que contam no score do professor
Apenas evasões cujo `motivos_saida.conta_score_professor = true`. Motivo `NULL` sem match em `motivos_saida` **não conta** (mudança documentada no CLAUDE.md). Alunos de `is_projeto_banda` excluídos (`filtrarRetencaoCanonica`).
- `ModalDetalhesEvasoes.tsx`, `useProfessoresPerformance.ts:76`.

### Tipos de movimentação (retenção)
`renovacao | nao_renovacao | aviso_previo | evasao | trancamento`. Para **retenção** agregam-se todos; para **evasão pura** só `evasao + nao_renovacao`.

### LTV / Tempo de permanência
Ex-alunos com **≥ 4 meses** e saída real (saiu de TODAS as matrículas). Exclui bolsistas, banda e 2º curso. Taxa de retorno = % pessoas com 2+ passagens.
- RPC `get_historico_ltv`; `ModalPermanenciaDetalhe.tsx`.

---

## Professores

### Health Score (0–100, ponderado)
6 dimensões (`HealthScoreConfig.tsx:11-18`): crescimento da carteira **15%**, média de alunos/turma **20%**, retenção **25%**, conversão **15%** (legado, somado à retenção na prática), presença **15%**, evasões **10%** (inverso).
- Classificação: **Saudável ≥ 70** · **Atenção 50–69** · **Crítico < 50**.
- Nível de risco por evasões: Crítico ≥ 15 · Alto ≥ 10 · Médio ≥ 5 · Normal < 5.

### Modo Mensal vs Trimestral
Trimestres: T1 = mar–mai · T2 = jun–ago · T3 = set–nov · "Não considerado" = dez/jan/fev. RPC `get_kpis_professor_periodo` aceita `p_data_inicio`/`p_data_fim`.

### Taxa de presença (faixas)
Crítico < 70% · Atenção 70–79% · OK ≥ 80% (`ModalDetalhesPresenca.tsx`).

---

## Salas

- **Ocupação (%):** soma da `capacidade_maxima` das turmas ativas na sala ÷ `capacidade_maxima` da sala × 100.
- **Taxa de utilização (%):** `horas_ocupadas / horas_disponiveis × 100`, onde cada turma ativa = 1h e capacidade = `nº_salas × 73h/semana` (seg–sex 13h/dia + sáb 8h).
- Considera `turmas.ativo = true` e `salas.ativo = true`.

---

## Sucesso do Aluno

- **Health score do aluno / fase da jornada:** view `vw_aluno_sucesso_lista` (`health_score_numerico`, `health_status`, `fase_jornada`, `percentual_presenca`, `status_pagamento`). Recalculado por `calcular_health_score_alunos_batch`.
- **Faltas:** RPC `get_faltas_periodo` deduplica aulas Emusys (individual+turma) por `(aluno, dia, curso)`, priorizando a visão individual.
- **Pesquisa pós-1ª aula:** `pesquisas_whatsapp` `tipo='pos_primeira_aula'`; status `respondida/nao_respondida/pendente`. Régua da timeline: 1ª aula → 3 meses → evasão.

---

## Inconsistências percebidas (a decidir)

> Itens que notei ao mapear. **Não alterei nada** — são decisões de negócio. Sinalizando para você decidir se ajustamos.

1. **Snapshot Kids/School hardcoded** — `SEGMENTACAO_KIDS_SCHOOL_CG_MAIO_2026 = {kids:202, school:294}` fixo em `TabGestao.tsx:43-50`. É um valor reconstituído manualmente; se a fonte viva divergir, o histórico de CG/maio-2026 mostra número fixo. Candidato a remover quando a segmentação por idade estiver confiável no histórico.
2. **Valores placeholder na Retenção** — `useEvasoesData.ts` usa **churn médio fixo `4.86`** (`:88`) e **taxa de renovação fixa `80%`** (`:91`). Não são calculados; o dado real vem de `useProfessoresPerformance`. O dashboard de Retenção pode exibir números que não batem com Administrativo/Professores.
3. **Duas fontes de evasão/renovação** — Retenção (`useEvasoesData`) lê a tabela **legada `evasoes`**, enquanto Administrativo/Professores usam **`movimentacoes_admin`** (canônico). Risco de números divergentes entre as páginas.
4. **Conversão experimental calculada de 2 jeitos** — Dashboard/Comercial usam `leads.experimental_realizada`; o canônico do professor usa `lead_experimentais`. CLAUDE.md já registra que a fonte canônica virou `lead_experimentais` — o Dashboard pode estar com a taxa antiga (inflada). Vale alinhar.
5. **Métricas bloqueadas em Metas** — `taxa_exp_mat` e `taxa_conversao_exp` estão desativadas (`MetasPageNew.tsx`) aguardando regra canônica. Enquanto isso, não dá pra metar conversão de experimental.
6. **Forms de Entrada gravam em tabelas legadas** — `FormMatricula/Evasao/Renovacao` escrevem em `movimentacoes`/`renovacoes`/`evasoes`, não em `movimentacoes_admin`. Se ainda forem usados, geram dados fora do fluxo canônico Emusys.
