# Aba "Respostas": análise + registro da pesquisa pós-1ª aula — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma sub-aba "Respostas" em Sucesso do Aluno que mostre os KPIs, recortes (professor/unidade/curso), evolução e o registro individual das respostas da pesquisa pós-1ª aula, com destaque de notas baixas e atalho para a conversa do aluno.

**Architecture:** Agregação no Postgres via 2 RPCs `STABLE` (`get_analise_pesquisas` retornando JSON; `get_respostas_pesquisa` retornando linhas). Front fino: hook `useAnalisePesquisas` consome as RPCs; componente `RespostasPesquisaTab` renderiza. Deep-link "abrir conversa" via prop chain até `SucessoClientePage`, que troca a aba de página e pré-seleciona o aluno na `CaixaEntradaTab`.

**Tech Stack:** React 19 + TypeScript, Vite, Supabase JS (RPC), Recharts (gráfico), Tailwind, date-fns, Sonner (toasts), Lucide icons.

## Global Constraints

- Idioma de variáveis/funções/comentários: **português**.
- Sem migration de schema: **nenhuma coluna nova** em `pesquisas_whatsapp`. Só criação de funções (RPCs).
- RPCs filtram sempre `tipo = 'pos_primeira_aula'` e `enviado_ok = true`; período aplicado sobre `enviado_em`; evolução agrupada por `respondido_em` (decisão fechada: satisfação ao longo do tempo).
- `p_unidade_id = NULL` significa consolidado (todas as unidades). O front passa `null` quando `unidadeAtual === 'todos'`, espelhando o padrão de `PesquisaEvasaoTab`/`usePesquisaPrimeiraAula`.
- Notas baixas = `nota <= 2` (destaque vermelho + atalho de conversa).
- Recorte professor/curso/unidade vem do vínculo **atual** do aluno (`alunos.professor_atual_id`, `alunos.curso_id`, `alunos.unidade_id`) — mesma resolução de `get_candidatos_pesquisa_primeira_aula`. Limitação aceita na spec.
- Projeto **não tem testes unitários**. Verificação: validação SQL via Supabase MCP (RPCs) e `npx tsc --noEmit` (front), além de teste visual ao final.
- Estilo visual: classes Tailwind dark (`bg-slate-800/50 rounded-2xl border border-slate-700/50`), seguindo `PesquisaEvasaoTab`/`PesquisaPrimeiraAulaTab`.
- Project ID Supabase (MCP): `ouqwbbermlzqqvtqwlul`.
- Git: autor Luciano, **sem** `Co-Authored-By`.

---

## File Structure

- **Criar** `supabase/functions/_rpc/get_analise_pesquisas.sql` — fonte versionada da RPC de agregação (referência; deploy via MCP `apply_migration`).
- **Criar** `supabase/functions/_rpc/get_respostas_pesquisa.sql` — fonte versionada da RPC de listagem.
- **Criar** `src/components/App/SucessoCliente/hooks/useAnalisePesquisas.ts` — hook de data fetching (chama as 2 RPCs).
- **Criar** `src/components/App/SucessoCliente/RespostasPesquisaTab.tsx` — UI da aba (KPIs, recortes, evolução, registro).
- **Modificar** `src/components/App/SucessoCliente/PesquisasTab.tsx` — adicionar sub-aba `respostas` + repassar `onAbrirConversa`.
- **Modificar** `src/components/App/SucessoCliente/TabSucessoAluno.tsx` — repassar `onAbrirConversa` para `PesquisasTab`.
- **Modificar** `src/components/App/SucessoCliente/SucessoClientePage.tsx` — estado de deep-link + handler que troca aba e pré-seleciona aluno.
- **Modificar** `src/components/App/Administrativo/CaixaEntrada/CaixaEntradaTab.tsx` — nova prop `alunoIdInicial` que pré-seleciona a conversa.

> Observação sobre `_rpc/`: a pasta serve só para versionar o SQL das funções no git (o projeto não tem `supabase/migrations` versionado para isto). O deploy efetivo é via MCP `apply_migration`. Se o repositório já tiver outra convenção para SQL de RPC, use-a; o conteúdo das funções é o que importa.

---

### Task 1: RPC `get_analise_pesquisas`

**Files:**
- Create: `supabase/functions/_rpc/get_analise_pesquisas.sql`
- Deploy: via MCP `apply_migration` (name: `create_get_analise_pesquisas`)

