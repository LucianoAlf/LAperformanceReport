# Auto-disparo da pesquisa de 1ª aula (só ontem) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba Pós-1ª Aula mostra só quem fez a 1ª aula ontem, e um cron 11h BRT dispara a pesquisa automaticamente (opt-in por toggle, teto 15/dia, aviso à Fabi no excedente).

**Architecture:** A RPC `get_candidatos_pesquisa_primeira_aula` ganha um modo "só ontem" (BRT). A aba passa a usar esse modo (sem seletor de janela). Um toggle persistido em `automacoes_config` controla um cron que chama uma edge orquestradora nova; ela reaproveita a edge de envio existente (`enviar-pesquisa-pos-primeira-aula`, que já faz 1/1 com 10s e é idempotente) e responde rápido ao cron via `EdgeRuntime.waitUntil`.

**Tech Stack:** Supabase (Postgres RPC + Edge Functions Deno + pg_cron/pg_net), React 19 + TS + Vite, UAZAPI (WhatsApp).

## Global Constraints

- **Timezone:** "ontem" SEMPRE em BRT (`America/Sao_Paulo`), na RPC e na edge. Nunca `CURRENT_DATE` cru (é UTC) para "ontem".
- **Git author:** `Luciano <lucianoalf.la@gmail.com>`. NUNCA adicionar `Co-Authored-By`.
- **Nenhuma mensagem a cliente real durante testes.** Validar disparos só contra o número de teste do Hugo: `5521964171223`.
- **Deploy de edge:** estas edges NÃO são webhooks externos → deploy normal (verify_jwt padrão `true`). Não usar `--no-verify-jwt`.
- **Projeto Supabase:** `ouqwbbermlzqqvtqwlul`.
- **Idioma:** variáveis, funções e comentários em português.
- **SQL encadeado via MCP:** usar `BEGIN`/`COMMIT` quando aplicável.
- **Kill switch começa DESLIGADO** (`automacoes_config.ativo = false`): nada dispara sozinho até ligarem o toggle.

---

## File Structure

- **Migration** `supabase/migrations/20260706180000_rpc_candidatos_apenas_ontem.sql` — recria a RPC com `p_apenas_ontem` + corrige o MIN da 1ª aula.
- **Migration** `supabase/migrations/20260706181000_automacoes_config.sql` — tabela + seed + RLS.
- **Edge** `supabase/functions/disparar-pesquisa-1a-aula-auto/index.ts` — orquestradora (nova).
- **Migration** `supabase/migrations/20260706182000_cron_disparar_pesquisa_1a_aula.sql` — pg_cron 11h BRT.
- **Frontend** `src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts` — `buscarCandidatos` sem janela.
- **Frontend** `src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx` — remove seletor, cabeçalho "1ª aula de ontem".
- **Frontend** `src/components/App/SucessoCliente/hooks/useAutomacoesSucessoAluno.ts` — load/save do toggle.
- **Frontend** `src/components/App/SucessoCliente/AutomacoesTab.tsx` — UI do toggle.

---

## Task 1: RPC modo "só ontem" + correção do MIN da 1ª aula

**Files:**
- Create: `supabase/migrations/20260706180000_rpc_candidatos_apenas_ontem.sql`

**Interfaces:**
- Produces: RPC `get_candidatos_pesquisa_primeira_aula(p_unidade_id uuid DEFAULT NULL, p_janela_dias integer DEFAULT 1, p_apenas_ontem boolean DEFAULT false)` — mesmas colunas de retorno. Com `p_apenas_ontem=true`, retorna só quem tem `data_primeira_aula = ontem (BRT)`. `data_primeira_aula` passa a ser a 1ª aula REAL (MIN de toda a presença, não da janela).

- [ ] **Step 1: Baseline — anotar o retorno atual (para comparar depois)**

Rodar via MCP `execute_sql` (projeto `ouqwbbermlzqqvtqwlul`):
```sql
SELECT count(*) AS total_janela1 FROM get_candidatos_pesquisa_primeira_aula(NULL, 1);
```
Guardar o número. É o baseline do modo janela (não deve quebrar).

- [ ] **Step 2: Aplicar a migration (apply_migration)**

