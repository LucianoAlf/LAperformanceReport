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

### Inadimplência operacional (regra nova, jun/2026)
Conta como inadimplente **somente** `status = 'ativo'` **E** `status_pagamento = 'inadimplente'` **E** `valor_parcela > 0`. **Trancado, evadido e inativo NÃO entram** no alerta/contagem de inadimplência operacional. Aplicada em `kpisAlunosVivosCanonicos.ts` (`isParcelaInadimplente`, :176), `TabelaAlunos.tsx`, `AlunosPage.tsx`, `gerar-relatorio-aluno`. O `sync-matriculas-emusys` não propõe `status_pagamento` para matrícula não-ativa.
- Motivo: inadimplentes haviam "saltado" de ~16 p/ ~40 por incluir trancado/evadido/histórico. Fonte: commit `restrict delinquency to active students`.
- **BANDA e bolsista integral permanecem `sem_parcela`** mesmo quando o Emusys retorna `em_dia` (migration `p08k`).

### Classificação de bolsista (KPI / MRR)
Usa o **`tipo_matricula_id` canônico** (`BOLSISTA_INT`/`BOLSISTA_PARC`), **não** o `tipo_aluno` legado — que pode estar contaminado (ex.: aluno marcado `bolsista_integral` em `tipo_aluno` mas pagante regular no contrato). RPC `get_kpis_alunos_admin_operacional`. Fonte: migration `admin_operacional_bolsista_por_tipo_canonico`.

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

### Health Score Professor V3 (0–100, ponderado)

O V3 é calculado e persistido no banco. Frontend, relatórios e agentes apenas leem o snapshot; não recalculam e não substituem ausência de base por zero.

| Pilar | Peso | Meta inicial | Grão/fonte canônica |
|---|---:|---:|---|
| Retenção atribuível | 25% | 90% | período matrícula-disciplina-professor exposto; `movimentacoes_admin` + `motivos_saida` |
| Permanência com o professor | 25% | 12 meses | vínculos encerrados de `vw_professor_periodos_efetivos_v3_sombra` |
| Conversão Exp→Mat | 15% | 70% | experimental confirmada e matrícula canonicamente vinculada |
| Média de alunos/turma | 15% | segmentada | ocupações únicas de pessoas por turma regular elegível |
| Número de alunos | 10% | segmentada | pessoas canônicas únicas na carteira professor+unidade |
| Presença dos alunos | 10% | 80% | roster + `vw_aluno_presenca_semantica_v1` |

`nota = min(100, valor_real / meta_versionada * 100)`. Sliders alteram somente pesos; metas são campos separados. Uma configuração ativa é imutável: alterações criam rascunho, passam por simulação e são ativadas em ação separada. Snapshots fechados não são reescritos.

#### Metas segmentadas de carteira e turma

Média/turma e Número de alunos não usam uma meta global no V3. Cada regra pertence a `unidade + curso + modalidade`, com modalidade canônica `turma` ou `individual`:

- `capacidade_maxima`: limite operacional do curso naquela unidade e modalidade;
- `meta_media_turma`: meta de ocupação por turma daquele segmento;
- `meta_carteira_curso`: meta de pessoas na carteira daquele segmento;
- curso não ofertado é declarado explicitamente, sem valores numéricos;
- curso formalmente atribuído e ainda sem alunos continua visível, mas não recebe nota zero nem penaliza o professor;
- quando surgir o primeiro vínculo ativo, a regra segmentada passa a ser pontuável;
- regra ausente ou atribuição ambígua produz `segmentacao_incompleta`, nunca fallback para meta global;
- capacidade excedida gera alerta operacional, sem cortar ocupação, valor bruto ou nota;
- o total de pessoas do professor continua vindo da carteira canônica e não pode ser inflado pela soma de cursos simultâneos.

A configuração segmentada segue o mesmo ciclo governado: rascunho, validação, simulação e ativação separada. Enquanto houver regra inválida, os comandos de salvar, simular e ativar permanecem bloqueados.