**Interfaces:**
- Consumes: tabelas `pesquisas_whatsapp`, `alunos`, `professores`, `unidades`, `cursos`.
- Produces: `get_analise_pesquisas(p_unidade_id uuid, p_data_inicio date, p_data_fim date) RETURNS jsonb`. Shape do JSON:
  - `kpis`: `{ enviadas:int, respondidas:int, taxa_resposta:numeric, nota_media:numeric, distribuicao:{ "1":int,"2":int,"3":int,"4":int,"5":int } }`
  - `por_professor`: `[{ professor_nome:text, qtd:int, nota_media:numeric }]`
  - `por_unidade`: `[{ unidade_nome:text, qtd:int, nota_media:numeric }]`
  - `por_curso`: `[{ curso_nome:text, qtd:int, nota_media:numeric }]`
  - `evolucao`: `[{ periodo:text (YYYY-MM-DD, início da semana), qtd:int, nota_media:numeric }]`

- [ ] **Step 1: Escrever o SQL da função**

Criar `supabase/functions/_rpc/get_analise_pesquisas.sql` com:

```sql
CREATE OR REPLACE FUNCTION public.get_analise_pesquisas(
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  WITH base AS (
    SELECT
      pw.id,
      pw.aluno_id,
      pw.nota,
      pw.enviado_em,
      pw.respondido_em,
      a.curso_id,
      a.professor_atual_id,
      a.unidade_id
    FROM pesquisas_whatsapp pw
    JOIN alunos a ON a.id = pw.aluno_id
    WHERE pw.tipo = 'pos_primeira_aula'
      AND pw.enviado_ok = true
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      AND (p_data_inicio IS NULL OR pw.enviado_em >= p_data_inicio)
      AND (p_data_fim IS NULL OR pw.enviado_em < (p_data_fim + 1))
  ),
  respondidas AS (
    SELECT * FROM base WHERE nota IS NOT NULL
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'enviadas', (SELECT count(*) FROM base),
      'respondidas', (SELECT count(*) FROM respondidas),
      'taxa_resposta', CASE
        WHEN (SELECT count(*) FROM base) > 0
        THEN round((SELECT count(*) FROM respondidas)::numeric * 100 / (SELECT count(*) FROM base), 1)
        ELSE 0 END,
      'nota_media', COALESCE(round((SELECT avg(nota) FROM respondidas), 2), 0),
      'distribuicao', (
        SELECT jsonb_object_agg(n::text, qtd)
        FROM (
          SELECT n, COALESCE((SELECT count(*) FROM respondidas r WHERE r.nota = n), 0) AS qtd
          FROM generate_series(1, 5) n
        ) d
      )
    ),
    'por_professor', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT p.nome AS professor_nome, count(*) AS qtd, round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        JOIN professores p ON p.id = r.professor_atual_id
        GROUP BY p.nome
        ORDER BY avg(r.nota) DESC
      ) x
    ), '[]'::jsonb),
    'por_unidade', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT u.nome AS unidade_nome, count(*) AS qtd, round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        JOIN unidades u ON u.id = r.unidade_id
        GROUP BY u.nome
        ORDER BY u.nome
      ) x
    ), '[]'::jsonb),
    'por_curso', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT c.nome AS curso_nome, count(*) AS qtd, round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        JOIN cursos c ON c.id = r.curso_id
        GROUP BY c.nome
        ORDER BY avg(r.nota) DESC
      ) x
    ), '[]'::jsonb),
    'evolucao', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT
          to_char(date_trunc('week', r.respondido_em), 'YYYY-MM-DD') AS periodo,
          count(*) AS qtd,
          round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        GROUP BY date_trunc('week', r.respondido_em)
        ORDER BY date_trunc('week', r.respondido_em)
      ) x
    ), '[]'::jsonb)
  )
$function$;
```

- [ ] **Step 2: Fazer deploy da função via MCP**

Usar a ferramenta MCP `apply_migration` no projeto `ouqwbbermlzqqvtqwlul`:
- name: `create_get_analise_pesquisas`
- query: (o conteúdo SQL acima)

Expected: sucesso, sem erro.

- [ ] **Step 3: Validar com fixtures temporárias (a tabela está vazia hoje)**

Rodar via MCP `execute_sql` (cria 3 linhas de teste, chama a RPC, confere, **apaga**). Use IDs reais de aluno: pegue 1 aluno por unidade existente. Exemplo de validação genérica que não suja a base:

```sql
BEGIN;
-- pega um aluno qualquer para usar de fixture
WITH amostra AS (SELECT id, unidade_id FROM alunos LIMIT 1)
INSERT INTO pesquisas_whatsapp (aluno_id, unidade_id, tipo, data_matricula, enviado_ok, enviado_em, nota, respondido_em)
SELECT a.id, a.unidade_id, 'pos_primeira_aula', CURRENT_DATE, true, now() - interval '2 days', 5, now() - interval '1 day' FROM amostra a
UNION ALL
SELECT a.id, a.unidade_id, 'pos_primeira_aula', CURRENT_DATE, true, now() - interval '2 days', 1, now() - interval '1 day' FROM amostra a
UNION ALL
SELECT a.id, a.unidade_id, 'pos_primeira_aula', CURRENT_DATE, true, now() - interval '2 days', NULL, NULL FROM amostra a;

SELECT public.get_analise_pesquisas(NULL, (CURRENT_DATE - 7)::date, CURRENT_DATE::date);
ROLLBACK;
```

Expected: o JSON traz `kpis.enviadas = 3`, `kpis.respondidas = 2`, `kpis.taxa_resposta = 66.7`, `kpis.nota_media = 3.00`, `distribuicao."5" = 1` e `"1" = 1`, e arrays `por_professor`/`por_unidade`/`por_curso`/`evolucao` não-vazios. O `ROLLBACK` desfaz as fixtures (nada persiste).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_rpc/get_analise_pesquisas.sql
git commit -m "feat(sucesso-aluno): RPC get_analise_pesquisas (KPIs + recortes da pesquisa)"
```

---

### Task 2: RPC `get_respostas_pesquisa`

**Files:**
- Create: `supabase/functions/_rpc/get_respostas_pesquisa.sql`
- Deploy: via MCP `apply_migration` (name: `create_get_respostas_pesquisa`)

**Interfaces:**
- Consumes: `pesquisas_whatsapp`, `alunos`, `unidades`, `cursos`, `professores`.
- Produces: `get_respostas_pesquisa(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` retornando linhas:
  `pesquisa_id uuid, aluno_id integer, nome text, nota integer, curso_nome text, professor_nome text, unidade_nome text, whatsapp_jid text, enviado_em timestamptz, respondido_em timestamptz`

- [ ] **Step 1: Escrever o SQL da função**

Criar `supabase/functions/_rpc/get_respostas_pesquisa.sql`:

```sql
CREATE OR REPLACE FUNCTION public.get_respostas_pesquisa(
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  pesquisa_id uuid,
  aluno_id integer,
  nome text,
  nota integer,
  curso_nome text,
  professor_nome text,
  unidade_nome text,
  whatsapp_jid text,
  enviado_em timestamptz,
  respondido_em timestamptz
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    pw.id,
    pw.aluno_id,
    a.nome::text,
    pw.nota,
    c.nome::text,
    p.nome::text,
    u.nome::text,
    pw.remote_jid,
    pw.enviado_em,
    pw.respondido_em
  FROM pesquisas_whatsapp pw
  JOIN alunos a ON a.id = pw.aluno_id
  JOIN unidades u ON u.id = a.unidade_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN professores p ON p.id = a.professor_atual_id
  WHERE pw.tipo = 'pos_primeira_aula'
    AND pw.enviado_ok = true
    AND pw.nota IS NOT NULL
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    AND (p_data_inicio IS NULL OR pw.enviado_em >= p_data_inicio)
    AND (p_data_fim IS NULL OR pw.enviado_em < (p_data_fim + 1))
  ORDER BY pw.respondido_em DESC
$function$;
```

- [ ] **Step 2: Deploy via MCP**

MCP `apply_migration`, projeto `ouqwbbermlzqqvtqwlul`, name `create_get_respostas_pesquisa`, query = SQL acima.

Expected: sucesso.

- [ ] **Step 3: Validar a assinatura/execução**

MCP `execute_sql`:

```sql
SELECT * FROM public.get_respostas_pesquisa(NULL, (CURRENT_DATE - 30)::date, CURRENT_DATE::date);
```

Expected: executa sem erro e retorna 0 linhas (tabela ainda vazia) — confirma que as colunas e tipos estão corretos.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_rpc/get_respostas_pesquisa.sql
git commit -m "feat(sucesso-aluno): RPC get_respostas_pesquisa (lista individual)"
```

---

### Task 3: Hook `useAnalisePesquisas`

**Files:**
- Create: `src/components/App/SucessoCliente/hooks/useAnalisePesquisas.ts`

**Interfaces:**
- Consumes: RPCs `get_analise_pesquisas` e `get_respostas_pesquisa` (Tasks 1–2); `supabase` client; `UnidadeId`.
- Produces:
  - `interface AnalisePesquisas` (shape do JSON da Task 1).
  - `interface RespostaPesquisa` (linha da Task 2).
  - `useAnalisePesquisas(unidadeAtual: UnidadeId, dataInicio: string, dataFim: string)` → `{ analise: AnalisePesquisas | null, respostas: RespostaPesquisa[], loading: boolean, recarregar: () => void }`.

- [ ] **Step 1: Escrever o hook**

Criar `src/components/App/SucessoCliente/hooks/useAnalisePesquisas.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface AnalisePesquisas {
  kpis: {
    enviadas: number;
    respondidas: number;
    taxa_resposta: number;
    nota_media: number;
    distribuicao: Record<string, number>;
  };
  por_professor: { professor_nome: string; qtd: number; nota_media: number }[];
  por_unidade: { unidade_nome: string; qtd: number; nota_media: number }[];
  por_curso: { curso_nome: string; qtd: number; nota_media: number }[];
  evolucao: { periodo: string; qtd: number; nota_media: number }[];
}

export interface RespostaPesquisa {
  pesquisa_id: string;
  aluno_id: number;
  nome: string;
  nota: number;
  curso_nome: string | null;
  professor_nome: string | null;
  unidade_nome: string | null;
  whatsapp_jid: string | null;
  enviado_em: string | null;
  respondido_em: string | null;
}

export function useAnalisePesquisas(unidadeAtual: UnidadeId, dataInicio: string, dataFim: string) {
  const [analise, setAnalise] = useState<AnalisePesquisas | null>(null);
  const [respostas, setRespostas] = useState<RespostaPesquisa[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const unidadeParam = unidadeAtual === 'todos' ? null : unidadeAtual;
      const [analiseRes, respostasRes] = await Promise.all([
        supabase.rpc('get_analise_pesquisas', {
          p_unidade_id: unidadeParam,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
        }),
        supabase.rpc('get_respostas_pesquisa', {
          p_unidade_id: unidadeParam,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
        }),
      ]);
      if (analiseRes.error) throw analiseRes.error;
      if (respostasRes.error) throw respostasRes.error;
      setAnalise((analiseRes.data as AnalisePesquisas) ?? null);
      setRespostas((respostasRes.data as RespostaPesquisa[]) || []);
    } catch (err: any) {
      toast.error('Erro ao carregar análise: ' + (err.message || 'desconhecido'));
      setAnalise(null);
      setRespostas([]);
    } finally {
      setLoading(false);
    }
  }, [unidadeAtual, dataInicio, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { analise, respostas, loading, recarregar: carregar };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros relativos a este arquivo. (Pode haver pré-existentes não relacionados; nenhum novo neste arquivo.)

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/hooks/useAnalisePesquisas.ts
git commit -m "feat(sucesso-aluno): hook useAnalisePesquisas (consome RPCs de analise)"
```

---

### Task 4: Componente `RespostasPesquisaTab`

**Files:**
- Create: `src/components/App/SucessoCliente/RespostasPesquisaTab.tsx`

**Interfaces:**
- Consumes: `useAnalisePesquisas`, `AnalisePesquisas`, `RespostaPesquisa` (Task 3); `UnidadeId`; Recharts; date-fns.
- Produces: `RespostasPesquisaTab({ unidadeAtual, onAbrirConversa }: { unidadeAtual: UnidadeId; onAbrirConversa?: (alunoId: number) => void })`.
  - O `onAbrirConversa` é **opcional** — nesta task fica desligado (Task 6 liga a cadeia). Quando ausente, o botão "abrir conversa" não aparece.

- [ ] **Step 1: Escrever o componente**

Criar `src/components/App/SucessoCliente/RespostasPesquisaTab.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Star, Send, MessageCircle, TrendingUp, Loader2, BarChart3 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useAnalisePesquisas } from './hooks/useAnalisePesquisas';

interface Props {
  unidadeAtual: UnidadeId;
  onAbrirConversa?: (alunoId: number) => void;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function Estrelas({ nota }: { nota: number }) {
  return <span className="text-amber-400">{'⭐'.repeat(nota)}</span>;
}

export function RespostasPesquisaTab({ unidadeAtual, onAbrirConversa }: Props) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth()); // 0-11

  const { dataInicio, dataFim } = useMemo(() => {
    const base = new Date(ano, mes, 1);
    return {
      dataInicio: format(startOfMonth(base), 'yyyy-MM-dd'),
      dataFim: format(endOfMonth(base), 'yyyy-MM-dd'),
    };
  }, [ano, mes]);

  const { analise, respostas, loading } = useAnalisePesquisas(unidadeAtual, dataInicio, dataFim);

  const kpis = analise?.kpis;
  const distribuicao = kpis?.distribuicao || {};
  const maxDist = Math.max(1, ...Object.values(distribuicao).map((v) => Number(v) || 0));
  const vazio = !loading && (!kpis || kpis.enviadas === 0);

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex items-center gap-3">
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}
      </div>

      {vazio ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 py-16 text-center text-slate-500">
          Nenhuma pesquisa enviada neste período.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Enviadas</p>
                  <p className="text-2xl font-bold text-white mt-1">{kpis?.enviadas || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center">
                  <Send className="w-6 h-6 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Taxa de resposta</p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">{kpis?.taxa_resposta || 0}%</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-blue-400" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">{kpis?.respondidas || 0} respondidas</p>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Nota média</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">
                    {(kpis?.nota_media ?? 0).toFixed(2)} ★
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Star className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-sm mb-2">Distribuição</p>
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map((n) => {
                  const qtd = Number(distribuicao[String(n)] || 0);
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <span className="text-amber-400 w-6">{n}★</span>
                      <div className="flex-1 bg-slate-700/50 rounded h-2 overflow-hidden">
                        <div className="bg-amber-400 h-full" style={{ width: `${(qtd / maxDist) * 100}%` }} />
                      </div>
                      <span className="text-slate-400 w-6 text-right">{qtd}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Evolução + Por professor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-violet-400" />
                <h3 className="font-medium text-white">Evolução (nota média por semana)</h3>
              </div>
              {analise && analise.evolucao.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analise.evolucao}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="periodo"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM')}
                    />
                    <YAxis domain={[0, 5]} stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff' }}
                      labelFormatter={(v) => format(new Date(v + 'T00:00:00'), 'dd/MM/yyyy')}
                      formatter={(value: any) => [`${Number(value).toFixed(2)} ★`, 'Nota média']}
                    />
                    <Line type="monotone" dataKey="nota_media" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 text-sm py-8 text-center">Sem respostas no período.</p>
              )}
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-violet-400" />
                <h3 className="font-medium text-white">Por professor</h3>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {analise && analise.por_professor.length > 0 ? (
                  analise.por_professor.map((p) => (
                    <div key={p.professor_nome} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{p.professor_nome}</span>
                      <span className={`font-medium ${p.nota_media < 3 ? 'text-red-400' : 'text-amber-400'}`}>
                        {p.nota_media.toFixed(1)} ★ <span className="text-slate-500 text-xs">({p.qtd})</span>
                        {p.nota_media < 3 && ' ⚠'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-sm">Sem dados.</p>
                )}
              </div>
            </div>
          </div>

          {/* Por unidade + Por curso */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <h3 className="font-medium text-white mb-3">Por unidade</h3>
              <div className="space-y-2">
                {analise && analise.por_unidade.length > 0 ? (
                  analise.por_unidade.map((u) => (
                    <div key={u.unidade_nome} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{u.unidade_nome}</span>
                      <span className="text-amber-400 font-medium">
                        {u.nota_media.toFixed(1)} ★ <span className="text-slate-500 text-xs">({u.qtd})</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-sm">Sem dados.</p>
                )}
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <h3 className="font-medium text-white mb-3">Por curso</h3>
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {analise && analise.por_curso.length > 0 ? (
                  analise.por_curso.map((c) => (
                    <div key={c.curso_nome} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{c.curso_nome}</span>
                      <span className="text-amber-400 font-medium">
                        {c.nota_media.toFixed(1)} ★ <span className="text-slate-500 text-xs">({c.qtd})</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-sm">Sem dados.</p>
                )}
              </div>
            </div>
          </div>

          {/* Registro de respostas */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="font-medium text-white">Registro de respostas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/80 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Aluno</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Nota</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Curso</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Unidade</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Respondido</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {respostas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Nenhuma resposta neste período
                      </td>
                    </tr>
                  ) : (
                    respostas.map((r) => {
                      const baixa = r.nota <= 2;
                      return (
                        <tr key={r.pesquisa_id} className={baixa ? 'bg-red-900/10' : 'hover:bg-slate-700/30'}>
                          <td className="px-4 py-3 text-white font-medium">{r.nome}</td>
                          <td className="px-4 py-3 text-center"><Estrelas nota={r.nota} /></td>
                          <td className="px-4 py-3 text-slate-300">{r.curso_nome || '—'}</td>
                          <td className="px-4 py-3 text-slate-300">{r.professor_nome || '—'}</td>
                          <td className="px-4 py-3 text-slate-300">{r.unidade_nome || '—'}</td>
                          <td className="px-4 py-3 text-center text-slate-400 text-sm">
                            {r.respondido_em ? format(new Date(r.respondido_em), 'dd/MM/yy', { locale: ptBR }) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {baixa && onAbrirConversa ? (
                              <button
                                onClick={() => onAbrirConversa(r.aluno_id)}
                                className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2"
                              >
                                Abrir conversa
                              </button>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos relativos a este arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/RespostasPesquisaTab.tsx
git commit -m "feat(sucesso-aluno): componente RespostasPesquisaTab (KPIs, recortes, evolucao, registro)"
```

---

### Task 5: Registrar sub-aba "Respostas" em `PesquisasTab`

**Files:**
- Modify: `src/components/App/SucessoCliente/PesquisasTab.tsx`

**Interfaces:**
- Consumes: `RespostasPesquisaTab` (Task 4).
- Produces: `PesquisasTab` agora aceita prop opcional `onAbrirConversa?: (alunoId: number) => void` e renderiza a 3ª sub-aba.

- [ ] **Step 1: Reescrever `PesquisasTab.tsx`**

Substituir o conteúdo de `src/components/App/SucessoCliente/PesquisasTab.tsx` por:

```tsx
import { useState } from 'react';
import { Star, UserX, BarChart3 } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { PesquisaPrimeiraAulaTab } from './PesquisaPrimeiraAulaTab';
import { PesquisaEvasaoTab } from './PesquisaEvasaoTab';
import { RespostasPesquisaTab } from './RespostasPesquisaTab';

type SubAba = 'pos_primeira_aula' | 'evasao' | 'respostas';

interface Props {
  unidadeAtual: UnidadeId;
  onAbrirConversa?: (alunoId: number) => void;
}

export function PesquisasTab({ unidadeAtual, onAbrirConversa }: Props) {
  const [subAba, setSubAba] = useState<SubAba>('pos_primeira_aula');

  const botaoClasse = (ativo: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
      ativo
        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-slate-800/30 rounded-xl p-1 w-fit">
        <button onClick={() => setSubAba('pos_primeira_aula')} className={botaoClasse(subAba === 'pos_primeira_aula')}>
          <Star className="w-4 h-4" />
          Pós-1ª Aula
        </button>
        <button onClick={() => setSubAba('evasao')} className={botaoClasse(subAba === 'evasao')}>
          <UserX className="w-4 h-4" />
          Evasão
        </button>
        <button onClick={() => setSubAba('respostas')} className={botaoClasse(subAba === 'respostas')}>
          <BarChart3 className="w-4 h-4" />
          Respostas
        </button>
      </div>

      {subAba === 'pos_primeira_aula' && <PesquisaPrimeiraAulaTab unidadeAtual={unidadeAtual} />}
      {subAba === 'evasao' && <PesquisaEvasaoTab unidadeAtual={unidadeAtual} />}
      {subAba === 'respostas' && (
        <RespostasPesquisaTab unidadeAtual={unidadeAtual} onAbrirConversa={onAbrirConversa} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação visual rápida**

Run: `npm run dev` e abra Sucesso do Aluno → Acompanhamento → Pesquisas → sub-aba "Respostas".
Expected: a sub-aba aparece com filtro de mês/ano e o estado vazio ("Nenhuma pesquisa enviada neste período."), sem erros no console. (A base está zerada, então o vazio é o esperado.)

- [ ] **Step 4: Commit**

```bash
git add src/components/App/SucessoCliente/PesquisasTab.tsx
git commit -m "feat(sucesso-aluno): adiciona sub-aba Respostas em PesquisasTab"
```

---

### Task 6: Deep-link "Abrir conversa" (prop chain + pré-seleção na Caixa)

**Files:**
- Modify: `src/components/App/SucessoCliente/TabSucessoAluno.tsx`
- Modify: `src/components/App/SucessoCliente/SucessoClientePage.tsx`
- Modify: `src/components/App/Administrativo/CaixaEntrada/CaixaEntradaTab.tsx`

**Interfaces:**
- Consumes: `PesquisasTab` com `onAbrirConversa` (Task 5); `CaixaEntradaTab`.
- Produces: clicar "Abrir conversa" numa nota baixa troca a aba de página para "Caixa de Entrada" e pré-seleciona a conversa do aluno (departamento `sucesso_aluno`).

- [ ] **Step 1: `CaixaEntradaTab` aceita `alunoIdInicial`**

Em `src/components/App/Administrativo/CaixaEntrada/CaixaEntradaTab.tsx`:

(a) Adicionar `useEffect` e `useRef` aos imports do React (linha 1 já importa `useState, useCallback`):

```tsx
import { useState, useCallback, useEffect, useRef } from 'react';
```

(b) Adicionar o campo à interface de props (após `multiUnidade?: boolean;`, antes do fechamento da interface, por volta da linha 27):

```tsx
  /** Quando informado, pré-seleciona a conversa deste aluno assim que as conversas carregam (deep-link). */
  alunoIdInicial?: number | null;
```

(c) Receber a prop na assinatura (por volta da linha 30):

```tsx
export function CaixaEntradaTab({ unidadeId, departamento = 'administrativo', multiUnidade = false, alunoIdInicial = null }: CaixaEntradaTabProps) {
```

(d) Declarar um ref do último aluno tratado por deep-link, logo após os `useState` do componente (por volta da linha 39, perto de `const [toasts, setToasts] = ...`):

```tsx
  const ultimoAlunoDeepLink = useRef<number | null>(null);
```

(e) Adicionar o efeito de pré-seleção logo após `handleSelecionarConversa` estar definido (por volta da linha 61, depois do `useCallback` dele):

```tsx
  useEffect(() => {
    if (!alunoIdInicial) return;
    if (ultimoAlunoDeepLink.current === alunoIdInicial) return; // já tratado este deep-link
    const conv = conversas.find((c) => c.aluno_id === alunoIdInicial);
    if (conv) {
      ultimoAlunoDeepLink.current = alunoIdInicial;
      setConversaSelecionada(conv);
      if (conv.nao_lidas > 0) marcarComoLida(conv.id);
    }
  }, [alunoIdInicial, conversas, marcarComoLida]);
```

O ref garante: (1) não sobrescreve a seleção manual do usuário quando `conversas` é refetchado; (2) ao clicar "Abrir conversa" para um aluno **diferente**, `alunoIdInicial` muda e a nova conversa é selecionada. Comportamento de borda: se o aluno não tiver conversa no departamento, nada acontece — a Fabi pode iniciar uma nova conversa manualmente. Aceitável no MVP.

- [ ] **Step 2: `TabSucessoAluno` repassa `onAbrirConversa`**

Em `src/components/App/SucessoCliente/TabSucessoAluno.tsx`:

(a) Atualizar a interface `Props` (por volta da linha 58):

```tsx
interface Props {
  unidadeAtual: UnidadeId;
  onAbrirConversa?: (alunoId: number) => void;
}
```

(b) Receber na assinatura (linha 62):

```tsx
export function TabSucessoAluno({ unidadeAtual, onAbrirConversa }: Props) {
```

(c) Passar para `PesquisasTab` (a linha existente `{subAba === 'pesquisa' && (<PesquisasTab unidadeAtual={unidadeAtual} />)}`, por volta da linha 698):

```tsx
      {subAba === 'pesquisa' && (
        <PesquisasTab unidadeAtual={unidadeAtual} onAbrirConversa={onAbrirConversa} />
      )}
```

- [ ] **Step 3: `SucessoClientePage` liga o deep-link**

Substituir o corpo de `src/components/App/SucessoCliente/SucessoClientePage.tsx` por:

```tsx
import { useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { Heart, Inbox, LineChart } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { CaixaEntradaTab } from '@/components/App/Administrativo/CaixaEntrada';
import { TabSucessoAluno } from './TabSucessoAluno';

type AbaModulo = 'caixa' | 'acompanhamento';

const sucessoTabs: PageTab<AbaModulo>[] = [
  { id: 'caixa', label: 'Caixa de Entrada', shortLabel: 'Caixa', icon: Inbox },
  { id: 'acompanhamento', label: 'Acompanhamento', shortLabel: 'Acomp.', icon: LineChart },
];

export function SucessoClientePage() {
  useSetPageTitle({
    titulo: 'Sucesso do Aluno',
    subtitulo: 'Atendimento, acompanhamento, presença e retenção dos alunos',
    icone: Heart,
    iconeCor: 'text-rose-400',
    iconeWrapperCor: 'bg-rose-500/20',
  });

  const context = useOutletContext<{ unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';

  const [aba, setAba] = useState<AbaModulo>('caixa');
  const [alunoParaCaixa, setAlunoParaCaixa] = useState<number | null>(null);

  const abrirConversaAluno = (alunoId: number) => {
    setAlunoParaCaixa(alunoId);
    setAba('caixa');
  };

  return (
    <div className="space-y-4">
      <PageTabs tabs={sucessoTabs} activeTab={aba} onTabChange={setAba} />

      {aba === 'caixa' ? (
        // Caixa de Entrada travada no departamento Sucesso do Aluno:
        // só recebe as conversas do número dedicado a Sucesso.
        <CaixaEntradaTab
          unidadeId={unidadeAtual}
          departamento="sucesso_aluno"
          multiUnidade
          alunoIdInicial={alunoParaCaixa}
        />
      ) : (
        <TabSucessoAluno unidadeAtual={unidadeAtual} onAbrirConversa={abrirConversaAluno} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos. As props `onAbrirConversa` e `alunoIdInicial` casam nas 4 camadas (RespostasPesquisaTab → PesquisasTab → TabSucessoAluno → SucessoClientePage; e SucessoClientePage → CaixaEntradaTab).

- [ ] **Step 5: Commit**

```bash
git add src/components/App/SucessoCliente/TabSucessoAluno.tsx src/components/App/SucessoCliente/SucessoClientePage.tsx src/components/App/Administrativo/CaixaEntrada/CaixaEntradaTab.tsx
git commit -m "feat(sucesso-aluno): deep-link 'abrir conversa' da nota baixa para a Caixa"
```

---

### Task 7: Verificação end-to-end com dados reais de teste

**Files:** nenhum (validação).

- [ ] **Step 1: Inserir 1 resposta de teste persistente (para ver a UI com dados)**

MCP `execute_sql` (cria 2 linhas reais para visualização; anote os `id` retornados):

```sql
WITH amostra AS (SELECT id, unidade_id FROM alunos WHERE status = 'ativo' LIMIT 1)
INSERT INTO pesquisas_whatsapp (aluno_id, unidade_id, tipo, data_matricula, enviado_ok, enviado_em, nota, respondido_em, remote_jid)
SELECT a.id, a.unidade_id, 'pos_primeira_aula', CURRENT_DATE, true, now() - interval '3 days', 5, now() - interval '2 days', NULL FROM amostra a
UNION ALL
SELECT a.id, a.unidade_id, 'pos_primeira_aula', CURRENT_DATE, true, now() - interval '3 days', 1, now() - interval '2 days', NULL FROM amostra a
RETURNING id;
```

- [ ] **Step 2: Validar a UI**

`npm run dev` → Sucesso do Aluno → Acompanhamento → Pesquisas → "Respostas", mês atual.
Expected: KPIs preenchidos (Enviadas 2, Taxa 100%, Nota média 3.00), distribuição com 1★ e 5★, recortes por professor/unidade/curso preenchidos, gráfico de evolução com 1 ponto, e a linha de nota 1 destacada em vermelho. (O botão "Abrir conversa" pode não pré-selecionar se o aluno não tiver conversa no departamento — comportamento esperado.)

- [ ] **Step 3: Limpar os dados de teste**

MCP `execute_sql` (use os `id` do Step 1):

```sql
DELETE FROM pesquisas_whatsapp WHERE id IN ('<id1>', '<id2>');
```

Expected: 2 linhas removidas; a aba volta ao estado vazio.

- [ ] **Step 4: Build final**

Run: `npm run build`
Expected: build conclui sem erros de tipo.

---

## Notas pós-implementação (fora do ciclo de tasks)

- Atualizar `daily-notes/2026-06-23.md` e `.claude/memory/integracao-infra.md` com a nova aba e as RPCs.
- Possível fast-follow: status "tratado/pendente" (coluna nova) e feedback textual — fora do escopo deste plano.
