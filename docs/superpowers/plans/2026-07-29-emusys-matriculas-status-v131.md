# Emusys Matriculas Status v1.3.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Emusys v1.3.1 matricula lifecycle the canonical current-state source and keep active, locked, interrupted and concluded populations consistent across database, reports, KPIs, dashboards, professor portfolios, LA Teacher and Fabio.

**Architecture:** Preserve every current Emusys state in a backend-only raw table keyed by unit and matricula, resolve it through one shared lifecycle contract, and publish a semantic operational view. Migrate current/live consumers to that contract while leaving closed historical snapshots immutable and retaining existing tables as compatibility projections.

**Tech Stack:** Supabase PostgreSQL, Deno Edge Functions, TypeScript, React 19, Vite, Node test runner, Deno test runner, Playwright.

---

### Task 1: Freeze the baseline and consumer inventory

**Files:**
- Create: `docs/auditorias/2026-07-29-emusys-matriculas-v131-baseline.md`
- Create: `tests/emusysMatriculasStatusV131Inventory.test.mjs`
- Read: `docs/METRICAS.md`
- Read: `docs/MAPA-SISTEMA.md`
- Read: `docs/MAPA-INTEGRACAO-EMUSYS.md`

- [ ] **Step 1: Write the failing inventory contract**

Create a Node contract test that scans live frontend, migrations and Edge Functions and asserts that every direct `trancado` inclusion is classified in the audit inventory.

- [ ] **Step 2: Run the inventory test and verify it fails**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Inventory.test.mjs
```

Expected: FAIL listing unclassified current consumers.

- [ ] **Step 3: Record the read-only baseline**

Capture, per unit:

```sql
select unidade_id, status, count(*) from public.alunos
group by unidade_id, status order by unidade_id, status;

select unidade_id, status_matricula, count(*)
from public.aluno_jornada_matricula_disciplina
group by unidade_id, status_matricula
order by unidade_id, status_matricula;
```

Record active, paying, MRR, ticket, delinquency, portfolio and current-lock outputs from the live RPCs used by Dashboard, Analytics, Administrative, Students and Professors.

- [ ] **Step 4: Complete the consumer inventory**

For each occurrence, record:

```text
consumer | source | current rule | desired rule | migration task | validation
```

Classify closed snapshots as immutable, current/live consumers as migrate, and dead objects as legacy.

- [ ] **Step 5: Run the inventory test**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Inventory.test.mjs
```

Expected: PASS with no unclassified current consumer.

- [ ] **Step 6: Commit**

```powershell
git add docs/auditorias/2026-07-29-emusys-matriculas-v131-baseline.md tests/emusysMatriculasStatusV131Inventory.test.mjs
git commit -m "test(emusys): freeze matricula lifecycle baseline"
```

### Task 2: Add the shared lifecycle resolver

**Files:**
- Create: `supabase/functions/_shared/emusys-matricula-lifecycle.ts`
- Create: `supabase/functions/_shared/emusys-matricula-lifecycle.test.ts`
- Modify: `supabase/functions/_shared/nao-renovacao-canonica.ts`
- Modify: `tests/naoRenovacaoEmusys.test.mjs`

- [ ] **Step 1: Write failing resolver tests**

Cover:

```typescript
assertEquals(resolveEmusysMatriculaLifecycle({ status: 'ativa' }).localStatus, 'ativo');
assertEquals(resolveEmusysMatriculaLifecycle({ status: 'trancada' }).localStatus, 'trancado');
assertEquals(resolveEmusysMatriculaLifecycle({ status: 'inativa', motivo_inativa: 'interrompida' }).localStatus, 'evadido');
assertEquals(resolveEmusysMatriculaLifecycle({ status: 'inativa', motivo_inativa: 'concluida' }).localStatus, 'inativo');
assertEquals(resolveEmusysMatriculaLifecycle({ status: 'inesperado' }).automaticTransition, false);
```

