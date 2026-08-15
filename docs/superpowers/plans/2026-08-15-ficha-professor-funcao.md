# Ficha Técnica Professor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved professor scenario bank and make questionnaire submission deterministic, strictly validated, and transactionally single-use without enabling the Professores UI.

**Architecture:** Keep the public bearer-token Edge Function as the questionnaire boundary. Move pure payload/ranking rules to a small local module covered by Node tests, and delegate the final database mutation to a service-role-only PostgreSQL RPC that locks the token and writes the test, answers, collaborator profile, and token state atomically. Add a dedicated token foreign key and partial unique index so old `evento_token` usages remain compatible.

**Tech Stack:** Supabase Edge Function (Deno/TypeScript), PostgreSQL migration/RPC, Node `node:test`, TOML function configuration.

---

### Task 1: Pure questionnaire contract

**Files:**
- Create: `supabase/functions/ficha-tecnica/logic.mjs`
- Test: `tests/fichaTecnicaProfessorContract.test.mjs`
- Modify: `supabase/functions/ficha-tecnica/index.ts`

- [x] Write failing tests for dynamic A counts, exact question/option validation, known cargo rejection, and explicit B/D tie orders.
- [x] Run the focused test and verify it fails because the new contract is absent.
- [x] Implement the pure validator/ranking helpers and import them from the Edge Function.
- [x] Add `BLOCO_A.PROFESSOR` and `DESEMPATE_A.PROFESSOR` from the approved attachments.
- [x] Run the focused test and verify it passes.

### Task 2: Atomic conclusion RPC

**Files:**
- Create: `supabase/migrations/20260815120000_ficha_tecnica_submit_transacional.sql`
- Modify: `supabase/functions/ficha-tecnica/index.ts`
- Test: `tests/fichaTecnicaSubmitRpcContract.test.mjs`

- [x] Write a failing migration contract test for the dedicated token foreign key, partial unique index, row lock, and service-role-only RPC.
- [x] Run the focused test and verify it fails.
- [x] Add `ficha_token_id`, its foreign key, and a partial unique index on `professor_perfil_testes`.
- [x] Add the transaction RPC with `FOR UPDATE`, duplicate/use checks, response-shape checks, inserts, profile update, and token update.
- [x] Replace the Edge Function's separate submit writes with the RPC call and map token conflicts to HTTP 409.
- [x] Run the focused test and verify it passes.

### Task 3: Configuration and regression verification

**Files:**
- Modify: `supabase/config.toml`
- Test: `tests/fichaTecnicaProfessorContract.test.mjs`

- [x] Add explicit `[functions.ficha-tecnica] verify_jwt = false`.
- [x] Verify the UI files remain unchanged and the department remains disabled.
- [x] Run focused contract tests, the repository test suite, and the available TypeScript/build checks.
- [x] Review the diff and report any baseline failures separately from this change.

The local `supabase db lint` gate remains unavailable because this worktree has no local Postgres and is not CLI-linked; the migration was reviewed statically and protected by the contract tests.