Nome: `rpc_candidatos_apenas_ontem`. Conteúdo:
```sql
-- Recria a RPC com modo "só ontem" (BRT) e corrige o cálculo da 1ª aula:
-- antes o MIN(data_aula) era feito DENTRO da janela (podia rotular a aula recente de um
-- veterano como "1ª aula"); agora é o MIN de TODA a presença do aluno (1ª aula real),
-- e a janela/ontem filtra data_primeira_aula no nível externo.
DROP FUNCTION IF EXISTS public.get_candidatos_pesquisa_primeira_aula(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_candidatos_pesquisa_primeira_aula(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_janela_dias integer DEFAULT 1,
  p_apenas_ontem boolean DEFAULT false
)
RETURNS TABLE(aluno_id integer, unidade_id uuid, nome text, unidade_nome text, curso_nome text, professor_nome text, data_primeira_aula date, data_matricula date, whatsapp_jid text)
LANGUAGE sql
STABLE
AS $function$
  WITH primeira_aula AS (
    SELECT
      ap.aluno_id,
      MIN(ap.data_aula) AS data_primeira_aula
    FROM aluno_presenca ap
    JOIN alunos a ON a.id = ap.aluno_id
    WHERE ap.status = 'presente'
      AND ap.data_aula >= a.data_matricula
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    GROUP BY ap.aluno_id
  ),
  candidatos AS (
    SELECT
      a.id                   AS aluno_id,
      a.unidade_id           AS unidade_id,
      a.nome::text           AS nome,
      u.nome::text           AS unidade_nome,
      c.nome::text           AS curso_nome,
      p.nome::text           AS professor_nome,
      pa.data_primeira_aula  AS data_primeira_aula,
      a.data_matricula       AS data_matricula,
      COALESCE(
        ac.whatsapp_jid,
        CASE
          WHEN a.whatsapp IS NOT NULL AND a.whatsapp <> ''
            THEN '55' || regexp_replace(a.whatsapp, '[^0-9]', '', 'g') || '@s.whatsapp.net'
          WHEN a.telefone IS NOT NULL AND a.telefone <> ''
            THEN '55' || regexp_replace(a.telefone, '[^0-9]', '', 'g') || '@s.whatsapp.net'
          ELSE NULL
        END
      ) AS whatsapp_jid
    FROM alunos a
    JOIN primeira_aula pa ON pa.aluno_id = a.id
    JOIN unidades u ON u.id = a.unidade_id
    LEFT JOIN cursos c ON c.id = a.curso_id
    LEFT JOIN professores p ON p.id = a.professor_atual_id
    LEFT JOIN LATERAL (
      SELECT ac2.whatsapp_jid
      FROM admin_conversas ac2
      JOIN whatsapp_caixas wc ON wc.id = ac2.caixa_id
      WHERE ac2.aluno_id = a.id
        AND wc.departamento = 'sucesso_aluno'
      ORDER BY ac2.created_at DESC
      LIMIT 1
    ) ac ON true
    WHERE a.is_segundo_curso = false
      AND a.status = 'ativo'
      AND a.numero_renovacoes = 0
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      AND pa.data_primeira_aula <= a.data_matricula + INTERVAL '4 months'
      AND (
        (p_apenas_ontem
          AND pa.data_primeira_aula = ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1))
        OR
        (NOT p_apenas_ontem
          AND pa.data_primeira_aula >= (CURRENT_DATE - (p_janela_dias || ' days')::interval)::date)
      )
      AND NOT EXISTS (
        SELECT 1 FROM pesquisas_whatsapp pw
        WHERE pw.aluno_id = a.id
          AND pw.tipo = 'pos_primeira_aula'
          AND pw.enviado_ok = true
      )
  )
  SELECT DISTINCT ON (COALESCE(whatsapp_jid, aluno_id::text))
    aluno_id, unidade_id, nome, unidade_nome, curso_nome, professor_nome,
    data_primeira_aula, data_matricula, whatsapp_jid
  FROM candidatos
  ORDER BY COALESCE(whatsapp_jid, aluno_id::text), data_primeira_aula DESC, aluno_id
$function$;
```

- [ ] **Step 3: Verificar que o modo janela ainda responde (caller antigo intacto)**

```sql
SELECT count(*) FROM get_candidatos_pesquisa_primeira_aula(NULL, 3);
```
Expected: retorna sem erro (a chamada de 2 args resolve pra nova função com `p_apenas_ontem=false`).

- [ ] **Step 4: Verificar o modo "só ontem"**

