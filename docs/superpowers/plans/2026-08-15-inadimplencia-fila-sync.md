# Fila Única do Sync Financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir três crons concorrentes por uma fila financeira durável, com backoff de 429, descoberta de competências antigas, tolerância auditável a IDs opcionais inválidos e sonda read-only por unidade.

**Architecture:** Um job representa uma competência global. RPCs privadas fazem enqueue, claim com lease, retry e conclusão; a Edge coleta as três unidades em série e só então usa a publicação atômica existente. A sonda de uma unidade nunca cria run nem escreve dados, e nenhum cron novo é ligado antes do gate.

**Tech Stack:** PostgreSQL 17, Supabase migrations/RPC/RLS, Supabase Edge Functions (Deno/TypeScript), Node Test Runner e fixture Docker PostgreSQL.

---

### Task 1: Contrato de erro e identidade do coletor

**Files:**
- Modify: `supabase/functions/_shared/faturasSync.ts`
- Modify: `tests/faturasSyncColeta.test.mjs`

- [ ] **Step 1: escrever testes vermelhos para 429 persistente e ID opcional inválido**

Adicionar casos equivalentes a:

```js
assert.throws(
  () => mapFatura(rawFatura({ matricula_id: 'inválida' }), 'cg', UNIDADE, COMPETENCIA),
  /never/, // deve deixar de lançar após a implementação
);

await assert.rejects(
  () => coletarFaturasUnidade({ ...options, fetchFn: async () => response429 }),
  (error) => error.code === 'EMUSYS_RATE_LIMIT'
    && error.retryAfterMs === 7000
    && calls === 1,
);
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `node --test --test-isolation=none tests/faturasSyncColeta.test.mjs`  
Expected: FAIL porque 429 ainda tenta cinco vezes e `matricula_id` inválido aborta.

- [ ] **Step 3: implementar erros tipados e avisos de validação**

Criar contratos públicos:

```ts
export class EmusysRateLimitError extends Error {
  readonly code = 'EMUSYS_RATE_LIMIT';
  constructor(public readonly retryAfterMs: number, unidade: string) {
    super(`Emusys /faturas ${unidade}: HTTP 429`);
  }
}

export class EmusysHttpError extends Error {
  readonly code = 'EMUSYS_HTTP_ERROR';
  constructor(public readonly status: number, message: string) { super(message); }
}

export type FaturaValidationIssue = {
  field: 'matricula_id' | 'contrato_id' | 'aluno_id';
  code: 'invalid_optional_identifier';
  raw_value: string;
};
```

`id` da fatura continua obrigatório. Para os três IDs opcionais, retornar
`null`, acumular `validation_issues` e guardar os avisos em
`payload._la_report.validation_issues`. Em 429, lançar
`EmusysRateLimitError` na primeira resposta, respeitando `Retry-After` sem
sleep/retry local.

- [ ] **Step 4: executar e confirmar os testes verdes**

Run: `node --test --test-isolation=none tests/faturasSyncColeta.test.mjs`  
Expected: todos PASS.

- [ ] **Step 5: commit**

```powershell
git add -- supabase/functions/_shared/faturasSync.ts tests/faturasSyncColeta.test.mjs
git commit -m "fix(financeiro): tornar 429 e ids opcionais auditaveis"
```

### Task 2: Fila durável e backlog canônico

**Files:**
- Create: `supabase/migrations/20260816013455_financeiro_sync_queue.sql`
- Create: `tests/financeiroSyncQueuePostgres.test.mjs`
- Create: `tests/financeiroSyncQueueContract.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: escrever a fixture PostgreSQL vermelha**

A fixture deve exigir estas assinaturas:

```sql
public.enqueue_financeiro_sync_competencias(date[], text, text, integer)
public.enqueue_financeiro_sync_backlog(text, text)
public.claim_financeiro_sync_job(uuid, integer)
public.retry_financeiro_sync_job(uuid, uuid, uuid, text, text, integer, integer)
public.complete_financeiro_sync_job(uuid, uuid, uuid)
public.fail_financeiro_sync_job(uuid, uuid, uuid, text, text)
```

Cobrir: enqueue repetido produz um job ativo; dois claims não obtêm dois jobs
`running`; lease expirado volta a retry; 429 agenda `next_attempt_at` no futuro;
tentativa máxima termina em `failed`; junho entra no backlog quando o último
snapshot completo contém aberta; junho sai quando o snapshot mais novo contém
somente paga; `authenticated` recebe `42501`.

- [ ] **Step 2: executar e confirmar a falha por migration ausente**

Run: `node --test --test-isolation=none tests/financeiroSyncQueueContract.test.mjs tests/financeiroSyncQueuePostgres.test.mjs`  
Expected: FAIL porque a fila/RPCs não existem.

- [ ] **Step 3: criar tabela, índices e RPCs privadas**

O núcleo da tabela deve ser:

