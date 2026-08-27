# Convergência de presença — Fase 4: hardening retrocompatível Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refazer as proteções de roster, concorrência, idempotência e Fábio/LA Teacher como expansão retrocompatível, sem reutilizar migrations WIP fora de ordem nem interromper clientes antigos.

**Architecture:** Quatro migrations novas entram primeiro apenas em PostgreSQL descartável: expansão de roster v2, locks/core internos, portas v2 paralelas e publicação canônica governada. As Edge Functions operam em modo dual e o LA Teacher adota o overload já existente com `p_request_id`; assinaturas antigas permanecem vigentes durante o rollout.

**Tech Stack:** Supabase CLI, PostgreSQL 17, advisory locks, Deno/TypeScript Edge Functions, React/Vite/Vitest no LA Teacher, Node test runner e Git worktrees.

---

## Material de referência proibido para publicação

The preserved WIP branch contains four reference-only migrations:

- `20260827143000_presenca_roster_identidade_local_fail_closed.sql`
- `20260827143100_presenca_comando_portas_reservadas_fail_closed.sql`
- `20260827143200_presenca_slot_escrita_fail_closed.sql`
- `20260827143300_la_teacher_legado_adaptador_canonico.sql`

Do not cherry-pick, rename or apply them. They invalidate roster too early,
expose ports while locks are being assembled, clone functions with
`pg_get_functiondef`, convert transient errors with `WHEN OTHERS`, and derive a
permanent UUID that conflates a legitimate A → B → A sequence.

## Compatibility matrix required before remote writes

| Database | Edge | LA Report | LA Teacher | Required result |
|---|---|---|---|---|
| current | current | Hugo/Fase 3 | current two-arg RPC | unchanged |
| expanded | current | Hugo/Fase 3 | current two-arg RPC | unchanged |
| expanded | dual | Hugo/Fase 3 | current two-arg RPC | unchanged |
| expanded | dual | Hugo/Fase 3 | new three-arg RPC | receipt enabled |

The new Edge must probe v2 and fall back to v1 only when the v2 function is
absent. It cannot require v2 unconditionally.

## Mapa de arquivos

### LA Report — criar

- four CLI-generated migrations with suffixes:
  `presenca_roster_v2_expansao_aditiva.sql`,
  `presenca_slot_lock_core.sql`,
  `presenca_portas_reservadas_duais.sql`, and
  `presenca_roster_v2_publicacao_gatada.sql`.
- `tests/presencaHardeningCompatibilidadePostgres.test.mjs`
- `tests/presencaHardeningAclPostgres.test.mjs`
- `docs/audits/2026-08-27-presenca-hardening-preflight.md`

### LA Report — modificar

- `supabase/functions/_shared/presenca-sync-run.ts`
- `supabase/functions/_shared/reconciliacao-grade-snapshot.ts`
- `supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts`
- `supabase/functions/sync-grade-futura-emusys/index.ts`
- `supabase/functions/sync-presenca-emusys/index.ts`
- `tests/presencaMigrationReleaseOrder.test.mjs`
- `tests/presencaProfessorComandoAuditoriaPostgres.test.mjs`
- `tests/presencaRosterOperacionalPostgres.test.mjs`
- `tests/presencaSyncOrquestracao.test.mjs`
- `tests/reconciliacaoGradeSnapshotContrato.test.mjs`

### LA Teacher — worktree separada

- Create: `D:\la-teacher-worktrees\presenca-request-id\src\lib\presencaPedido.ts`
- Create: `D:\la-teacher-worktrees\presenca-request-id\src\lib\presencaPedido.test.ts`
- Modify: `D:\la-teacher-worktrees\presenca-request-id\src\lib\api.ts`
- Create: `D:\la-teacher-worktrees\presenca-request-id\src\lib\api.test.ts`
- Modify: `D:\la-teacher-worktrees\presenca-request-id\src\types\db.ts`

## Task 1: Atualizar documentação, CLI e ledger

**Files:**
- Create: `docs/audits/2026-08-27-presenca-hardening-preflight.md`

