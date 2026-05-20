# Saúde das Automações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir módulo admin de monitoramento passivo de webhooks Emusys (matrícula em tempo real via edge, lead/experimental via cron auditor) que detecta divergências de negócio, oferece painel de jornada + feed cronológico, badge no menu, e botão de auditoria sob demanda.

**Architecture:** Arquitetura híbrida. Edge `processar-matricula-emusys` chama helper de invariantes ao final (tempo real). Nova edge `auditor-divergencias-emusys` rodando via pg_cron horário + botão manual no frontend varre `leads`/`lead_experimentais`/`alunos` com queries SQL idempotentes. Tudo grava em `automacao_log` estendida + nova tabela `automacao_invariantes`. Frontend nova rota `/automacoes` com 2 abas (Jornadas/Feed).

**Tech Stack:** React 19 + TypeScript 5.8 + Vite + Tailwind + Radix; Supabase (PostgreSQL + Edge Functions Deno + pg_cron + pg_net); date-fns; Lucide icons.

---

## File Structure

### Banco
- **Migration nova:** `supabase/migrations/<timestamp>_saude_automacoes.sql` — 4 colunas em `automacao_log`, tabela `automacao_invariantes`, índices, RLS, cron.

### Edge Functions
- **Modificar:** `supabase/functions/processar-matricula-emusys/index.ts` — chamar helper ao final.
- **Criar:** `supabase/functions/_shared/invariantes.ts` — helper TypeScript com types, `comFallback`, `gravarLog`, todas as `checar*`.
- **Criar:** `supabase/functions/auditor-divergencias-emusys/index.ts` — edge nova que varre o banco.

### Frontend
- **Criar:** `src/components/App/Automacoes/AutomacoesPage.tsx` — container com tabs + botão "Rodar agora".
- **Criar:** `src/components/App/Automacoes/TabJornadas.tsx` — aba 1.
- **Criar:** `src/components/App/Automacoes/TabFeedEventos.tsx` — aba 2.
- **Criar:** `src/components/App/Automacoes/CardJornada.tsx`.
- **Criar:** `src/components/App/Automacoes/LinhaEvento.tsx`.
- **Criar:** `src/components/App/Automacoes/ModalPayloadBruto.tsx`.
- **Criar:** `src/components/App/Automacoes/BotaoRodarAuditoria.tsx`.
- **Criar:** `src/components/App/Automacoes/index.ts` — barrel.
- **Criar:** `src/hooks/useAutomacoesData.ts`.
- **Criar:** `src/hooks/useBadgeAutomacoes.ts`.
- **Modificar:** `src/router.tsx` — lazy import + rota `/automacoes`.
- **Modificar:** `src/components/App/Layout/AppSidebar.tsx` — item no bloco Admin com badge.

---

## Task 1: Migration — extensão de `automacao_log` + tabela `automacao_invariantes`

**Files:**
- Create: `supabase/migrations/20260520120000_saude_automacoes.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- supabase/migrations/20260520120000_saude_automacoes.sql

-- 1. Estender automacao_log
ALTER TABLE public.automacao_log
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS lead_id BIGINT,
  ADD COLUMN IF NOT EXISTS payload_bruto JSONB,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.automacao_log
  ADD CONSTRAINT automacao_log_status_check
  CHECK (status IN ('ok', 'warn', 'erro'));

CREATE UNIQUE INDEX IF NOT EXISTS automacao_log_idempotency_key_uq
  ON public.automacao_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS automacao_log_aluno_id_created_at_idx
  ON public.automacao_log (aluno_id, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_log_lead_id_created_at_idx
  ON public.automacao_log (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_log_status_created_at_idx
  ON public.automacao_log (status, created_at DESC);

-- 2. Nova tabela automacao_invariantes
CREATE TABLE IF NOT EXISTS public.automacao_invariantes (
  id           BIGSERIAL PRIMARY KEY,
  log_id       BIGINT NOT NULL REFERENCES public.automacao_log(id) ON DELETE CASCADE,
  regra        TEXT NOT NULL,
  severidade   TEXT NOT NULL CHECK (severidade IN ('critico', 'aviso')),
  mensagem     TEXT NOT NULL,
  visto_em     TIMESTAMPTZ,
  visto_por    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automacao_invariantes_visto_idx
  ON public.automacao_invariantes (visto_em) WHERE visto_em IS NULL;

CREATE INDEX IF NOT EXISTS automacao_invariantes_severidade_created_at_idx
  ON public.automacao_invariantes (severidade, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_invariantes_regra_created_at_idx
  ON public.automacao_invariantes (regra, created_at DESC);

CREATE INDEX IF NOT EXISTS automacao_invariantes_log_id_idx
  ON public.automacao_invariantes (log_id);

-- 3. RLS
ALTER TABLE public.automacao_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automacao_invariantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automacao_log_select_authenticated" ON public.automacao_log;
CREATE POLICY "automacao_log_select_authenticated"
  ON public.automacao_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "automacao_invariantes_select_authenticated" ON public.automacao_invariantes;
CREATE POLICY "automacao_invariantes_select_authenticated"
  ON public.automacao_invariantes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "automacao_invariantes_update_admin" ON public.automacao_invariantes;
CREATE POLICY "automacao_invariantes_update_admin"
  ON public.automacao_invariantes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfis
      WHERE perfis.auth_user_id = auth.uid()
        AND perfis.tipo = 'admin'
    )
  );

COMMENT ON TABLE public.automacao_invariantes IS
'Registra violações de invariantes de negócio detectadas nos webhooks Emusys (matrícula em tempo real) ou via cron auditor (lead/experimental/alunos).';

COMMENT ON COLUMN public.automacao_log.status IS
'Resultado do processamento: ok=sem violações, warn=violou só avisos, erro=violou pelo menos 1 critico.';
COMMENT ON COLUMN public.automacao_log.payload_bruto IS
'Payload original do webhook (matrícula) ou snapshot do registro no banco (auditor).';
COMMENT ON COLUMN public.automacao_log.idempotency_key IS
'Hash estável que evita reprocessamento duplicado. Para auditor: audit:<regra>:<record_id>.';
```

- [ ] **Step 2: Aplicar migration**

Via MCP:
```
mcp__supabase__apply_migration(project_id='ouqwbbermlzqqvtqwlul', name='saude_automacoes', query=<conteúdo do arquivo>)
```

Expected: sucesso sem erros.

- [ ] **Step 3: Validar schema**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'automacao_log'
  AND column_name IN ('status','lead_id','payload_bruto','idempotency_key')
ORDER BY ordinal_position;
```

Expected: 4 linhas.

```sql
SELECT count(*) FROM public.automacao_invariantes;
```

Expected: 0.

- [ ] **Step 4: Validar que linhas antigas não quebraram**

```sql
SELECT status, count(*) FROM public.automacao_log GROUP BY status;
```

Expected: todas com `status='ok'` (default retroativo).

- [ ] **Step 5: Validar que frontend ainda lê automacao_log**

Abrir uma das telas que lê (`/app/alunos` → aba Automação OU `/app/entrada/lead`) com user `authenticated`. Confirmar que a lista carrega sem erro.

Expected: lista de logs renderiza normalmente.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260520120000_saude_automacoes.sql
git commit -m "feat(saude-automacoes): migration - extender automacao_log + tabela invariantes + RLS permissivo"
```

---

## Task 2: Helper compartilhado — types e função `gravarLog`

**Files:**
- Create: `supabase/functions/_shared/invariantes.ts`

- [ ] **Step 1: Criar arquivo com types e gravarLog**