Also test normalized accents/case, missing `motivo_inativa`, legacy `finalizada`, lock details and unit-scoped identity.

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
deno test --allow-env supabase/functions/_shared/emusys-matricula-lifecycle.test.ts
node --test tests/naoRenovacaoEmusys.test.mjs
```

Expected: FAIL because the resolver and new conclusion contract do not exist.

- [ ] **Step 3: Implement the pure resolver**

The resolver returns:

```typescript
type EmusysMatriculaLifecycleResolution = {
  rawStatus: 'ativa' | 'trancada' | 'inativa' | 'finalizada' | 'desconhecido';
  rawReason: 'interrompida' | 'concluida' | null;
  localStatus: 'ativo' | 'trancado' | 'evadido' | 'inativo' | null;
  journeyStatus: 'ativa' | 'trancada' | 'finalizada' | 'desconhecido';
  movementKind: 'evasao' | 'nao_renovacao' | 'trancamento' | null;
  automaticTransition: boolean;
  auditReason: string | null;
};
```

Unknown and ambiguous values return `localStatus=null`, `automaticTransition=false`.

- [ ] **Step 4: Update the non-renewal predicate**

Accept `inativa/concluida` and the explicit legacy conclusion alias. Never convert an interrupted or ambiguous matricula into non-renewal.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
deno test --allow-env supabase/functions/_shared/emusys-matricula-lifecycle.test.ts
node --test tests/naoRenovacaoEmusys.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/_shared/emusys-matricula-lifecycle.ts supabase/functions/_shared/emusys-matricula-lifecycle.test.ts supabase/functions/_shared/nao-renovacao-canonica.ts tests/naoRenovacaoEmusys.test.mjs
git commit -m "feat(emusys): resolve canonical matricula lifecycle"
```

### Task 3: Add raw current-state storage and semantic projection

**Files:**
- Create: `supabase/migrations/20260729120000_emusys_matriculas_estado_atual.sql`
- Create: `tests/emusysMatriculasEstadoAtualSchema.test.mjs`

- [ ] **Step 1: Write the failing schema contract**

Assert the migration creates:

```text
emusys_matriculas_estado_atual
vw_aluno_estado_operacional_canonico
upsert_emusys_matriculas_estado_atual
```

Also assert composite identity, RLS, payload privacy, status checks, boolean semantic flags and no grant to `anon`.

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
node --test tests/emusysMatriculasEstadoAtualSchema.test.mjs
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the additive schema**

Create the raw table keyed by `(unidade_id, emusys_matricula_id)`, indexes by student/status, a service-role materializer and the semantic view. The view must set every active/portfolio/finance boolean to true only for resolved `ativa`.

- [ ] **Step 4: Apply the security checklist**

Verify:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name='emusys_matriculas_estado_atual';
```

The raw table has no `anon` or `authenticated` access. Revoke RPC materialization from public/anon/authenticated; retain authenticated execution only if a helper is used by a frontend-written CHECK, trigger or default.

- [ ] **Step 5: Run the schema contract**

Run:

```powershell
node --test tests/emusysMatriculasEstadoAtualSchema.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260729120000_emusys_matriculas_estado_atual.sql tests/emusysMatriculasEstadoAtualSchema.test.mjs
git commit -m "feat(emusys): add canonical current matricula state"
```

### Task 4: Preserve lifecycle fields in the canonical journey

**Files:**
- Modify: `supabase/functions/_shared/jornada-canonica.ts`
- Modify: `supabase/functions/_shared/jornada-canonica.test.ts`
- Modify: `scripts/tests/jornada-canonica.test.ts`
- Create: `supabase/migrations/20260729121000_jornada_status_emusys_v131.sql`

- [ ] **Step 1: Add failing tests**

Assert API and webhook inputs preserve:

```text
status_emusys
motivo_inativa
trancamento_id
trancamento_motivo
trancamento_data_inicial
trancamento_data_final
```

Assert webhook payloads that omit these fields do not erase values previously written by the GET sync.

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
deno test --allow-env supabase/functions/_shared/jornada-canonica.test.ts
npx tsx --test scripts/tests/jornada-canonica.test.ts
```

Expected: FAIL on the new lifecycle columns.

- [ ] **Step 3: Add columns and update builders**

Add the fields to the journey table and payload builder. Resolve `inativa` through the shared resolver. Keep the journey public status vocabulary compatible (`ativa`, `trancada`, `finalizada`, `desconhecido`).

- [ ] **Step 4: Protect sparse webhook updates**

Only include lifecycle keys in the upsert when the payload actually contains them.

- [ ] **Step 5: Run the focused tests**