- [ ] **Step 1: Read only official current documentation**

Fetch and inspect:

```text
https://supabase.com/changelog.md
https://supabase.com/docs/reference/cli/introduction
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/functions
```

Search for `breaking-change`, CLI migrations, Edge Functions, Postgres, RLS and
function privileges. Record every relevant entry and URL in the preflight.

- [ ] **Step 2: Discover commands instead of guessing syntax**

Run:

```powershell
npx supabase --version
npx supabase --help
npx supabase migration --help
npx supabase migration new --help
npx supabase migration list --help
npx supabase db push --help
npx supabase db lint --help
deno --version
node --version
docker --version
```

Expected: all tools respond; record exact versions.

- [ ] **Step 3: Re-read ledger and live overloads**

Run `npx supabase migration list` and this read-only SQL on
`ouqwbbermlzqqvtqwlul`:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 10;

select p.oid::regprocedure::text as assinatura, p.prosecdef, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'app_registrar_presencas_aula',
    'app_criar_comando_presenca_v1',
    'app_aplicar_comando_presenca_v1',
    'fabio_registrar_presencas_aula',
    'reconciliar_grade_snapshot_emusys_v1'
  )
order by assinatura;
```

Expected: both two-arg and three-arg LA Teacher signatures exist; the two-arg
signature remains executable by `authenticated`; latest remote migration is
represented locally. Stop on drift.

- [ ] **Step 4: Commit preflight**

Document source URLs, tool versions, latest ledger, live ACLs, current Edge
versions and `writes remotos: 0`.

```powershell
git add -- docs/audits/2026-08-27-presenca-hardening-preflight.md
git commit -m "docs(presenca): registra preflight do hardening"
```

## Task 2: Generate migrations and lock release order

**Files:**
- Modify: `tests/presencaMigrationReleaseOrder.test.mjs`
- Create via CLI: the four migrations listed above

- [ ] **Step 1: Write RED release-order assertions**

Extend the test with:

```javascript
const suffixes = [
  'presenca_roster_v2_expansao_aditiva.sql',
  'presenca_slot_lock_core.sql',
  'presenca_portas_reservadas_duais.sql',
  'presenca_roster_v2_publicacao_gatada.sql',
];
const files = suffixes.map((suffix) => migrations.find((name) => name.endsWith(suffix)));
assert.equal(files.every(Boolean), true, `migrations ausentes: ${files}`);
const versions = files.map((name) => Number(name.split('_')[0]));
assert.deepEqual([...versions].sort((a, b) => a - b), versions);
assert.equal(versions.every((version) => version > 20260827180000), true);
for (const forbidden of ['20260827143000', '20260827143100', '20260827143200', '20260827143300']) {
  assert.equal(migrations.some((name) => name.startsWith(forbidden)), false);
}
```

Also assert the four new SQL files contain no `pg_get_functiondef`, no runtime
`regexp_replace` of function definitions and no `exception when others`.

- [ ] **Step 2: Run RED**

Run: `node --test tests/presencaMigrationReleaseOrder.test.mjs`

Expected: FAIL because the four files do not exist.

- [ ] **Step 3: Generate one file at a time**

```powershell
npx supabase migration new presenca_roster_v2_expansao_aditiva
npx supabase migration new presenca_slot_lock_core
npx supabase migration new presenca_portas_reservadas_duais
npx supabase migration new presenca_roster_v2_publicacao_gatada
Get-ChildItem 'supabase/migrations/*_presenca_*' | Sort-Object Name | Select-Object -Last 8 -ExpandProperty Name
```

Expected: four strictly increasing versions newer than the remote ledger. Do
not rename them.

## Task 3: Implement additive roster v2 without invalidating v1

**Files:**
- Modify: generated `*_presenca_roster_v2_expansao_aditiva.sql`
- Modify: `tests/presencaRosterOperacionalPostgres.test.mjs`
- Create: `tests/presencaHardeningCompatibilidadePostgres.test.mjs`

- [ ] **Step 1: Write PostgreSQL 17 RED fixtures**

Prove all of these independently:

```text
old reconciliar_grade_snapshot_emusys_v1 still executes
old vw_aula_roster_operacional_v1 returns the same fixture
new reconciliar_grade_snapshot_emusys_v2 accepts p_sync_run_id
new vw_aula_roster_operacional_v2 publishes only concluded run with hash
initiated, failed, aborted, replaced or partial run publishes zero names
applying the migration changes no existing roster/state row
```

Snapshot rows before applying the migration and compare them after it.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/presencaRosterOperacionalPostgres.test.mjs tests/presencaHardeningCompatibilidadePostgres.test.mjs
```

