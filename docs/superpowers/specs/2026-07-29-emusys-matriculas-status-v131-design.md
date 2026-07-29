# Emusys Matriculas Status v1.3.1 - Canonical Lifecycle Design

**Date:** 2026-07-29  
**Status:** Approved for implementation  
**Authority:** Alf, based on the Emusys API v1.3.1 changelog and live GET validation  
**Scope:** LA Report current student lifecycle, operational metrics, reports, dashboards, professor portfolios, LA Teacher/Fabio read models, sync and matrícula webhooks

## 1. Decision

The canonical current state of an Emusys matrícula is scoped by:

```text
unidade_id + emusys_matricula_id
```

The business mapping is:

| Emusys state | Local state | Meaning |
|---|---|---|
| `ativa` | `ativo` | Current active matrícula |
| `trancada` | `trancado` | Temporary lock currently in force |
| `inativa` + `interrompida` | `evadido` | Definitive interruption |
| `inativa` + `concluida` | `inativo` | Contract concluded without an active renewal |
| unknown/inconsistent | no automatic local transition | Audit queue |

`status=finalizada` is only a request alias accepted by the Emusys API. New GET payloads return `status=inativa`. Legacy payloads that contain `finalizada` remain readable but are never allowed to fall back to `ativo`.

### 1.1 Temporary lock rule

While `trancada`, the matrícula:

- preserves its identity and pedagogical history;
- appears in a dedicated current-lock list;
- does not enter active students, active matrículas, professor portfolio, MRR, ticket, delinquency, attendance denominator, Health Score, churn/current-retention population or operational occupancy;
- does not become evasion;
- may return to `ativo` when the Emusys GET reports `ativa` again.

Closed historical snapshots remain immutable. The new rule applies to live/open periods and future snapshots.

## 2. Source of Truth

### 2.1 Raw current source

Create `public.emusys_matriculas_estado_atual`, keyed by `(unidade_id, emusys_matricula_id)`, to preserve the current GET state even when no local student row is linked.

Minimum fields:

- `unidade_id`;
- `emusys_matricula_id`;
- `emusys_aluno_id`;
- `status_emusys`;
- `motivo_inativa`;
- `trancamento_id`;
- `trancamento_motivo`;
- `trancamento_data_inicial`;
- `trancamento_data_final`;
- `contrato_atual_id`;
- `payload_snapshot`;
- `payload_hash`;
- `sincronizado_em`;
- `primeiro_visto_em`;
- `updated_at`.

The raw table is backend-only. It is not a frontend reporting source.

### 2.2 Canonical projection

Create `public.vw_aluno_estado_operacional_canonico` joining `alunos` to the raw state by unit and Emusys matrícula ID. It exposes:

- raw Emusys state and reason;
- resolved local lifecycle state;
- `entra_base_ativa`;
- `entra_base_vinculada`;
- `entra_carteira_professor`;
- `entra_financeiro_ativo`;
- current lock details;
- source and sync timestamp.

`entra_base_ativa`, `entra_carteira_professor` and `entra_financeiro_ativo` are true only for `ativa`.

The view is the semantic contract. Existing tables remain for compatibility while live consumers migrate.

## 3. Write Paths

### 3.1 GET sync

`sync-matriculas-emusys` must:

1. fetch `status=todas`;
2. validate only `ativa`, `trancada` and `inativa`;
3. preserve `motivo_inativa` and `trancamento_ativo`;
4. bulk-upsert the raw current-state table;
5. update the canonical journey status;
6. propose/apply local lifecycle transitions only through the existing fixed-field and canonical-decision guards;
7. never map an unknown state to `ativo`;
8. process `inativa/concluida` in the renewal/non-renewal path;
9. process `inativa/interrompida` as a definitive interruption;
10. leave ambiguous states in the audit queue.

The sync does not fabricate movement dates and does not create historical movement rows from a GET snapshot when the actual event date is unavailable.

### 3.2 Webhooks

`processar-matricula-emusys` must use the same lifecycle resolver:

- `matricula_trancamento` sets a temporary lock and records its dates;
- `matricula_finalizacao` must not always mean evasion;
- a conclusion/non-renewal motive maps to concluded/inactive;
- interruption motives map to evasion;
- an absent or ambiguous motive is not automatically classified as evasion and goes to audit.

Webhook idempotency and raw payload logging remain unchanged.

### 3.3 Manual administrative actions

