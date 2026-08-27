# Convergência de presença — Fase 2: recibos duráveis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fortalecer o protocolo direto criado pelo Hugo com `request_id` persistente por usuário e intenção, sem trocar as RPCs que já funcionam em produção.

**Architecture:** `presencaRecibo.ts` continua sendo a única carteira de pedidos do frontend. Cada intenção recebe uma chave formada por usuário autenticado, superfície e payload; a carteira usa memória com espelho em `sessionStorage`, aceita várias intenções ambíguas simultâneas e só remove uma entrada após validar um recibo resolvido correspondente.

**Tech Stack:** React 18/19, TypeScript, Supabase JS, Web Storage API, Node test runner, Vite e navegador autenticado.

---

## Contrato desta fase

- Manter as RPCs diretas `app_registrar_chamada_agenda`,
  `app_marcar_presenca_professor_aula`,
  `app_registrar_presenca_professor_dia` e
  `app_remover_presenca_professor_dia`.
- Manter `p_request_id` na mesma chamada que executa a ação.
- Não importar nem recriar `src/lib/presencaComando.ts` ou
  `src/lib/presencaEnvioPendente.ts`.
- Tratar `concluido`, `parcial`, `falhou` e `nao_recebido` como resolvidos;
  `recebido` e `processando` permanecem pendentes.
- Falha de rede, erro do PostgREST, status desconhecido, recibo malformado ou
  `request_id` divergente preservam a intenção para retry.
- Uma resposta resolvida remove somente a chave correspondente.

## Mapa de arquivos

### Modificar

- `src/lib/presencaRecibo.ts`: validação do recibo, carteira em memória e persistência de sessão.
- `tests/presencaRecibo.test.mjs`: contrato de status e protocolo direto.
- `src/components/App/Agenda/Chamada/useChamadaAcoes.ts`: chamada de alunos.
- `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`: professor por aula e por dia.
- `src/components/App/Agenda/Chamada/ChamadaDia.tsx`: operação em lote dos professores.
- `docs/audits/2026-08-27-presenca-convergencia-execucao.md`: evidência sem PII.

### Criar

- `tests/presencaReciboPersistencia.test.mjs`: reload, usuários distintos, múltiplas intenções e recibos inválidos.

## Task 1: Travar o comportamento de persistência antes da implementação

**Files:**
- Create: `tests/presencaReciboPersistencia.test.mjs`
- Test: `src/lib/presencaRecibo.ts`

- [ ] **Step 1: Criar um armazenamento controlável no teste**

Create `tests/presencaReciboPersistencia.test.mjs` with these imports and helper:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chaveDoPedido,
  encerrarPedido,
  interpretarEEncerrarPedido,
  requestIdDoPedido,
} from '../src/lib/presencaRecibo.ts';

class SessionStorageMemoria {
  valores = new Map();

  getItem(chave) {
    return this.valores.get(chave) ?? null;
  }

  setItem(chave, valor) {
    this.valores.set(chave, valor);
  }

  removeItem(chave) {
    this.valores.delete(chave);
  }
}

const recibo = (requestId, status = 'concluido') => ({
  request_id: requestId,
  status,
  aplicados: status === 'falhou' || status === 'nao_recebido' ? 0 : 1,
  rejeitados: status === 'falhou' ? 1 : 0,
  erros: status === 'falhou' ? [{ codigo: 'status_invalido' }] : [],
});
```

- [ ] **Step 2: Adicionar os dez cenários bloqueantes**

Append to the same file:

```javascript
test('reload recupera o mesmo request id da sessão', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 1, status: 'presente' }]);
  const primeiro = requestIdDoPedido(chave, storage);
  const depoisDoReload = requestIdDoPedido(chave, storage, new Map());
  assert.equal(depoisDoReload, primeiro);
  encerrarPedido(chave, storage);
});

test('usuários distintos nunca compartilham intenção', () => {
  const storage = new SessionStorageMemoria();
  const payload = [{ aluno_id: 1, status: 'presente' }];
  const a = chaveDoPedido('user-a', 'chamada', payload);
  const b = chaveDoPedido('user-b', 'chamada', payload);
  assert.notEqual(a, b);
  assert.notEqual(requestIdDoPedido(a, storage), requestIdDoPedido(b, storage));
  encerrarPedido(a, storage);
  encerrarPedido(b, storage);
});