Expected: FAIL on missing v2 RPC/view.

- [ ] **Step 3: Implement additive RPC/view**

In the generated migration:

1. create `reconciliar_grade_snapshot_emusys_v2(uuid,uuid,date,date,jsonb,boolean)`;
2. require the outer run to match unit/mode and status `iniciada`;
3. call v1 inside the same transaction;
4. replace the v1 internal run id by `p_sync_run_id` in
   `aula_roster_sync_estado.run_id` and the matching
   `aula_alunos_emusys.ultimo_run_visto` before commit;
5. require exact row counts and raise `40001` on concurrent mismatch;
6. create `vw_aula_roster_operacional_v2 WITH (security_invoker=true)` joining
   a concluded `presenca_sync_execucoes` row with non-null hash, matching counts,
   complete local identity and equal publication run;
7. revoke from `PUBLIC`, `anon`, `authenticated`; grant only to `service_role`.

Do not create a roster mutation trigger, bulk-update state or redefine v1.

- [ ] **Step 4: Run GREEN and commit**

```powershell
node --test tests/presencaRosterOperacionalPostgres.test.mjs tests/presencaHardeningCompatibilidadePostgres.test.mjs
git add -- ':(glob)supabase/migrations/*_presenca_roster_v2_expansao_aditiva.sql' tests/presencaRosterOperacionalPostgres.test.mjs tests/presencaHardeningCompatibilidadePostgres.test.mjs
git commit -m "feat(presenca): expande publicacao atomica do roster v2"
```

## Task 4: Build locks and private cores before exposing ports

**Files:**
- Modify: generated `*_presenca_slot_lock_core.sql`
- Modify: `tests/presencaProfessorComandoAuditoriaPostgres.test.mjs`
- Modify: `tests/presencaRosterOperacionalPostgres.test.mjs`

- [ ] **Step 1: Write concurrent RED tests**

Use two PostgreSQL sessions to prove:

```text
same request id + same payload applies exactly once
same request id + different payload raises 23505
client discards the first committed response, retries the same request id and still has one command/event set
roster mutation waits on the same aula lock as a reserved command
twin cancellation/justification blocks attendance write
replaced run never publishes after it resumes
40001, 40P01, 55P03 and 57014 remain retryable and non-terminal
```