Run the two commands from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/_shared/jornada-canonica.ts supabase/functions/_shared/jornada-canonica.test.ts scripts/tests/jornada-canonica.test.ts supabase/migrations/20260729121000_jornada_status_emusys_v131.sql
git commit -m "feat(alunos): preserve Emusys lifecycle in journey"
```

### Task 5: Update the GET sync without running it

**Files:**
- Modify: `supabase/functions/sync-matriculas-emusys/index.ts`
- Create: `tests/syncMatriculasEmusysStatusV131.test.mjs`

- [ ] **Step 1: Write failing sync contracts**

Assert:

```text
no STATUS_API_PARA_NOSSO fallback to ativo
status=todas is fetched
raw rows are bulk-upserted
inativa/concluida uses non-renewal
inativa/interrompida proposes evasion
ambiguous rows enter audit
GET does not create historical movements without an event date
status-fixed local rows are not overwritten
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
node --test tests/syncMatriculasEmusysStatusV131.test.mjs
```

Expected: FAIL on fallback and missing raw-state materialization.

- [ ] **Step 3: Replace the inline status map**

Use the shared resolver for filtering, suggestion generation, active-only enrichments and reconciliation.

- [ ] **Step 4: Upsert raw state in bounded batches**

Call the service-role materializer with complete pages. Track fetched, stored, linked, ambiguous and rejected counts per unit.

- [ ] **Step 5: Keep GET reconciliation event-safe**

Update current state and journey but do not insert an evasion/trancamento/non-renewal movement unless the event date is supplied by a real event source.

- [ ] **Step 6: Run focused tests and type-check**

Run:

```powershell
node --test tests/syncMatriculasEmusysStatusV131.test.mjs
deno check supabase/functions/sync-matriculas-emusys/index.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add supabase/functions/sync-matriculas-emusys/index.ts tests/syncMatriculasEmusysStatusV131.test.mjs
git commit -m "fix(emusys): sync matricula lifecycle v1.3.1"
```

### Task 6: Split webhook conclusion from interruption

**Files:**
- Modify: `supabase/functions/processar-matricula-emusys/index.ts`
- Create: `tests/processarMatriculaLifecycleV131.test.mjs`

- [ ] **Step 1: Write failing webhook contracts**

Cover:

```text
trancamento -> trancado + movement
conclusion/non-renewal -> inativo + nao_renovacao
interruption motive -> evadido + evasao
missing/ambiguous motive -> audit only
duplicate event -> idempotent
```

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
node --test tests/processarMatriculaLifecycleV131.test.mjs
```

Expected: FAIL because all finalizations currently call the evasion handler.

- [ ] **Step 3: Route events through the shared resolver**

Use structured reason normalization. Preserve existing webhook logging and idempotency.

- [ ] **Step 4: Remove automatic ambiguous evasion**

Persist the raw event and divergence, leave local status unchanged, and return an auditable result.

- [ ] **Step 5: Run focused tests and type-check**

Run:

```powershell
node --test tests/processarMatriculaLifecycleV131.test.mjs
deno check supabase/functions/processar-matricula-emusys/index.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/processar-matricula-emusys/index.ts tests/processarMatriculaLifecycleV131.test.mjs
git commit -m "fix(emusys): distinguish conclusion from interruption"
```

### Task 7: Migrate database live/current consumers

**Files:**
- Create: `supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql`
- Create: `tests/emusysMatriculasStatusV131Consumers.test.mjs`

- [ ] **Step 1: Write failing database consumer contracts**

Assert current definitions used by the app:

```text
exclude resolved trancada from active, paying, MRR, ticket, delinquency and portfolio
expose currently_locked separately
retain trancamentos_in_period from movimentacoes_admin
keep concluded separate from interrupted
do not alter fechamento_mensal_snapshots or closed Health Score snapshots
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Consumers.test.mjs
```

Expected: FAIL on current active/trancado unions.

- [ ] **Step 3: Redefine canonical live RPCs and views**

Migrate the latest live definitions for:

```text
get_kpis_alunos_admin_operacional
get_kpis_alunos_canonicos
get_kpis_alunos_financeiro_vivo_canonico
get_kpis_alunos_vinculos_vivo_canonico
vw_dashboard_unidade
vw_kpis_gestao_mensal
vw_aluno_sucesso_lista
vw_kpis_retencao_mensal
get_programa_fideliza_dados
current professor/Fabio/LA Teacher portfolio read models
current contracts and churn eligibility
```

Only redefine objects confirmed as live consumers. Keep legacy functions under their legacy names.

- [ ] **Step 4: Add current-lock outputs**

Provide one authenticated read RPC returning current locks with reason and dates, unit-scoped by the existing permission model.

- [ ] **Step 5: Apply grants safely**

Revoke public/anon only from RPC/materializer entry points. Do not remove authenticated execution from helpers used by frontend-written CHECK constraints, triggers or defaults.