```typescript
// supabase/functions/_shared/invariantes.ts

export type Severidade = 'critico' | 'aviso';

export type Invariante = {
  regra: string;
  severidade: Severidade;
  mensagem: string;
};

export type GravarLogParams = {
  evento: string;
  acao: string;
  aluno_nome: string;
  aluno_id?: number | null;
  lead_id?: number | null;
  unidade_nome?: string | null;
  payload_bruto?: unknown;
  idempotency_key?: string | null;
  invariantes?: Invariante[];
  detalhes?: unknown;
  workflow_id?: string | null;
  execution_id?: string | null;
};

/**
 * Wrapper que captura exceções de uma função checar*.
 * Se a checagem falhar, retorna uma invariante 'invariante_checagem_falhou'
 * em vez de propagar o erro.
 */
export function comFallback(fn: () => Invariante[]): Invariante[] {
  try {
    return fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [{
      regra: 'invariante_checagem_falhou',
      severidade: 'critico',
      mensagem: `Checagem lançou exceção: ${msg}`,
    }];
  }
}

/**
 * Grava 1 linha em automacao_log + 0..N linhas em automacao_invariantes
 * em uma única transação lógica (best-effort).
 *
 * Status derivado das invariantes:
 *   - 'erro' se alguma é crítica
 *   - 'warn' se tem só aviso
 *   - 'ok' se array vazio
 *
 * Idempotência: se idempotency_key já existe em automacao_log, retorna
 * silenciosamente sem inserir (ON CONFLICT DO NOTHING).
 */
export async function gravarLog(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: GravarLogParams,
): Promise<void> {
  const invariantes = params.invariantes ?? [];
  const status: 'ok' | 'warn' | 'erro' =
    invariantes.some(i => i.severidade === 'critico') ? 'erro'
    : invariantes.length > 0 ? 'warn'
    : 'ok';

  // INSERT em automacao_log
  const { data: log, error } = await supabase
    .from('automacao_log')
    .insert({
      evento: params.evento,
      acao: params.acao,
      aluno_nome: params.aluno_nome,
      aluno_id: params.aluno_id ?? null,
      lead_id: params.lead_id ?? null,
      unidade_nome: params.unidade_nome ?? null,
      payload_bruto: params.payload_bruto ?? null,
      idempotency_key: params.idempotency_key ?? null,
      detalhes: params.detalhes ?? null,
      workflow_id: params.workflow_id ?? null,
      execution_id: params.execution_id ?? null,
      status,
    })
    .select('id')
    .single();

  // Idempotência: conflict em idempotency_key não é erro
  if (error) {
    if (error.code === '23505') return; // unique violation = já gravado antes
    console.error('[gravarLog] erro ao inserir automacao_log:', error);
    return;
  }

  // INSERT em automacao_invariantes (se houver)
  if (log && invariantes.length > 0) {
    const rows = invariantes.map(i => ({
      log_id: log.id,
      regra: i.regra,
      severidade: i.severidade,
      mensagem: i.mensagem,
    }));
    const { error: errInv } = await supabase
      .from('automacao_invariantes')
      .insert(rows);
    if (errInv) {
      console.error('[gravarLog] erro ao inserir invariantes:', errInv);
    }
  }
}

/**
 * Hash determinístico para idempotency_key.
 * Usa Deno crypto SubtleCrypto (SHA-256) e retorna hex.
 */
export async function computarHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/invariantes.ts
git commit -m "feat(saude-automacoes): helper invariantes - types, comFallback, gravarLog, computarHash"
```

---

## Task 3: Helper — funções `checar*` para matrícula/renovação/trancamento/finalização

**Files:**
- Modify: `supabase/functions/_shared/invariantes.ts`

- [ ] **Step 1: Adicionar as funções checar* ao final do arquivo**

Append ao final de `supabase/functions/_shared/invariantes.ts`:

```typescript
// =============================================================================
// Resultado esperado das funções de processamento (passado às checar*)
// =============================================================================

export type ResultadoMatricula = {
  aluno_id: number | null;
  curso_id: number | null;
  professor_id: number | null;
  professor_resolvido_por: 'emusys_id' | 'nome' | 'nenhum';
  lead_id: number | null;
  unidade_id: string | null;
  // deno-lint-ignore no-explicit-any
  payload?: any;
};

// =============================================================================
// Helpers internos
// =============================================================================

// deno-lint-ignore no-explicit-any
function isEmpty(v: any): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// =============================================================================
// checarMatricula (matricula_nova / inserido_segundo_curso)
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarMatricula(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];
  const m = payload?.matricula ?? {};
  const aluno = payload?.aluno ?? m?.aluno ?? {};
  const disciplinas: any[] = m?.disciplinas ?? [];

  if (isEmpty(aluno?.nome)) {
    v.push({ regra: 'matricula_sem_aluno_nome', severidade: 'critico',
      mensagem: 'payload.aluno.nome ausente ou vazio' });
  }
  if (isEmpty(m?.id_matricula) && isEmpty(payload?.id_matricula)) {
    v.push({ regra: 'matricula_sem_emusys_matricula_id', severidade: 'critico',
      mensagem: 'id_matricula ausente — impede idempotência' });
  }
  if (!Array.isArray(disciplinas) || disciplinas.length === 0) {
    v.push({ regra: 'matricula_sem_disciplinas', severidade: 'critico',
      mensagem: 'payload.matricula.disciplinas[] vazio ou ausente' });
    return v;
  }

  const d0 = disciplinas[0] ?? {};
  if (isEmpty(d0?.id_professor)) {
    v.push({ regra: 'matricula_sem_professor', severidade: 'critico',
      mensagem: 'disciplinas[0].id_professor ausente no payload' });
  } else if (resultado.professor_id === null && resultado.professor_resolvido_por === 'nenhum') {
    v.push({ regra: 'matricula_professor_nao_resolvido', severidade: 'critico',
      mensagem: `id_professor=${d0.id_professor} veio mas não casou em professores_unidades (nem por id nem por nome)` });
  } else if (resultado.professor_resolvido_por === 'nome') {
    v.push({ regra: 'matricula_professor_resolvido_por_nome', severidade: 'aviso',
      mensagem: `Auto-curou via nome="${d0?.nome_professor ?? '?'}" — emusys_id gravado retroativamente` });
  }

  if (isEmpty(d0?.id_curso) && resultado.curso_id === null) {
    v.push({ regra: 'matricula_sem_curso', severidade: 'critico',
      mensagem: 'curso_id ausente ou não casou' });
  }

  if (resultado.lead_id === null && !isEmpty(aluno?.telefone)) {
    v.push({ regra: 'matricula_sem_lead_origem', severidade: 'aviso',
      mensagem: `nenhum lead com telefone ${aluno.telefone} encontrado — matrícula direta` });
  }

  const vp = Number(m?.valor_passaporte ?? 0);
  if (vp === 0) {
    v.push({ regra: 'matricula_sem_valor_passaporte', severidade: 'aviso',
      mensagem: 'valor_passaporte = 0 (re-matrícula, bolsista ou erro?)' });
  }

  return v;
}

// =============================================================================
// checarRenovacao
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarRenovacao(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];

  if (resultado.aluno_id === null) {
    v.push({ regra: 'renovacao_sem_matricula_anterior', severidade: 'critico',
      mensagem: 'não achou matrícula prévia por emusys_matricula_id nem por (aluno+curso)' });
  }

  const valorNovo = Number(payload?.matricula?.valor_parcela ?? 0);
  const valorAnterior = Number(payload?.matricula?.valor_parcela_anterior ?? 0);
  if (valorAnterior > 0 && valorNovo > 0) {
    const reajuste = (valorNovo - valorAnterior) / valorAnterior;
    if (reajuste > 0.30) {
      v.push({ regra: 'renovacao_reajuste_acima_30pct', severidade: 'aviso',
        mensagem: `reajuste ${(reajuste * 100).toFixed(1)}% (de ${valorAnterior} para ${valorNovo})` });
    }
  }

  return v;
}

// =============================================================================
// checarTrancamento
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarTrancamento(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];

  if (resultado.aluno_id === null) {
    v.push({ regra: 'trancamento_aluno_nao_encontrado', severidade: 'critico',
      mensagem: 'aluno não localizado por emusys_matricula_id nem (aluno+curso)' });
  }

  if (isEmpty(payload?.matricula?.motivo) && isEmpty(payload?.motivo)) {
    v.push({ regra: 'trancamento_sem_motivo', severidade: 'aviso',
      mensagem: 'motivo do trancamento vazio' });
  }

  return v;
}

// =============================================================================
// checarFinalizacao (evasão)
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarFinalizacao(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];

  if (resultado.aluno_id === null) {
    v.push({ regra: 'evasao_aluno_nao_encontrado', severidade: 'critico',
      mensagem: 'aluno não localizado' });
  }

  const motivoTexto = payload?.matricula?.motivo ?? payload?.motivo;
  const motivoId = payload?.matricula?.motivo_saida_id ?? payload?.motivo_saida_id;
  if (isEmpty(motivoTexto) && isEmpty(motivoId)) {
    v.push({ regra: 'evasao_motivo_nulo', severidade: 'aviso',
      mensagem: 'motivo da evasão vazio (não impacta score)' });
  } else if (isEmpty(motivoId)) {
    v.push({ regra: 'evasao_sem_motivo_saida_id', severidade: 'aviso',
      mensagem: `motivo veio só como texto: "${motivoTexto}" — impacta cálculo de score` });
  }

  return v;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/invariantes.ts
git commit -m "feat(saude-automacoes): checar* para matricula/renovacao/trancamento/finalizacao"
```

---

## Task 4: Atualizar edge `processar-matricula-emusys` para chamar helper

**Files:**
- Modify: `supabase/functions/processar-matricula-emusys/index.ts`