- Classificação inicial: **Saudável ≥ 70** · **Atenção 50–69** · **Crítico < 50**.
- Métrica sem base possui valor pontuável e nota `null`; seu peso sai temporariamente do denominador.
- Score exibível exige cobertura mínima de 60% e Retenção ou Permanência disponível.
- Parcial é visível, mas nunca rankeável ou premiável. Ranking existe somente em ciclo oficial fechado.
- Crescimento, fator de demanda e evasão duplicada pertencem à V2 histórica e não compõem o V3.

### Recortes mensal e por ciclo

Os ciclos fixos aprovados são **Jun-Ago**, **Set-Nov**, **Dez-Fev** e **Mar-Mai**. A RPC recebe a competência de referência selecionada e resolve o ciclo correspondente sem deslocar o mês.

- Número de alunos: mês = fechamento atual; ciclo = média dos fechamentos disponíveis e oficial somente com três meses.
- Média/turma: mês = ocupações/turmas elegíveis no mês; ciclo = soma das ocupações ÷ soma das turmas, nunca média simples das médias.
- Retenção e conversão: janela/ciclo definido no snapshot, com numerador e denominador preservados.
- Permanência: histórico acumulado de vínculos encerrados, não apenas os três meses do ciclo. Vínculos com menos de quatro meses ficam no histórico, mas não entram na média/nota.
- Presença: observado de junho/julho fica auditável; a pontuação contratual começa em 03/08/2026. Barra e Recreio podem contribuir conforme política versionada e cobertura mínima; Campo Grande permanece visível em auditoria e fora do score até nivelamento operacional.

### Health Score V2 (histórico/rollback)

A composição antiga (crescimento, média/turma, renovação, conversão, presença e evasões) permanece somente para histórico e rollback controlado durante a observação. Ela não é a fonte dos cards, relatórios e agentes V3 migrados.

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

## Fechamento mensal / Governança de competência (jun/2026)

Para impedir que a virada de mês recalcule/altere competências já fechadas, o fechamento passou a ser **canônico e auditável**:

- **`dados_mensais` deixou de ser fonte de verdade** — virou camada de **compatibilidade** (telas antigas). A fonte do retrato fechado é o snapshot.
- **Fluxo oficial de fechamento** (só após o último sync/movimento do mês, com confirmação explícita):
  1. `preview_fechamento_mensal(ano, mes, unidade?, payloads?)` — **read-only**, junta domínios, aponta bloqueios/alertas. Não grava.
  2. `gravar_snapshot_fechamento_mensal(...)` — grava o retrato com **hash + auditoria**; só `service_role`; bloqueia se houver bloqueios; exige confirmação se houver alertas; não sobrescreve snapshot fechado.
  3. `atualizar_dados_mensais_por_snapshot(...)` — atualiza `dados_mensais` por compatibilidade a partir do snapshot aprovado (`dry_run` default).
- **Tabelas:** `fechamento_mensal_snapshots`, `fechamento_mensal_auditoria` (RLS: `authenticated` lê, escrita só `service_role`).
- **Writers legados bloqueados** para `anon`/`authenticated`: `snapshot_dados_mensais`, `fechar_dados_mensais`, `recalcular_dados_mensais`, `upsert_dados_mensais` (só `service_role`).
- **Financeiro do mês = faturamento PREVISTO por parcela canônica** (mensalidade − desconto condicional). Faturamento realizado com juros/multa aguarda endpoint de faturas do Emusys (ainda inexistente).
- Fonte: migrations `p09a`–`p09g` (`20260630*`), commit `c401724 feat: add canonical monthly closing safeguards`, relatório `docs/luciano/relatorio_randolph_fechamento_junho_2026.md`.
- ⚠️ Junho/2026 **ainda não foi fechado** — infraestrutura criada e validada (`preview` = `aprovavel`, 0 bloqueios), gravação pendente de autorização.