```sql
SELECT aluno_id, nome, data_primeira_aula
FROM get_candidatos_pesquisa_primeira_aula(NULL, 1, true)
ORDER BY nome;
```
Expected: TODAS as linhas têm `data_primeira_aula` = ontem (BRT). Se ontem não teve 1ª aula, retorna 0 linhas — OK. Conferir contra:
```sql
SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1) AS ontem_brt;
```

- [ ] **Step 5: Verificar que o aviso #1 (edge) continua funcionando**

Invocar o aviso #1 em dry-run (não envia):
```bash
curl -s -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/notificar-primeira-aula-fabi" \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```
Expected: JSON com `ok:true` e `total` coerente com o Step 4 (o aviso #1 filtra `data_primeira_aula === ontem` em JS; agora bate com o modo `p_apenas_ontem`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260706180000_rpc_candidatos_apenas_ontem.sql
git commit --author="Luciano <lucianoalf.la@gmail.com>" -m "feat(rpc): modo 'so ontem' em get_candidatos_pesquisa_primeira_aula + fix MIN 1a aula real"
```

---

## Task 2: Tabela `automacoes_config` (kill switch persistido)

**Files:**
- Create: `supabase/migrations/20260706181000_automacoes_config.sql`

**Interfaces:**
- Produces: tabela `automacoes_config(slug text PK, ativo boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now())` com a linha seed `('auto_pesquisa_1a_aula', false)`. Leitura/escrita por `authenticated`; `service_role` ignora RLS.

- [ ] **Step 1: Aplicar a migration (apply_migration)**

Nome: `automacoes_config`. Conteúdo:
```sql
CREATE TABLE IF NOT EXISTS public.automacoes_config (
  slug        text PRIMARY KEY,
  ativo       boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automacoes_config ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão permissivo de crm_templates_whatsapp (o gate real é a permissão na UI).
DROP POLICY IF EXISTS automacoes_config_select ON public.automacoes_config;
CREATE POLICY automacoes_config_select ON public.automacoes_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS automacoes_config_insert ON public.automacoes_config;
CREATE POLICY automacoes_config_insert ON public.automacoes_config
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS automacoes_config_update ON public.automacoes_config;
CREATE POLICY automacoes_config_update ON public.automacoes_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.automacoes_config (slug, ativo)
VALUES ('auto_pesquisa_1a_aula', false)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Verificar seed e RLS**

```sql
SELECT slug, ativo FROM public.automacoes_config WHERE slug = 'auto_pesquisa_1a_aula';
```
Expected: 1 linha, `ativo = false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706181000_automacoes_config.sql
git commit --author="Luciano <lucianoalf.la@gmail.com>" -m "feat(db): tabela automacoes_config (kill switch das automacoes de sucesso do aluno)"
```

---

## Task 3: Edge orquestradora `disparar-pesquisa-1a-aula-auto`

**Files:**
- Create: `supabase/functions/disparar-pesquisa-1a-aula-auto/index.ts`

**Interfaces:**
- Consumes: RPC `get_candidatos_pesquisa_primeira_aula(NULL, 1, true)` (Task 1); tabela `automacoes_config` (Task 2); edge `enviar-pesquisa-pos-primeira-aula` (existente, body `{ alunos: [{aluno_id, unidade_id, whatsapp_jid, nome, curso, data_matricula}] }`, retorno `{ resultados: [{aluno_id, ok, erro}] }`).
- Produces: endpoint POST. Body opcional `{ dry_run?: boolean, forcar?: boolean }`. `dry_run` só simula; `forcar` ignora o toggle (p/ teste manual). Responde rápido; envio real roda em `EdgeRuntime.waitUntil`.

- [ ] **Step 1: Escrever a edge**

Criar `supabase/functions/disparar-pesquisa-1a-aula-auto/index.ts`:
```ts
// Edge Function: disparar-pesquisa-1a-aula-auto
// Auto-disparo (opt-in) da pesquisa de 1ª aula para quem fez a 1ª aula ONTEM (BRT).
// Gated pelo toggle automacoes_config(slug='auto_pesquisa_1a_aula'). Teto 15/dia; acima
// disso, dispara 15 e avisa a Fabi (caixa 3) pra completar o resto na aba Pós-1ª Aula.
// Reaproveita a edge enviar-pesquisa-pos-primeira-aula (1/1 com 10s, idempotente).
// Responde rápido ao cron; o envio real roda em EdgeRuntime.waitUntil.
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CAIXA_SUCESSO_ID = 3;
const NUMERO_FABI = '5521994696489';
const TETO_DIARIO = 15;
const SLUG_CONFIG = 'auto_pesquisa_1a_aula';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Envia um texto simples pela caixa Sucesso do Aluno (id=3). Usado só para avisar a Fabi.
async function avisarFabi(supabase, texto) {
  try {
    const { data: caixa } = await supabase
      .from('whatsapp_caixas')
      .select('uazapi_url, uazapi_token')
      .eq('id', CAIXA_SUCESSO_ID).eq('ativo', true).maybeSingle();
    if (!caixa) return;
    let baseUrl = caixa.uazapi_url || '';
    if (baseUrl && !baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    baseUrl = baseUrl.replace(/\/+$/, '');
    await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: caixa.uazapi_token },
      body: JSON.stringify({ number: NUMERO_FABI, text: texto, delay: 500, readchat: true }),
    });
  } catch (e) {
    console.error('[disparar-pesquisa-auto] avisarFabi erro:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    let body = {};
    try { body = await req.json(); } catch { /* cron manda body vazio */ }
    const dryRun = body.dry_run === true;
    const forcar = body.forcar === true;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Kill switch
    const { data: cfg } = await supabase
      .from('automacoes_config').select('ativo').eq('slug', SLUG_CONFIG).maybeSingle();
    const ativo = cfg?.ativo === true;
    if (!ativo && !forcar) {
      return json({ ok: true, enviado: false, motivo: 'auto_desligado' });
    }

    // 2) Candidatos de ontem (todas as unidades)
    const { data: candidatos, error: rpcErr } = await supabase.rpc(
      'get_candidatos_pesquisa_primeira_aula',
      { p_unidade_id: null, p_janela_dias: 1, p_apenas_ontem: true },
    );
    if (rpcErr) return json({ ok: false, erro: 'rpc_falhou: ' + rpcErr.message }, 500);

    const comContato = (candidatos || []).filter((c) => c.whatsapp_jid);
    const lote = comContato.slice(0, TETO_DIARIO);
    const excedente = comContato.length - lote.length;

    if (comContato.length === 0) {
      return json({ ok: true, enviado: false, motivo: 'sem_candidatos', total: 0 });
    }

    if (dryRun) {
      return json({
        ok: true, dry_run: true, total: comContato.length,
        disparariam: lote.length, excedente, alunos: lote.map((c) => c.nome),
      });
    }

    // 3) Dispara em background (a edge de envio leva ~10s por aluno). Responde já ao cron.
    const tarefa = (async () => {
      const payload = {
        alunos: lote.map((a) => ({
          aluno_id: a.aluno_id, unidade_id: a.unidade_id, whatsapp_jid: a.whatsapp_jid,
          nome: a.nome, curso: a.curso_nome, data_matricula: a.data_matricula,
        })),
      };
      const { data: envio, error: envErr } = await supabase.functions.invoke(
        'enviar-pesquisa-pos-primeira-aula', { body: payload },
      );
      const resultados = (envio && envio.resultados) || [];
      const enviados = resultados.filter((r) => r.ok).length;
      console.log(`[disparar-pesquisa-auto] disparados=${lote.length} enviados=${enviados} excedente=${excedente}`, envErr?.message || '');

      if (excedente > 0) {
        await avisarFabi(
          supabase,
          `⚠️ *Auto-disparo da pesquisa de 1ª aula*\n\nDisparei ${enviados} pesquisa(s) hoje (teto de ${TETO_DIARIO}/dia).\nAinda restam *${excedente}* na aba *Pós-1ª Aula* — dispare quando puder. 🙏`,
        );
      }
    })();

    // @ts-ignore — EdgeRuntime existe no runtime Supabase
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(tarefa);
    } else {
      await tarefa;
    }

    return json({ ok: true, enviado: true, total: comContato.length, disparados: lote.length, excedente });
  } catch (err) {
    console.error('[disparar-pesquisa-auto] erro:', err);
    return json({ ok: false, erro: err instanceof Error ? err.message : 'Erro interno' }, 500);
  }
});
```

- [ ] **Step 2: Deploy da edge (deploy_edge_function via MCP)**

Deploy `disparar-pesquisa-1a-aula-auto` (verify_jwt padrão `true`). Confirmar `status: ACTIVE`.

- [ ] **Step 3: Testar dry-run (não envia nada)**

```bash
curl -s -X POST "https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/disparar-pesquisa-1a-aula-auto" \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"dry_run": true, "forcar": true}'
```
Expected: `{ ok:true, dry_run:true, total:N, disparariam:min(N,15), excedente:max(0,N-15), alunos:[...] }`. `forcar:true` ignora o toggle desligado. Conferir que os nomes batem com a RPC do Task 1 Step 4.

- [ ] **Step 4: Testar disparo real controlado (SEM tocar clientes)**

Não invocar sem dry-run enquanto houver alunos reais na lista de ontem. Para validar o caminho de envio, seguir o protocolo de teste do projeto: inserir/apontar apenas o número de teste do Hugo (`5521964171223`). Se a lista de ontem estiver vazia, o caminho já é seguro (retorna `sem_candidatos`). Registrar no PR/commit que o envio real não foi disparado contra clientes.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/disparar-pesquisa-1a-aula-auto/index.ts
git commit --author="Luciano <lucianoalf.la@gmail.com>" -m "feat(edge): disparar-pesquisa-1a-aula-auto (auto-disparo opt-in, teto 15/dia, aviso Fabi)"
```

---

## Task 4: Cron pg_cron 11h BRT

**Files:**
- Create: `supabase/migrations/20260706182000_cron_disparar_pesquisa_1a_aula.sql`

**Interfaces:**
- Consumes: edge `disparar-pesquisa-1a-aula-auto` (Task 3).
- Produces: job pg_cron `disparar-pesquisa-1a-aula-diario` schedule `0 14 * * *` (= 11h BRT).

- [ ] **Step 1: Aplicar a migration (apply_migration)**

Nome: `cron_disparar_pesquisa_1a_aula`. Conteúdo (mesmo padrão do job 32 `notificar-primeira-aula-fabi-diario`):
```sql
-- Remove job anterior de mesmo nome (idempotente).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'disparar-pesquisa-1a-aula-diario';

SELECT cron.schedule(
  'disparar-pesquisa-1a-aula-diario',
  '0 14 * * *',  -- 14:00 UTC = 11:00 BRT
  $$
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/disparar-pesquisa-1a-aula-auto',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.settings.anon_key', true),
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus'
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);
```

- [ ] **Step 2: Verificar o job**

```sql
SELECT jobid, schedule, jobname FROM cron.job WHERE jobname = 'disparar-pesquisa-1a-aula-diario';
```
Expected: 1 linha, schedule `0 14 * * *`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706182000_cron_disparar_pesquisa_1a_aula.sql
git commit --author="Luciano <lucianoalf.la@gmail.com>" -m "feat(cron): disparar-pesquisa-1a-aula-diario 11h BRT"
```

---

## Task 5: Aba Pós-1ª Aula — remover seletor, travar em "ontem"

**Files:**
- Modify: `src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts`
- Modify: `src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx`

**Interfaces:**
- Consumes: RPC modo `p_apenas_ontem=true` (Task 1).
- Produces: `buscarCandidatos()` sem argumentos (sempre "ontem").

- [ ] **Step 1: Hook — `buscarCandidatos` sem janela**

Em `usePesquisaPrimeiraAula.ts`, substituir a função `buscarCandidatos`:
```ts
  const buscarCandidatos = useCallback(async () => {
    setLoading(true);
    setResultados([]);
    try {
      const { data, error } = await supabase.rpc('get_candidatos_pesquisa_primeira_aula', {
        p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
        p_apenas_ontem: true,
      });
      if (error) throw error;
      setCandidatos((data as CandidatoPesquisa[]) || []);
    } catch (err: any) {
      toast.error('Erro ao buscar candidatos: ' + (err.message || 'Erro desconhecido'));
      setCandidatos([]);
    } finally {
      setLoading(false);
    }
  }, [unidadeAtual]);
```

- [ ] **Step 2: Tab — remover o Select de janela e o estado `janelaDias`**

Em `PesquisaPrimeiraAulaTab.tsx`:
- Remover `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }`.
- Remover `const [janelaDias, setJanelaDias] = useState<number>(1);`.
- Trocar o `useEffect` de busca:
```tsx
  useEffect(() => {
    if (unidadeAtual !== 'todos') {
      buscarCandidatos();
    }
  }, [unidadeAtual]);
```
- Substituir o bloco do `<Select>` (linhas ~58-67) por um rótulo de data de ontem:
```tsx
          <span className="text-sm font-medium text-white">
            1ª aula de ontem{' '}
            <span className="text-slate-400 font-normal">
              ({format(new Date(Date.now() - 86400000), 'dd/MM', { locale: ptBR })})
            </span>
          </span>
```
- No botão de refresh, trocar `onClick={() => buscarCandidatos(janelaDias)}` por `onClick={() => buscarCandidatos()}`.
- No estado vazio da tabela (linha ~135), trocar o texto por:
```tsx
                    Nenhum calouro fez a primeira aula ontem (pendente de pesquisa)
```

- [ ] **Step 3: Typecheck / build**

Run: `npm run build` (ou `npx tsc --noEmit`)
Expected: sem erros de tipo em `PesquisaPrimeiraAulaTab.tsx` / `usePesquisaPrimeiraAula.ts` (sem `janelaDias`, sem `Select` órfão).

- [ ] **Step 4: Commit**

```bash
git add src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx
git commit --author="Luciano <lucianoalf.la@gmail.com>" -m "feat(sucesso-aluno): aba Pos-1a Aula trava lista em 'ontem' (remove seletor de janela)"
```

---

## Task 6: Toggle do kill switch na subaba Mensagens Automáticas

**Files:**
- Modify: `src/components/App/SucessoCliente/hooks/useAutomacoesSucessoAluno.ts`
- Modify: `src/components/App/SucessoCliente/AutomacoesTab.tsx`

**Interfaces:**
- Consumes: tabela `automacoes_config` (Task 2).
- Produces: no hook, `autoPesquisaAtivo: boolean`, `loadingConfig: boolean`, `toggleAutoPesquisa(novo: boolean): Promise<void>`.

- [ ] **Step 1: Hook — carregar/salvar o toggle**

Em `useAutomacoesSucessoAluno.ts`, dentro de `useAutomacoesSucessoAluno()`:
- Adicionar estado:
```ts
  const [autoPesquisaAtivo, setAutoPesquisaAtivo] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
```
- Adicionar loader + toggle:
```ts
  const carregarConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data, error } = await supabase
        .from('automacoes_config').select('ativo').eq('slug', 'auto_pesquisa_1a_aula').maybeSingle();
      if (error) throw error;
      setAutoPesquisaAtivo(data?.ativo === true);
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] carregarConfig:', err);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const toggleAutoPesquisa = useCallback(async (novo: boolean) => {
    const anterior = autoPesquisaAtivo;
    setAutoPesquisaAtivo(novo); // otimista
    try {
      const { error } = await supabase
        .from('automacoes_config')
        .update({ ativo: novo, updated_at: new Date().toISOString() })
        .eq('slug', 'auto_pesquisa_1a_aula');
      if (error) throw error;
      toast.success(novo ? 'Auto-disparo ligado' : 'Auto-disparo desligado');
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] toggleAutoPesquisa:', err);
      setAutoPesquisaAtivo(anterior); // rollback
      toast.error('Erro ao alterar o auto-disparo');
    }
  }, [autoPesquisaAtivo]);
```
- No `useEffect` inicial, chamar também `carregarConfig()`:
```ts
  useEffect(() => { carregarTextos(); carregarConfig(); }, [carregarTextos, carregarConfig]);
```
- Exportar no return: `autoPesquisaAtivo, loadingConfig, toggleAutoPesquisa` (adicionar às props já retornadas).

- [ ] **Step 2: UI — controle liga/desliga no bloco da pesquisa de 1ª aula**

Em `AutomacoesTab.tsx`, no card da automação `pesquisa_1a_aula`, adicionar um toggle usando o padrão de switch já existente no projeto (checkbox estilizado como as outras toggles). Ler `autoPesquisaAtivo`/`toggleAutoPesquisa` do hook. Exemplo mínimo (adaptar às classes do card):
```tsx
        <div className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Auto-disparo diário (11h)</p>
            <p className="text-xs text-slate-400">
              Dispara sozinho a pesquisa de quem fez a 1ª aula ontem. Teto de 15/dia — acima disso,
              a Fabi completa o resto aqui na aba Pós-1ª Aula.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoPesquisaAtivo}
            disabled={loadingConfig}
            onClick={() => toggleAutoPesquisa(!autoPesquisaAtivo)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoPesquisaAtivo ? 'bg-violet-500' : 'bg-slate-600'} disabled:opacity-50`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoPesquisaAtivo ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
```

- [ ] **Step 3: Typecheck / build**

Run: `npm run build` (ou `npx tsc --noEmit`)
Expected: sem erros; o hook exporta `autoPesquisaAtivo`, `loadingConfig`, `toggleAutoPesquisa` e a tab os consome.

- [ ] **Step 4: Commit**

```bash
git add src/components/App/SucessoCliente/hooks/useAutomacoesSucessoAluno.ts src/components/App/SucessoCliente/AutomacoesTab.tsx
git commit --author="Luciano <lucianoalf.la@gmail.com>" -m "feat(sucesso-aluno): toggle do auto-disparo da pesquisa de 1a aula (Mensagens Automaticas)"
```

---

## Task 7: Documentação e memória

**Files:**
- Modify: `docs/MAPA-SISTEMA.md` (página Sucesso do Aluno → Acompanhamento: aba Pós-1ª Aula + edge + cron)
- Modify: `.claude/memory/integracao-infra.md` (nova edge `disparar-pesquisa-1a-aula-auto` + cron + tabela `automacoes_config`)
- Modify: `C:\Users\hugog\.claude\projects\c--Users-hugog-OneDrive-Desktop-Projects-LA-Music-LAperformanceReport\memory\pendencias-2026-07-06-solicitacoes-fabi-sucesso-aluno.md` (marcar #2 como FEITO)
- Modify: `CLAUDE.md` (bullet da pesquisa NPS: citar auto-disparo opt-in + aba travada em ontem)

- [ ] **Step 1: Atualizar `docs/MAPA-SISTEMA.md`**

Na entrada da aba Pós-1ª Aula, registrar: lista travada em "ontem" (RPC `p_apenas_ontem`), toggle de auto-disparo (`automacoes_config`), edge `disparar-pesquisa-1a-aula-auto` + cron `disparar-pesquisa-1a-aula-diario` (11h BRT, teto 15/dia).

- [ ] **Step 2: Atualizar `.claude/memory/integracao-infra.md`**

Adicionar bullet: edge `disparar-pesquisa-1a-aula-auto` (opt-in via `automacoes_config` slug `auto_pesquisa_1a_aula`, teto 15/dia, `EdgeRuntime.waitUntil`, avisa Fabi no excedente), cron `0 14 * * *`, RPC ganhou `p_apenas_ontem` + fix do MIN da 1ª aula real.

- [ ] **Step 3: Marcar #2 como FEITO na pendência**

Editar `pendencias-2026-07-06-solicitacoes-fabi-sucesso-aluno.md`: mudar "🔴 #2" para "✅ #2", resumindo a solução (aba só ontem + cron opt-in + teto 15 + kill switch). Atualizar a linha correspondente em `MEMORY.md`.

- [ ] **Step 4: Atualizar `CLAUDE.md`**

No bullet da "Pesquisa NPS pós-1ª aula", acrescentar: aba Pós-1ª Aula travada em "ontem"; auto-disparo opt-in (cron 11h BRT, teto 15/dia, kill switch em `automacoes_config`).

- [ ] **Step 5: Commit**

```bash
git add docs/MAPA-SISTEMA.md .claude/memory/integracao-infra.md CLAUDE.md
git commit --author="Luciano <lucianoalf.la@gmail.com>" -m "docs: auto-disparo pesquisa 1a aula (mapa-sistema, memoria, claude.md)"
```

---

## Self-Review (feito na escrita do plano)

- **Cobertura do spec:** RPC modo ontem + fix MIN (Task 1) ✓; tabela config (Task 2); edge orquestradora + teto + aviso Fabi (Task 3); cron 11h BRT (Task 4); aba só ontem (Task 5); toggle kill switch (Task 6); docs (Task 7). Todos os componentes do spec têm task.
- **Placeholders:** nenhum "TBD"; código completo em cada step (RPC, edge, migrations, hook, UI).
- **Consistência de tipos:** RPC assinatura `(uuid, integer, boolean)` usada igual na aba, no aviso #1 e na edge; edge de envio consome `{aluno_id, unidade_id, whatsapp_jid, nome, curso, data_matricula}` e retorna `{resultados:[{aluno_id, ok, erro}]}` — igual ao que o hook já usa; toggle expõe `autoPesquisaAtivo/loadingConfig/toggleAutoPesquisa` consumidos na tab.
- **Trade-off "só ontem estrito":** honrado (sem rede de segurança), como decidido.