- [ ] **Step 1: Localizar pontos de chamada para inserir o helper**

Ler o arquivo e identificar onde cada handler termina (após o INSERT/UPDATE final). Em geral: `handleMatriculaNova`, `handleRenovacao`, `handleTrancamento`, `handleEvasao`.

Cada handler retorna algo como `{ ok: true, aluno_id, ... }`. Vamos chamar `gravarLog` ao final dele.

- [ ] **Step 2: Adicionar imports**

No topo do `supabase/functions/processar-matricula-emusys/index.ts`, próximo aos outros imports:

```typescript
import {
  checarMatricula,
  checarRenovacao,
  checarTrancamento,
  checarFinalizacao,
  comFallback,
  computarHash,
  gravarLog,
  type ResultadoMatricula,
} from '../_shared/invariantes.ts';
```

- [ ] **Step 3: Encapsular cada handler em try/catch com gravarLog**

Para cada handler (`handleMatriculaNova`, `handleRenovacao`, `handleTrancamento`, `handleEvasao`), envolver o corpo principal e chamar `gravarLog` ao final.

Padrão (exemplo para `handleMatriculaNova`):

```typescript
async function handleMatriculaNova(supabase: any, payload: any) {
  const idempotency_key = await computarHash(
    `matricula_nova:${payload?.matricula?.id_matricula ?? ''}:${payload?.matricula?.data_matricula ?? ''}`
  );

  try {
    // ... toda a lógica existente do handler permanece ...
    const resultado: ResultadoMatricula = {
      aluno_id,
      curso_id,
      professor_id,
      professor_resolvido_por,  // 'emusys_id' | 'nome' | 'nenhum'
      lead_id,
      unidade_id,
      payload,
    };

    const invariantes = comFallback(() => checarMatricula(payload, resultado));

    await gravarLog(supabase, {
      evento: 'matricula_nova',
      acao: 'inserido', // ou 'inserido_segundo_curso' conforme caminho
      aluno_id: aluno_id ?? undefined,
      aluno_nome: payload?.aluno?.nome ?? '(desconhecido)',
      lead_id: lead_id ?? undefined,
      unidade_nome: payload?.unidade_nome ?? undefined,
      payload_bruto: payload,
      idempotency_key,
      invariantes,
    });

    return { ok: true, aluno_id };
  } catch (e: any) {
    await gravarLog(supabase, {
      evento: 'matricula_nova',
      acao: 'erro',
      aluno_nome: payload?.aluno?.nome ?? '(desconhecido)',
      payload_bruto: payload,
      idempotency_key,
      invariantes: [{
        regra: 'processamento_falhou_excecao',
        severidade: 'critico',
        mensagem: `Exceção em handleMatriculaNova: ${e?.message ?? e}`,
      }],
    });
    throw e;
  }
}
```

Aplicar padrão equivalente para `handleRenovacao` (chama `checarRenovacao`), `handleTrancamento` (chama `checarTrancamento`), `handleEvasao` (chama `checarFinalizacao`). Em cada uma, variar:
- `evento` (matricula_renovacao / matricula_trancamento / matricula_finalizacao)
- `acao` (renovado / status_trancado / status_evadido)
- função `checar*` chamada

**IMPORTANTE:** O handler existente já deve estar retornando `professor_resolvido_por` (v16 introduziu fallback de nome). Confirmar isso ou expor o valor como retorno.

- [ ] **Step 4: Atualizar marca de versão**

Procurar no arquivo a constante de versão (ex: `const VERSAO = 'v16'`) e atualizar para `v17`. Atualizar também console.logs do tipo `[processar-matricula-emusys v16]` para `v17`.

- [ ] **Step 5: Deploy da edge**

Via MCP:
```
mcp__supabase__deploy_edge_function(
  project_id='ouqwbbermlzqqvtqwlul',
  name='processar-matricula-emusys',
  files=[{ name: 'index.ts', content: <conteúdo atualizado> }]
)
```

Expected: deploy sucesso.

- [ ] **Step 6: Validação com payload mock**

Disparar uma matrícula nova de teste via curl com payload Emusys conhecido. Verificar que:

```sql
SELECT id, evento, acao, status, idempotency_key, jsonb_typeof(payload_bruto::jsonb) as payload
FROM automacao_log
WHERE evento = 'matricula_nova'
ORDER BY created_at DESC LIMIT 1;
```

Expected: 1 linha com `status='ok'` ou `'warn'`/`'erro'` conforme payload, `idempotency_key` preenchido, `payload_bruto` = 'object'.

```sql
SELECT regra, severidade, mensagem FROM automacao_invariantes
WHERE log_id = (SELECT max(id) FROM automacao_log WHERE evento='matricula_nova');
```

Expected: 0..N linhas conforme invariantes detectadas.

- [ ] **Step 7: Validar idempotência**

Re-disparar exatamente o mesmo payload. Verificar:

```sql
SELECT count(*) FROM automacao_log WHERE evento='matricula_nova' AND idempotency_key = <hash do payload de teste>;
```

Expected: 1 (não duplicou).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/processar-matricula-emusys/index.ts
git commit -m "feat(saude-automacoes): edge matricula v17 - chama helper de invariantes ao final"
```

---

## Task 5: Edge `auditor-divergencias-emusys` — Setup e queries de leads

**Files:**
- Create: `supabase/functions/auditor-divergencias-emusys/index.ts`

- [ ] **Step 1: Criar estrutura base da edge**

```typescript
// supabase/functions/auditor-divergencias-emusys/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { gravarLog, type Invariante, type Severidade } from '../_shared/invariantes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Trigger = 'cron' | 'manual';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

type Regra = {
  regra: string;
  severidade: Severidade;
  evento: string;
  acao: string;
  // SELECT que retorna rows a serem registrados
  sql: string;
  // Constrói a mensagem da invariante a partir da row
  construirMensagem: (row: Row) => string;
  // Constrói o identificador único pra idempotency_key
  construirIdempotencyKey: (row: Row) => string;
  // Constrói metadata pra automacao_log (aluno_nome, aluno_id, lead_id, unidade_nome)
  construirLog: (row: Row) => {
    aluno_nome: string;
    aluno_id?: number | null;
    lead_id?: number | null;
    unidade_nome?: string | null;
  };
};

const REGRAS: Regra[] = [
  // Preenchido nas próximas tasks
];

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: { trigger?: Trigger; user_id?: string | null } = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { /* body opcional */ }
  }
  const trigger: Trigger = body.trigger ?? 'cron';
  const user_id = body.user_id ?? null;

  const t0 = Date.now();
  let totalDetectado = 0;
  let totalNovo = 0;
  const erros: Array<{ regra: string; erro: string }> = [];

  for (const regra of REGRAS) {
    try {
      const { data: rows, error } = await supabase.rpc('executar_query_auditoria', {
        p_sql: regra.sql,
      });
      if (error) {
        erros.push({ regra: regra.regra, erro: error.message });
        continue;
      }
      const lista: Row[] = (rows as Row[]) ?? [];
      totalDetectado += lista.length;

      for (const row of lista) {
        const idempotency_key = regra.construirIdempotencyKey(row);
        const meta = regra.construirLog(row);
        const invariante: Invariante = {
          regra: regra.regra,
          severidade: regra.severidade,
          mensagem: regra.construirMensagem(row),
        };
        const antes = await supabase
          .from('automacao_log')
          .select('id')
          .eq('idempotency_key', idempotency_key)
          .limit(1)
          .maybeSingle();
        if (antes.data) continue; // já existia: idempotente

        await gravarLog(supabase, {
          evento: regra.evento,
          acao: regra.acao,
          aluno_nome: meta.aluno_nome,
          aluno_id: meta.aluno_id ?? undefined,
          lead_id: meta.lead_id ?? undefined,
          unidade_nome: meta.unidade_nome ?? undefined,
          payload_bruto: row,
          idempotency_key,
          invariantes: [invariante],
          detalhes: { trigger, user_id, audit_run_at: new Date().toISOString() },
        });
        totalNovo++;
      }
    } catch (e: any) {
      erros.push({ regra: regra.regra, erro: e?.message ?? String(e) });
    }
  }

  const duracao_ms = Date.now() - t0;

  return new Response(JSON.stringify({
    ok: true,
    trigger,
    duracao_ms,
    total_detectado: totalDetectado,
    novos: totalNovo,
    regras_com_erro: erros,
  }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
});
```

- [ ] **Step 2: Criar RPC `executar_query_auditoria` para encapsular SQL dinâmico com SECURITY DEFINER**

Adicionar nova migration: `supabase/migrations/20260520120100_rpc_executar_query_auditoria.sql`:

```sql
-- RPC para auditor-divergencias-emusys executar queries SELECT dinâmicas.
-- SECURITY DEFINER restrito a service_role (edge function autenticada).
CREATE OR REPLACE FUNCTION public.executar_query_auditoria(p_sql TEXT)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- regex defensiva: apenas SELECT
  v_lower TEXT;
