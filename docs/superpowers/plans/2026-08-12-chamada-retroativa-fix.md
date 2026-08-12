# Chamada retroativa fallback Emusys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir a decisão humana da secretaria quando uma chamada retroativa parte de um fallback `ausente` do Emusys.

**Architecture:** O caminho permanece centralizado na RPC security-definer `app_registrar_chamada_agenda`. A função continua usando `status_presenca` como decisão final e `status`/`emusys_presenca_bruta` como evidência; somente o guard de idempotência muda para não confundir fallback com decisão humana. O frontend não será alterado.

**Tech Stack:** PostgreSQL 17, Supabase migrations, Node.js `node:test`, Docker PostgreSQL fixture, React/TypeScript/Vite.

---

### Task 1: Regression fixture for retroactive fallback promotion

**Files:**
- Create: `tests/chamadaRetroativaPostgres.test.mjs`
- Read: `supabase/migrations/20260811130700_chamada_toggle_indeterminado.sql`
- Read, when present: `supabase/migrations/20260812171943_chamada_retroativa_fallback_emusys.sql`

- [x] **Step 1: Write the failing test**

Create a Node test that starts an isolated `postgres:17-alpine` container, creates only the tables/columns and helper functions used by `app_registrar_chamada_agenda`, loads the current production function from `20260811130700_chamada_toggle_indeterminado.sql`, and inserts:

```sql
insert into public.aluno_presenca (
  id, aluno_id, aula_emusys_id, unidade_id, status, status_presenca, respondido_por
) values (
  1, 10, 100, '11111111-1111-1111-1111-111111111111',
  'ausente', null, 'emusys'
);
```

Invoke:

```sql
select public.app_registrar_chamada_agenda(
  '[{"aula_emusys_id":100,"aluno_id":10,"status":"falta"}]'::jsonb
);
```

Assert the returned JSON has `atualizados = 1`, `erros = []`, and the row has `status_presenca = 'falta'` and `respondido_por = 'agenda_secretaria'`. Also call the RPC a second time and assert `atualizados = 0`, proving a human decision remains idempotent.

- [x] **Step 2: Run the test and verify it fails for the expected reason**

Run:

```powershell
node --test tests/chamadaRetroativaPostgres.test.mjs
```

Expected before the fix: the test reaches the RPC but reports `atualizados = 0` and the row remains with `status_presenca = null`, demonstrating the premature `continue`.

### Task 2: Apply the minimal SQL correction

**Files:**
- Create: `supabase/migrations/20260812171943_chamada_retroativa_fallback_emusys.sql`

- [x] **Step 1: Recreate the RPC with the corrected idempotency guard**

Copy the current `app_registrar_chamada_agenda(jsonb)` definition into the new migration without changing validation, permissions, audit, justification, or repository behavior. Replace only:

```sql
if v_status_anterior is not distinct from v_status then
  continue; -- nada mudou, idempotente
end if;
```

with:

```sql
-- O fallback do Emusys pode parecer "falta", mas ainda não é decisão humana.
-- Só uma decisão final já preenchida pode ser idempotente.
if v_existente.status_presenca is not null
   and v_status_anterior is not distinct from v_status then
  continue;
end if;
```

Keep the existing grants for `authenticated` and revoke `public, anon` exactly as in the current RPC migration.

- [x] **Step 2: Make the fixture load the correction after the baseline function**

When the new migration exists, append its SQL to the fixture setup after the baseline function. Do not change the assertions: they must prove the externally visible behavior.

- [x] **Step 3: Run the regression test and verify it passes**

Run:

```powershell
node --test tests/chamadaRetroativaPostgres.test.mjs
```

Expected: all fixture assertions pass with zero failures.

### Task 3: Repository verification

**Files:**
- No additional production files.

- [x] **Step 1: Run the focused test plus the relevant existing UI/static tests**

Run:

```powershell
node --test tests/chamadaRetroativaPostgres.test.mjs tests/conciliacaoPresencasUI.test.mjs
```

- [x] **Step 2: Run TypeScript and production build checks**

Run:

```powershell
npx tsc --noEmit -p tsconfig.json
npm run build
git diff --check
```

Expected: build and diff checks exit code 0. The repository-wide TypeScript command still reports the pre-existing syntax error in `scripts/importar_historico_ltv.js:29-36`, which is outside this change.

### Task 4: Remote migration and authenticated E2E gate

**External target:** Supabase project `ouqwbbermlzqqvtqwlul` and the deployed LA Report Agenda.

- [x] **Step 1: Apply only the reviewed migration to Supabase**

Use the Supabase migration operation with name `20260812150000_chamada_retroativa_fallback_emusys`, then query the remote function definition and migration history to confirm it is present. The remote history recorded version `20260812171943`. Do not run a data backfill.

- [x] **Step 2: Open the deployed Agenda and authenticate**

Use the credentials supplied by the user only through the browser input fields. Never print, store, or include the password in test output.

- [x] **Step 3: Execute the real retroactive workflow**

Open the date containing the existing Vanessa fallback record, locate the student card, click `Falta`, and confirm:

- the toast indicates successful registration;
- the `Falta` button remains visually active;
- the card origin changes to `Secretaria`;
- a full page reload keeps the `Falta` state active.

Use a screenshot/DOM observation as evidence and do not create synthetic records or send messages.

- [x] **Step 4: Query the exact row after the E2E action**

Run a read-only query for the specific existing row and confirm `status_presenca='falta'` and `respondido_por='agenda_secretaria'`. Report the before/after state without exposing credentials.

### Task 5: Commit and handoff

- [x] **Step 1: Review the diff and migration history locally**

Run:

```powershell
git diff --stat
git diff -- supabase/migrations/20260812171943_chamada_retroativa_fallback_emusys.sql tests/chamadaRetroativaPostgres.test.mjs
git status --short --branch
```

- [x] **Step 2: Commit the focused change**

```powershell
git add docs/superpowers/specs/2026-08-12-chamada-retroativa-design.md docs/superpowers/plans/2026-08-12-chamada-retroativa-fix.md supabase/migrations/20260812171943_chamada_retroativa_fallback_emusys.sql tests/chamadaRetroativaPostgres.test.mjs
git commit -m "fix(chamada): persist retroactive Emusys fallback decision"
```

- [x] **Step 3: Report exact branch, commit, remote migration, E2E evidence, and worktree status**

Do not claim completion unless the focused test, build, remote verification, and E2E evidence have fresh successful output.