```sql
create table public.financeiro_sync_queue (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  status text not null default 'pending',
  priority integer not null default 100,
  trigger_source text not null,
  requested_by text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_id uuid,
  sync_run_id uuid references public.sync_runs(id),
  last_http_status integer,
  last_error_code text,
  last_error_detail text,
  last_retry_after_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending','running','retry_wait','succeeded','failed')),
  check (competencia = date_trunc('month', competencia)::date)
);

create unique index financeiro_sync_queue_competencia_active_uniq
  on public.financeiro_sync_queue (competencia)
  where status in ('pending','running','retry_wait');

create unique index financeiro_sync_queue_one_running_uniq
  on public.financeiro_sync_queue ((true))
  where status = 'running';

create index financeiro_sync_queue_due_idx
  on public.financeiro_sync_queue (priority, next_attempt_at, created_at)
  where status in ('pending','retry_wait');
```

O claim usa `FOR UPDATE SKIP LOCKED` numa transação curta. O retry calcula
`greatest(Retry-After, least(3600, 30 * 2^(attempt_count-1)))`. Todas as funções
validam `auth.role()='service_role'`, revogam `PUBLIC/anon/authenticated` e
concedem somente a `service_role`. Ativar RLS sem política pública.

No fim da migration, neutralizar somente:

```sql
sync-faturas-competencia-atual
sync-faturas-competencia-anterior
sync-faturas-competencia-seguinte
```

Não criar cron novo.

- [ ] **Step 4: executar fixture, contrato e advisors locais**

Run: `node --test --test-isolation=none tests/financeiroSyncQueueContract.test.mjs tests/financeiroSyncQueuePostgres.test.mjs`  
Expected: PASS, incluindo backlog de junho e ACL.

- [ ] **Step 5: commit**

```powershell
git add -- package.json supabase/migrations/20260816013455_financeiro_sync_queue.sql tests/financeiroSyncQueueContract.test.mjs tests/financeiroSyncQueuePostgres.test.mjs
git commit -m "feat(financeiro): adicionar fila duravel de sincronizacao"
```

### Task 3: Worker único e sonda read-only

**Files:**
- Create: `supabase/functions/_shared/financeiroSyncQueue.ts`
- Modify: `supabase/functions/sync-faturas-emusys/index.ts`
- Modify: `supabase/functions/refresh-contas-receber/index.ts`
- Modify: `tests/faturasSyncFrescorContrato.test.mjs`
- Create: `tests/financeiroSyncWorker.test.mjs`

- [ ] **Step 1: escrever contratos vermelhos**

Os testes devem exigir:

```js
assert.match(syncSource, /claim_financeiro_sync_job/);
assert.match(syncSource, /retry_financeiro_sync_job/);
assert.match(syncSource, /complete_financeiro_sync_job/);
assert.match(syncSource, /mode\s*===\s*'probe'/);
assert.doesNotMatch(probeBranch, /start_financeiro_sync_run|publish_financeiro_sync_run/);
assert.match(refreshSource, /enqueue_financeiro_sync_backlog/);
```

Também testar `classifyFinanceiroSyncError`: 429/rede/5xx são retry; validação
de paginação/ID obrigatório é terminal; `Retry-After` é convertido para
segundos inteiros.

- [ ] **Step 2: executar e confirmar a falha**

Run: `node --test --test-isolation=none tests/faturasSyncFrescorContrato.test.mjs tests/financeiroSyncWorker.test.mjs`  
Expected: FAIL porque o endpoint ainda inicia runs diretamente.

- [ ] **Step 3: implementar protocolo puro da fila**

`financeiroSyncQueue.ts` deve exportar:

```ts
export type FinanceiroQueueJob = {
  id: string;
  competencia: string;
  attempt_count: number;
  max_attempts: number;
};

export type ClassifiedSyncError = {
  retryable: boolean;
  code: string;
  detail: string;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
};

export function classifyFinanceiroSyncError(error: unknown): ClassifiedSyncError;
```

- [ ] **Step 4: converter `sync-faturas-emusys` para enqueue/claim**

Fluxo obrigatório:

```text
autenticar -> enqueue explícito/backlog -> claim de um job
-> start_financeiro_sync_run -> coletar CG/Recreio/Barra em série
-> publish_financeiro_sync_run -> complete_financeiro_sync_job
```

Em falha: primeiro `fail_financeiro_sync_run`; depois `retry_*` ou `fail_*` da
fila conforme a classificação. Retornar HTTP 202 com `ok:false` para
`retry_wait`, nunca `ok:true`.

No modo `probe`, exigir `service_role`, aceitar somente `cg|recreio|barra`,
coletar uma unidade e devolver `probe:true`, competência, resumo e itens. Esse
ramo não pode chamar nenhuma RPC de run/fila/publicação.

- [ ] **Step 5: converter o refresh interno**

Aceitar competências explícitas sem limite artificial de duas, ou
`include_backlog=true`; enfileirar e acordar exatamente um worker. Devolver
`queue_status`, `next_attempt_at`, `sync_run_id` e erro real.