test('duas intenções ambíguas coexistem na mesma sessão', () => {
  const storage = new SessionStorageMemoria();
  const a = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 1, status: 'presente' }]);
  const b = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 2, status: 'falta' }]);
  const requestA = requestIdDoPedido(a, storage);
  const requestB = requestIdDoPedido(b, storage);
  assert.equal(requestIdDoPedido(a, storage, new Map()), requestA);
  assert.equal(requestIdDoPedido(b, storage, new Map()), requestB);
  encerrarPedido(a, storage);
  encerrarPedido(b, storage);
});

test('conteúdo inválido no storage é ignorado sem derrubar a chamada', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 3, status: 'falta' }]);
  storage.setItem(`la-report:presenca:pedidos:v2:${chave}`, '{invalido');
  assert.match(requestIdDoPedido(chave, storage), /^[0-9a-f-]{36}$/u);
  encerrarPedido(chave, storage);
});

test('resposta 200 malformada preserva request id', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 4, status: 'presente' }]);
  const requestId = requestIdDoPedido(chave, storage);
  assert.throws(
    () => interpretarEEncerrarPedido(chave, requestId, { aplicados: 1 }, storage),
    /recibo sem status/,
  );
  assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage);
});

test('recibo resolvido limpa apenas a própria intenção', () => {
  const storage = new SessionStorageMemoria();
  const a = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 5, status: 'presente' }]);
  const b = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 6, status: 'presente' }]);
  const requestA = requestIdDoPedido(a, storage);
  const requestB = requestIdDoPedido(b, storage);
  interpretarEEncerrarPedido(a, requestA, recibo(requestA), storage);
  assert.notEqual(requestIdDoPedido(a, storage, new Map()), requestA);
  assert.equal(requestIdDoPedido(b, storage, new Map()), requestB);
  encerrarPedido(a, storage);
  encerrarPedido(b, storage);
});

test('status desconhecido e request id divergente preservam a intenção', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'professor_aula', { aula_id: 10, presente: true });
  const requestId = requestIdDoPedido(chave, storage);
  assert.throws(
    () => interpretarEEncerrarPedido(chave, requestId, recibo(requestId, 'status_futuro'), storage),
    /status desconhecido/,
  );
  assert.throws(
    () => interpretarEEncerrarPedido(chave, requestId, recibo('00000000-0000-4000-8000-000000000099'), storage),
    /request_id divergente/,
  );
  assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage);
});

test('recebido e processando mantêm a intenção pendente', () => {
  for (const status of ['recebido', 'processando']) {
    const storage = new SessionStorageMemoria();
    const chave = chaveDoPedido('user-a', status, [{ aluno_id: 7, status: 'presente' }]);
    const requestId = requestIdDoPedido(chave, storage);
    const resultado = interpretarEEncerrarPedido(chave, requestId, recibo(requestId, status), storage);
    assert.equal(resultado.status, status);
    assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
    encerrarPedido(chave, storage);
  }
});

test('nao_recebido encerra a intenção para permitir novo envio', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 8, status: 'falta' }]);
  const requestId = requestIdDoPedido(chave, storage);
  interpretarEEncerrarPedido(chave, requestId, recibo(requestId, 'nao_recebido'), storage);
  assert.notEqual(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage);
});

test('timeout após envio conserva o ID para retry após reload', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 9, status: 'presente' }]);
  const requestIdEnviado = requestIdDoPedido(chave, storage);
  // O transporte perde a resposta: nenhum parser/encerramento é chamado.
  const requestIdDoRetry = requestIdDoPedido(chave, storage, new Map());
  assert.equal(requestIdDoRetry, requestIdEnviado);
  encerrarPedido(chave, storage);
});
```

- [ ] **Step 3: Rodar e confirmar RED**

Run:

```powershell
node --test tests/presencaReciboPersistencia.test.mjs
```

Expected: FAIL because `interpretarEEncerrarPedido` is not exported and
`chaveDoPedido` does not yet accept the user id.

## Task 2: Implementar a carteira durável e a validação fail-closed

**Files:**
- Modify: `src/lib/presencaRecibo.ts`
- Test: `tests/presencaRecibo.test.mjs`
- Test: `tests/presencaReciboPersistencia.test.mjs`

- [ ] **Step 1: Expandir os tipos sem aceitar cast inseguro**

In `src/lib/presencaRecibo.ts`, use these exact status sets:

```typescript
export type StatusRecibo =
  | 'nao_recebido'
  | 'recebido'
  | 'processando'
  | 'concluido'
  | 'parcial'
  | 'falhou';

const STATUS_RECIBO = new Set<StatusRecibo>([
  'nao_recebido',
  'recebido',
  'processando',
  'concluido',
  'parcial',
  'falhou',
]);