- [ ] **Step 6: Run contract tests**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Consumers.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql tests/emusysMatriculasStatusV131Consumers.test.mjs
git commit -m "fix(metricas): align live matricula lifecycle consumers"
```

### Task 8: Migrate frontend calculations and administrative UX

**Files:**
- Modify: `src/lib/kpisAlunosVivosCanonicos.ts`
- Modify: `src/components/App/Administrativo/AdministrativoPage.tsx`
- Modify: `src/components/App/Administrativo/ModalRelatorio.tsx`
- Modify: `src/components/App/Alunos/AlunosPage.tsx`
- Modify: `src/components/App/Professores/TabCarteiraProfessores.tsx`
- Modify: `src/components/GestaoMensal/TabGestao.tsx`
- Modify: `src/components/GestaoMensal/TabRetencao.tsx`
- Create: `tests/emusysMatriculasStatusV131Frontend.test.mjs`

- [ ] **Step 1: Write failing frontend contracts**

Assert:

```text
no live KPI helper treats trancado as active
Administrative separates Ativos agora, Trancados agora and Trancamentos no periodo
manual unfreeze never updates by name alone
student and professor portfolios do not count locked rows
UI does not render missing data as zero
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Frontend.test.mjs
```

Expected: FAIL on active/trancado filters and unsafe unfreeze.

- [ ] **Step 3: Consume canonical RPC outputs**

Remove duplicated status arithmetic where a canonical RPC exists. Keep current locks as a separate list and card.

- [ ] **Step 4: Fix manual status actions**

Use local student ID or unit plus Emusys matricula ID. If the current Emusys state disagrees, show the reconciliation state rather than silently overriding it.

- [ ] **Step 5: Update labels and tooltips**

Use:

```text
Ativos agora
Trancados agora
Trancamentos no periodo
Interrupcoes definitivas
Contratos concluidos
```

- [ ] **Step 6: Run tests and build**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Frontend.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/kpisAlunosVivosCanonicos.ts src/components/App/Administrativo src/components/App/Alunos/AlunosPage.tsx src/components/App/Professores/TabCarteiraProfessores.tsx src/components/GestaoMensal tests/emusysMatriculasStatusV131Frontend.test.mjs
git commit -m "fix(ui): separate active and locked matriculas"
```

### Task 9: Migrate reports, AI inputs and metric documentation

**Files:**
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`
- Modify: `supabase/functions/gemini-relatorio-gerencial/index.ts`
- Modify: `supabase/functions/bi-agent-lamusic/index.ts`
- Modify: `supabase/functions/bi-agent-lamusic/tools.ts`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`
- Create: `tests/emusysMatriculasStatusV131Reports.test.mjs`

- [ ] **Step 1: Write failing report contracts**

Assert that report inputs use the canonical current-state RPCs and that current locks are not labeled as active or as period movements.

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Reports.test.mjs
```

Expected: FAIL on old active/trancado report language.

- [ ] **Step 3: Migrate report inputs**

Use canonical RPC values. Do not let generative report code recalculate status semantics.

- [ ] **Step 4: Update metric contracts**

Replace the old active/trancado rule and document the Emusys v1.3.1 lifecycle, current-lock versus period-lock distinction and closed-snapshot policy.

- [ ] **Step 5: Run report contracts and Edge checks**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131Reports.test.mjs
deno check supabase/functions/relatorio-admin-whatsapp/index.ts
deno check supabase/functions/gemini-relatorio-gerencial/index.ts
deno check supabase/functions/bi-agent-lamusic/index.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/relatorio-admin-whatsapp supabase/functions/gemini-relatorio-gerencial supabase/functions/bi-agent-lamusic docs/METRICAS.md docs/MAPA-SISTEMA.md docs/MAPA-INTEGRACAO-EMUSYS.md tests/emusysMatriculasStatusV131Reports.test.mjs
git commit -m "fix(relatorios): use canonical matricula lifecycle"
```

### Task 10: Verify locally before remote writes

**Files:**
- Modify only files required by failing checks.

- [ ] **Step 1: Run all focused lifecycle tests**

Run:

```powershell
node --test tests/emusysMatriculasStatusV131*.test.mjs tests/naoRenovacaoEmusys.test.mjs
deno test --allow-env supabase/functions/_shared/emusys-matricula-lifecycle.test.ts supabase/functions/_shared/jornada-canonica.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the relevant regression suite**

Run:

```powershell
node --test tests/alunoSegurancaP0P1.test.mjs tests/laTeacherCarteira.test.mjs tests/fabioConsumidoresPedagogicosCanonicos.test.mjs tests/professoresCarteiraSegmentosCanonicos.test.mjs tests/regressoesComercialPermanencia.test.mjs scripts/tests/relatorioGerencialKpisAlunosCanonicosSemDivergencia.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: successful Vite build.

