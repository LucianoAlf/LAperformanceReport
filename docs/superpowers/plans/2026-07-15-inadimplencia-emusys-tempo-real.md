# Inadimplência em tempo real (Lista de Alunos) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a fonte do banner "Inadimplência" e do filtro correspondente na Lista de Alunos, de um campo manual (`status_pagamento`, resetado todo mês) para um cache alimentado ao vivo pela API do Emusys (`contrato_atual.inadimplente` / `contrato_atual.valor_mensalidade`), sem alterar nenhuma métrica oficial nem escrever automaticamente em `status_pagamento`/`valor_parcela`.

**Architecture:** Tabela de cache `inadimplencia_emusys_cache` (1 linha por matrícula ativa) alimentada por uma edge function (`sync-inadimplencia-emusys`, 1 unidade por invocação, mesmo padrão de `sync-matriculas-emusys`) rodando via `pg_cron` 3x/dia por unidade. O frontend (`AlunosPage.tsx`) faz um segundo `select` nessa tabela ao carregar os alunos e anexa dois campos novos (`inadimplente_emusys`, `valor_mensalidade_emusys`) no aluno principal e em cada `outros_cursos[i]`, casando por `(unidade_id, emusys_matricula_id)`. `TabelaAlunos.tsx` passa a ler esses campos no banner/filtro/coluna de valor.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno + pg_cron), React 19 + TypeScript, `supabase-js` client.

## Global Constraints

- Não alterar `alunos.status_pagamento` nem `alunos.valor_parcela` automaticamente em nenhum passo — são campos manuais, com governança própria (`statusPagamentoGovernanca.ts`).
- Não alterar a métrica oficial de Inadimplência % usada em Dashboard/Resumo (`docs/METRICAS.md`) — ela continua sobre `status_pagamento`.
- Só matrícula com `status = 'ativo'` entra na conta de inadimplência (mesma exclusão de hoje, `TabelaAlunos.tsx:88-90`). A sync só busca `GET /matriculas?status=ativa` — nunca trancada.
- IDs do Emusys são por unidade, não globais — todo match por `emusys_matricula_id` **precisa** vir acompanhado de `unidade_id` no filtro/chave (regra do projeto, `.claude/memory/emusys-api.md`).
- RLS fechado por padrão: a tabela nova só permite `SELECT` para `authenticated`; escrita só via `service_role` (edge function).
- Antes de deployar a edge function, comparar deployado vs. git com `get_edge_function` (protocolo do projeto — nunca assumir que git == produção).

---

### Task 1: Migration — tabela `inadimplencia_emusys_cache`

**Files:**
- Create: `supabase/migrations/20260715120000_criar_inadimplencia_emusys_cache.sql`

**Interfaces:**
- Produces: tabela `inadimplencia_emusys_cache(unidade_id, emusys_matricula_id, inadimplente, valor_mensalidade_emusys, forma_pagamento_emusys, atualizado_em)`, PK composta `(unidade_id, emusys_matricula_id)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Cache de inadimplencia/valor real cobrado, vindo da API do Emusys (contrato_atual.inadimplente
-- e contrato_atual.valor_mensalidade), por matricula ATIVA. Populada pela edge function
-- sync-inadimplencia-emusys (cron 3x/dia por unidade). NAO substitui alunos.status_pagamento
-- (campo manual, com governanca propria) -- e uma fonte adicional, so de leitura no frontend.
-- Spec: docs/superpowers/specs/2026-07-15-inadimplencia-emusys-tempo-real-design.md
CREATE TABLE inadimplencia_emusys_cache (
  unidade_id uuid NOT NULL REFERENCES unidades(id),
  emusys_matricula_id text NOT NULL,
  inadimplente boolean NOT NULL DEFAULT false,
  valor_mensalidade_emusys numeric,
  forma_pagamento_emusys text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, emusys_matricula_id)
);

COMMENT ON TABLE inadimplencia_emusys_cache IS 'Cache de inadimplencia/valor real vindo da API do Emusys (contrato_atual.inadimplente/valor_mensalidade), por matricula ativa. Alimentada por sync-inadimplencia-emusys. Leitura no frontend em AlunosPage.tsx para o banner/filtro/coluna de valor da Lista de Alunos -- nao altera alunos.status_pagamento/valor_parcela.';

ALTER TABLE inadimplencia_emusys_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inadimplencia_emusys_cache_select_authenticated" ON inadimplencia_emusys_cache
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Aplicar via MCP e conferir**

Aplicar com `mcp__supabase__apply_migration` (nome `criar_inadimplencia_emusys_cache`, query acima). Depois:

```sql
SELECT * FROM inadimplencia_emusys_cache LIMIT 1;
SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE tablename = 'inadimplencia_emusys_cache';
```

Esperado: tabela vazia sem erro; 1 policy, `roles = {authenticated}`, `cmd = SELECT`.

- [ ] **Step 3: Commit** (só se o usuário pedir explicitamente — regra do projeto é nunca commitar sem pedido)

---

### Task 2: Edge function `sync-inadimplencia-emusys`

**Files:**
- Create: `supabase/functions/sync-inadimplencia-emusys/index.ts`

**Interfaces:**
- Consumes: `inadimplencia_emusys_cache` (Task 1), secrets `EMUSYS_TOKEN_CG/RECREIO/BARRA` (já existem), `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (padrão de toda edge function), `_shared/supabase-client.ts` (`createServiceClient`).
- Produces: endpoint HTTP `POST /functions/v1/sync-inadimplencia-emusys?u=cg|recreio|barra`, resposta JSON `{ unidade, total_matriculas, inadimplentes, paginas, paginacao_completa, deletados, throttled? }`.