Retryable failures must not set `presenca_comandos.status` terminal and must
not append a terminal `falhou` event.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/presencaProfessorComandoAuditoriaPostgres.test.mjs tests/presencaRosterOperacionalPostgres.test.mjs
```

Expected: twin-slot and transient-error cases fail.

- [ ] **Step 3: Implement static internal definitions**

In `*_presenca_slot_lock_core.sql`:

- define roster and canonical-slot lock-key functions;
- acquire old/new keys in `least` then `greatest` order;
- add `BEFORE` lock-only triggers on `aula_alunos_emusys` and `aulas_emusys`;
- define private `fn_criar_comando_presenca_core_v2`,
  `fn_aplicar_comando_presenca_core_v2` and
  `fn_validar_comando_roster_reservado_v2` as static SQL;
- require v2 published roster, complete local identities, exact set equality
  and no cancellation/justification in any twin;
- assign explicit terminal SQLSTATEs and let transient SQLSTATEs escape;
- revoke internals/triggers from `PUBLIC`, `anon`, `authenticated` and
  `service_role` because only later `SECURITY DEFINER` ports call them.

Copy the committed v1 business body into the migration source and edit it
there; never clone a live function at migration runtime.

- [ ] **Step 4: Run GREEN and commit**

```powershell
node --test tests/presencaProfessorComandoAuditoriaPostgres.test.mjs tests/presencaRosterOperacionalPostgres.test.mjs
git add -- ':(glob)supabase/migrations/*_presenca_slot_lock_core.sql' tests/presencaProfessorComandoAuditoriaPostgres.test.mjs tests/presencaRosterOperacionalPostgres.test.mjs
git commit -m "feat(presenca): serializa roster e slot antes das portas v2"
```

## Task 5: Add v2 reserved ports in parallel

**Files:**
- Modify: generated `*_presenca_portas_reservadas_duais.sql`
- Create: `tests/presencaHardeningAclPostgres.test.mjs`
- Modify: `tests/presencaProfessorComandoAuditoriaPostgres.test.mjs`

- [ ] **Step 1: Write RED API/ACL tests**

Require these signatures to coexist:

```text
app_criar_comando_chamada_professor_v2(uuid,integer,integer[])
fabio_criar_comando_chamada_v2(uuid,integer,integer,integer[],text)
app_aplicar_comando_presenca_v2(uuid)
app_registrar_presencas_aula(integer,integer[])
app_registrar_presencas_aula(integer,integer[],uuid)
```

Expected ACL:

| Signature | anon | authenticated | service_role |
|---|---:|---:|---:|
| app professor v2 | false | true | false |
| Fábio v2 | false | false | true |
| apply v2 | false | owner only | true |
| old two-arg Teacher | false | true | unchanged |

Use two authenticated fixture UUIDs to prove user B cannot inspect/apply user
A's request.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/presencaHardeningAclPostgres.test.mjs tests/presencaProfessorComandoAuditoriaPostgres.test.mjs
```

Expected: missing v2 ports.

- [ ] **Step 3: Implement ports without redefining v1**

The migration must:

- assemble the roster in the database after acquiring its lock;
- validate professor ownership via `auth.uid()` in the app port;
- require service role and professor/aula context in the Fábio port;
- delegate only to v2 cores;
- persist terminal rejection only for SQLSTATE `22023`, `23503`, `23505`,
  `23514` and `42501`;
- rethrow every unlisted SQLSTATE with the request pending;
- keep generic v1 and all direct Hugo/Teacher signatures byte-identical;
- set `search_path = pg_catalog, public` and explicit ACLs.

- [ ] **Step 4: Prove A → B → A uses three IDs**

Call the app with three caller-generated UUIDs and payloads `presente`, `falta`,
`presente`; assert three commands. Retry the first UUID with its original
payload and assert row/event counts do not change.

- [ ] **Step 5: Run GREEN and commit**

```powershell
node --test tests/presencaHardeningAclPostgres.test.mjs tests/presencaProfessorComandoAuditoriaPostgres.test.mjs
git add -- ':(glob)supabase/migrations/*_presenca_portas_reservadas_duais.sql' tests/presencaHardeningAclPostgres.test.mjs tests/presencaProfessorComandoAuditoriaPostgres.test.mjs
git commit -m "feat(presenca): adiciona portas reservadas v2 em paralelo"
```

## Task 6: Make sync Edge source dual-compatible

**Files:**
- Modify: `supabase/functions/_shared/presenca-sync-run.ts`
- Modify: `supabase/functions/_shared/reconciliacao-grade-snapshot.ts`
- Modify: `supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts`
- Modify: `supabase/functions/sync-grade-futura-emusys/index.ts`
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`
- Modify: `tests/presencaSyncOrquestracao.test.mjs`
- Modify: `tests/reconciliacaoGradeSnapshotContrato.test.mjs`

- [ ] **Step 1: Write four RED compatibility cases**

Mock RPCs and prove:

```text
old Edge/v1 contract succeeds on expanded DB
new Edge calls v2 when available
new Edge falls back once to v1 only on PGRST202/function-not-found
validation, authorization, timeout and network errors never trigger fallback
```

Finalization must occur after reconciliation; failed/replaced runs never return
`publicavel=true`.

- [ ] **Step 2: Run RED**

```powershell
deno test supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts
node --test tests/presencaSyncOrquestracao.test.mjs tests/reconciliacaoGradeSnapshotContrato.test.mjs
```

- [ ] **Step 3: Implement capability-based mode**

Add:

```typescript
type ReconciliacaoContrato = 'v2' | 'v1_fallback';