- [ ] **Step 6: executar testes**

Run: `node --test --test-isolation=none tests/faturasSyncColeta.test.mjs tests/faturasSyncFrescorContrato.test.mjs tests/financeiroSyncWorker.test.mjs`  
Expected: todos PASS.

- [ ] **Step 7: commit**

```powershell
git add -- supabase/functions/_shared/financeiroSyncQueue.ts supabase/functions/_shared/faturasSync.ts supabase/functions/sync-faturas-emusys/index.ts supabase/functions/refresh-contas-receber/index.ts tests/faturasSyncFrescorContrato.test.mjs tests/financeiroSyncWorker.test.mjs
git commit -m "feat(financeiro): processar faturas pela fila unica"
```

### Task 4: Quarentena canônica de identidade inválida

**Files:**
- Create: `supabase/migrations/20260816010100_inadimplencia_canonica_identidade.sql`
- Modify: `tests/inadimplenciaCanonicaContract.test.mjs`
- Modify: `tests/inadimplenciaCanonicaPostgres.test.mjs`

- [ ] **Step 1: adicionar cenário vermelho**

Inserir item aberto/fresco cujo `payload` contenha:

```json
{"_la_report":{"validation_issues":[{"field":"matricula_id","code":"invalid_optional_identifier"}]}}
```

Exigir `status='incomplete'`, `items=[]`,
`reconciliation.validation_issue_count=1` e uma linha em
`invalid_identity_invoices`.

- [ ] **Step 2: executar e confirmar que a fatura ainda aparece em `items`**

Run: `node --test --test-isolation=none tests/inadimplenciaCanonicaContract.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs`  
Expected: FAIL no cenário de identidade.

- [ ] **Step 3: substituir a função por versão que separa avisos**

Na CTE de linhas relevantes, derivar:

```sql
coalesce(jsonb_array_length(i.payload #> '{_la_report,validation_issues}'), 0)
  as validation_issue_count
```

Excluir essas linhas de `itens_confirmados`, deduplicá-las por
`canonical_fatura_id` em `itens_identidade_invalida` e expor contagem/lista na
reconciliação. Manter todas as garantias de frescor, dedupe global, juros, BRT,
ACL e fronteira da Sol.

- [ ] **Step 4: executar testes e fixture**

Run: `node --test --test-isolation=none tests/inadimplenciaCanonicaContract.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs`  
Expected: PASS.

- [ ] **Step 5: commit**

```powershell
git add -- supabase/migrations/20260816010100_inadimplencia_canonica_identidade.sql tests/inadimplenciaCanonicaContract.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs
git commit -m "fix(financeiro): colocar ids invalidos em reconciliacao"
```

### Task 5: Publicação controlada do checkpoint 3

**Files:**
- Create: `docs/auditorias/2026-08-15-inadimplencia-fila-sync-checkpoint-3.md`
- Rename after remote apply: migrations created in Tasks 2 and 4 to the exact versions returned by the Supabase ledger

- [ ] **Step 1: rodar suíte focada e verificações estáticas**

```powershell
node --test --test-isolation=none tests/faturasSyncColeta.test.mjs tests/faturasSyncFrescorContrato.test.mjs tests/financeiroSyncWorker.test.mjs tests/financeiroSyncQueueContract.test.mjs
node --test --test-isolation=none tests/financeiroSyncQueuePostgres.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs
git diff --check
```

Expected: tudo PASS e nenhum erro de whitespace.

- [ ] **Step 2: aplicar migrations uma a uma e alinhar o ledger**

Aplicar somente o SQL das duas migrations pelo Supabase, listar o ledger,
renomear cada arquivo para a versão efetivamente registrada e fixar hashes
locais dos statements remotos nos testes. Não usar `db push --include-all`.

- [ ] **Step 3: validar banco remoto sem chamar o Emusys**

Comprovar: RLS/ACL; nenhum job `running`; backlog contém competências antigas
esperadas; três crons diretos ausentes/inativos; nenhum cron novo; leitura
canônica continua `stale` com `items=[]`.

- [ ] **Step 4: publicar Edge Functions preservando JWT**

Deploy de `sync-faturas-emusys` com `verify_jwt=true` e
`refresh-contas-receber` com seu valor atual `verify_jwt=false`. Validar versão,
fonte e logs. Não invocar `probe` nem worker neste task.

- [ ] **Step 5: executar advisors e documentar evidência**

Registrar migrations/versões, testes, ACL, crons neutralizados, Edge versions e
o fato de que nenhum request foi feito ao Emusys e nenhum cron foi ligado.

- [ ] **Step 6: revisão independente e commit**

```powershell
git add -- docs/auditorias/2026-08-15-inadimplencia-fila-sync-checkpoint-3.md supabase/migrations tests supabase/functions package.json
git commit -m "chore(financeiro): fechar checkpoint da fila unica"
```

O próximo passo continua sendo o checkpoint 4. A sonda real e a comparação
item a item ficam exclusivamente no checkpoint 6 aprovado.