- [ ] **Step 1: Escrever a edge function**

```ts
/// <reference lib="deno.ns" />

// Edge Function: sync-inadimplencia-emusys
// Cache de inadimplencia/valor real (contrato_atual.inadimplente / valor_mensalidade) por
// matricula ATIVA, vindo da API do Emusys. Processa UMA unidade por invocacao (?u=cg|recreio|barra),
// mesmo padrao de sync-matriculas-emusys, para caber no idle timeout de 150s apesar do
// throttle do rate limit da API (60 req/min).
//
// So le da API -- nunca escreve em alunos.status_pagamento/valor_parcela. Correcao continua manual.
// Spec: docs/superpowers/specs/2026-07-15-inadimplencia-emusys-tempo-real-design.md

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';

const EMUSYS_API = 'https://api.emusys.com.br/v1';
const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
};
const UNIDADES: Record<string, { nome: string; id: string; token: string }> = {
  cg: { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: requiredEnv('EMUSYS_TOKEN_CG') },
  recreio: { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: requiredEnv('EMUSYS_TOKEN_RECREIO') },
  barra: { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: requiredEnv('EMUSYS_TOKEN_BARRA') },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Guard de acesso: cron (x-sync-token) OU qualquer usuario autenticado (o botao "Atualizar
// agora" e usado pela equipe toda -- diferente de sync-matriculas-emusys, que so escreve
// dado de negocio e por isso restringe a tecnicos; aqui e so cache de leitura).
async function validarAcesso(req: Request): Promise<Response | null> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return null;

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return new Response(JSON.stringify({ erro: 'nao autenticado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (token === SUPABASE_SERVICE_ROLE_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return new Response(JSON.stringify({ erro: 'token invalido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return null;
}

interface MatriculaAtiva {
  id: number;
  inadimplente: boolean;
  valor_mensalidade: number | null;
  forma_pagamento: string | null;
}

async function fetchMatriculasAtivas(token: string): Promise<{ items: MatriculaAtiva[]; completo: boolean }> {
  const items: MatriculaAtiva[] = [];
  let cursor = '';
  let completo = false;

  for (let i = 0; i < 200; i++) {
    const url = `${EMUSYS_API}/matriculas?status=ativa&limite=50${cursor ? `&cursor=${cursor}` : ''}`;
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { token } });
    } catch (fetchError) {
      console.error('Falha de rede na paginacao de matriculas ativas:', fetchError);
      break; // paginacao incompleta -- completo fica false
    }
    if (!resp.ok) {
      console.error(`API respondeu ${resp.status} na pagina ${i + 1}`);
      break;
    }
    const json = await resp.json();
    for (const m of json.items || []) {
      items.push({
        id: Number(m.id),
        inadimplente: m.contrato_atual?.inadimplente === true,
        valor_mensalidade: m.contrato_atual?.valor_mensalidade ?? null,
        forma_pagamento: m.contrato_atual?.forma_pagamento || null,
      });
    }
    if (!json.paginacao?.tem_mais || !json.paginacao?.proximo_cursor) {
      completo = true;
      break;
    }
    cursor = json.paginacao.proximo_cursor;
    await sleep(1100); // throttle: rate limit 60/min por IP
  }

  return { items, completo };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const bloqueio = await validarAcesso(req);
  if (bloqueio) return bloqueio;

  const alvo = new URL(req.url).searchParams.get('u') || '';
  const u = UNIDADES[alvo];
  if (!u) {
    return new Response(JSON.stringify({ erro: 'unidade invalida; use ?u=cg|recreio|barra' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Guard contra chamadas repetidas: se atualizou ha menos de 5min, nao rechama a API.
  const { data: ultimaAtualizacao } = await supabase
    .from('inadimplencia_emusys_cache')
    .select('atualizado_em')
    .eq('unidade_id', u.id)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimaAtualizacao?.atualizado_em) {
    const minutosDesde = (Date.now() - new Date(ultimaAtualizacao.atualizado_em).getTime()) / 60000;
    if (minutosDesde < 5) {
      const { count } = await supabase
        .from('inadimplencia_emusys_cache')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', u.id);
      const { count: inadimplentesCount } = await supabase
        .from('inadimplencia_emusys_cache')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', u.id)
        .eq('inadimplente', true);
      return new Response(JSON.stringify({
        unidade: u.nome,
        throttled: true,
        total_matriculas: count || 0,
        inadimplentes: inadimplentesCount || 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const { items, completo } = await fetchMatriculasAtivas(u.token);

  const agora = new Date().toISOString();
  let inadimplentes = 0;
  const rows = items.map((m) => {
    if (m.inadimplente) inadimplentes++;
    return {
      unidade_id: u.id,
      emusys_matricula_id: String(m.id),
      inadimplente: m.inadimplente,
      valor_mensalidade_emusys: m.valor_mensalidade,
      forma_pagamento_emusys: m.forma_pagamento,
      atualizado_em: agora,
    };
  });

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase
      .from('inadimplencia_emusys_cache')
      .upsert(chunk, { onConflict: 'unidade_id,emusys_matricula_id' });
    if (error) {
      return new Response(JSON.stringify({ erro: `upsert falhou: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let deletados = 0;
  // So remove fantasmas se a paginacao terminou 100% -- senao um erro no meio apagaria
  // matricula legitima que so nao foi buscada ainda nesta rodada.
  if (completo && items.length > 0) {
    const idsAtuais = items.map((m) => String(m.id));
    const { data: removidos, error: deleteError } = await supabase
      .from('inadimplencia_emusys_cache')
      .delete()
      .eq('unidade_id', u.id)
      .not('emusys_matricula_id', 'in', `(${idsAtuais.map((id) => `"${id}"`).join(',')})`)
      .select('emusys_matricula_id');
    if (deleteError) console.error('Falha no delete-diff:', deleteError.message);
    deletados = removidos?.length || 0;
  }

  return new Response(JSON.stringify({
    unidade: u.nome,
    total_matriculas: items.length,
    inadimplentes,
    paginacao_completa: completo,
    deletados,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
```

- [ ] **Step 2: Validar sintaxe**

Run: `node --check "supabase\functions\sync-inadimplencia-emusys\index.ts"` (Deno TS, mas `node --check` pega erro grosseiro de sintaxe — mesmo protocolo já usado neste projeto pra edge functions).
Expected: sem output (sintaxe ok). Se o Node reclamar de sintaxe TS que o Deno aceita, ignorar erros de tipo — só validar chaves/parênteses/strings balanceados.

- [ ] **Step 3: Deploy via MCP**

Antes de deployar, se já existir alguma versão publicada (não deveria, é função nova), rodar `get_edge_function` pra comparar. Deployar com `mcp__supabase__deploy_edge_function` (`name: sync-inadimplencia-emusys`, conteúdo do arquivo local, sem `verify_jwt: false` — não é webhook externo, mantém o padrão default).

- [ ] **Step 4: Testar manualmente para 1 unidade**

```bash
curl -s -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=recreio" \
  -H "Authorization: Bearer <token de um usuario logado ou service_role>"
```

Expected: JSON com `unidade: "Recreio"`, `total_matriculas` próximo de 422 (o número que já confirmamos nesta sessão), `paginacao_completa: true`.

- [ ] **Step 5: Conferir no banco**

```sql
SELECT unidade_id, count(*) total, count(*) FILTER (WHERE inadimplente) inadimplentes, max(atualizado_em) atualizado_em
FROM inadimplencia_emusys_cache GROUP BY unidade_id;
```

Expected: 1 linha (Recreio), `total` batendo com a resposta da function.

- [ ] **Step 6: Testar o guard de 5 minutos**

Rodar o mesmo `curl` do Step 4 de novo, imediatamente.
Expected: resposta com `throttled: true` e os mesmos números, sem re-chamar a API do Emusys (confirmar pelo tempo de resposta bem mais rápido que a primeira chamada).

- [ ] **Step 7: Commit** (só se pedido)

---

### Task 3: Cron — 3x/dia por unidade, defasado

**Files:**
- Create: `supabase/migrations/20260715120500_cron_sync_inadimplencia_emusys.sql`

**Interfaces:**
- Consumes: função `sync-inadimplencia-emusys` (Task 2), secret `sync_matriculas_admin_token` já existente no vault (reaproveitado).

- [ ] **Step 1: Escrever a migration do cron**

```sql
-- Cron de sync-inadimplencia-emusys: 3 horarios/dia (08h, 13h, 18h BRT = 11h, 16h, 21h UTC),
-- 1 unidade por invocacao defasada 20min (mesmo espacamento de sync-matriculas-emusys), pra
-- nao estourar o timeout de 150s nem o rate limit de 60 req/min da API do Emusys.
SELECT cron.schedule('sync-inadimplencia-cg-manha', '0 11 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-recreio-manha', '20 11 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-barra-manha', '40 11 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-cg-tarde', '0 16 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-recreio-tarde', '20 16 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-barra-tarde', '40 16 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-cg-noite', '0 21 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-recreio-noite', '20 21 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-barra-noite', '40 21 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);
```

- [ ] **Step 2: Aplicar via MCP e conferir**

```sql
SELECT jobname, schedule FROM cron.job WHERE jobname ILIKE 'sync-inadimplencia-%' ORDER BY jobname;
```

Expected: 9 linhas, horários batendo com o que foi escrito acima.

- [ ] **Step 3: Commit** (só se pedido)

---

### Task 4: Frontend — tipos e `selectFields` (`AlunosPage.tsx`)

**Files:**
- Modify: `src/components/App/Alunos/AlunosPage.tsx:44-102` (interface `Aluno`), `:521-534` (`selectFields`)

**Interfaces:**
- Produces: `Aluno.emusys_matricula_id?: string | null`, `Aluno.inadimplente_emusys?: boolean`, `Aluno.valor_mensalidade_emusys?: number | null`, `Aluno._inadimplencia_atualizado_em?: string | null` — consumidos pela Task 5 (merge) e Task 6/7 (`TabelaAlunos.tsx`).

- [ ] **Step 1: Adicionar campos na interface `Aluno`**

Em `AlunosPage.tsx`, dentro da interface `Aluno` (perto de `foto_url?: string | null;`, linha ~98), adicionar:

```ts
  emusys_matricula_id?: string | null;
  // Inadimplencia/valor ao vivo da API Emusys (nao confundir com status_pagamento/valor_parcela, que sao manuais)
  inadimplente_emusys?: boolean;
  valor_mensalidade_emusys?: number | null;
  _inadimplencia_atualizado_em?: string | null;
```

- [ ] **Step 2: Adicionar `emusys_matricula_id` ao `selectFields`**

Em `AlunosPage.tsx:521-534`, adicionar `emusys_matricula_id` na lista de colunas simples (linha 524, junto de `status, status_pagamento, ...`):

```ts
      status, status_pagamento, aguardando_renovacao, dia_vencimento, tipo_matricula_id, tipo_aluno, unidade_id, data_matricula,
      is_segundo_curso, data_nascimento, forma_pagamento_id, telefone, whatsapp, responsavel_telefone, data_saida,
      arquivado_em, arquivado_por, arquivado_motivo, arquivado_origem, arquivado_aluno_principal_id,
      foto_url, photo_url, instagram, emusys_matricula_id,
```

- [ ] **Step 3: Conferir com typecheck**

Run: `npx tsc --noEmit -p .` (do diretório raiz do projeto)
Expected: nenhum erro novo em `AlunosPage.tsx` (os únicos erros pré-existentes são em `scripts/importar_historico_ltv.js`, não relacionados).

- [ ] **Step 4: Commit** (só se pedido)

---

### Task 5: Frontend — merge do cache no carregamento (`AlunosPage.tsx`)

**Files:**
- Modify: `src/components/App/Alunos/AlunosPage.tsx:664-728` (dentro de `carregarDados()`, dependência da Task 4)

**Interfaces:**
- Consumes: `Aluno.emusys_matricula_id`/`unidade_id` (Task 4), tabela `inadimplencia_emusys_cache` (Task 1).
- Produces: `alunos` (state) com `inadimplente_emusys`/`valor_mensalidade_emusys`/`_inadimplencia_atualizado_em` preenchidos — consumido pela Task 6/7.

- [ ] **Step 1: Buscar o cache e mesclar após o agrupamento por pessoa**

Em `AlunosPage.tsx`, logo depois de `alunosComSegundoCurso.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));` (linha 727) e antes de `setAlunos(alunosComSegundoCurso);` (linha 728), substituir por:

```ts
      alunosComSegundoCurso.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

      // Merge com o cache de inadimplencia/valor ao vivo do Emusys (so leitura -- nao
      // altera status_pagamento/valor_parcela). Match por (unidade_id, emusys_matricula_id)
      // -- IDs do Emusys sao por unidade, nunca globais.
      const unidadesEnvolvidas = [...new Set(alunosComSegundoCurso.map(a => a.unidade_id).filter(Boolean))];
      const cacheMap = new Map<string, { inadimplente: boolean; valor_mensalidade_emusys: number | null; atualizado_em: string }>();
      if (unidadesEnvolvidas.length > 0) {
        const { data: cacheRows } = await supabase
          .from('inadimplencia_emusys_cache')
          .select('unidade_id, emusys_matricula_id, inadimplente, valor_mensalidade_emusys, atualizado_em')
          .in('unidade_id', unidadesEnvolvidas);
        (cacheRows || []).forEach((row: any) => {
          cacheMap.set(`${row.unidade_id}|${row.emusys_matricula_id}`, row);
        });
      }

      const alunosComInadimplenciaEmusys = alunosComSegundoCurso.map(aluno => {
        const chavePrincipal = aluno.emusys_matricula_id ? `${aluno.unidade_id}|${aluno.emusys_matricula_id}` : null;
        const cachePrincipal = chavePrincipal ? cacheMap.get(chavePrincipal) : undefined;

        const outrosCursosComCache = aluno.outros_cursos?.map(oc => {
          const chaveOc = oc.emusys_matricula_id ? `${oc.unidade_id}|${oc.emusys_matricula_id}` : null;
          const cacheOc = chaveOc ? cacheMap.get(chaveOc) : undefined;
          return {
            ...oc,
            inadimplente_emusys: cacheOc?.inadimplente,
            valor_mensalidade_emusys: cacheOc?.valor_mensalidade_emusys ?? undefined,
          };
        });

        return {
          ...aluno,
          inadimplente_emusys: cachePrincipal?.inadimplente,
          valor_mensalidade_emusys: cachePrincipal?.valor_mensalidade_emusys ?? undefined,
          _inadimplencia_atualizado_em: cachePrincipal?.atualizado_em ?? null,
          outros_cursos: outrosCursosComCache,
        };
      });

      setAlunos(alunosComInadimplenciaEmusys);
```

- [ ] **Step 2: Conferir com typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem erro novo.

- [ ] **Step 3: Conferir manualmente no navegador**

Com a Task 2 já tendo populado `inadimplencia_emusys_cache` para Recreio, abrir a Lista de Alunos (Recreio) e no console do navegador rodar algo como inspecionar o state (ou logar temporariamente) para confirmar que pelo menos um aluno tem `inadimplente_emusys` definido (`true` ou `false`, não `undefined`). Remover qualquer log de depuração antes do commit.

- [ ] **Step 4: Commit** (só se pedido)

---

### Task 6: Frontend — filtro `inadimplente_emusys_live` (`AlunosPage.tsx`)

**Files:**
- Modify: `src/components/App/Alunos/AlunosPage.tsx:185-201` (interface `Filtros`), `:263-279` (estado inicial), `:1141-1149` (bloco de filtro), `:1290-1298` (reset de filtros — conferir número de linha real após as Tasks 4/5, pode ter deslocado)

**Interfaces:**
- Produces: `filtros.inadimplente_emusys_live: boolean`, consumido pela Task 7 (botão do banner) e usado no filtro de listagem.

- [ ] **Step 1: Adicionar campo na interface `Filtros`**

```ts
export interface Filtros {
  // ...campos existentes...
  status_pagamento: string;
  inadimplente_emusys_live: boolean;
  // ...
}
```

- [ ] **Step 2: Adicionar ao estado inicial de `filtros`**

No `useState<Filtros>({ ... status_pagamento: '', ... })`, adicionar `inadimplente_emusys_live: false,`.

- [ ] **Step 3: Adicionar o bloco de filtro**

Logo depois do bloco existente `if (filtros.status_pagamento) { ... }` (linhas ~1141-1149), adicionar:

```ts
    // Filtro por inadimplencia ao vivo (Emusys) -- independente do status_pagamento manual
    if (filtros.inadimplente_emusys_live) {
      resultado = resultado.filter(a => {
        if (String(a.status || '').toLowerCase() !== 'ativo') return false;
        const principalInadimplente = a.inadimplente_emusys === true;
        const outroCursoInadimplente = a.outros_cursos?.some(oc =>
          String(oc.status || '').toLowerCase() === 'ativo' && oc.inadimplente_emusys === true
        );
        return principalInadimplente || outroCursoInadimplente;
      });
    }
```

- [ ] **Step 4: Incluir no reset de filtros**

Onde os filtros são resetados (ex.: botão "Limpar filtros", procurar o objeto que espelha o estado inicial de `Filtros`), adicionar `inadimplente_emusys_live: false,` junto dos outros campos zerados.

- [ ] **Step 5: Conferir com typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem erro novo.

- [ ] **Step 6: Commit** (só se pedido)

---

### Task 7: Frontend — banner e "Atualizar agora" (`TabelaAlunos.tsx`)

**Files:**
- Modify: `src/components/App/Alunos/TabelaAlunos.tsx:299-344` (novo memo ao lado do `inadimplenciaInfo` existente), `:1944-1985` (JSX do banner)

**Interfaces:**
- Consumes: `alunos`/`todosAlunos` com `inadimplente_emusys`/`valor_mensalidade_emusys`/`_inadimplencia_atualizado_em` (Task 5), `filtros`/`setFiltros` (Task 6), `unidadeAtual` (já existe na página).
- Produces: nada consumido por outra task — é o ponto final visível ao usuário.

- [ ] **Step 1: Adicionar o novo memo `inadimplenciaInfoEmusys`**

Logo depois do `inadimplenciaInfo` existente (fecha em `}, [todosAlunos, alunos]);`, linha ~344), adicionar:

```ts
  const inadimplenciaInfoEmusys = useMemo(() => {
    const fonte = todosAlunos || alunos;
    const ativos = fonte.filter(a => String(a.status || '').toLowerCase() === 'ativo');

    let total = 0;
    let valor = 0;
    let semDado = 0;
    let atualizadoEm: string | null = null;

    ativos.forEach(a => {
      const principalInadimplente = a.inadimplente_emusys === true;
      const outrosInadimplentes = a.outros_cursos?.filter(oc =>
        String(oc.status || '').toLowerCase() === 'ativo' && oc.inadimplente_emusys === true
      ) || [];

      if (principalInadimplente || outrosInadimplentes.length > 0) {
        total++;
        if (principalInadimplente) {
          valor += a.valor_mensalidade_emusys ?? a.valor_parcela ?? 0;
        }
        outrosInadimplentes.forEach(oc => {
          valor += oc.valor_mensalidade_emusys ?? oc.valor_parcela ?? 0;
        });
      }

      if (a.inadimplente_emusys === undefined) semDado++;
      if (a._inadimplencia_atualizado_em && (!atualizadoEm || a._inadimplencia_atualizado_em > atualizadoEm)) {
        atualizadoEm = a._inadimplencia_atualizado_em;
      }
    });

    return { total, valor, semDado, atualizadoEm, mostrar: total > 0 || semDado > 0 };
  }, [todosAlunos, alunos]);

  function formatarTempoDecorrido(iso: string | null): string {
    if (!iso) return 'nunca sincronizado';
    const diffMs = Date.now() - new Date(iso).getTime();
    const horas = Math.floor(diffMs / (1000 * 60 * 60));
    if (horas < 1) return 'há menos de 1h';
    if (horas === 1) return 'há 1h';
    return `há ${horas}h`;
  }
