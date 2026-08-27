# Convergência de presença — Fase 5: publicação e rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar a convergência com PRs, autorizações separadas, ondas por unidade/superfície, prova real no navegador e rollback sem perda de dados.

**Architecture:** Fonte, frontend, migrations, Edge e LA Teacher são promovidos em gates independentes. O código chega primeiro sem cutover; as flags avançam em cinco ondas, cada uma condicionada a sete dias operacionais verdes e revertida para legado diante de qualquer gatilho objetivo.

**Tech Stack:** Git/GitHub CLI, Supabase CLI/PostgreSQL, Supabase Edge Functions, Vercel CLI, React/Vite, LA Teacher, browser autenticado e scripts de auditoria.

---

## Autorizações separadas

Before each state change, record the authorization in
`docs/audits/2026-08-27-presenca-convergencia-execucao.md`. These are separate:

1. push branch and open PR;
2. merge PR;
3. apply corrective/additive migrations;
4. deploy each Edge Function;
5. deploy LA Report;
6. deploy LA Teacher;
7. activate each unit/surface wave;
8. run any roster repair/backfill.

Authorization for one item does not imply another. This plan never creates
synthetic student, class, presence or absence data in production.

## Release branches

Create from current `origin/main`, never from the dirty local `main` checkout:

- `codex/presenca-paridade-publicacao`
- `codex/presenca-recibos-publicacao`
- `codex/presenca-consumidores-publicacao`
- `codex/presenca-hardening-publicacao`
- LA Teacher: existing `codex/presenca-request-id`

Each branch cherry-picks only commits whose subjects are named in its task.
Resolve unique hashes with `git log --format='%H %s'` and stop if a subject is
missing or appears more than once.

## Objective gates used by every wave

```text
operational_days >= 7
unexplained_shadow_deltas = 0
incomplete_sync_without_block = 0
commands_without_terminal_receipt_after_15m = 0
human_decisions_overwritten = 0
confirmed_false_pending = 0
ACL_or_permission_regressions = 0
new_application_errors = 0
```

An operational day is a local date with at least one regular scheduled class
that already ended in the target unit. Calendar days without classes do not
count.

## Task 1: Publish source parity without runtime changes

**Files:**
- Source branch: `codex/presenca-convergencia-segura`
- Release branch: `codex/presenca-paridade-publicacao`

- [ ] **Step 1: Refresh remote and re-run parity gate**

```powershell
git fetch --prune origin
git merge-base --is-ancestor 08dca49c origin/main
git diff --exit-code origin/main...HEAD -- src index.html vite.config.ts package-lock.json
npm run test:presenca-backend
npm test
npm run build
```

Expected: Hugo remains ancestor, no Vite runtime diff, all checks pass.

- [ ] **Step 2: Create clean release branch and select parity commits**

```powershell
git switch -c codex/presenca-paridade-publicacao origin/main
git log codex/presenca-convergencia-segura --format='%H %s' --reverse | rg "registra baseline|versiona migrations ja publicadas|restaura fonte edge ja publicada|reconcilia contratos e testes|fecha gate de paridade"
```

Cherry-pick exactly the five unique hashes printed by the command, in order.
Include the approved spec/plans documentation commit if it is not already in
`origin/main`. Do not include Fase 2 runtime commits.

- [ ] **Step 3: Verify, push and open PR**

```powershell
git diff --exit-code origin/main...HEAD -- src index.html vite.config.ts package-lock.json
npm run test:presenca-backend
npm test
npm run build
git push -u origin codex/presenca-paridade-publicacao
gh pr create --base main --head codex/presenca-paridade-publicacao --title "chore(presenca): reconcilia fonte publicada no Supabase" --body-file docs/audits/2026-08-27-presenca-convergencia-execucao.md
```

Expected: PR open, CI green, zero production deployment.

- [ ] **Step 4: Review and merge only after authorization**

Require review of manifest, migration history, Edge source and zero-runtime
diff. Merge through GitHub; do not merge directly in the local checkout.

- [ ] **Step 5: Fast-forward local main while preserving user files**

Repeat the SHA-256 procedure from Fase 1, then:

```powershell
git -C "D:\2026\LA-performance-report" fetch --prune origin
git -C "D:\2026\LA-performance-report" merge --ff-only origin/main
```

Expected: local/remote main same hash; user documents unchanged.

## Task 2: Publish receipt durability in LA Report

**Files:**
- Release branch: `codex/presenca-recibos-publicacao`
- Deploy project: `la-performance-report`

- [ ] **Step 1: Create branch and cherry-pick only Fase 2**

Create from latest `origin/main`. Resolve and cherry-pick the unique commits:

```text
fix(presenca): persiste recibos por usuario e intencao
fix(presenca): integra recibo duravel nas chamadas
docs(presenca): fecha gate dos recibos duraveis
```

