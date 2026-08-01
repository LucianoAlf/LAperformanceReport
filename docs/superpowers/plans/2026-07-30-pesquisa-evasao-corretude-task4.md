# Pesquisa de Evasao Task 4 Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os sete bloqueios de corretude do claim e do envio sem acesso a producao, push, deploy ou merge.

**Architecture:** O PostgreSQL continua sendo a autoridade atomica do slot e passa a identificar cada resultado pela tripla pesquisa, preview e idempotency key, sempre travando preview antes do cabecalho. A Edge separa configuracao pre-dispatch de falhas posteriores ao fetch, e reconsulta a mesma claim quando a resposta do registro de sucesso se perde. A fixture roda somente em banco PostgreSQL 17 descartavel com marcador externo a `public`.

**Tech Stack:** PostgreSQL 17, PL/pgSQL, Deno/TypeScript, Node.js test runner, Docker CLI.

---

### Task 1: Terminal legado, invariantes e reaplicacao

**Files:**
- Modify: `supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql`
- Test: `tests/fixtures/pesquisa_evasao_claim_pg17.sql`
- Test: `tests/pesquisaEvasaoEdgeSegura.test.mjs`

- [ ] **Step 1: Write failing PG17 cases**

Criar previews novas sobre cabecalhos `ignorado`, `invalidada` e `recusada_opt_out`; cada claim deve consumir a preview com `envio_status_tentativa='bloqueado'`, retornar `deve_despachar=false` e continuar false no replay. Criar previews incompletas sem `aluno_id`, `data_evasao_snapshot` e `caixa_id`, exigindo `PESQUISA_EVASAO_PREVIEW_SNAPSHOT_INCOMPLETO`.

- [ ] **Step 2: Run RED**

Run:

```powershell
$env:PESQUISA_EVASAO_PG17_CONTAINER='pesquisa-evasao-pg17-task4-review2'
node --test tests/pesquisaEvasaoEdgeSegura.test.mjs
```

Expected: terminal legado reutiliza indevidamente o cabecalho ou os novos casos estruturais falham.

- [ ] **Step 3: Implement the production eligibility predicate**

Permitir reuso produtivo apenas quando:

```sql
v_existente.envio_status in ('nao_enviado', 'falhou')
and v_existente.resposta_status = 'sem_resposta'
and v_existente.status in ('pendente', 'falha_envio', 'sem_whatsapp')
```

Qualquer outro estado consome e bloqueia apenas a preview nova. Validar os tres campos obrigatorios no snapshot. Trocar o indice ativo por `drop index if exists` seguido da definicao canonica e reaplicar a FK por `drop constraint` mais `add constraint`.

- [ ] **Step 4: Run GREEN and commit**

Run the same Node command and commit only migration/fixture/structural tests.

### Task 2: Identidade completa e ordem unica de locks