const STATUS_RESOLVIDO = new Set<StatusRecibo>([
  'nao_recebido',
  'concluido',
  'parcial',
  'falhou',
]);
```

Use this status/UI matrix in every consumer; do not collapse these outcomes
into a generic success or failure:

| Outcome | Clear request ID | Operational presentation |
|---|---:|---|
| `concluido` | yes | success with applied/rejected counters |
| `parcial` | yes | partial result with rejected items |
| `falhou` | yes | terminal rejection with canonical error |
| `nao_recebido` | yes | `Pedido não recebido; tente novamente.` |
| `recebido` / `processando` | no | `Pedido recebido; aguardando confirmação.` |
| PostgREST/network error | no | `Não foi possível consultar o resultado; tente novamente.` |
| malformed/unknown receipt | no | `Resposta inválida; pedido preservado para nova tentativa.` |

Change `interpretarRecibo` so it checks `STATUS_RECIBO.has(status)`, requires
non-negative integer `aplicados` and `rejeitados`, and requires `erros` to be an
array. Throw `Resposta inesperada do banco: status desconhecido`,
`contadores inválidos` or `erros inválidos` before returning any receipt.

- [ ] **Step 2: Substituir a Map única por memória + sessão injetáveis**

Add these definitions and preserve `novoRequestId`, `descreverErro`,
`descreverErrosDoRecibo` and `mensagemDeErro`:

```typescript
export interface ArmazenamentoPedidos {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

const PREFIXO_PEDIDO = 'la-report:presenca:pedidos:v2:';
const pedidosEmVoo = new Map<string, string>();

function storagePadrao(): ArmazenamentoPedidos | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function chaveStorage(chave: string): string {
  return `${PREFIXO_PEDIDO}${chave}`;
}

export function chaveDoPedido(usuarioId: string, escopo: string, payload: unknown): string {
  if (!usuarioId) throw new Error('Usuário autenticado obrigatório para registrar presença');
  return `${usuarioId}:${escopo}:${JSON.stringify(payload)}`;
}

export function requestIdDoPedido(
  chave: string,
  storage: ArmazenamentoPedidos | null = storagePadrao(),
  memoria: Map<string, string> = pedidosEmVoo,
): string {
  const emMemoria = memoria.get(chave);
  if (emMemoria) return emMemoria;
  try {
    const bruto = storage?.getItem(chaveStorage(chave));
    if (bruto) {
      const salvo = JSON.parse(bruto) as { requestId?: unknown };
      if (typeof salvo.requestId === 'string') {
        memoria.set(chave, salvo.requestId);
        return salvo.requestId;
      }
      storage?.removeItem(chaveStorage(chave));
    }
  } catch {
    try { storage?.removeItem(chaveStorage(chave)); } catch { /* memória segue disponível */ }
  }
  const requestId = novoRequestId();
  memoria.set(chave, requestId);
  try { storage?.setItem(chaveStorage(chave), JSON.stringify({ requestId })); } catch { /* best effort */ }
  return requestId;
}

export function encerrarPedido(
  chave: string,
  storage: ArmazenamentoPedidos | null = storagePadrao(),
  memoria: Map<string, string> = pedidosEmVoo,
): void {
  memoria.delete(chave);
  try { storage?.removeItem(chaveStorage(chave)); } catch { /* limpeza em memória já ocorreu */ }
}
```

- [ ] **Step 3: Encerrar somente depois de validar o recibo correspondente**

Add:

```typescript
export function interpretarEEncerrarPedido(
  chave: string,
  requestIdEsperado: string,
  data: unknown,
  storage: ArmazenamentoPedidos | null = storagePadrao(),
): ReciboPresenca {
  const recibo = interpretarRecibo(data);
  if (recibo.request_id && recibo.request_id !== requestIdEsperado) {
    throw new Error('Resposta inesperada do banco: request_id divergente');
  }
  if (STATUS_RESOLVIDO.has(recibo.status)) encerrarPedido(chave, storage);
  return recibo;
}
```

- [ ] **Step 4: Ajustar os testes antigos à chave por usuário**

In `tests/presencaRecibo.test.mjs`, change every call from
`chaveDoPedido(escopo, payload)` to
`chaveDoPedido('usuario-teste', escopo, payload)`. Add assertions that
`interpretarRecibo` rejects `status_futuro`, negative counters and non-array
`erros`.

- [ ] **Step 5: Rodar os dois arquivos e confirmar GREEN**

Run:

```powershell
node --test tests/presencaRecibo.test.mjs tests/presencaReciboPersistencia.test.mjs
```

Expected: all receipt and persistence tests pass.

- [ ] **Step 6: Commit do helper isolado**

```powershell
git add -- src/lib/presencaRecibo.ts tests/presencaRecibo.test.mjs tests/presencaReciboPersistencia.test.mjs
git commit -m "fix(presenca): persiste recibos por usuario e intencao"
```

## Task 3: Integrar a chamada de alunos sem trocar o transporte

**Files:**
- Modify: `src/components/App/Agenda/Chamada/useChamadaAcoes.ts`
- Test: `tests/presencaRecibo.test.mjs`

- [ ] **Step 1: Escrever a trava estática do consumidor**

Append to `tests/presencaRecibo.test.mjs`:

```javascript
test('chamada de alunos identifica usuário e só encerra após interpretar', () => {
  const codigo = arquivo('src/components/App/Agenda/Chamada/useChamadaAcoes.ts');
  assert.match(codigo, /useAuth\(\)/u);
  assert.match(codigo, /chaveDoPedido\(user\.id,\s*'chamada'/u);
  assert.match(codigo, /const requestId = requestIdDoPedido\(chave\)/u);
  assert.match(codigo, /app_registrar_chamada_agenda[\s\S]*p_request_id:\s*requestId/u);
  assert.match(codigo, /interpretarEEncerrarPedido\(chave,\s*requestId,\s*data\)/u);
  assert.doesNotMatch(codigo, /encerrarPedido\(chave\)[\s\S]{0,160}interpretarRecibo/u);
});
```

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node --test tests/presencaRecibo.test.mjs`

Expected: FAIL because the hook still clears before parsing and lacks `user.id`.

- [ ] **Step 3: Portar o helper para o hook**

In `useChamadaAcoes.ts`:

1. import `useAuth` from `@/contexts/AuthContext`;
2. replace imports of `encerrarPedido` and `interpretarRecibo` with
   `interpretarEEncerrarPedido`;
3. obtain `const { user } = useAuth()` at hook scope;
4. before setting `salvando`, reject missing `user?.id` with
   `toast.error('Sessão inválida', { description: 'Entre novamente para registrar a chamada.' })`;
5. build `const chave = chaveDoPedido(user.id, 'chamada', itens)`;
6. build `const requestId = requestIdDoPedido(chave)` once;
7. send `p_request_id: requestId`;
8. parse with `interpretarEEncerrarPedido(chave, requestId, data)`.

Branch on the returned status using the matrix from Task 2. In particular,
`recebido`/`processando` must show a non-terminal pending message,
`nao_recebido` must say the request was not received, and a PostgREST/network
error must say the result could not be consulted. These exact messages must be
distinct in the static consumer test.

Keep the existing `catch` unchanged in semantics: PostgREST/network errors show
an error and do not call `encerrarPedido`.

- [ ] **Step 4: Run focused test**

Run: `node --test tests/presencaRecibo.test.mjs`

Expected: PASS.

## Task 4: Integrar professor por aula e por dia

**Files:**
- Modify: `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`
- Test: `tests/presencaRecibo.test.mjs`

- [ ] **Step 1: Adicionar a trava dos três caminhos de professor**

Append a test that asserts:

```javascript
const codigo = arquivo('src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx');
assert.match(codigo, /useAuth\(\)/u);
assert.match(codigo, /chaveDoPedido\(user\.id,\s*'professor_dia'/u);
assert.match(codigo, /chaveDoPedido\(user\.id,\s*'professor_aula'/u);
assert.equal((codigo.match(/interpretarEEncerrarPedido\(/gu) ?? []).length, 3);
assert.doesNotMatch(codigo, /app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1/u);
```

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node --test tests/presencaRecibo.test.mjs`

Expected: FAIL on `user.id` and `interpretarEEncerrarPedido`.

- [ ] **Step 3: Aplicar o mesmo protocolo nos três blocos**

In `ProfessorPresencaToggle.tsx`, obtain `user` from `useAuth`, reject a missing
session before a write and, in `toggleDia`, `toggleAula` and
`marcarTodasAulas`, use this sequence exactly:

```typescript
const chave = chaveDoPedido(user.id, escopo, payload);
const requestId = requestIdDoPedido(chave);
const { data: recibo, error } = await supabase.rpc(nomeRpc, {
  ...parametrosExistentes,
  p_request_id: requestId,
});
if (error) throw error;
const resultado = interpretarEEncerrarPedido(chave, requestId, recibo);
```

Pass `resultado` to the existing success/error decision. Do not clear in
`catch` or `finally`. Apply the same pending/not-received/query-unavailable
distinction defined in Task 2 to all three blocks.

- [ ] **Step 4: Run focused test**

Run: `node --test tests/presencaRecibo.test.mjs`

Expected: PASS.

## Task 5: Integrar a operação em lote sem perder pedidos parciais

**Files:**
- Modify: `src/components/App/Agenda/Chamada/ChamadaDia.tsx`
- Test: `tests/presencaRecibo.test.mjs`

- [ ] **Step 1: Travar isolamento por professor**

Append a test that asserts the file destructures both `hasPermission` and
`user`, builds `chaveDoPedido(user.id, 'professor_dia', ...)`, stores the
request id in a local constant and calls `interpretarEEncerrarPedido` inside the
loop. Also assert there is no standalone `encerrarPedido(chave)`.

- [ ] **Step 2: Run RED**

Run: `node --test tests/presencaRecibo.test.mjs`

Expected: FAIL because the current loop clears before parsing.

- [ ] **Step 3: Corrigir o loop**

Change `const { hasPermission } = useAuth()` to
`const { hasPermission, user } = useAuth()`. Before the loop, reject missing
`user?.id`. For each professor, create and send one local `requestId`; call
`interpretarEEncerrarPedido` before incrementing `sucessos`. A failed or
malformed professor receipt increments `erros` while preserving only that
professor's unresolved request. Count `recebido`/`processando` separately as
pending; never increment `sucessos` for a non-terminal receipt.

- [ ] **Step 4: Run focused tests and commit consumers**

```powershell
node --test tests/presencaRecibo.test.mjs tests/presencaReciboPersistencia.test.mjs
git add -- src/components/App/Agenda/Chamada/useChamadaAcoes.ts src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx src/components/App/Agenda/Chamada/ChamadaDia.tsx tests/presencaRecibo.test.mjs
git commit -m "fix(presenca): integra recibo duravel nas chamadas"
```

Expected: tests pass and commit contains only the three consumers plus the test.

## Task 6: Provar que o protocolo do Hugo continua vigente

**Files:**
- Verify: `src/lib/presencaRecibo.ts`
- Verify: `src/components/App/Agenda/Chamada/useChamadaAcoes.ts`
- Verify: `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`
- Verify: `src/components/App/Agenda/Chamada/ChamadaDia.tsx`

- [ ] **Step 1: Executar a proibição do transporte concorrente**

Run:

```powershell
$hits = rg -n "app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1|presencaComando|presencaEnvioPendente" src/components/App/Agenda src/lib
if ($LASTEXITCODE -eq 0) { $hits; throw 'transporte concorrente encontrado no runtime' }
if ($LASTEXITCODE -ne 1) { throw 'rg falhou' }
```

Expected: no matches and no exception.

- [ ] **Step 2: Executar suíte e build**

Run:

```powershell
node --test tests/presencaRecibo.test.mjs tests/presencaReciboPersistencia.test.mjs
npm test
npm run build
```

Expected: focused tests, complete suite and Vite build all pass.

- [ ] **Step 3: Verificar UI sem write operacional**

Open production-equivalent preview in an authenticated browser. For Barra,
Recreio and Campo Grande:

1. open `Agenda > Chamada`;
2. reload the page;
3. confirm the call cards still render;
4. inspect DOM for disabled/loading state stability;
5. inspect console and network for new application errors;
6. do not click a presence/fault action in production in this phase.

Expected: UI stable after reload; no write request is sent.

- [ ] **Step 4: Registrar o gate**

Append to `docs/audits/2026-08-27-presenca-convergencia-execucao.md`:

```markdown
## Fase 2 — recibos duráveis

- protocolo direto do Hugo preservado: sim
- request id persistente por usuário e intenção: sim
- múltiplas intenções ambíguas: cobertas por teste
- payload malformado preserva request id: coberto por teste
- transporte concorrente no runtime: ausente
- suíte integral e build: aprovados
- browser autenticado sem write: Barra, Recreio e Campo Grande
- writes remotos nesta fase: nenhum
```

- [ ] **Step 5: Commit do gate e parar**

```powershell
git add -- docs/audits/2026-08-27-presenca-convergencia-execucao.md
git commit -m "docs(presenca): fecha gate dos recibos duraveis"
git status --short --branch
```

Expected: clean branch. Do not start Fase 3 before review of the runtime diff.