BEGIN
  v_lower := lower(trim(p_sql));
  IF v_lower NOT LIKE 'select%' THEN
    RAISE EXCEPTION 'executar_query_auditoria: apenas SELECT permitido';
  END IF;
  IF position(';' IN v_lower) < length(v_lower) - 1 THEN
    -- bloqueia ; antes do fim (statement chaining)
    RAISE EXCEPTION 'executar_query_auditoria: statement chaining bloqueado';
  END IF;

  RETURN QUERY EXECUTE format('SELECT to_jsonb(t) FROM (%s) t', regexp_replace(p_sql, ';\s*$', ''));
END;
$$;

REVOKE ALL ON FUNCTION public.executar_query_auditoria(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executar_query_auditoria(TEXT) TO service_role;

COMMENT ON FUNCTION public.executar_query_auditoria IS
'Executa SELECT dinâmico para o auditor de divergências. Restrito a service_role.';
```

Aplicar via:
```
mcp__supabase__apply_migration(project_id='ouqwbbermlzqqvtqwlul', name='rpc_executar_query_auditoria', query=<conteúdo>)
```

Expected: sucesso.

- [ ] **Step 3: Commit (estrutura base + RPC, sem regras ainda)**

```bash
git add supabase/functions/auditor-divergencias-emusys/index.ts supabase/migrations/20260520120100_rpc_executar_query_auditoria.sql
git commit -m "feat(saude-automacoes): edge auditor - estrutura base + RPC executar_query_auditoria"
```

---

## Task 6: Auditor — regras de leads

**Files:**
- Modify: `supabase/functions/auditor-divergencias-emusys/index.ts`

- [ ] **Step 1: Adicionar regras de leads ao array REGRAS**

Substituir `const REGRAS: Regra[] = [];` por:

```typescript
const REGRAS: Regra[] = [
  // ============================================================
  // LEADS
  // ============================================================
  {
    regra: 'lead_sem_nome',
    severidade: 'critico',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, telefone, unidade_id, created_at
      FROM leads
      WHERE (nome IS NULL OR trim(nome) = '')
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} sem nome (telefone=${row.telefone ?? 'NULL'})`,
    construirIdempotencyKey: (row) => `audit:lead_sem_nome:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_sem_telefone',
    severidade: 'critico',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, unidade_id, created_at
      FROM leads
      WHERE (telefone IS NULL OR trim(telefone) = '')
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} nome="${row.nome ?? '?'}" sem telefone`,
    construirIdempotencyKey: (row) => `audit:lead_sem_telefone:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_telefone_invalido',
    severidade: 'aviso',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, telefone, unidade_id
      FROM leads
      WHERE telefone IS NOT NULL
        AND length(regexp_replace(telefone, '[^0-9]', '', 'g')) NOT BETWEEN 10 AND 13
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} telefone="${row.telefone}" fora do range BR (10-13 dígitos)`,
    construirIdempotencyKey: (row) => `audit:lead_telefone_invalido:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_sem_unidade',
    severidade: 'critico',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, telefone, created_at
      FROM leads
      WHERE unidade_id IS NULL
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} nome="${row.nome ?? '?'}" sem unidade`,
    construirIdempotencyKey: (row) => `audit:lead_sem_unidade:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_duplicado_mesmo_dia',
    severidade: 'aviso',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      WITH dups AS (
        SELECT telefone, unidade_id, date_trunc('day', created_at) as dia,
               array_agg(id ORDER BY id) as ids,
               count(*) as qtd
        FROM leads
        WHERE telefone IS NOT NULL AND telefone <> ''
          AND created_at > now() - interval '14 days'
        GROUP BY telefone, unidade_id, date_trunc('day', created_at)
        HAVING count(*) > 1
      )
      SELECT (ids[1])::bigint as id, telefone, unidade_id, qtd, ids
      FROM dups
    `,
    construirMensagem: (row) => `telefone=${row.telefone} criado ${row.qtd}× no mesmo dia (ids=${JSON.stringify(row.ids)})`,
    construirIdempotencyKey: (row) => `audit:lead_duplicado_mesmo_dia:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: `(${row.qtd} duplicatas)`,
      lead_id: row.id,
    }),
  },
];
```

- [ ] **Step 2: Deploy intermediário pra validar leads**

```
mcp__supabase__deploy_edge_function(
  project_id='ouqwbbermlzqqvtqwlul',
  name='auditor-divergencias-emusys',
  files=[{ name: 'index.ts', content: <conteúdo atual> }]
)
```

- [ ] **Step 3: Invocar edge manualmente e validar**

Via curl ou MCP:
```bash
curl -X POST 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/auditor-divergencias-emusys' \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

Expected: resposta JSON com `total_detectado >= 0`, `novos >= 0`, `regras_com_erro: []`.

- [ ] **Step 4: Validar registros**

```sql
SELECT regra, count(*) FROM automacao_invariantes
WHERE created_at > now() - interval '5 minutes'
GROUP BY regra;
```

Expected: contagens por regra de lead.

- [ ] **Step 5: Validar idempotência**

Invocar edge de novo. Conferir que `novos = 0` (mesmas divergências já gravadas).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/auditor-divergencias-emusys/index.ts
git commit -m "feat(saude-automacoes): auditor - regras de leads (5 invariantes)"
```

---

## Task 7: Auditor — regras de experimentais

**Files:**
- Modify: `supabase/functions/auditor-divergencias-emusys/index.ts`

- [ ] **Step 1: Adicionar regras de lead_experimentais ao array REGRAS**

Inserir após as regras de leads (antes do `];` final):

```typescript
  // ============================================================
  // EXPERIMENTAIS (lead_experimentais)
  // ============================================================
  {
    regra: 'experimental_sem_professor',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, l.telefone, l.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE le.professor_id IS NULL
        AND le.created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} lead="${row.lead_nome}" data=${row.data_experimental} sem professor`,
    construirIdempotencyKey: (row) => `audit:experimental_sem_professor:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_data_passada',
    severidade: 'aviso',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, l.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE le.data_experimental < (current_date - interval '1 day')
        AND le.experimental_realizada IS NOT TRUE
        AND le.faltou_experimental IS NOT TRUE
        AND le.created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} data ${row.data_experimental} já passou sem realizada/faltou`,
    construirIdempotencyKey: (row) => `audit:experimental_data_passada:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_realizada_e_faltou',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, l.unidade_id
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE le.experimental_realizada = true
        AND le.faltou_experimental = true
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} flags contraditórias (realizada=true E faltou=true)`,
    construirIdempotencyKey: (row) => `audit:experimental_realizada_e_faltou:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_realizada_data_futura',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, l.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE le.experimental_realizada = true
        AND le.data_experimental > current_date
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} marcada como realizada antes da data (data=${row.data_experimental})`,
    construirIdempotencyKey: (row) => `audit:experimental_realizada_data_futura:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_faltou_data_futura',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, l.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE le.faltou_experimental = true
        AND le.data_experimental > current_date
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} marcada como falta antes da data (data=${row.data_experimental})`,
    construirIdempotencyKey: (row) => `audit:experimental_faltou_data_futura:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
```

- [ ] **Step 2: Deploy + validar**

Mesmo padrão da Task 6: deploy via MCP, invocar edge, conferir nova contagem por regra.

```sql
SELECT regra, count(*) FROM automacao_invariantes
WHERE regra LIKE 'experimental_%' AND created_at > now() - interval '5 minutes'
GROUP BY regra;
```

Expected: contagens por regra de experimental (pode ser 0 se nenhum lead_experimental atual viola).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/auditor-divergencias-emusys/index.ts
git commit -m "feat(saude-automacoes): auditor - regras de experimentais (5 invariantes)"
```

---

## Task 8: Auditor — regras de alunos fantasma

**Files:**
- Modify: `supabase/functions/auditor-divergencias-emusys/index.ts`

- [ ] **Step 1: Adicionar regras de alunos ao array REGRAS**

Inserir após as regras de experimentais:

```typescript
  // ============================================================
  // ALUNOS (divergências históricas)
  // ============================================================
  {
    regra: 'matricula_sem_professor_no_banco',
    severidade: 'critico',
    evento: 'auditoria_alunos',
    acao: 'divergencia_detectada',
    sql: `
      SELECT a.id, a.nome, a.unidade_id, u.nome as unidade_nome, a.created_at
      FROM alunos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.professor_atual_id IS NULL
        AND a.status = 'ativo'
    `,
    construirMensagem: (row) =>
      `aluno_id=${row.id} nome="${row.nome}" ativo sem professor (unidade=${row.unidade_nome ?? '?'})`,
    construirIdempotencyKey: (row) => `audit:matricula_sem_professor_no_banco:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      aluno_id: row.id,
      unidade_nome: row.unidade_nome ?? null,
    }),
  },
  {
    regra: 'matricula_sem_curso_no_banco',
    severidade: 'critico',
    evento: 'auditoria_alunos',
    acao: 'divergencia_detectada',
    sql: `
      SELECT a.id, a.nome, a.unidade_id, u.nome as unidade_nome
      FROM alunos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.curso_id IS NULL
        AND a.status = 'ativo'
    `,
    construirMensagem: (row) =>
      `aluno_id=${row.id} nome="${row.nome}" ativo sem curso (unidade=${row.unidade_nome ?? '?'})`,
    construirIdempotencyKey: (row) => `audit:matricula_sem_curso_no_banco:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      aluno_id: row.id,
      unidade_nome: row.unidade_nome ?? null,
    }),
  },
  {
    regra: 'matricula_sem_lead_origem_no_banco',
    severidade: 'aviso',
    evento: 'auditoria_alunos',
    acao: 'divergencia_detectada',
    sql: `
      SELECT a.id, a.nome, a.telefone, a.unidade_id, u.nome as unidade_nome
      FROM alunos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.created_at > now() - interval '60 days'
        AND a.telefone IS NOT NULL AND a.telefone <> ''
        AND NOT EXISTS (
          SELECT 1 FROM leads l
          WHERE regexp_replace(coalesce(l.telefone,''), '[^0-9]', '', 'g')
              = regexp_replace(coalesce(a.telefone,''), '[^0-9]', '', 'g')
            AND l.unidade_id = a.unidade_id
        )
    `,
    construirMensagem: (row) =>
      `aluno_id=${row.id} nome="${row.nome}" telefone=${row.telefone} matrícula direta (sem lead prévio)`,
    construirIdempotencyKey: (row) => `audit:matricula_sem_lead_origem_no_banco:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      aluno_id: row.id,
      unidade_nome: row.unidade_nome ?? null,
    }),
  },
```

- [ ] **Step 2: Deploy + validar**

Deploy via MCP. Invocar edge. Validar:

```sql
SELECT regra, count(*) FROM automacao_invariantes
WHERE regra LIKE '%no_banco%' AND created_at > now() - interval '5 minutes'
GROUP BY regra;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/auditor-divergencias-emusys/index.ts
git commit -m "feat(saude-automacoes): auditor - regras de alunos fantasma (3 invariantes)"
```

---

## Task 9: pg_cron — agendamento horário do auditor

**Files:**
- Create: `supabase/migrations/20260520120200_cron_auditor_divergencias.sql`

- [ ] **Step 1: Criar migration do cron**

```sql
-- supabase/migrations/20260520120200_cron_auditor_divergencias.sql

-- Garantir extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job antigo se existir (idempotência)
DO $$
BEGIN
  PERFORM cron.unschedule('auditor-divergencias-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auditor-divergencias-cron');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Agendar: toda hora cheia
SELECT cron.schedule(
  'auditor-divergencias-cron',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/auditor-divergencias-emusys',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);

COMMENT ON EXTENSION pg_cron IS 'auditor-divergencias-cron roda toda hora cheia';
```

**Nota:** `app.settings.anon_key` precisa estar configurado como GUC do banco. Se não estiver, o usuário/admin precisa definir manualmente via:
```sql
ALTER DATABASE postgres SET app.settings.anon_key = '<anon_key>';
```

Verifique antes via:
```sql
SHOW app.settings.anon_key;
```

Se vier vazio, configurar antes de aplicar a migration.

- [ ] **Step 2: Aplicar migration**

```
mcp__supabase__apply_migration(project_id='ouqwbbermlzqqvtqwlul', name='cron_auditor_divergencias', query=<conteúdo>)
```

- [ ] **Step 3: Validar agendamento**

```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'auditor-divergencias-cron';
```

Expected: 1 linha com `schedule='0 * * * *'` e `active=true`.

- [ ] **Step 4: Aguardar primeira execução (até 1h) ou disparar manualmente**

Para não esperar 1h, disparar manualmente:
```sql
SELECT net.http_post(
  url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/auditor-divergencias-emusys',
  headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true), 'Content-Type', 'application/json'),
  body := jsonb_build_object('trigger', 'cron')
);
```

Após ~30s, validar:
```sql
SELECT count(*) FROM automacao_log
WHERE evento LIKE 'auditoria_%' AND created_at > now() - interval '5 minutes';
```

Expected: > 0 se houver divergências.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260520120200_cron_auditor_divergencias.sql
git commit -m "feat(saude-automacoes): pg_cron - auditor roda toda hora cheia"
```

---

## Task 10: Frontend — hook `useBadgeAutomacoes`

**Files:**
- Create: `src/hooks/useBadgeAutomacoes.ts`

- [ ] **Step 1: Criar hook do contador do badge**

```typescript
// src/hooks/useBadgeAutomacoes.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Conta invariantes críticas com visto_em IS NULL.
 * Usado pelo badge vermelho do menu lateral "Saúde das Automações".
 *
 * Poll de 60s. Sem WebSocket (volume baixo, complexidade extra desnecessária).
 */
export function useBadgeAutomacoes() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancel = false;

    async function buscar() {
      const { count: total, error } = await supabase
        .from('automacao_invariantes')
        .select('id', { count: 'exact', head: true })
        .is('visto_em', null)
        .eq('severidade', 'critico');
      if (!cancel) {
        if (error) {
          console.error('[useBadgeAutomacoes]', error);
          setCount(0);
        } else {
          setCount(total ?? 0);
        }
        setLoading(false);
      }
    }

    buscar();
    const interval = setInterval(buscar, 60_000);

    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, []);

  return { count, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBadgeAutomacoes.ts
git commit -m "feat(saude-automacoes): hook useBadgeAutomacoes - contador de invariantes criticas nao vistas"
```

---

## Task 11: Frontend — hook `useAutomacoesData`

**Files:**
- Create: `src/hooks/useAutomacoesData.ts`

- [ ] **Step 1: Criar hook com filtros e fetch**

```typescript
// src/hooks/useAutomacoesData.ts
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type Severidade = 'critico' | 'aviso';

export type Invariante = {
  id: number;
  log_id: number;
  regra: string;
  severidade: Severidade;
  mensagem: string;
  visto_em: string | null;
  visto_por: string | null;
  created_at: string;
};

export type LogAutomacao = {
  id: number;
  evento: string;
  acao: string;
  aluno_nome: string;
  aluno_id: number | null;
  lead_id: number | null;
  unidade_nome: string | null;
  status: 'ok' | 'warn' | 'erro';
  payload_bruto: unknown;
  detalhes: unknown;
  workflow_id: string | null;
  execution_id: string | null;
  created_at: string;
  invariantes?: Invariante[];
};

export type Filtros = {
  dataInicio: Date;
  dataFim: Date;
  unidades: string[];        // IDs ou nomes; se vazio = todas
  status: Array<'ok' | 'warn' | 'erro'>;   // se vazio = todos
  busca: string;             // ILIKE em aluno_nome
  apenasNaoVistos: boolean;
  evento: string | null;     // null = todos
  regra: string | null;      // null = todas
  severidade: Severidade | null;
  limit: number;             // default 200
};

export function defaultFiltros(): Filtros {
  const dataFim = new Date();
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - 7);
  return {
    dataInicio,
    dataFim,
    unidades: [],
    status: [],
    busca: '',
    apenasNaoVistos: false,
    evento: null,
    regra: null,
    severidade: null,
    limit: 200,
  };
}

export function useAutomacoesData(filtros: Filtros) {
  const [logs, setLogs] = useState<LogAutomacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const fkey = useMemo(() => JSON.stringify({
    di: filtros.dataInicio.toISOString(),
    df: filtros.dataFim.toISOString(),
    u: [...filtros.unidades].sort(),
    s: [...filtros.status].sort(),
    b: filtros.busca,
    nv: filtros.apenasNaoVistos,
    e: filtros.evento,
    r: filtros.regra,
    sev: filtros.severidade,
    l: filtros.limit,
  }), [filtros]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setErro(null);

    let q = supabase
      .from('automacao_log')
      .select(`
        id, evento, acao, aluno_nome, aluno_id, lead_id, unidade_nome,
        status, payload_bruto, detalhes, workflow_id, execution_id, created_at,
        automacao_invariantes (id, log_id, regra, severidade, mensagem, visto_em, visto_por, created_at)
      `)
      .gte('created_at', filtros.dataInicio.toISOString())
      .lte('created_at', filtros.dataFim.toISOString())
      .order('created_at', { ascending: false })
      .limit(filtros.limit);

    if (filtros.unidades.length > 0) {
      q = q.in('unidade_nome', filtros.unidades);
    }
    if (filtros.status.length > 0) {
      q = q.in('status', filtros.status);
    }
    if (filtros.busca.trim()) {
      q = q.ilike('aluno_nome', `%${filtros.busca.trim()}%`);
    }
    if (filtros.evento) {
      q = q.eq('evento', filtros.evento);
    }

    const { data, error } = await q;
    if (error) {
      setErro(error.message);
      setLogs([]);
      setLoading(false);
      return;
    }

    let lista = (data ?? []).map((l: any) => ({
      ...l,
      invariantes: l.automacao_invariantes ?? [],
    })) as LogAutomacao[];

    if (filtros.regra) {
      lista = lista.filter(l => l.invariantes?.some(i => i.regra === filtros.regra));
    }
    if (filtros.severidade) {
      lista = lista.filter(l => l.invariantes?.some(i => i.severidade === filtros.severidade));
    }
    if (filtros.apenasNaoVistos) {
      lista = lista.filter(l => l.invariantes?.some(i => i.visto_em === null && i.severidade === 'critico'));
    }

    setLogs(lista);
    setLoading(false);
  }, [fkey]);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  const marcarVistas = useCallback(async (invariante_ids: number[]) => {
    if (invariante_ids.length === 0) return;
    const { data: userResult } = await supabase.auth.getUser();
    const uid = userResult.user?.id ?? null;
    const { error } = await supabase
      .from('automacao_invariantes')
      .update({ visto_em: new Date().toISOString(), visto_por: uid })
      .in('id', invariante_ids)
      .is('visto_em', null);
    if (error) {
      console.error('[marcarVistas]', error);
    } else {
      await refetch();
    }
  }, [refetch]);

  return { logs, loading, erro, refetch, marcarVistas };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAutomacoesData.ts
git commit -m "feat(saude-automacoes): hook useAutomacoesData - fetch com filtros + marcar vistas"
```