Manual status operations must use local student ID or `(unidade_id, emusys_matricula_id)`, never name alone.

The LA Report may record an operational action, but the next Emusys reconciliation must make any source disagreement visible. A manual action cannot silently override a different current Emusys state.

## 4. Read Consumers

### 4.1 Current operational consumers

The following current/live concepts must exclude `trancado`:

- active students and active matrículas;
- paying students, MRR and ticket;
- current professor portfolio and student count;
- average students per class and room occupancy;
- current attendance population;
- current Health Score student-count inputs;
- current churn/fidelity population;
- delinquency;
- current renewal/contact base;
- current contracts and upcoming-contract lists.

### 4.2 Dedicated lock outputs

Expose two different measurements:

- **Currently locked:** current `trancada` state from the canonical projection.
- **Locks started in the period:** `movimentacoes_admin.tipo='trancamento'` in the selected period.

They must not share a label or denominator.

### 4.3 Reports and surfaces

Inventory and migrate, at minimum:

- Administrative page, KPI details and report modal;
- Students page, cards, filters, audit and reconciliation;
- Dashboard and Analytics;
- Management monthly pages and monthly closing preview;
- Commercial/administrative/managerial reports;
- WhatsApp administrative report and AI-generated report inputs;
- Professor portfolio, cards, modal, Health Score and reports;
- Success of Student and retention/fidelity consumers;
- LA Teacher `app_*` read models;
- Fabio portfolio/context read models;
- contracts-expiring and finance read models;
- BI query documentation and metric contracts.

Legacy functions remain untouched unless a live consumer still invokes them. Their names must be documented as legacy rather than silently repurposed.

## 5. Administrative UX

The Administrative page must show:

- `Ativos agora`: current active matrículas only;
- `Trancados agora`: current temporary locks, with reason and return window;
- `Trancamentos no período`: movements started in the selected period;
- `Interrupções definitivas`: `inativa/interrompida`;
- `Contratos concluídos`: `inativa/concluida`.

No card may count a temporarily locked matrícula both as active and locked.

Historical closed months keep their stored snapshots. Current/open-period cards identify the live canonical source.

## 6. Security

- Raw Emusys payload is backend-only.
- New table starts with RLS enabled and no `anon`/`authenticated` write grants.
- Materializer and sync helpers are service-role only.
- Read views expose only operational fields required by authenticated LA Report consumers.
- Any helper used by a CHECK constraint, trigger or default keeps the execution grant required by the writer role.
- IDs are always unit-scoped.

## 7. Rollout

1. Capture a read-only baseline of all affected KPIs by unit.
2. Add raw-state storage and canonical projection.
3. Add resolver tests and update GET sync without running it.
4. Update webhook handling and tests.
5. Migrate live database views/RPCs.
6. Migrate frontend and Edge Function consumers.
7. Build and run SQL/TypeScript tests.
8. Run the GET sync in controlled unit batches.
9. Compare before/after counts and audit unexpected transitions.
10. Recompute only the open July period and live caches.
11. Validate all three units in the browser.
12. Preserve rollback by keeping previous function definitions in the migration and by avoiding destructive schema changes.

## 8. Required Tests

1. `ativa` maps to active.
2. `trancada` with valid details maps to temporary lock.
3. `inativa/interrompida` maps to definitive interruption.
4. `inativa/concluida` maps to concluded/inactive.
5. Unknown status never maps to active.
6. `trancada` is excluded from every active denominator.
7. `trancada` remains visible in current-lock outputs.
8. A concluded contract is not counted as evasion.
9. An interrupted contract is not counted as conclusion/non-renewal.
10. An ambiguous finalization webhook goes to audit.
11. IDs with the same numeric value in different units remain isolated.
12. Fixed local decisions are not overwritten.
13. Closed snapshots are unchanged.
14. July live/open values are recalculated consistently across UI, reports and RPCs.
15. Anonymous users cannot read raw payloads or call materializers.

## 9. Acceptance Criteria

- No production code contains an unknown-status fallback to `ativo`.
- The live GET totals reconcile by unit with the raw-state table.
- Current active counts exclude all 28 temporary locks found in the 2026-07-29 audit.
- Interrupted and concluded inactives are reported separately.
- Administrative page, reports, dashboards and professor/student views agree for the same unit and cut date.
- LA Teacher and Fabio receive only active current portfolios.
- No closed historical snapshot changes.
- A before/after audit report records every affected consumer and residual risk.