```

- [ ] **Step 2: Adicionar estado de loading do botão "Atualizar agora"**

Perto de outros `useState` da tabela, adicionar:

```ts
  const [atualizandoInadimplencia, setAtualizandoInadimplencia] = useState(false);
```

- [ ] **Step 3: Adicionar a função que chama a edge function**

Em algum ponto do componente (perto de outras funções `async function` da tabela), adicionar:

```ts
  const UNIDADE_ID_PARA_CODIGO_SYNC: Record<string, 'cg' | 'recreio' | 'barra'> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'cg',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'recreio',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'barra',
  };

  async function atualizarInadimplenciaAgora() {
    setAtualizandoInadimplencia(true);
    try {
      const codigos = unidadeAtual === 'todos'
        ? Object.values(UNIDADE_ID_PARA_CODIGO_SYNC)
        : [UNIDADE_ID_PARA_CODIGO_SYNC[unidadeAtual]].filter(Boolean);

      await Promise.all(codigos.map(codigo =>
        supabase.functions.invoke(`sync-inadimplencia-emusys?u=${codigo}`, { method: 'POST' })
      ));

      await onRecarregar();
    } finally {
      setAtualizandoInadimplencia(false);
    }
  }
```

(`onRecarregar` já existe como prop da tabela, usado em outros pontos como `onSalvar={onRecarregar}` — reaproveitar o mesmo mecanismo de recarga.)

- [ ] **Step 4: Trocar o JSX do banner**

Substituir o bloco `{inadimplenciaInfo.mostrar && !alertaInadimplenciaDismissed && ( ... )}` (linhas ~1944-1985) por:

```tsx
      {/* Alerta financeiro (Emusys ao vivo) */}
      {inadimplenciaInfoEmusys.mostrar && !alertaInadimplenciaDismissed && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
          inadimplenciaInfoEmusys.total > 0 ? 'bg-red-500/15 border-red-500/30' : 'bg-amber-500/15 border-amber-500/30'
        }`}>
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${inadimplenciaInfoEmusys.total > 0 ? 'text-red-400' : 'text-amber-300'}`} />
          <span className={`${inadimplenciaInfoEmusys.total > 0 ? 'text-red-300' : 'text-amber-200'} flex-1`}>
            <strong className={inadimplenciaInfoEmusys.total > 0 ? 'text-red-200' : 'text-amber-100'}>
              {inadimplenciaInfoEmusys.total > 0
                ? `${inadimplenciaInfoEmusys.total} aluno${inadimplenciaInfoEmusys.total !== 1 ? 's' : ''} ativo${inadimplenciaInfoEmusys.total !== 1 ? 's' : ''} inadimplente${inadimplenciaInfoEmusys.total !== 1 ? 's' : ''} (Emusys ao vivo)`
                : `${inadimplenciaInfoEmusys.semDado} aluno${inadimplenciaInfoEmusys.semDado !== 1 ? 's' : ''} ainda sem sync de inadimplência`
              }
            </strong>
            {inadimplenciaInfoEmusys.total > 0 && (
              <> — R$ {inadimplenciaInfoEmusys.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em parcelas inadimplentes</>
            )}
            {' · '}
            <span className="opacity-70">atualizado {formatarTempoDecorrido(inadimplenciaInfoEmusys.atualizadoEm)}</span>
          </span>
          {inadimplenciaInfoEmusys.total > 0 && (
            <button
              onClick={() => setFiltros({ ...filtros, inadimplente_emusys_live: true })}
              className="px-3 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-200"
            >
              Filtrar ativos inadimplentes
            </button>
          )}
          <button
            onClick={atualizarInadimplenciaAgora}
            disabled={atualizandoInadimplencia}
            className="px-3 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap bg-slate-700/40 hover:bg-slate-700/60 border-slate-600 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {atualizandoInadimplencia ? 'Atualizando...' : 'Atualizar agora'}
          </button>
          <button
            onClick={() => setAlertaInadimplenciaDismissed(true)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Dispensar alerta"
          >
            <X className={`w-4 h-4 ${inadimplenciaInfoEmusys.total > 0 ? 'text-red-400' : 'text-amber-300'}`} />
          </button>
        </div>
      )}