---

## Task 12: Frontend — componentes `ModalPayloadBruto`, `LinhaEvento`, `BotaoRodarAuditoria`

**Files:**
- Create: `src/components/App/Automacoes/ModalPayloadBruto.tsx`
- Create: `src/components/App/Automacoes/LinhaEvento.tsx`
- Create: `src/components/App/Automacoes/BotaoRodarAuditoria.tsx`

- [ ] **Step 1: Criar `ModalPayloadBruto.tsx`**

```tsx
// src/components/App/Automacoes/ModalPayloadBruto.tsx
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  payload: unknown;
  titulo: string;
  onClose: () => void;
};

export function ModalPayloadBruto({ open, payload, titulo, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h3 className="text-white font-semibold">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <pre className="overflow-auto p-6 text-xs text-gray-300 whitespace-pre-wrap break-words">
          {payload === null || payload === undefined
            ? '(vazio)'
            : JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `LinhaEvento.tsx`**

```tsx
// src/components/App/Automacoes/LinhaEvento.tsx
import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Code2 } from 'lucide-react';
import type { LogAutomacao, Invariante } from '@/hooks/useAutomacoesData';
import { ModalPayloadBruto } from './ModalPayloadBruto';

type Props = {
  log: LogAutomacao;
  onMarcarVistas?: (invariante_ids: number[]) => void;
};

const ICONS = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  erro: <AlertCircle className="w-4 h-4 text-rose-400" />,
};

const COR_LINHA = {
  ok: 'border-l-emerald-500/40',
  warn: 'border-l-amber-500/60',
  erro: 'border-l-rose-500/60',
};