- [ ] **Step 2: Run protocol gate**

```powershell
node --test tests/presencaRecibo.test.mjs tests/presencaReciboPersistencia.test.mjs
$hits = rg -n "app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1|presencaComando|presencaEnvioPendente" src/components/App/Agenda src/lib
if ($LASTEXITCODE -eq 0) { $hits; throw 'transporte concorrente encontrado' }
if ($LASTEXITCODE -ne 1) { throw 'rg falhou' }
npm test
npm run build
```

Expected: direct Hugo RPCs remain and all checks pass.

- [ ] **Step 3: Push, PR, review and merge**

Push the branch and open a PR titled
`fix(presenca): preserva request id apos reload`. Review the three Hugo files
line-by-line. Merge only after CI and authorization.

- [ ] **Step 4: Link the exact Vercel project and deploy main**

From a clean checkout of the merged `origin/main`:

```powershell
vercel link --yes --project la-performance-report
vercel --prod
```

Expected: deployment reaches `Ready`. Record deployment ID, URL, source commit
and bundle hash; `Ready` is not the functional proof.

- [ ] **Step 5: Authenticated browser proof**

In production, open Barra, Recreio and Campo Grande. Verify Agenda/Chamada DOM,
console, network and reload. With one real same-day action explicitly selected
by operations, execute the normal attendance flow once and verify:

Query `presenca_comandos` by the exact UUID copied from the authenticated
network request and select `request_id`, `status`, `itens_total`,
`itens_aplicados`, `itens_rejeitados`, author presence and timestamps. Expected:
one terminal command, correct counts, author present and no duplicate event.

## Task 3: Publish consumers after the fail-closed correction

**Files:**
- Release branch: `codex/presenca-consumidores-publicacao`
- Migration: generated `*_presenca_ausencia_bruta_fail_closed.sql`

- [ ] **Step 1: Create branch and select Fase 3 commits**

Create from latest `origin/main`; cherry-pick unique commits with subjects:

```text
fix(presenca): impede ausencia bruta no envelope legado
feat(presenca): adiciona adaptador visual canonico
feat(presenca): conecta agenda e conciliacao ao contrato canonico
feat(presenca): conecta agentes e indicadores ao contrato canonico
docs(presenca): fecha gate dos consumidores em sombra
```

- [ ] **Step 2: Verify no cutover and open PR**

```powershell
npm run test:presenca-canonica
npm test
npm run build
```

Read-only production SQL must still show `sombra=21` and `canonico_v2=0`.
Push, open PR, obtain review and merge. Do not deploy frontend yet.

- [ ] **Step 3: Re-run migration preflight immediately before write**

```powershell
npx supabase migration list
npx supabase db push --help
```

Run the supported dry-run form. Expected: exactly one missing migration, the
fail-closed correction. Stop if another migration appears. Record authorization
for this migration separately.

- [ ] **Step 4: Apply only the correction**

Use the CLI form validated by `--help`, without `--include-all` or migration
repair. Immediately verify:

```sql
select version, name
from supabase_migrations.schema_migrations
where name = 'presenca_ausencia_bruta_fail_closed';

select has_function_privilege(
  'public',
  'public.fn_agenda_dia_legado_envelope_v1(date,uuid)',
  'execute'
) as public_execute;
```

Expected: one ledger row; `public_execute=false`.

- [ ] **Step 5: Deploy LA Report consumers**

Link `la-performance-report`, deploy merged `main`, record commit/deployment,
then verify browser DOM/console/reload for Agenda, Conciliação, Sucesso do Aluno
and professor details in all three units. Do not activate a flag.

## Task 4: Publish additive hardening, dual Edge and LA Teacher request IDs

**Files:**
- LA Report branch: `codex/presenca-hardening-publicacao`
- LA Teacher branch: `codex/presenca-request-id`
- Edge Functions: `sync-presenca-emusys`, `sync-grade-futura-emusys`

- [ ] **Step 1: Assemble and review LA Report hardening PR**

Create from latest `origin/main` and cherry-pick:

```text
docs(presenca): registra preflight do hardening
feat(presenca): expande publicacao atomica do roster v2
feat(presenca): serializa roster e slot antes das portas v2
feat(presenca): adiciona portas reservadas v2 em paralelo
feat(presenca): torna sync compativel com roster v1 e v2
feat(presenca): governa publicacao do roster v2 por flag
docs(presenca): fecha gate descartavel do hardening
```

Run the complete Fase 4 matrix, push, open PR, security/domain review and merge.

- [ ] **Step 2: Tag rollback sources before operational deployment**

From merged clean main:

```powershell
git tag -a presenca-pre-hardening-2026-08-27 -m "rollback source before presence hardening"
git push origin presenca-pre-hardening-2026-08-27
```

In LA Teacher, tag current production source:

```powershell
git -C "D:\la-teacher" tag -a presenca-pre-request-id-2026-08-27 -m "rollback source before attendance request id"
git -C "D:\la-teacher" push origin presenca-pre-request-id-2026-08-27
```

Stop if either tag already exists at a different commit.

- [ ] **Step 3: Apply the four additive migrations only**

Re-read ledger, run dry-run and confirm exactly the four Fase 4 migrations in
generated order. After separate authorization, apply them without bypass flags.
Verify all four ledger rows, old signatures/ACLs, new v2 signatures/ACLs and
`sombra=21`.

- [ ] **Step 4: Prove old runtime against expanded DB before Edge deploy**

Use read-only real traffic/logs and authenticated browser reloads. Expected:
current LA Report and current LA Teacher still load and their existing RPCs
return their previous shapes. Any permission or latency regression triggers
rollback of runtime behavior to old adapters; additive DDL is not removed.

- [ ] **Step 5: Deploy dual Edge source with preserved JWT settings**

Discover current CLI syntax first. Deploy only:

```text
sync-presenca-emusys          verify_jwt=false
sync-grade-futura-emusys     verify_jwt=true
```

Use `--no-verify-jwt` only for the first. Record prior versions 102/34, new
versions, remote SHA-256, deployment timestamps and source commit. Verify real
metadata cron traffic and no roster publication from failed/replaced runs.

- [ ] **Step 6: Publish LA Teacher through PR and deploy**

On `codex/presenca-request-id`, rebase on current `origin/main`, run
`npm run test:unit` and `npm run build`, push, open PR, review and merge. From a
clean merged checkout:

```powershell
vercel link --yes --project la-teacher
vercel --prod
```

In an authenticated production browser, verify agenda load, two-arg fallback
availability, new three-arg network payload, reload retry behavior and console.
Use one real operational class selected by the professor/operation; no fixture.

## Task 5: Establish daily monitoring before activation

**Files:**
- Modify: `docs/audits/2026-08-27-presenca-convergencia-execucao.md`

- [ ] **Step 1: Capture a PII-free daily snapshot**

Run read-only queries grouped only by unit/date/status:

```sql
select unidade_id, data_alvo, status, count(*)
from public.presenca_sync_execucoes
where criada_em >= now() - interval '14 days'
group by unidade_id, data_alvo, status
order by data_alvo, unidade_id, status;

select status, count(*) as comandos,
       sum(itens_aplicados) as aplicados,
       sum(itens_rejeitados) as rejeitados
from public.presenca_comandos
where criado_em >= now() - interval '14 days'
group by status
order by status;

select count(*) as comandos_sem_recibo_apos_15m
from public.presenca_comandos
where criado_em < now() - interval '15 minutes'
  and status not in ('concluido','parcial','falhou','nao_recebido');

select modo, count(*)
from public.presenca_rollout_config
group by modo;
```

Set `AUDIT_PRINT_SQL=1` and run `node scripts/auditar-presenca-canonica.mjs` to
generate the 30-day read-only SQL. Execute it through the authorized SQL tool
and feed only aggregated rows back through `AUDIT_ROWS_STDIN=1` for unexplained
deltas and overwritten-human counters. Store counts/hashes, no names or row
payloads.

- [ ] **Step 2: Establish baseline latency/error windows**

Capture p50/p95 and errors for:

```text
get_agenda_dia_v2
app_minha_agenda_sessao
app_registrar_chamada_agenda
app_registrar_presencas_aula
sync-presenca-emusys
sync-grade-futura-emusys
```

Compare against pre-release values in the audit. A new permission error,
statement timeout, or p95 increase above 20% blocks activation.

## Task 6: Activate five waves with seven operational days each

**Files:**
- Audit: `docs/audits/2026-08-27-presenca-convergencia-execucao.md`
- RPC: `admin_alterar_presenca_rollout_v1`

- [ ] **Step 1: Resolve canonical unit IDs without hardcoding**

Read-only SQL:

```sql
select id, nome
from public.unidades
where lower(nome) in ('recreio', 'barra', 'campo grande')
order by nome;
```

Expected: exactly three active units, one per name. Stop on duplicates/missing.

- [ ] **Step 2: Execute Onda 1 — Recreio Agenda + Sol**

Only after all objective gates are green, call
`admin_alterar_presenca_rollout_v1` separately for `agenda` and `sol`, with a
fresh UUID per transition, reason
`onda 1 recreio agenda e sol apos sete dias verdes`, and evidence containing
the measured seven-day counters. Confirm two append-only rollout events.

- [ ] **Step 3: Monitor seven Recreio operational days**