- [ ] **Step 4: Inspect migrations**

Run local SQL lint if PostgreSQL is available. If the local database is unavailable, record that limitation and validate syntax on a disposable Supabase branch before production.

### Task 11: Apply migrations and deploy Edge Functions

**Files:**
- Apply the three new migration files.
- Deploy: `sync-matriculas-emusys`
- Deploy: `processar-matricula-emusys`
- Deploy report functions changed in Task 9.

- [ ] **Step 1: Inspect production health**

Read Postgres/API/Edge logs and database advisors. Stop on current platform errors unrelated to the migration that would invalidate the rollout.

- [ ] **Step 2: Verify migration order and remote drift**

Compare local migration names with remote migration history. Do not use `supabase db push` when history is divergent.

- [ ] **Step 3: Apply additive migrations in order**

Apply:

```text
20260729120000_emusys_matriculas_estado_atual.sql
20260729121000_jornada_status_emusys_v131.sql
20260729122000_estado_operacional_consumidores_vivos.sql
```

- [ ] **Step 4: Verify security and definitions**

Inspect RLS, grants and `pg_get_functiondef`/`pg_get_viewdef`. Confirm no frontend-written CHECK/trigger/default helper lost authenticated execution.

- [ ] **Step 5: Deploy changed Edge Functions**

Preserve each function's current JWT/authentication mode. Do not weaken authentication.

### Task 12: Reconcile unit by unit and validate the cutover

**Files:**
- Create: `docs/auditorias/2026-07-29-emusys-matriculas-v131-execucao.md`

- [ ] **Step 1: Run Barra sync**

Capture before/after active, locked, interrupted and concluded counts. Verify payload count equals raw-state table count for the unit.

- [ ] **Step 2: Run Recreio sync**

Repeat the same checks.

- [ ] **Step 3: Run Campo Grande sync**

Repeat the same checks.

- [ ] **Step 4: Audit transitions**

List every local status change with unit, matricula, old state, new state, raw reason and guard result. Investigate only values that contradict the approved mapping.

- [ ] **Step 5: Recompute open/current July only**

Refresh live caches and open July snapshots that are explicitly current. Compare checksums/counts proving closed historical snapshots did not change.

- [ ] **Step 6: Run cross-surface parity queries**

For each unit, confirm the same active/pay/portfolio/locked totals in canonical RPCs consumed by Administrative, Students, Dashboard, Analytics, Professors, LA Teacher and Fabio.

- [ ] **Step 7: Write the execution report**

Record before/after counts, impacted consumers, security verification, sync results, any ambiguous records and rollback references.

### Task 13: Browser validation

**Files:**
- Modify only files required by observed regressions.

- [ ] **Step 1: Start the application**

Run:

```powershell
npm run dev -- --host 127.0.0.1 --port 5175
```

- [ ] **Step 2: Validate Administrative**

Check desktop and mobile:

```text
Ativos agora
Trancados agora
Trancamentos no periodo
Interrupcoes definitivas
Contratos concluidos
```

Open KPI details and report modal and compare to SQL.

- [ ] **Step 3: Validate Students, Dashboard and Analytics**

For Barra, Recreio and Campo Grande, compare active, paying, MRR, ticket, delinquency and current-lock values.

- [ ] **Step 4: Validate Professors**

Confirm locked students do not enter portfolio, average/class occupancy or Health Score current student count.

- [ ] **Step 5: Validate reports**

Generate Administrative and managerial reports and confirm their totals match the UI and canonical RPCs.

- [ ] **Step 6: Check browser errors**

Confirm no console errors, failed network requests, layout overflow or stale cache mixes old and new status rules.

### Task 14: Final regression, versioning and handoff

**Files:**
- Update: `docs/auditorias/2026-07-29-emusys-matriculas-v131-execucao.md`

- [ ] **Step 1: Run final verification**

Run:

```powershell
node --test tests/*.test.mjs
npm run build
```

Run the Deno focused suite from Tasks 2 and 4.

- [ ] **Step 2: Inspect Git scope**

Confirm no unrelated user/Hugo/Alfredo changes were overwritten and no credentials or raw personal payloads entered the repository.

- [ ] **Step 3: Commit remaining evidence**

```powershell
git add docs/auditorias/2026-07-29-emusys-matriculas-v131-execucao.md
git commit -m "docs(emusys): report matricula lifecycle cutover"
```

- [ ] **Step 4: Synchronize safely**

Fetch remote, inspect incoming commits, integrate without discarding local work, rerun the focused tests and build, then push the verified branch.