interface ResultadoReconciliacaoDual {
  contrato: ReconciliacaoContrato;
  resultado: Record<string, unknown>;
}
```

Pass `syncRunId` to v2. Fall back only for the exact function-not-found code
covered by the test. Log unit/date/run IDs and counts, never names/rosters.

- [ ] **Step 4: Run checks and commit without deploy**

```powershell
deno test supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts
node --test tests/presencaSyncOrquestracao.test.mjs tests/reconciliacaoGradeSnapshotContrato.test.mjs
deno check --node-modules-dir=auto supabase/functions/sync-presenca-emusys/index.ts
deno check --node-modules-dir=auto supabase/functions/sync-grade-futura-emusys/index.ts
git add -- supabase/functions/_shared/presenca-sync-run.ts supabase/functions/_shared/reconciliacao-grade-snapshot.ts supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts supabase/functions/sync-grade-futura-emusys/index.ts supabase/functions/sync-presenca-emusys/index.ts tests/presencaSyncOrquestracao.test.mjs tests/reconciliacaoGradeSnapshotContrato.test.mjs
git commit -m "feat(presenca): torna sync compativel com roster v1 e v2"
```

## Task 7: Gate canonical roster publication without changing flags

**Files:**
- Modify: generated `*_presenca_roster_v2_publicacao_gatada.sql`
- Modify: `tests/presencaHardeningCompatibilidadePostgres.test.mjs`

- [ ] **Step 1: Write RED rollout cases**

Prove in disposable Postgres:

```text
legado returns pre-existing roster path
sombra returns the same operational payload and skips discarded heavy query
canonico_v2 reads vw_aula_roster_operacional_v2
rollback changes no roster row and deletes no event
all 21 rollout rows remain sombra after migration
```

- [ ] **Step 2: Implement only governed adapters**

Create private canonical functions reading v2 and update only the
`canonico_v2` branch of adapters. Preserve Hugo's optimization: LA Teacher
`sombra` returns legacy directly and does not calculate/discard canonical JSON.
Do not update any `presenca_rollout_config.modo`.

- [ ] **Step 3: Run GREEN and commit**

```powershell
node --test tests/presencaHardeningCompatibilidadePostgres.test.mjs tests/presencaRolloutAdaptersPostgres.test.mjs tests/presencaRolloutConfigPostgres.test.mjs
git add -- ':(glob)supabase/migrations/*_presenca_roster_v2_publicacao_gatada.sql' tests/presencaHardeningCompatibilidadePostgres.test.mjs
git commit -m "feat(presenca): governa publicacao do roster v2 por flag"
```

## Task 8: Adopt random request ID in LA Teacher

**Files:**
- Create worktree: `D:\la-teacher-worktrees\presenca-request-id`
- Create: `src/lib/presencaPedido.ts`
- Create: `src/lib/presencaPedido.test.ts`
- Modify: `src/lib/api.ts`
- Create: `src/lib/api.test.ts`
- Modify: `src/types/db.ts`

- [ ] **Step 1: Create isolated worktree**

```powershell
git -C "D:\la-teacher" fetch --prune origin
git -C "D:\la-teacher" worktree add -b codex/presenca-request-id "D:\la-teacher-worktrees\presenca-request-id" origin/main
git -C "D:\la-teacher-worktrees\presenca-request-id" status --short --branch
```

Expected: clean worktree from current `origin/main`.

- [ ] **Step 2: Write RED Vitest cases**

Use an in-memory Storage and prove:

```text
same ambiguous aula + sorted absences + user survives reload with same ID
different user is isolated
two ambiguous classes coexist
terminal response clears only its request
network or malformed response preserves request
A → B → A after terminal generates three UUIDs
registrarPresencas sends p_request_id
browser source contains no service-role key, service-role environment lookup or service-role client
```

- [ ] **Step 3: Implement the session helper**

Use prefix `la-teacher:presenca:pedidos:v1:`, UUID v4 generated by the caller,
and user+aula+sorted absence IDs as the intention key. Clear only after a valid
terminal receipt. Never derive UUID from payload.

- [ ] **Step 4: Change only registrarPresencas**

After obtaining the authenticated user only for request scoping, call:

```typescript
supabase.rpc('app_registrar_presencas_aula', {
  p_aula_emusys_id: aulaId,
  p_alunos_ausentes: [...ausentes].sort((a, b) => a - b),
  p_request_id: requestId,
});
```

Update `src/types/db.ts` with `p_request_id: string`. Do not change server-side
authorization and do not use the generic two-step transport. Add a static test
over `src/` rejecting `SUPABASE_SERVICE_ROLE_KEY`, service-role environment
lookups and creation of a service-role Supabase client; the browser continues
using only the authenticated user's session.

- [ ] **Step 5: Run and commit without deploy**

```powershell
npm ci
npm run test:unit
npm run build
git add -- src/lib/presencaPedido.ts src/lib/presencaPedido.test.ts src/lib/api.ts src/lib/api.test.ts src/types/db.ts
git commit -m "fix(presenca): envia request id duravel no la teacher"
```

## Task 9: Close disposable compatibility/security gate

**Files:**
- Modify: `docs/audits/2026-08-27-presenca-convergencia-execucao.md`
- Modify: `docs/audits/2026-08-27-presenca-hardening-preflight.md`

- [ ] **Step 1: Run full PostgreSQL 17 matrix**

```powershell
node --test tests/presencaMigrationReleaseOrder.test.mjs tests/presencaHardeningCompatibilidadePostgres.test.mjs tests/presencaHardeningAclPostgres.test.mjs tests/presencaProfessorComandoAuditoriaPostgres.test.mjs tests/presencaRosterOperacionalPostgres.test.mjs
```

Expected: all pass without production writes.

- [ ] **Step 2: Run complete source verification**

```powershell
npm run test:presenca-backend
npm run test:presenca-canonica
npm test
npm run build
deno check --node-modules-dir=auto supabase/functions/sync-presenca-emusys/index.ts
deno check --node-modules-dir=auto supabase/functions/sync-grade-futura-emusys/index.ts
git diff --check
```

- [ ] **Step 3: Produce dry-run without bypass**

Rediscover `npx supabase db push --help`, then run its supported dry-run form.
It must list only the Fase 3 correction and the four Fase 4 migrations, in
order. Never use `--include-all`. Run the supported lint/advisor command and
separate new-object findings from the existing baseline.

- [ ] **Step 4: Record and commit gate**

Append:

```markdown
## Fase 4 — hardening retrocompatível

- migrations novas CLI e posteriores ao ledger: 4/4
- WIPs 143000–143300 publicados: não
- DB expandido + Edge atual/dual: aprovado em fixture
- LA Teacher antigo/novo + DB expandido: aprovado
- concorrência, A-B-A, gêmeas e run substituída: aprovado
- ACL/RLS/search_path: aprovado
- dry-run sem include-all: aprovado
- migrations/Edge/LA Teacher publicados: não
```

Then:

```powershell
git add -- docs/audits/2026-08-27-presenca-convergencia-execucao.md docs/audits/2026-08-27-presenca-hardening-preflight.md
git commit -m "docs(presenca): fecha gate descartavel do hardening"
git status --short --branch
git -C "D:\la-teacher-worktrees\presenca-request-id" status --short --branch
```

Expected: both worktrees clean. Do not apply migrations, deploy Edge, push or
activate a flag in this phase.