```

- [ ] **Step 5: Conferir com typecheck e build**

Run: `npx tsc --noEmit -p .` e `npm run build`
Expected: ambos limpos (mesmos erros pré-existentes de `scripts/importar_historico_ltv.js`, nada novo).

- [ ] **Step 6: Testar no navegador**

Abrir Lista de Alunos (unidade com cache populado pela Task 2). Confirmar: banner mostra "atualizado há Xh"; clicar em "Atualizar agora" desabilita o botão, espera alguns segundos, timestamp muda pra "há menos de 1h"; clicar em "Filtrar ativos inadimplentes" filtra a tabela (conferir que só aparecem alunos com `inadimplente_emusys === true`).

- [ ] **Step 7: Commit** (só se pedido)

---

### Task 8: Frontend — aviso de divergência de valor (`TabelaAlunos.tsx`)

**Files:**
- Modify: `src/components/App/Alunos/TabelaAlunos.tsx:2283-2327` (coluna Parcela do aluno principal), `~2646` (coluna Parcela equivalente em `outros_cursos`, conferir número de linha real no momento da implementação)

**Interfaces:**
- Consumes: `aluno.valor_mensalidade_emusys`/`aluno.valor_parcela` (Task 5), `setAlunoFicha` (já existe no componente, abre `ModalFichaAluno`).

- [ ] **Step 1: Adicionar o ícone de divergência na célula de Parcela (aluno principal)**

Dentro do bloco `{col('parcela') && (() => { ... return (<td>...</td>); })()}` (linhas ~2283-2327), depois do `{vemDeOutroCurso && (...)}` (linha ~2321-2323), adicionar:

```tsx
                          {aluno.valor_mensalidade_emusys != null && aluno.valor_parcela != null &&
                            Math.abs(aluno.valor_mensalidade_emusys - aluno.valor_parcela) > 0.01 && (
                            <Tooltip content={`Emusys cobra R$ ${aluno.valor_mensalidade_emusys.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — aqui está R$ ${aluno.valor_parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Clique para corrigir.`}>
                              <button
                                type="button"
                                onClick={() => setAlunoFicha(aluno)}
                                className="ml-1 text-amber-400 hover:text-amber-300"
                              >
                                ⚠️
                              </button>
                            </Tooltip>
                          )}