export function LinhaEvento({ log, onMarcarVistas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const naoVistas = (log.invariantes ?? []).filter(i => i.visto_em === null);
  const data = new Date(log.created_at);
  const dataFmt = data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className={`bg-slate-900/60 border border-slate-800 border-l-4 ${COR_LINHA[log.status]} rounded-lg p-4`}>
      <div className="flex items-center gap-3">
        {ICONS[log.status]}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">{dataFmt}</span>
            <span className="text-white font-medium">{log.evento}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-300">{log.aluno_nome}</span>
            {log.unidade_nome && (
              <>
                <span className="text-gray-500">·</span>
                <span className="text-gray-400 text-xs">{log.unidade_nome}</span>
              </>
            )}
          </div>
          {(log.invariantes?.length ?? 0) > 0 && (
            <button
              onClick={() => setAberto(v => !v)}
              className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
            >
              {aberto ? 'Ocultar' : 'Ver'} {log.invariantes!.length} problema(s)
            </button>
          )}
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="text-gray-400 hover:text-white p-1"
          title="Ver payload"
        >
          <Code2 className="w-4 h-4" />
        </button>
        {naoVistas.length > 0 && onMarcarVistas && (
          <button
            onClick={() => onMarcarVistas(naoVistas.map(i => i.id))}
            className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded"
          >
            Marcar visto
          </button>
        )}
      </div>

      {aberto && (log.invariantes?.length ?? 0) > 0 && (
        <div className="mt-3 ml-7 space-y-2">
          {log.invariantes!.map((inv: Invariante) => (
            <div key={inv.id} className="flex items-start gap-2 text-xs">
              <span className={
                inv.severidade === 'critico'
                  ? 'text-rose-400 font-medium'
                  : 'text-amber-400 font-medium'
              }>
                [{inv.severidade}]
              </span>
              <code className="text-gray-300">{inv.regra}</code>
              <span className="text-gray-500">·</span>
              <span className="text-gray-400">{inv.mensagem}</span>
              {inv.visto_em && (
                <span className="text-emerald-500 text-[10px]">✓ vista</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalPayloadBruto
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        payload={log.payload_bruto ?? log.detalhes}
        titulo={`${log.evento} · ${log.aluno_nome} · ${dataFmt}`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Criar `BotaoRodarAuditoria.tsx`**

```tsx
// src/components/App/Automacoes/BotaoRodarAuditoria.tsx
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

type Props = {
  onConcluido?: () => void;
};

export function BotaoRodarAuditoria({ onConcluido }: Props) {
  const [rodando, setRodando] = useState(false);

  async function rodar() {
    setRodando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('auditor-divergencias-emusys', {
        body: { trigger: 'manual', user_id: u?.user?.id ?? null },
      });
      if (error) throw error;

      const novos = (data as any)?.novos ?? 0;
      const dur = ((data as any)?.duracao_ms ?? 0) / 1000;
      if (novos > 0) {
        toast.success(`Auditoria concluída em ${dur.toFixed(1)}s — ${novos} nova(s) divergência(s) detectada(s).`);
      } else {
        toast.message(`Auditoria concluída em ${dur.toFixed(1)}s — sem novas divergências.`);
      }
      onConcluido?.();
    } catch (e: any) {
      toast.error(`Erro ao rodar auditoria: ${e.message ?? e}`);
    } finally {
      // Throttle 30s pra evitar spam
      setTimeout(() => setRodando(false), 30_000);
    }
  }

  return (
    <button
      onClick={rodar}
      disabled={rodando}
      className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-50 text-cyan-300 border border-cyan-500/40 rounded-lg transition-colors text-sm font-medium"
    >
      <RefreshCw className={`w-4 h-4 ${rodando ? 'animate-spin' : ''}`} />
      {rodando ? 'Rodando auditoria...' : 'Rodar auditoria agora'}
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Automacoes/ModalPayloadBruto.tsx src/components/App/Automacoes/LinhaEvento.tsx src/components/App/Automacoes/BotaoRodarAuditoria.tsx
git commit -m "feat(saude-automacoes): componentes ModalPayloadBruto, LinhaEvento, BotaoRodarAuditoria"
```

---

## Task 13: Frontend — `TabFeedEventos` e `TabJornadas`

**Files:**
- Create: `src/components/App/Automacoes/TabFeedEventos.tsx`
- Create: `src/components/App/Automacoes/TabJornadas.tsx`

- [ ] **Step 1: Criar `TabFeedEventos.tsx`**

```tsx
// src/components/App/Automacoes/TabFeedEventos.tsx
import { Filtros, LogAutomacao, useAutomacoesData } from '@/hooks/useAutomacoesData';
import { LinhaEvento } from './LinhaEvento';

type Props = { filtros: Filtros };

export function TabFeedEventos({ filtros }: Props) {
  const { logs, loading, erro, marcarVistas } = useAutomacoesData(filtros);

  if (erro) return <div className="text-rose-400 p-4">Erro: {erro}</div>;
  if (loading) return <div className="text-gray-400 p-4">Carregando...</div>;
  if (logs.length === 0) return <div className="text-gray-500 p-4">Nenhum evento nos critérios.</div>;

  return (
    <div className="space-y-2">
      {logs.map((log: LogAutomacao) => (
        <LinhaEvento key={log.id} log={log} onMarcarVistas={marcarVistas} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Criar `TabJornadas.tsx`**

```tsx
// src/components/App/Automacoes/TabJornadas.tsx
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Filtros, LogAutomacao, useAutomacoesData } from '@/hooks/useAutomacoesData';
import { LinhaEvento } from './LinhaEvento';

type Props = { filtros: Filtros };

type Jornada = {
  chave: string;        // aluno_id ou lead_id ou nome
  rotulo: string;
  unidade?: string;
  logs: LogAutomacao[];
  criticos: number;
  avisos: number;
};

export function TabJornadas({ filtros }: Props) {
  const { logs, loading, erro, marcarVistas } = useAutomacoesData(filtros);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const jornadas: Jornada[] = useMemo(() => {
    const mapa = new Map<string, Jornada>();
    for (const log of logs) {
      const chave = log.aluno_id
        ? `aluno:${log.aluno_id}`
        : log.lead_id
          ? `lead:${log.lead_id}`
          : `nome:${log.aluno_nome.toLowerCase()}`;
      let j = mapa.get(chave);
      if (!j) {
        j = { chave, rotulo: log.aluno_nome, unidade: log.unidade_nome ?? undefined, logs: [], criticos: 0, avisos: 0 };
        mapa.set(chave, j);
      }
      j.logs.push(log);
      for (const inv of log.invariantes ?? []) {
        if (inv.severidade === 'critico') j.criticos++;
        else j.avisos++;
      }
    }
    // Ordena por nº de críticos desc, depois por evento mais recente
    return [...mapa.values()].sort((a, b) => {
      if (b.criticos !== a.criticos) return b.criticos - a.criticos;
      const ta = new Date(a.logs[0]?.created_at ?? 0).getTime();
      const tb = new Date(b.logs[0]?.created_at ?? 0).getTime();
      return tb - ta;
    });
  }, [logs]);

  if (erro) return <div className="text-rose-400 p-4">Erro: {erro}</div>;
  if (loading) return <div className="text-gray-400 p-4">Carregando...</div>;
  if (jornadas.length === 0) return <div className="text-gray-500 p-4">Nenhuma jornada nos critérios.</div>;

  return (
    <div className="space-y-3">
      {jornadas.map(j => {
        const aberto = expanded[j.chave] ?? false;
        const Chevron = aberto ? ChevronDown : ChevronRight;
        return (
          <div key={j.chave} className="bg-slate-900/60 border border-slate-800 rounded-lg">
            <button
              onClick={() => setExpanded(e => ({ ...e, [j.chave]: !aberto }))}
              className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/30 transition-colors text-left"
            >
              <Chevron className="w-5 h-5 text-gray-400" />
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium">{j.rotulo}</div>
                {j.unidade && <div className="text-xs text-gray-500">{j.unidade}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {j.logs.length} evento(s)
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {j.criticos > 0 && <span className="text-rose-400 font-medium">{j.criticos} crítico(s)</span>}
                {j.avisos > 0 && <span className="text-amber-400 font-medium">{j.avisos} aviso(s)</span>}
              </div>
            </button>

            {aberto && (
              <div className="px-4 pb-4 pt-1 space-y-2">
                {j.logs.map(log => (
                  <LinhaEvento key={log.id} log={log} onMarcarVistas={marcarVistas} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/App/Automacoes/TabFeedEventos.tsx src/components/App/Automacoes/TabJornadas.tsx
git commit -m "feat(saude-automacoes): TabFeedEventos e TabJornadas"
```

---

## Task 14: Frontend — `AutomacoesPage` container e index barrel

**Files:**
- Create: `src/components/App/Automacoes/AutomacoesPage.tsx`
- Create: `src/components/App/Automacoes/index.ts`

- [ ] **Step 1: Criar `AutomacoesPage.tsx`**

```tsx
// src/components/App/Automacoes/AutomacoesPage.tsx
import { useState } from 'react';
import { Activity, GitBranch, List, Search } from 'lucide-react';
import { defaultFiltros, type Filtros } from '@/hooks/useAutomacoesData';
import { TabJornadas } from './TabJornadas';
import { TabFeedEventos } from './TabFeedEventos';
import { BotaoRodarAuditoria } from './BotaoRodarAuditoria';

type Aba = 'jornadas' | 'feed';

const PRESETS_PERIODO: Array<{ label: string; dias: number }> = [
  { label: 'Hoje', dias: 0 },
  { label: '7 dias', dias: 7 },
  { label: '30 dias', dias: 30 },
];

export function AutomacoesPage() {
  const [aba, setAba] = useState<Aba>('jornadas');
  const [filtros, setFiltros] = useState<Filtros>(defaultFiltros());
  const [refreshKey, setRefreshKey] = useState(0);

  function aplicarPreset(dias: number) {
    const fim = new Date();
    const ini = new Date();
    if (dias === 0) {
      ini.setHours(0, 0, 0, 0);
    } else {
      ini.setDate(ini.getDate() - dias);
    }
    setFiltros(f => ({ ...f, dataInicio: ini, dataFim: fim }));
  }

  function setStatus(s: Filtros['status']) {
    setFiltros(f => ({ ...f, status: s }));
  }

  function setBusca(busca: string) {
    setFiltros(f => ({ ...f, busca }));
  }

  function toggleNaoVistos() {
    setFiltros(f => ({ ...f, apenasNaoVistos: !f.apenasNaoVistos }));
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" key={refreshKey}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-400" />
            Saúde das Automações
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Monitoramento de webhooks Emusys (lead, experimental, matrícula)
          </p>
        </div>
        <BotaoRodarAuditoria onConcluido={() => setRefreshKey(k => k + 1)} />
      </div>

      {/* Filtros */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS_PERIODO.map(p => (
            <button
              key={p.label}
              onClick={() => aplicarPreset(p.dias)}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-md"
            >
              {p.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-2 bg-slate-800 rounded-md px-3 py-1.5 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={filtros.busca}
              onChange={e => setBusca(e.target.value)}
              className="bg-transparent text-sm text-gray-200 placeholder:text-gray-500 outline-none flex-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Status:</span>
          {(['ok', 'warn', 'erro'] as const).map(s => {
            const ativo = filtros.status.includes(s);
            return (
              <button
                key={s}
                onClick={() => setStatus(ativo
                  ? filtros.status.filter(x => x !== s)
                  : [...filtros.status, s])}
                className={`px-3 py-1 text-xs rounded-full border ${
                  ativo
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'text-gray-400 border-slate-700 hover:border-slate-600'
                }`}
              >
                {s}
              </button>
            );
          })}
          <label className="flex items-center gap-2 ml-4 cursor-pointer">
            <input
              type="checkbox"
              checked={filtros.apenasNaoVistos}
              onChange={toggleNaoVistos}
              className="accent-cyan-500"
            />
            <span className="text-xs text-gray-300">Apenas não vistas (críticas)</span>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-800 mb-4">
        <button
          onClick={() => setAba('jornadas')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'jornadas'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <GitBranch className="w-4 h-4" /> Jornadas
        </button>
        <button
          onClick={() => setAba('feed')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'feed'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <List className="w-4 h-4" /> Feed de eventos
        </button>
      </div>

      {aba === 'jornadas' ? <TabJornadas filtros={filtros} /> : <TabFeedEventos filtros={filtros} />}
    </div>
  );
}
```

- [ ] **Step 2: Criar `index.ts` barrel**

```typescript
// src/components/App/Automacoes/index.ts
export { AutomacoesPage } from './AutomacoesPage';
```

- [ ] **Step 3: Commit**

```bash
git add src/components/App/Automacoes/AutomacoesPage.tsx src/components/App/Automacoes/index.ts
git commit -m "feat(saude-automacoes): AutomacoesPage container com filtros, tabs e botao de auditoria"
```

---

## Task 15: Frontend — adicionar rota `/automacoes` e item no sidebar

**Files:**
- Modify: `src/router.tsx`
- Modify: `src/components/App/Layout/AppSidebar.tsx`

- [ ] **Step 1: Adicionar lazy import e rota em `router.tsx`**

Localizar o bloco de imports lazy (próximo à linha 80) e adicionar:

```typescript
// Saúde das Automações
const AutomacoesPage = lazy(() => import('./components/App/Automacoes').then(m => ({ default: m.AutomacoesPage })));
```

Adicionar dentro do bloco `children` do AppLayout (próximo à linha 270, junto das rotas admin):

```tsx
{
  path: 'automacoes',
  element: <Suspense fallback={<PageLoader />}><AutomacoesPage /></Suspense>,
},
```

- [ ] **Step 2: Adicionar item no sidebar (bloco Admin)**

No arquivo `src/components/App/Layout/AppSidebar.tsx`, localizar o bloco `{isAdmin && (...)}` (próximo à linha 256). Antes ou após os outros itens admin, adicionar um item:

Primeiro, no topo do arquivo verificar imports de ícones e adicionar `Activity` à lista de imports do `lucide-react`.

Importar o hook:
```typescript
import { useBadgeAutomacoes } from '@/hooks/useBadgeAutomacoes';
```

Dentro do componente `AppSidebar`, perto dos outros hooks (próximo à linha 95):
```typescript
const { count: criticosNaoVistos } = useBadgeAutomacoes();
```

Dentro do bloco `{isAdmin && (...)}`, adicionar o item (segue padrão dos outros NavLink admin):

```tsx
<Tooltip content="Saúde das Automações" enabled={isCollapsed}>
  <NavLink
    to="/app/automacoes"
    className={({ isActive }) =>
      isCollapsed
        ? "w-full flex items-center justify-center py-2.5 relative"
        : `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
            isActive
              ? 'bg-gradient-to-r from-rose-500/20 to-orange-500/20 text-rose-400 border border-rose-500/30'
              : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
          }`
    }
    style={isCollapsed ? { background: 'none', border: 'none', boxShadow: 'none', outline: 'none' } : {}}
  >
    <Activity className={`w-5 h-5 ${isCollapsed && criticosNaoVistos > 0 ? 'text-rose-400' : ''}`} />
    {!isCollapsed && (
      <span className="text-sm font-medium flex-1">Saúde das Automações</span>
    )}
    {criticosNaoVistos > 0 && (
      <span className={`${isCollapsed ? 'absolute -top-1 -right-1' : ''} w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold`}>
        {criticosNaoVistos > 99 ? '99+' : criticosNaoVistos}
      </span>
    )}
  </NavLink>
</Tooltip>
```

- [ ] **Step 3: Validar visualmente**

Rodar `npm run dev` (porta 5175). Logar como admin. Confirmar:
- Item "Saúde das Automações" aparece no sidebar bloco Admin
- Clicar navega para `/app/automacoes`
- Página carrega com filtros, tabs e botão "Rodar auditoria agora"
- Sem erros no console

- [ ] **Step 4: Commit**

```bash
git add src/router.tsx src/components/App/Layout/AppSidebar.tsx
git commit -m "feat(saude-automacoes): rota /automacoes + item no sidebar admin com badge"
```

---

## Task 16: Validação end-to-end

**Files:** (sem mudanças, só validação)

- [ ] **Step 1: Disparar auditoria manual via UI**

Logar como admin, navegar `/app/automacoes`, clicar "Rodar auditoria agora".

Expected: toast verde ou cinza com duração e contagem. Painel recarrega.

- [ ] **Step 2: Validar contagem do badge**

Verificar que badge no menu sidebar mostra contagem coerente com:
```sql
SELECT count(*) FROM automacao_invariantes
WHERE visto_em IS NULL AND severidade = 'critico';
```

- [ ] **Step 3: Marcar invariante como vista**

Na UI, clicar "Marcar visto" numa linha com invariante crítica. Confirmar que badge decrementa em até 60s.

Validar SQL:
```sql
SELECT id, visto_em, visto_por FROM automacao_invariantes
WHERE visto_em > now() - interval '5 minutes'
ORDER BY visto_em DESC LIMIT 5;
```

Expected: linhas com `visto_em` recente e `visto_por = auth.uid()` do admin.

- [ ] **Step 4: Validar filtros (todos)**

- Mudar preset período (Hoje, 7 dias, 30 dias) e ver lista atualizar
- Toggle "Status: erro" e ver só erros
- Buscar nome conhecido e ver filtragem ILIKE
- Toggle "Apenas não vistas (críticas)"
- Mudar de aba Jornadas → Feed e voltar

Expected: tudo funcionando, sem erros no console.

- [ ] **Step 5: Validar payload modal**

Clicar no ícone de código `Code2` em um evento. Modal abre mostrando JSON formatado do `payload_bruto`.

- [ ] **Step 6: Validar matrícula em tempo real**

Aguardar próxima matrícula real OU disparar webhook mock via curl pra `processar-matricula-emusys`. Verificar:
- Edge processa normalmente (aluno entra)
- Linha aparece em `automacao_log` com `status='ok'/'warn'/'erro'`
- Invariantes correspondentes gravadas
- Aparece no painel em até 30s (auto-refresh)

- [ ] **Step 7: Smoke test do cron**

Aguardar próxima hora cheia (ou disparar manualmente via net.http_post como na Task 9). Verificar nova execução:

```sql
SELECT count(*) FROM automacao_log
WHERE evento LIKE 'auditoria_%'
  AND (detalhes::jsonb)->>'trigger' = 'cron'
  AND created_at > now() - interval '70 minutes';
```

Expected: ≥ 0 (≥1 se houver divergências novas; 0 é OK se nenhuma nova).

- [ ] **Step 8: Commit final (se houver ajustes durante validação)**

Apenas se foram feitos ajustes durante validação:
```bash
git add <arquivos modificados>
git commit -m "fix(saude-automacoes): ajustes pos-validacao end-to-end"
```

---

## Task 17: Atualizar memória do projeto

**Files:**
- Modify: `.claude/memory/integracao-infra.md`

- [ ] **Step 1: Adicionar entradas ao arquivo de memória**

Adicionar na seção de edge functions:
- `processar-matricula-emusys` v17 — grava `automacao_log` + invariantes em tempo real via helper `_shared/invariantes.ts`
- `auditor-divergencias-emusys` v1 — varre leads/experimentais/alunos com ~13 invariantes em SQL idempotente, disparado por pg_cron horário + botão manual no frontend
- pg_cron `auditor-divergencias-cron` — toda hora cheia

Adicionar na seção de tabelas/schemas:
- `automacao_log` estendida com `status`, `lead_id`, `payload_bruto`, `idempotency_key`
- `automacao_invariantes` (nova) — 1 linha por regra violada, soft mark via `visto_em`

Adicionar nova entrada no `MEMORY.md` se houver índice de módulos de produto:
- "Saúde das Automações" — módulo admin de monitoramento passivo, rota `/automacoes`

- [ ] **Step 2: Commit**

```bash
git add .claude/memory/integracao-infra.md .claude/memory/MEMORY.md
git commit -m "docs(memory): registrar saude das automacoes (edge matricula v17 + auditor v1 + cron)"
```

---

## Self-Review

**Spec coverage:**
- Schema extension `automacao_log` + nova `automacao_invariantes` + RLS permissivo → Task 1 ✓
- Helper `_shared/invariantes.ts` com `comFallback`, `gravarLog`, `computarHash` → Task 2 ✓
- Funções `checar*` matrícula/renovação/trancamento/finalização → Task 3 ✓
- Edge matrícula chama helper → Task 4 ✓
- Edge auditor com queries SQL idempotentes → Tasks 5-8 ✓
- pg_cron horário → Task 9 ✓
- Hooks `useBadgeAutomacoes`, `useAutomacoesData` → Tasks 10-11 ✓
- Componentes UI completos → Tasks 12-14 ✓
- Rota + sidebar item com badge → Task 15 ✓
- Botão manual "Rodar auditoria" → Task 12 ✓
- Validação end-to-end → Task 16 ✓
- Memória do projeto → Task 17 ✓

**Catálogo de invariantes:** o plano cobre as invariantes de matrícula em tempo real (Task 3) e ~13 das ~44 da spec via cron (Tasks 6-8). As demais (sub-eventos de experimental como cancelada/reagendada que dependem de campos que o n8n grava em NocoDB e não em `lead_experimentais`) ficam para v2 quando esses campos forem expostos no Supabase. Documentado como limitação na spec.

**Placeholder scan:** nenhum "TODO", "fill in", "TBD" ou similar nas tasks. Todos os blocos de código completos.

**Type consistency:** `Severidade`, `Invariante`, `LogAutomacao`, `Filtros`, `Regra`, `ResultadoMatricula` consistentes entre helper, hook e componentes. `comFallback`, `gravarLog`, `computarHash` exportados onde usados.

---

## Execução

**Plan complete and saved to `docs/superpowers/plans/2026-05-20-saude-automacoes.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints for review

**Which approach?**
