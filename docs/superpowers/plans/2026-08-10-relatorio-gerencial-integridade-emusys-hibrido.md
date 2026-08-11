# Relatório gerencial — integridade Emusys e destaques híbridos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or **superpowers:executing-plans** to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Fazer o relatório gerencial mensal publicar somente metas, cobertura, comparativos e rankings sustentados pelo contrato canônico, enquanto o sync captura Lead ID e reconcilia experimentais por identidade Emusys sem destruir histórico.

**Architecture:** A entrega será aditiva e dividida em três gates. O SQL produtor expõe campos separados (\`metas.operacionais\`, cobertura e comparabilidade); a Edge renderiza esses campos e aplica uma trava determinística na narrativa. Helpers puros concentram a reconciliação de Lead ID e a prioridade de chaves da aula, e as funções de sync apenas usam esses helpers no escopo da unidade; nenhum backfill, deploy ou escrita remota entra neste plano.

**Tech Stack:** TypeScript/Deno Edge Functions, PostgreSQL/Supabase migrations, Node \`node:test\`, Deno \`@std/assert\`, Supabase RPC/REST, Vite.

---

## Contexto e arquivos envolvidos

* \`supabase/functions/gemini-relatorio-gerencial/index.ts\` é o contrato e renderer público; ele também valida a narrativa produzida pela IA.
* \`supabase/migrations/20260801222500_corrigir_relatorio_gerencial_metas_matriculador.sql\` é a RPC canônica atual. A alteração será uma migration nova, preservando a assinatura e a ACL da função existente.
* \`supabase/migrations/20260801115829_relatorios_mensais_fechamento_canonico.sql\` é a origem do payload comercial; a nova migration deve separar cobertura sem alterar snapshots fechados.
* \`tests/relatorioGerencialCanonico.test.mjs\`, \`tests/relatorioGerencialRender.test.ts\` e \`tests/relatorioGerencialCanonicoPostgres.test.mjs\` cobrem contrato, texto publicado e integração SQL isolada.
* \`supabase/functions/sync-matriculas-emusys/index.ts\` materializa jornadas e divergências; \`supabase/functions/_shared/jornada-canonica.ts\` converte payloads de matrícula.
* \`supabase/functions/sync-presenca-emusys/index.ts\` reconcilia experimentais; o novo helper ficará em \`supabase/functions/_shared/experimental-reconciliacao.ts\` com teste no mesmo diretório.
* \`supabase/functions/_shared/relatorios-mensais-canonicos.ts\` e os quatro mapas em \`docs/REGRAS-DE-NEGOCIO.md\`, \`docs/METRICAS.md\`, \`docs/MAPA-INTEGRACAO-EMUSYS.md\`, \`docs/MAPA-SISTEMA.md\` documentam fontes, grãos e limites de publicação.

### Task 0: Capturar a linha de base e o drift remoto somente para leitura

**Files:**
- Read: \`supabase/migrations/*.sql\`, \`supabase/functions/gemini-relatorio-gerencial/index.ts\`, \`supabase/functions/sync-matriculas-emusys/index.ts\`, \`supabase/functions/sync-presenca-emusys/index.ts\`
- Create: \`docs/superpowers/evidence/2026-08-10-relatorio-integridade-baseline.md\`

- [x] **Step 1: Registrar estado local e testes de baseline**

~~~powershell
git status --short --branch
npm test
node --test tests/relatorioGerencialCanonico.test.mjs
~~~

Expected: worktree limpo; suíte padrão passa; o teste canônico pode ter exatamente a falha conhecida da asserção antiga \`faturamento_previsto\` no renderer.

- [x] **Step 2: Registrar definições remotas sem aplicar nada**

~~~powershell
supabase functions list
supabase migration list
~~~

Salvar somente nomes/versões em \`docs/superpowers/evidence/2026-08-10-relatorio-integridade-baseline.md\`; não executar \`db push\`, \`functions deploy\`, \`--include-all\`, backfill ou RPC de escrita.

- [x] **Step 3: Commit da evidência de auditoria**

~~~powershell
git add docs/superpowers/evidence/2026-08-10-relatorio-integridade-baseline.md
git commit -m "docs: registrar baseline da auditoria do relatorio"
~~~

### Task 1: Tornar o contrato do renderer explícito (RED)

**Files:**
- Modify: \`tests/relatorioGerencialCanonico.test.mjs\`
- Modify: \`tests/relatorioGerencialRender.test.ts\`

- [x] **Step 1: Escrever fixture realista e asserções RED**

Adicionar ao fixture de Recreio/julho:

~~~ts
metas: {
  operacionais: { reajuste_medio: 10, leads: 160, matriculas: 21, ticket_parcela: 435 },
  mensais: { reajuste_medio: 7 }, // legado, não consumido pelo renderer novo
  fideliza: { meta_reajuste_minimo: 7, meta_churn_maximo: 4, meta_inadimplencia_maxima: 1, meta_renovacao_minima: 90 },
  matriculador: { meta_taxa_lead_exp: 18, meta_taxa_exp_mat: 75, meta_taxa_lead_mat: 13.5, meta_volume: 20, meta_ticket: 435 },
},
comercial: {
  cobertura_curso_interesse: {
    total_leads: 297, detalhamento_disponivel: 296, detalhamento_indisponivel: 1,
    curso_declarado_informado: 120, curso_declarado_ausente: 176,
    percentual_detalhamento_disponivel: 99.66, percentual_curso_declarado_ausente: 59.26,
    fonte: "leads.curso_interesse", versao_regra: "curso-interesse-v2",
  },
  leads_por_canal: [{ nome: "Visita/Placa", quantidade: 7 }],
  matriculas_por_curso: [{ nome: "Canto", quantidade: 8 }],
},
rankings: {
  oficiais: [],
  destaques_mensais_parciais: {
    presenca: { cobertura: "3 de 24 professores", regra: "presenca-media-v1", itens: [{ professor: "P1", presenca_media: 81.5 }] },
  },
},
comparativos: { disponibilidade: "indisponivel", motivo: "fechamento_anterior_incompativel", status: "indisponivel" },
~~~

Assert that the rendered text contains \`metas.operacionais\`, \`99,66%\`, \`176\`, \`1 indisponível\`, leads by channel, enrollments by course, \`Destaques mensais parciais (não oficiais)\`, and no medal/ordinal wording for partial data. Assert that \`8,13%\` is evaluated against operational \`10%\` in Gestão and against Fideliza \`7%\` only in the Fideliza block.

Add Node source assertions for \`cobertura_curso_interesse\`, \`metas.operacionais\`, \`rankings.oficiais\`, \`rankings.destaques_mensais_parciais\`, \`leads_por_canal\`, \`matriculas_por_curso\`, and a temporal-language guard.

- [x] **Step 2: Run the focused tests and confirm failure**

~~~powershell
deno test --no-lock --allow-read tests/relatorioGerencialRender.test.ts
node --test tests/relatorioGerencialCanonico.test.mjs
~~~

Expected: FAIL because the current renderer consumes \`metas.mensais\`, has no coverage split, does not render the two existing distributions, and treats partial rankings as official/empty.

### Task 2: Implement Gate 1 in the Edge renderer (GREEN)

**Files:**
- Modify: \`supabase/functions/gemini-relatorio-gerencial/index.ts:21-1060\`
- Test: \`tests/relatorioGerencialCanonico.test.mjs\`, \`tests/relatorioGerencialRender.test.ts\`

- [x] **Step 1: Expand types and validation without removing legacy fields**

Define \`metas.operacionais\`, \`comercial.cobertura_curso_interesse\`, \`rankings.oficiais\`, \`rankings.destaques_mensais_parciais\`, and structured \`comparativos.disponibilidade/motivo\`. Keep \`metas.mensais\` only as a compatibility field and make the renderer read \`operacionais\`.

~~~ts
type Comparativos = {
  disponibilidade: "disponivel" | "indisponivel";
  motivo?: string;
  status?: string;
  fingerprint?: string;
  anterior?: unknown;
  atual?: unknown;
};
type CursoCoverage = {
  total_leads: number;
  detalhamento_disponivel: number;
  detalhamento_indisponivel: number;
  curso_declarado_informado: number;
  curso_declarado_ausente: number;
  percentual_detalhamento_disponivel?: number;
  percentual_curso_declarado_ausente?: number;
  fonte: string;
  versao_regra: string;
};
~~~

\`contratoGerencialValido\` must reject negative coverage, totals that do not reconcile, a partial ranking placed in \`oficiais\`, or missing explicit comparability status; absence remains an explicit unavailable state, never zero.

- [x] **Step 2: Normalize exit reasons and add safe temporal narrative validation**

Normalize with NFD, lowercase, whitespace collapse and canonical aliases so \`Dificuldade financeira\` and \`Dificuldade Financeira\` share one key. Add \`narrativaTemporalmenteSegura(text, comparativos)\` that rejects \`aument\`, \`redu\`, \`crescimento\`, \`queda\`, \`melhora\`, \`piora\`, \`próxim\`, \`previst\`, \`evoluç\`, \`compar\` when availability is not \`disponivel\`. Use it for AI output and deterministic fallback.

~~~ts
const normalizado = texto.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/\\s+/g, " ").trim();
~~~

- [x] **Step 3: Render the separated blocks and distributions**

Use \`const metasOperacionais = dados.metas?.operacionais ?? {}\` for Gestão/Comercial; use only \`metasFideliza\` in Fideliza+ and \`metasMatriculador\` in Matriculador+. Render \`leads_por_canal\` and \`matriculas_por_curso\` with their own grão labels. Render course coverage before course interest, showing detailed count, historical unavailable count and genuinely absent declared course count separately. Add \`linhasDestaquesParciais\` without ordinal/medal wording; \`linhasRanking\` receives only \`rankings.oficiais\`.

- [x] **Step 4: Run focused tests and then the broader TypeScript build**

~~~powershell
deno test --no-lock --allow-read tests/relatorioGerencialRender.test.ts
node --test tests/relatorioGerencialCanonico.test.mjs
npm run build
~~~

Expected: all focused tests pass; build exits 0. Commit:

~~~powershell
git add supabase/functions/gemini-relatorio-gerencial/index.ts tests/relatorioGerencialCanonico.test.mjs tests/relatorioGerencialRender.test.ts
git commit -m "feat: separar metas cobertura e destaques no relatorio"
~~~

### Task 3: Publicar o contrato SQL do Gate 1 (RED → GREEN)

**Files:**
+ Create: \`supabase/migrations/20260811123000_relatorio_gerencial_integridade_hibrido.sql\`
- Modify: \`tests/relatorioGerencialCanonico.test.mjs\`
- Modify: \`tests/relatorioGerencialCanonicoPostgres.test.mjs\`

- [x] **Step 1: Add RED SQL contract assertions**

Assert that the new migration contains the additive fields and ACL:

~~~js
assert.match(sql, /metas.*operacionais/);
assert.match(sql, /cobertura_curso_interesse/);
assert.match(sql, /leads_por_canal/);
assert.match(sql, /matriculas_por_curso/);
assert.match(sql, /comparativos.*disponibilidade/);
assert.match(sql, /rankings.*destaques_mensais_parciais/);
assert.match(sql, /revoke all on function public\\.get_relatorio_gerencial_canonico_v1/);
assert.match(sql, /grant execute on function public\\.get_relatorio_gerencial_canonico_v1[\\s\\S]*authenticated, service_role/);
~~~

Extend the isolated PostgreSQL fixture to assert that \`metas.operacionais\` comes from \`metas_kpi\`, Fideliza remains sourced from \`programa_fideliza_config\`, and \`comparativos.disponibilidade\` is \`indisponivel\` with a structured reason when there is no equivalent prior closing.

- [x] **Step 2: Run the RED integration tests**

~~~powershell
node --test tests/relatorioGerencialCanonico.test.mjs tests/relatorioGerencialCanonicoPostgres.test.mjs
~~~

Expected: FAIL because the additive migration and fields do not yet exist.

- [x] **Step 3: Implement the additive RPC migration**

Create \`CREATE OR REPLACE FUNCTION public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)\` preserving the current return type, security posture and closed-document checks. Use \`v_admin->'metas_kpi'\` for \`metas.operacionais\`; leave \`metas.mensais\` as a compatibility alias only. Pass through existing \`leads_por_canal\` and \`matriculas_por_curso\`. Add \`comercial.cobertura_curso_interesse\` from the existing lead snapshot and detailed lead rows:

~~~sql
jsonb_build_object(
  'total_leads', v_leads_snapshot,
  'detalhamento_disponivel', v_leads_detalhados,
  'detalhamento_indisponivel', greatest(v_leads_snapshot - v_leads_detalhados, 0),
  'curso_declarado_informado', v_leads_com_curso,
  'curso_declarado_ausente', v_leads_sem_curso,
  'percentual_detalhamento_disponivel', round((v_leads_detalhados * 100.0) / nullif(v_leads_snapshot, 0), 2),
  'percentual_curso_declarado_ausente', round((v_leads_sem_curso * 100.0) / nullif(v_leads_snapshot, 0), 2),
  'fonte', 'leads.curso_interesse',
  'versao_regra', 'curso-interesse-v2'
)
~~~

Do not turn \`detalhamento_indisponivel\` into \`Sem curso\` in \`leads_por_curso\`; keep the detailed distribution and coverage counts separate. Return \`rankings.oficiais\` only from the existing closed/official/eligible Health Score rows and an empty partial structure with explicit \`status: 'indisponivel'\` when the cycle is not eligible. Return \`comparativos.disponibilidade\` and \`motivo\` rather than a prose-only flag. Revoke \`anon\` and grant only \`authenticated, service_role\` after the function definition.

- [x] **Step 4: Run isolated PostgreSQL tests and commit**

~~~powershell
node --test tests/relatorioGerencialCanonico.test.mjs tests/relatorioGerencialCanonicoPostgres.test.mjs
~~~

Expected: PASS, including JSON assertions for 297/296/1/120/176 and the separate meta sources. Commit:

~~~powershell
git add supabase/migrations/20260811123000_relatorio_gerencial_integridade_hibrido.sql tests/relatorioGerencialCanonico.test.mjs tests/relatorioGerencialCanonicoPostgres.test.mjs
git commit -m "feat: publicar contrato canonico de metas e cobertura"
~~~

### Task 4: Lead ID escopado e auditável no sync de matrículas (RED → GREEN)

**Files:**
- Create: \`supabase/functions/_shared/lead-id-reconciliacao.ts\`
- Create: \`supabase/functions/_shared/lead-id-reconciliacao.test.ts\`
- Create: \`supabase/migrations/20260811131500_emusys_lead_id_alunos.sql\`
- Modify: \`supabase/functions/sync-matriculas-emusys/index.ts:929-1025,1080-1260\`
- Modify: \`supabase/functions/_shared/jornada-canonica.ts\`

- [x] **Step 1: Write pure RED tests for the reconciliation decision**

~~~ts
const unidade = "u-recreio";
assertEquals(decidirLeadId({ unidadeId: unidade, local: null, emusys: 701 }), { acao: "preencher", valor: 701 });
assertEquals(decidirLeadId({ unidadeId: unidade, local: 701, emusys: 701 }), { acao: "manter", valor: 701 });
assertEquals(decidirLeadId({ unidadeId: unidade, local: 700, emusys: 701 }), { acao: "auditar_divergencia", local: 700, remoto: 701 });
assertEquals(decidirLeadId({ unidadeId: "u-barra", local: null, emusys: 701 }), { acao: "preencher", valor: 701 });
~~~

Add cases proving a second course remains a separate journey row and that a homonymous name is never an input to this decision.

- [x] **Step 2: Run the helper test to verify RED**

~~~powershell
deno test --no-lock --allow-read supabase/functions/_shared/lead-id-reconciliacao.test.ts
~~~

Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement the helper and capture \`mat.aluno.lead_id\`**

~~~ts
export type LeadIdDecision =
  | { acao: "preencher"; valor: number }
  | { acao: "manter"; valor: number }
  | { acao: "auditar_divergencia"; local: number; remoto: number }
  | { acao: "sem_dado" };

export function decidirLeadId(input: { unidadeId: string; local: number | null; emusys: number | null }): LeadIdDecision {
  if (input.emusys == null) return { acao: "sem_dado" };
  if (input.local == null) return { acao: "preencher", valor: input.emusys };
  if (input.local === input.emusys) return { acao: "manter", valor: input.local };
  return { acao: "auditar_divergencia", local: input.local, remoto: input.emusys };
}
~~~

Use the Portuguese function name \`decidirLeadId\` consistently in implementation and tests. Extend \`JornadaMatriculaInput\` with \`emusysLeadId\` and map \`mat.aluno.lead_id\` in \`buildJornadaInputFromMatriculaApi\`. Select \`alunos.emusys_lead_id\` in the sync. Match local rows by \`(unidade_id, emusys_matricula_id)\` or the already resolved local aluno ID, never by name. Apply a null-only update when the exact unit-scoped row has no Lead ID; leave equal values untouched; insert/update a \`matriculas_divergencias\` record with field \`emusys_lead_id\` on conflict, preserving local value, for divergence. Keep dry-run/audit controls and do not alter fixed fields.

- [x] **Step 4: Run helper and existing journey tests**

~~~powershell
deno test --no-lock --allow-read supabase/functions/_shared/lead-id-reconciliacao.test.ts supabase/functions/_shared/jornada-canonica.test.ts
~~~

Expected: PASS. Commit:

~~~powershell
git add supabase/functions/_shared/lead-id-reconciliacao.ts supabase/functions/_shared/lead-id-reconciliacao.test.ts supabase/functions/_shared/jornada-canonica.ts supabase/functions/sync-matriculas-emusys/index.ts
git commit -m "feat: reconciliar lead id por unidade no sync de matriculas"
~~~

### Task 5: Priorizar ID exato na reconciliação de experimentais (RED → GREEN)

**Files:**
- Create: \`supabase/functions/_shared/experimental-reconciliacao.ts\`
- Create: \`supabase/functions/_shared/experimental-reconciliacao.test.ts\`
- Modify: \`supabase/functions/sync-presenca-emusys/index.ts:613-1155\`

- [x] **Step 1: Write RED cases for exact aula identity and fallback**

~~~ts
const candidatos = [{ id: 1, unidade_id: "u", emusys_aula_id: 991, emusys_lead_id: 700, data_experimental: "2026-07-10", horario_experimental: "10:00" }];
assertEquals(selecionarCandidatoExperimental({ unidadeId: "u", emusysAulaId: 991, emusysLeadId: 700, data: "2026-07-10", horario: "14:00" }, candidatos)?.id, 1);
assertEquals(selecionarCandidatoExperimental({ unidadeId: "u", emusysAulaId: 991, emusysLeadId: 700, data: "2026-07-10", horario: "10:30" }, candidatos)?.id, 1);
assertEquals(selecionarCandidatoExperimental({ unidadeId: "u", emusysAulaId: null, emusysLeadId: 700, data: "2026-07-10", horario: "10:00" }, candidatos)?.id, 1);
assertEquals(selecionarCandidatoExperimental({ unidadeId: "u", emusysAulaId: null, emusysLeadId: 700, data: "2026-07-11", horario: "10:00" }, candidatos), null);
~~~

- [x] **Step 2: Run RED**

~~~powershell
deno test --no-lock --allow-read supabase/functions/_shared/experimental-reconciliacao.test.ts
~~~

Expected: FAIL because no pure selector exists.

- [x] **Step 3: Implement exact-ID-first selection and wire it into the Edge**

Implement \`selecionarCandidatoExperimental\` with these ordered branches: exact unit plus \`emusys_aula_id\`; then exact unit plus Lead ID/date and stable fields; then tolerant time window only for records without aula ID. The exact aula branch must not compare hour, date, course or name. Keep the legacy path disabled when \`somenteIdentidadesEstaveis\` is true, and preserve audit status/error fields. Ensure the Supabase query always filters \`unidade_id\` and uses \`.maybeSingle()\` only after the exact key has been made unique.

- [x] **Step 4: Run focused presence tests and commit**

~~~powershell
deno test --no-lock --allow-read supabase/functions/_shared/experimental-reconciliacao.test.ts supabase/functions/_shared/experimental-snapshot.test.ts supabase/functions/_shared/emusys-aulas.test.ts
~~~

Expected: PASS, including the 240-minute and 30-minute exact-ID cases. Commit:

~~~powershell
git add supabase/functions/_shared/experimental-reconciliacao.ts supabase/functions/_shared/experimental-reconciliacao.test.ts supabase/functions/sync-presenca-emusys/index.ts
git commit -m "fix: priorizar identidade exata da aula na reconciliacao"
~~~

### Task 6: Comparabilidade e preservação histórica (RED → GREEN)

**Files:**
- Create: \`supabase/functions/_shared/relatorio-comparabilidade.ts\`
- Create: \`supabase/functions/_shared/relatorio-comparabilidade.test.ts\`
+ Modify: \`supabase/migrations/20260811123000_relatorio_gerencial_integridade_hibrido.sql\`
- Modify: \`tests/relatorioGerencialCanonicoPostgres.test.mjs\`

- [x] **Step 1: Write RED fingerprint eligibility tests**

~~~ts
const base = { status: "fechado", unidadeId: "u", dominio: "comercial", grao: "lead", populacao: "leads-base", regra: "v2", competencia: "2026-07", cobertura: 100 };
assertEquals(classificarComparabilidade(base, { ...base, competencia: "2026-06" }).disponibilidade, "disponivel");
assertEquals(classificarComparabilidade(base, { ...base, regra: "v1" }).motivo, "regra_incompativel");
assertEquals(classificarComparabilidade(base, { ...base, status: "aberto" }).motivo, "snapshot_nao_fechado");
assertEquals(classificarComparabilidade({ ...base, cobertura: 80 }, { ...base, cobertura: 100 }).motivo, "cobertura_insuficiente");
~~~

- [x] **Step 2: Run RED**

~~~powershell
deno test --no-lock --allow-read supabase/functions/_shared/relatorio-comparabilidade.test.ts
~~~

Expected: FAIL because the classifier does not exist.

- [x] **Step 3: Implement deterministic fingerprint comparison and producer wiring**

Export \`classificarComparabilidade(atual, anterior)\` and \`fingerprintComparabilidade(snapshot)\` using sorted JSON over unit/domain/grain/population/rule/competence/coverage policy. Return \`{ disponibilidade: "indisponivel", motivo }\` for missing, open, invalid, different-unit/domain/grain/rule or insufficient coverage. In the SQL RPC, populate the fields from closed document metadata; never compare a live/current payload to a closed snapshot. Keep official Health Score rows restricted to immutable closed/publicable snapshots and expose the partial section separately.

- [x] **Step 4: Add no-delete and dry-run regression checks**

Assert in the existing sync source/tests that current API absence has no \`delete\`/deleteMany path against \`aulas_emusys\`, \`aula_alunos_emusys\` or \`aluno_presenca\`. Add a pure \`classificarEstadoAula\` test for \`visto\`, \`ausente_no_snapshot_corrente\`, \`movido\`, \`cancelado\` and \`historico_preservado\`. If a future backfill script is added, require \`DRY_RUN=true\` as its default and assert no write method is called in the dry-run test; do not add a production backfill now.

- [x] **Step 5: Run isolated SQL/helper tests and commit**

~~~powershell
deno test --no-lock --allow-read supabase/functions/_shared/relatorio-comparabilidade.test.ts supabase/functions/_shared/experimental-snapshot.test.ts
node --test tests/relatorioGerencialCanonicoPostgres.test.mjs
~~~

Expected: PASS; snapshots remain immutable, history is not deleted, and incompatible periods return a structured reason. Commit:

~~~powershell
git add supabase/functions/_shared/relatorio-comparabilidade.ts supabase/functions/_shared/relatorio-comparabilidade.test.ts supabase/migrations/20260811123000_relatorio_gerencial_integridade_hibrido.sql tests/relatorioGerencialCanonicoPostgres.test.mjs
git commit -m "feat: bloquear comparativos sem fechamento equivalente"
~~~

### Task 7: Atualizar documentação e evidência de auditoria

**Files:**
- Modify: \`docs/REGRAS-DE-NEGOCIO.md\`
- Modify: \`docs/METRICAS.md\`
- Modify: \`docs/MAPA-INTEGRACAO-EMUSYS.md\`
- Modify: \`docs/MAPA-SISTEMA.md\`
- Create: \`docs/superpowers/evidence/2026-08-10-relatorio-integridade-gates.md\`

- [x] **Step 1: Documentar fontes e grãos**

Document \`metas_kpi\` versus Fideliza+/Matriculador+, the 297/296/1/120/176 coverage interpretation, Lead ID scope \`(unidade_id, emusys_*)\`, experimental exact-key precedence, ranking official/partial semantics, and the rule that current API absence never deletes historical rows.

- [x] **Step 2: Record the local audit matrix**

Create a table in the evidence file with each of the six approved priorities, source file/RPC, test name, result and remaining rollout gate. Explicitly mark remote migration application, backfill and deployment as \`pendente de aprovação\`, not as completed.

- [x] **Step 3: Commit documentation**

~~~powershell
git add docs/REGRAS-DE-NEGOCIO.md docs/METRICAS.md docs/MAPA-INTEGRACAO-EMUSYS.md docs/MAPA-SISTEMA.md docs/superpowers/evidence/2026-08-10-relatorio-integridade-gates.md
git commit -m "docs: registrar fontes graos e gates do relatorio"
~~~

### Task 8: Final verification and rollout boundary

**Files:**
- Read: all changed files and \`git diff origin/main...HEAD\`

- [x] **Step 1: Run all local tests with frozen dependency state**

~~~powershell
npm test
node --test tests/relatorioGerencialCanonico.test.mjs tests/relatorioGerencialCanonicoPostgres.test.mjs
deno test --no-lock --allow-read tests/relatorioGerencialRender.test.ts supabase/functions/_shared/lead-id-reconciliacao.test.ts supabase/functions/_shared/jornada-canonica.test.ts supabase/functions/_shared/experimental-reconciliacao.test.ts supabase/functions/_shared/relatorio-comparabilidade.test.ts supabase/functions/_shared/experimental-snapshot.test.ts supabase/functions/_shared/emusys-aulas.test.ts
npm run build
~~~

Expected: every command exits 0. If Deno is unavailable, report the exact command/error and do not claim completion.

- [x] **Step 2: Audit migration and destructive-operation boundaries**

~~~powershell
git diff --check
rg -n "CREATE OR REPLACE FUNCTION public\.get_relatorio_gerencial_canonico_v1|revoke all on function public\.get_relatorio_gerencial_canonico_v1|grant execute on function public\.get_relatorio_gerencial_canonico_v1|DELETE FROM|\.delete\(" supabase/migrations/20260811123000_relatorio_gerencial_integridade_hibrido.sql supabase/functions/sync-matriculas-emusys/index.ts supabase/functions/sync-presenca-emusys/index.ts
git status --short --branch
~~~

Expected: RPC ACL names only \`authenticated, service_role\`; no new destructive history operation; worktree clean after the final commit.

- [x] **Step 3: Stop at the approved rollout gate**

Do not run \`supabase db push\`, \`supabase functions deploy\`, Vercel deployment, remote backfill, migration repair or real-case write. The handoff must state the exact commit, test output and the separate approvals still required for migration/backfill/publication.

## Self-review against the approved specification

* Metas sources and the two program blocks are covered by Tasks 1–3.
* Course-interest coverage and existing distributions are covered by Tasks 1–3.
* Hybrid official/partial ranking and narrative temporal guard are covered by Tasks 1–2 and 6.
* Lead ID, unit scope, homonyms and multi-course preservation are covered by Task 4.
* Exact aula identity before time fallback is covered by Task 5.
* Equivalent closing fingerprints, immutable snapshots and no destructive history sync are covered by Task 6.
* Documentation, ACL review, reproducible tests and rollout separation are covered by Tasks 7–8.
* No placeholders or unspecified implementation branches remain; every code change has a named file, RED command, GREEN command and expected result.