---

## Inconsistências percebidas (a decidir)

> Itens que notei ao mapear. **Não alterei nada** — são decisões de negócio. Sinalizando para você decidir se ajustamos.

1. **Snapshot Kids/School hardcoded** — `SEGMENTACAO_KIDS_SCHOOL_CG_MAIO_2026 = {kids:202, school:294}` fixo em `TabGestao.tsx:43-50`. É um valor reconstituído manualmente; se a fonte viva divergir, o histórico de CG/maio-2026 mostra número fixo. Candidato a remover quando a segmentação por idade estiver confiável no histórico.
2. **Valores placeholder na Retenção** — `useEvasoesData.ts` usa **churn médio fixo `4.86`** (`:88`) e **taxa de renovação fixa `80%`** (`:91`). Não são calculados; o dado real vem de `useProfessoresPerformance`. O dashboard de Retenção pode exibir números que não batem com Administrativo/Professores.
3. **Duas fontes de evasão/renovação** — Retenção (`useEvasoesData`) lê a tabela **legada `evasoes`**, enquanto Administrativo/Professores usam **`movimentacoes_admin`** (canônico). Risco de números divergentes entre as páginas.
4. **Conversão experimental calculada de 2 jeitos** — Dashboard/Comercial usam `leads.experimental_realizada`; o canônico do professor usa `lead_experimentais`. CLAUDE.md já registra que a fonte canônica virou `lead_experimentais` — o Dashboard pode estar com a taxa antiga (inflada). Vale alinhar.
5. **Métricas bloqueadas em Metas** — `taxa_exp_mat` e `taxa_conversao_exp` estão desativadas (`MetasPageNew.tsx`) aguardando regra canônica. Enquanto isso, não dá pra metar conversão de experimental.
6. **Forms de Entrada gravam em tabelas legadas** — `FormMatricula/Evasao/Renovacao` escrevem em `movimentacoes`/`renovacoes`/`evasoes`, não em `movimentacoes_admin`. Se ainda forem usados, geram dados fora do fluxo canônico Emusys.
7. **Ticket Médio: numerador precisa vir de fatura por competência, não de `alunos.valor_parcela`** — Clayton (07/07) reportou que o ticket médio do LA Report não bate com a planilha/Financeiro do Emusys que a ADM usa. Investigado: **não é passaporte/lojinha** (já descartados no cálculo atual — `alunos.valor_passaporte` é coluna separada, lojinha não existe em `alunos`). **Denominador "por pessoa" está correto** (regra validada pelo Alf, P3, não muda). A causa real é a **fonte do numerador**: o `alunos_ticket` da view `vw_kpis_gestao_mensal` (e as cópias equivalentes em `AlunosPage.tsx:682-696`, `kpisAlunosVivosCanonicos.ts:263,312`, `TabProfessoresNew.tsx:662-669` — "Ticket Médio Geral") somam o campo **cadastral estático `alunos.valor_parcela`**, mas a regra final (Alf, 07/07) exige o valor da **fatura da competência**: `valor_pago` se paga; valor devido atualizado (sem desconto de pontualidade perdido + juros/multa) se aberta/inadimplente. Validado ao vivo para Recreio jun/2026: previsto líquido calculado via fatura R$136.510,68 vs tela real da ADM R$136.475,68. `emusys_faturas` permanece o espelho atual, mas a exportação por competência agora lê exclusivamente o `sync_run_items` de um `sync_run_id` completo. Os quatro cálculos de Ticket Médio/LTV listados acima ainda não foram migrados. **Faturamento Previsto/MRR/ARR não são afetados**.

8. **Frescor financeiro não vem de timestamp de linha** — somente `sync_runs.run_type='live'`, `status='succeeded'`, `snapshot_complete=true` e `unidades_concluidas=3` prova frescor. O `baseline` derivado do legado serve para detectar ausências, mas nunca autoriza aplicação financeira por si só.