**Files:**
- Modify: `supabase/migrations/20260730173000_pesquisa_evasao_claim_seguro.sql`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`
- Test: `tests/fixtures/pesquisa_evasao_claim_pg17.sql`
- Test: `tests/pesquisaEvasaoEdgeSegura.test.mjs`

- [ ] **Step 1: Write failing signature and stale/concurrency cases**

Exigir a assinatura:

```sql
(uuid, uuid, uuid, uuid, text, text, text)
```

Testar resultado da tentativa A depois de B ser atual, sem mudar B; testar replay e registro concorrentes por `dblink` com `lock_timeout`, sem deadlock e com estado final coerente.

- [ ] **Step 2: Run RED**

Expected: a assinatura nova esta ausente e o corpo atual contem `from public.pesquisa_evasao ... for update` antes do lock de `pesquisa_evasao_previews`.

- [ ] **Step 3: Implement preview-to-header locking**

O registrador seleciona primeiro a preview por:

```sql
pp.id = p_preview_id
and pp.idempotency_key = p_idempotency_key
and pp.auth_user_id = p_auth_user_id
```

Depois seleciona o cabecalho por `id`, `preview_id` e `idempotency_key`. Revogar e remover a assinatura antiga de cinco argumentos; a Edge envia `claim.preview_id` e `claim.idempotency_key`.

- [ ] **Step 4: Run GREEN and commit**

Executar fixture e testes estruturais antes do commit local.

### Task 3: Runner destrutivo seguro

**Files:**
- Create: `tests/helpers/runPesquisaEvasaoPg17Fixture.mjs`
- Modify: `tests/pesquisaEvasaoEdgeSegura.test.mjs`
- Modify: `tests/fixtures/pesquisa_evasao_claim_pg17.sql`

- [ ] **Step 1: Write failing runner/guard tests**

O teste deve exigir nome de container permitido, imagem `postgres:17*`, servidor 17, criar `pesquisa_evasao_fixture_<hex>`, criar `fixture_safety.sentinel`, provar que apenas uma GUC em `postgres` nao passa pelo guard e remover o banco em `finally`.

- [ ] **Step 2: Run RED**

Expected: o runner atual usa diretamente `postgres` e nao cria nem remove banco descartavel.

- [ ] **Step 3: Implement the disposable database runner**

Usar `crypto.randomBytes`, `createdb`, `psql`, `dropdb --force` e confirmar a ausencia do banco depois do `finally`. O guard SQL verifica nome, `server_version_num`, segredo da GUC e a linha correspondente em `fixture_safety.sentinel` antes de qualquer `drop schema`.

- [ ] **Step 4: Run GREEN and commit**

Executar o teste com container PostgreSQL 17 real e confirmar zero skip.

### Task 4: Configuracao exata antes do dispatch

**Files:**
- Modify: `supabase/functions/enviar-pesquisa-evasao/provider.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/provider.test.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`
- Test: `tests/pesquisaEvasaoEdgeSegura.test.mjs`

- [ ] **Step 1: Write failing pure tests**

Testar caixa divergente, consulta com erro, URL/token UAZAPI ausentes e URL/session WAHA ausentes. Em todos os casos o contador do fake fetch permanece zero.

- [ ] **Step 2: Run RED**

Run:

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/provider.test.ts
```

- [ ] **Step 3: Implement exact lookup and validation**

A Edge consulta `whatsapp_caixas` diretamente pelo ID ativo, falha se nao houver exatamente uma linha ou se houver erro, valida protocolo HTTP(S), token/session e igualdade de `caixaId` antes de chamar `fetchProviderComTimeout`.

- [ ] **Step 4: Run GREEN and commit**

Executar teste Deno, check, lint, fmt e teste estrutural.

### Task 5: Recuperacao do sucesso e conversa observavel

**Files:**
- Create: `supabase/functions/enviar-pesquisa-evasao/flow.ts`
- Create: `supabase/functions/enviar-pesquisa-evasao/flow.test.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`

- [ ] **Step 1: Write failing flow tests**

Testar que uma reconsulta da mesma pesquisa/preview/key com `enviado` e o mesmo provider ID confirma sucesso; qualquer divergencia fica incerta. Testar conversa preparada, erro retornado e excecao, com `captura_resposta_preparada=false` e warning nos dois ultimos casos.

- [ ] **Step 2: Run RED**

Run:

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/flow.test.ts
```

- [ ] **Step 3: Implement recovery without redispatch**

Depois de erro no RPC de sucesso, chamar novamente `claim_pesquisa_evasao_preview` com a mesma preview. Se pesquisa, preview, key, status e provider ID coincidirem, responder sucesso; senao registrar `incerto` para a mesma identidade. A conversa retorna resultado explicito e nunca muda o envio para retryable.

- [ ] **Step 4: Run GREEN and commit**

Executar testes do flow e da Edge antes do commit.

### Task 6: Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run complete Node and PG17 matrix**

```powershell
$env:PESQUISA_EVASAO_PG17_CONTAINER='pesquisa-evasao-pg17-task4-review2'
node --test tests/pesquisaEvasaoFundacaoSegura.test.mjs tests/pesquisaEvasaoEdgeSegura.test.mjs
```

- [ ] **Step 2: Run complete Deno matrix**

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/contract.test.ts supabase/functions/enviar-pesquisa-evasao/auth.test.ts supabase/functions/enviar-pesquisa-evasao/provider.test.ts supabase/functions/enviar-pesquisa-evasao/flow.test.ts
deno check supabase/functions/enviar-pesquisa-evasao/index.ts
deno lint supabase/functions/enviar-pesquisa-evasao
deno fmt --check supabase/functions/enviar-pesquisa-evasao
```

- [ ] **Step 3: Cleanup and audit**

Parar o container de teste, confirmar que o runner removeu seus bancos, executar `git status --porcelain=v1`, listar hashes locais e reportar explicitamente que nao houve producao, push, deploy, PR ou merge.
