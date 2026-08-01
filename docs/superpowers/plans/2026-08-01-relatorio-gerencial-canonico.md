# Relatorio Gerencial Canonico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o botao gerencial publicar um unico relatorio executivo, composto no servidor a partir dos fechamentos mensais canonicos Administrativo e Comercial, com a IA restrita aos textos narrativos.

**Architecture:** Uma nova RPC `get_relatorio_gerencial_canonico_v1` valida unidade, competencia e os dois documentos mensais fechados, agrega rankings canonicos de professores e configuracoes vigentes dos programas, e devolve um contrato JSON versionado. A edge `gemini-relatorio-gerencial` recebe somente `unidade`, `ano` e `mes`, busca esse contrato usando o JWT do usuario, gera cinco campos narrativos com fallback deterministico e renderiza todos os numeros sem permitir que a IA os altere. O frontend deixa de buscar a RPC legada e de enviar payload livre ao servidor.

**Tech Stack:** PostgreSQL 17/Supabase RPC, Supabase Edge Functions/Deno/TypeScript, React 19/TypeScript, Node test runner.

---

## File structure

- Create `supabase/migrations/20260801193000_relatorio_gerencial_canonico.sql`: produtor server-side, guard de acesso, metas, rankings, comparabilidade e grants.
- Modify `supabase/functions/gemini-relatorio-gerencial/index.ts`: validacao/autorizacao, leitura da RPC, narrativa controlada e renderizacao publica.
- Modify `src/components/App/Administrativo/ModalRelatorio.tsx`: chamada da edge apenas com filtros.
- Create `tests/relatorioGerencialCanonico.test.mjs`: contrato estatico da arquitetura, conteudo e linguagem publica.
- Create `tests/relatorioGerencialCanonicoPostgres.test.mjs`: compilacao e comportamento real da nova RPC em PostgreSQL 17.
- Modify `docs/MAPA-SISTEMA.md`: fluxo botao -> edge -> produtor canonico.
- Modify `docs/METRICAS.md`: definicoes e regras de publicacao do gerencial.
- Modify `docs/RELATORIO-GERENCIAL-IA.md`: papel limitado da IA e campos executivos.

### Task 1: Contract tests for the server-only flow

**Files:**
- Create: `tests/relatorioGerencialCanonico.test.mjs`
- Test: `tests/relatorioGerencialCanonico.test.mjs`

- [x] **Step 1: Write the failing architecture test**

Create assertions proving that the migration exposes `get_relatorio_gerencial_canonico_v1`, reads both monthly canonical producers, reads program configuration tables, builds rankings directly from V3, and never invokes the legacy gerencial wrapper.

- [x] **Step 2: Write the failing edge/frontend test**

Assert that the edge accepts `unidade`, `ano`, `mes`, calls the new RPC, and does not accept `dados`; assert that `ModalRelatorio.tsx` invokes only the edge with those filters.

- [x] **Step 3: Write the failing public-language test**

Assert absence of public report phrases `camada canonica`, `conciliação canônica`, `snapshot`, `RPC`, `legada`, `bloqueio seguro`, and presence of financial, base, trancamento, commercial, retention, ranking and program sections.

- [x] **Step 4: Run the test and verify RED**

Run: `node --test tests/relatorioGerencialCanonico.test.mjs`

Expected: FAIL because the producer does not exist and the current edge accepts caller-supplied `dados`.

### Task 2: Canonical PostgreSQL producer

**Files:**
- Create: `supabase/migrations/20260801193000_relatorio_gerencial_canonico.sql`
- Create: `tests/relatorioGerencialCanonicoPostgres.test.mjs`

- [x] **Step 1: Write the PostgreSQL behavior fixture**

The fixture must stub the two canonical monthly producers and V3 professor read models, seed operational and program goals, compile the migration in PostgreSQL 17 and assert the returned contract:

```json
{
  "schema_version": 1,
  "status": "fechado",
  "unidade": {},
  "competencia": {},
  "administrativo": {},
  "comercial": {},
  "rankings": {},
  "metas": {
    "mensais": {},
    "fideliza": {},
    "matriculador": {}
  },
  "comparativos": {
    "status": "indisponivel"
  },
  "auditoria": {}
}
```

- [x] **Step 2: Run the PostgreSQL test and verify RED**

Run: `node --test tests/relatorioGerencialCanonicoPostgres.test.mjs`

Expected: FAIL because the migration file/function does not exist.

- [x] **Step 3: Implement the producer**

Implement `security definer`, fixed `search_path`, parameter validation, `pode_gerar_relatorio_admin_v1` authorization, closed-document validation, direct V3 rankings, current program configurations, monthly goals from the frozen administrative document, and internal source metadata. Missing source must stay `null`/unavailable and must never be converted to zero.