```

- [ ] **Step 2: Repetir o mesmo padrão no bloco de `outros_cursos`**

Localizar o bloco equivalente de `col('parcela')` dentro da renderização de cada `outros_cursos[i]` (perto da linha ~2646 — conferir contexto exato no momento da implementação, pois os números de linha deslocam com as tasks anteriores) e aplicar o mesmo ícone, trocando `aluno` pela variável do curso em questão (ex.: `outroCurso`) e `setAlunoFicha(aluno)` por `setAlunoFicha(outroCurso)` (mesma prop `onAbrirOutroCurso` já usada no `ModalFichaAluno`, linha 3250).

- [ ] **Step 3: Conferir com typecheck e build**

Run: `npx tsc --noEmit -p .` e `npm run build`
Expected: limpos.

- [ ] **Step 4: Testar no navegador**

Achar (ou forçar temporariamente via SQL) um aluno onde `valor_mensalidade_emusys` do cache diverge de `valor_parcela`. Confirmar que o ⚠️ aparece na coluna Parcela, o tooltip mostra os dois valores, e o clique abre a Ficha do Aluno correta.

- [ ] **Step 5: Commit** (só se pedido)

---

## Self-Review (cobertura da spec)

- Tabela de cache (spec §1) → Task 1.
- Edge function + guard de 5min + delete-diff condicionado (spec §2) → Task 2.
- Cron 3x/dia por unidade, defasado (spec §2) → Task 3.
- `emusys_matricula_id` no `selectFields` + merge por `(unidade_id, emusys_matricula_id)` no bloco `alunosComSegundoCurso` (spec §3) → Tasks 4 e 5.
- Banner com fonte trocada, "atualizado há Xh", botão "Atualizar agora", filtro novo independente (spec §4) → Tasks 6 e 7.
- Coluna de valor com aviso de divergência, abrindo Ficha do Aluno (spec §4) → Task 8.
- Fora de escopo (métrica oficial, trancado, escrita automática, tela nova) → nenhuma task toca nisso — confirmado.

## Verificação final (fim a fim)

1. Rodar `npm run build` limpo depois de todas as tasks.
2. Abrir Lista de Alunos → Recreio → conferir banner "ao vivo", clicar "Atualizar agora", conferir filtro, conferir ícone de divergência de valor.
3. Trocar unidade pra "Todas" → conferir que "Atualizar agora" dispara as 3 unidades e o merge funciona pra cada uma (sem cruzar matrícula de unidade errada — validar com um aluno de cada unidade).
4. Confirmar visualmente que `status_pagamento`/`valor_parcela` de nenhum aluno mudou sozinho depois de rodar a sync (comparar `updated_at` de `alunos` antes/depois).