Every operational day, run Task 5 queries and browser checks. Compare Agenda
and Sol universe/equation for the same date. Do not advance by elapsed calendar
time alone.

- [ ] **Step 4: Execute Onda 2 — Recreio Teacher/Fábio, Lia and open metrics**

Activate `la_teacher`, `lia` and `kpis` separately. Keep `mila` and
`relatorios` in shadow. Monitor seven additional operational days with LA
Teacher DOM/network, Fábio receipts, Lia output metadata and KPI equations.

- [ ] **Step 5: Execute Onda 3 — Barra**

Activate `agenda`, `sol`, `la_teacher`, `lia` and `kpis` for Barra as separate
events. Monitor seven Barra operational days; also keep Recreio green.

- [ ] **Step 6: Execute Onda 4 — Campo Grande**

Activate the same five surfaces for Campo Grande. Monitor seven Campo Grande
operational days; specifically verify local-unit identity where Emusys IDs are
repeated and a two-course student fixture only in disposable tests, not prod.

- [ ] **Step 7: Execute Onda 5 — consolidated/agents/reports**

After all three units remain green, activate `mila` and `relatorios` per unit,
then validate consolidated reports and analytical agents. No coverage is
invented for Mila/Fábio: empty source remains empty/null with freshness/rule.

- [ ] **Step 8: Monitor seven operational days after final wave**

Require all objective gates green for all units and all surfaces. Record daily
snapshot timestamps and hashes.

## Task 7: Execute governed rollback on any trigger

**Files:**
- Tags: `presenca-pre-hardening-2026-08-27`, `presenca-pre-request-id-2026-08-27`
- RPC: `admin_alterar_presenca_rollout_v1`

- [ ] **Step 1: Roll back the affected flag immediately**

For the affected unit/surface, call the admin RPC with `p_modo='legado'`, reason
starting `rollback:` and one permitted trigger:

```text
sync_incompleto_sem_bloqueio
divergencia_agenda_sol
comando_sem_recibo
decisao_humana_sobrescrita
vazamento_acl
erro_runtime
```

Use a fresh request ID. Verify the append-only rollback event; do not delete
commands, evidence or decisions.

- [ ] **Step 2: Roll back application source when needed**

For LA Report or LA Teacher, promote/redeploy the exact tagged source through
Vercel and verify authenticated browser behavior. Do not use `git reset --hard`
on shared checkouts.

- [ ] **Step 3: Roll back Edge when needed**

Redeploy the source recorded for Edge versions 102/34 with the original
`verify_jwt` settings. Expanded DDL remains inert behind legacy/shadow adapters
and is corrected by a later migration if needed; never down-migrate production
tables.

## Task 8: Final E2E and handoff

**Files:**
- Modify: `docs/audits/2026-08-27-presenca-convergencia-execucao.md`
- Modify: `docs/runbooks/presenca-canonica.md`

- [ ] **Step 1: Run final repository checks**

```powershell
npm run test:presenca-backend
npm run test:presenca-canonica
npm test
npm run build
git status --short --branch
git log --oneline --decorate -20
git -C "D:\la-teacher" status --short --branch
git -C "D:\la-teacher" log --oneline --decorate -10
```

Expected: tests/builds pass and tracked release checkouts are clean.

- [ ] **Step 2: Complete authenticated real-system proof**

For Barra, Recreio and Campo Grande verify:

```text
Agenda and Chamada DOM/source/freshness/rule
individual and batch attendance receipt
professor day/aula receipt
LA Teacher attendance receipt after reload
Fábio record-derived attendance and author
Sol/Lia/Mila context metadata
KPI/report period, universe, numerator and denominator
console and network without new errors
post-reload stability
```

Every production write must be a normal real action explicitly selected by
operations. Use read-only checks for all other cases.

- [ ] **Step 3: Reconcile Git, Supabase, Edge and deployments**

Record final main hashes for both repos, PR numbers, migration versions, Edge
versions/SHA/`verify_jwt`, Vercel deployment IDs, flag/event counts and final
snapshot timestamp. Confirm local main equals remote main after preserving the
two user documents.

- [ ] **Step 4: Update runbook and close only with measured criteria**

The runbook must explain source grain, raw vs semantic absence, retry/request
IDs, receipt lookup, sync/roster health, wave status, rollback and escalation.
Close as complete only after the final seven operational days have all gates
green and no unexplained divergence. Otherwise report the exact partial state.

- [ ] **Step 5: Commit final evidence**

```powershell
git add -- docs/audits/2026-08-27-presenca-convergencia-execucao.md docs/runbooks/presenca-canonica.md
git commit -m "docs(presenca): registra encerramento do rollout canonico"
git push
```

Expected: final evidence reaches a reviewed PR; no direct push to `main`.