- [x] **Step 4: Run both tests and verify GREEN**

Run: `node --test tests/relatorioGerencialCanonico.test.mjs tests/relatorioGerencialCanonicoPostgres.test.mjs`

Expected: PASS.

### Task 3: Deterministic executive renderer and constrained AI

**Files:**
- Modify: `supabase/functions/gemini-relatorio-gerencial/index.ts`
- Test: `tests/relatorioGerencialCanonico.test.mjs`

- [x] **Step 1: Extend the failing test with report content requirements**

Cover canonical July semantics: additional enrollments instead of second-course count, total exits including nonrenewals, two commercial tickets, pending renewals, advance notices, lead-quality warning, risk names only for actionable exceptions, and comparison omission when definitions are not comparable.

- [x] **Step 2: Run the test and verify RED**

Run: `node --test tests/relatorioGerencialCanonico.test.mjs`

Expected: FAIL against the old renderer.

- [x] **Step 3: Replace the edge request and renderer**

Create a Supabase client with the request JWT, call `get_relatorio_gerencial_canonico_v1`, send the LLM only a minimal business summary, validate the five narrative fields, scrub technical-control language, and render every KPI from the typed RPC payload. If Gemini fails, use a business-language fallback consistent with the actual released conversion rate.

- [x] **Step 4: Run the test and Deno check**

Run: `node --test tests/relatorioGerencialCanonico.test.mjs`

Run: `deno check supabase/functions/gemini-relatorio-gerencial/index.ts`

Expected: PASS.

### Task 4: Frontend cutover

**Files:**
- Modify: `src/components/App/Administrativo/ModalRelatorio.tsx`
- Test: `tests/relatorioGerencialCanonico.test.mjs`

- [x] **Step 1: Make the frontend assertion fail for the legacy flow**

Confirm the gerencial generator no longer contains `.rpc('get_dados_relatorio_gerencial'` and does not send `dados` or a caller-computed unit name.

- [x] **Step 2: Run the test and verify RED**

Run: `node --test tests/relatorioGerencialCanonico.test.mjs`

Expected: FAIL until the frontend is changed.

- [x] **Step 3: Invoke the edge with filters only**

Send `{ unidade: unidadeUUID, ano: anoRelatorio, mes: mesRelatorio }`, preserve the existing modal/error UX, and require a specific unit.

- [x] **Step 4: Run the test and build**

Run: `node --test tests/relatorioGerencialCanonico.test.mjs`

Run: `npm run build`

Expected: PASS with only the repository's pre-existing Rollup/chunk warnings.

### Task 5: Canonical documentation and regression suite

**Files:**
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/RELATORIO-GERENCIAL-IA.md`

- [x] **Step 1: Document the single producer and metric meanings**

Document closed monthly sources, distinction between active-base ticket and new-enrollment tickets, additional enrollments, total exits, configuration-derived program goals, comparable-period rule, and AI narrative-only responsibility.

- [x] **Step 2: Run targeted regression tests**

Run:

```powershell
node --test `
  tests/relatorioGerencialCanonico.test.mjs `
  tests/relatorioGerencialCanonicoPostgres.test.mjs `
  tests/relatoriosMensaisBotoesCanonicos.test.mjs `
  tests/relatorioAdminMensalRicoCanonico.test.mjs `
  tests/relatorioComercialMensalRetificacaoAuditada.test.mjs `
  tests/relatorioCoordenacaoRankingV3.test.mjs
```

Expected: all pass, with PostgreSQL test skipped only if Docker is unavailable.

- [x] **Step 3: Run final verification**

Run: `deno check supabase/functions/gemini-relatorio-gerencial/index.ts`

Run: `npm run build`

Run: `git diff --check`

Expected: zero errors.

- [x] **Step 4: Review the isolated diff**

Confirm only the files listed in this plan changed, no snapshot row was mutated, no PR #24 file was touched, and no deployment/merge happened without an explicit integration checkpoint.

### Task 6: Embedded-browser clipboard hardening

**Files:**
- Modify: `src/lib/clipboard.ts`
- Modify: `src/components/App/Administrativo/ModalRelatorio.tsx`
- Create: `tests/clipboardCopySynchronousFallback.test.mjs`

- [x] **Step 1: Reproduce the stale clipboard failure in a regression test**

Require the synchronous copy path to run before the first asynchronous Clipboard API attempt, preserving the user-click permission in embedded browsers.

- [x] **Step 2: Keep a manual recovery path visible**

When both browser copy methods fail, focus and select the visible report text and tell the user to press the platform copy shortcut.

- [x] **Step 3: Run clipboard and full regressions**

Run the clipboard regression together with the canonical managerial, monthly report, PostgreSQL, Deno, build, and diff checks.
