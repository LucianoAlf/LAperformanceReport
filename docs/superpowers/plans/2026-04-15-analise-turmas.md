# Análise de Turmas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba "Análise de Turmas" no Sucesso do Cliente com KPIs, ranking de turmas e alunos em risco, usando RPC server-side.

**Architecture:** RPC PostgreSQL (`rpc_analise_turmas`) faz toda a agregação no banco e retorna JSON. Hook `useAnaliseTurmas` chama a RPC. Componente `AnaliseTurmasTab` renderiza KPIs, tabela ordenável com rows expansíveis e lista de alunos em risco.

**Tech Stack:** PostgreSQL (RPC/plpgsql), React 19, TypeScript, Tailwind CSS, Supabase JS client, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-15-analise-turmas-design.md`

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| RPC `rpc_analise_turmas` | Criar (via MCP execute_sql) | Agregação server-side |
| `src/hooks/useAnaliseTurmas.ts` | Criar | Hook de data fetching |
| `src/components/App/Alunos/SucessoCliente/AnaliseTurmasTab.tsx` | Criar | Componente da aba |
| `src/components/App/Alunos/SucessoCliente/TabSucessoAluno.tsx` | Modificar (linhas 9, 19, 71, 413-424, 694-695) | Registrar nova aba |

---

### Task 1: Criar RPC `rpc_analise_turmas` no Supabase

**Files:**
- Criar: RPC via `mcp__supabase__execute_sql`

- [ ] **Step 1: Criar a função RPC no banco**

Executar via MCP Supabase `execute_sql`:

```sql
CREATE OR REPLACE FUNCTION rpc_analise_turmas(
  p_unidade_id uuid DEFAULT NULL,
  p_ano int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  p_mes int DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inicio date;
  v_fim date;
  v_inicio_ant date;
  v_fim_ant date;
  v_kpis jsonb;
  v_turmas jsonb;
  v_alunos_risco jsonb;
BEGIN
  -- Período atual e anterior
  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;
  v_inicio_ant := (v_inicio - interval '1 month')::date;
  v_fim_ant := (v_inicio - interval '1 day')::date;

  -- === TURMAS ===
  WITH presencas AS (
    SELECT
      ap.aluno_id,
      a.nome AS aluno_nome,
      ap.turma_nome,
      ap.curso_nome,
      ap.data_aula,
      ap.status,
      ae.tipo,
      ae.professor_nome,
      ae.data_hora_inicio,
      ae.cancelada
    FROM aluno_presenca ap
    JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
    JOIN alunos a ON a.id = ap.aluno_id
    WHERE ap.data_aula BETWEEN v_inicio AND v_fim
      AND ae.cancelada IS NOT TRUE
      AND ae.tipo IN ('turma', 'individual')
      AND (p_unidade_id IS NULL OR ap.unidade_id = p_unidade_id)
  ),
  presencas_ant AS (
    SELECT
      ap.turma_nome,
      ap.status,
      ae.tipo
    FROM aluno_presenca ap
    JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
    WHERE ap.data_aula BETWEEN v_inicio_ant AND v_fim_ant
      AND ae.cancelada IS NOT TRUE
      AND ae.tipo = 'individual'
      AND (p_unidade_id IS NULL OR ap.unidade_id = p_unidade_id)
  ),
  -- Agregar por turma (presença usa tipo=individual)
  turma_stats AS (
    SELECT
      p.turma_nome,
      MAX(p.curso_nome) AS curso_nome,
      -- Professor mais frequente (MODE)
      (SELECT pi.professor_nome
       FROM presencas pi
       WHERE pi.turma_nome = p.turma_nome
         AND pi.tipo = 'individual'
         AND pi.professor_nome IS NOT NULL
       GROUP BY pi.professor_nome
       ORDER BY COUNT(*) DESC
       LIMIT 1
      ) AS professor_nome,
      -- Horário mais frequente
      (SELECT TO_CHAR(pi.data_hora_inicio, 'Dy HH24:MI')
       FROM presencas pi
       WHERE pi.turma_nome = p.turma_nome AND pi.tipo = 'individual'
       GROUP BY TO_CHAR(pi.data_hora_inicio, 'Dy HH24:MI')
       ORDER BY COUNT(*) DESC
       LIMIT 1
      ) AS horario,
      COUNT(DISTINCT p.aluno_id) FILTER (WHERE p.tipo = 'individual') AS qtd_alunos,
      COUNT(DISTINCT p.data_aula) FILTER (WHERE p.tipo = 'turma') AS qtd_aulas,
      COUNT(*) FILTER (WHERE p.tipo = 'individual' AND p.status = 'presente') AS presentes,
      COUNT(*) FILTER (WHERE p.tipo = 'individual') AS total
    FROM presencas p
    GROUP BY p.turma_nome
  ),
  turma_anterior AS (
    SELECT
      turma_nome,
      CASE WHEN COUNT(*) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE status = 'presente') * 100.0 / COUNT(*), 1)
        ELSE NULL
      END AS presenca_anterior_pct
    FROM presencas_ant
    GROUP BY turma_nome
  ),
  -- Alunos por turma (detalhamento)
  alunos_turma AS (
    SELECT
      p.turma_nome,
      p.aluno_id,
      p.aluno_nome AS nome,
      COUNT(*) FILTER (WHERE p.status = 'presente') AS presentes,
      COUNT(*) AS total,
      ROUND(COUNT(*) FILTER (WHERE p.status = 'presente') * 100.0 / NULLIF(COUNT(*), 0), 1) AS pct,
      MAX(p.data_aula) FILTER (WHERE p.status = 'presente') AS ultima_presenca
    FROM presencas p
    WHERE p.tipo = 'individual'
    GROUP BY p.turma_nome, p.aluno_id, p.aluno_nome
  ),
  -- === ALUNOS EM RISCO (3+ faltas consecutivas) ===
  presencas_ordenadas AS (
    SELECT
      aluno_id,
      aluno_nome,
      turma_nome,
      curso_nome,
      data_aula,
      status,
      ROW_NUMBER() OVER (PARTITION BY aluno_id, turma_nome ORDER BY data_aula) AS rn,
      ROW_NUMBER() OVER (PARTITION BY aluno_id, turma_nome ORDER BY data_aula)
        - ROW_NUMBER() OVER (PARTITION BY aluno_id, turma_nome, status ORDER BY data_aula) AS grp
    FROM presencas
    WHERE tipo = 'individual'
  ),
  streaks AS (
    SELECT
      aluno_id,
      aluno_nome,
      turma_nome,
      curso_nome,
      COUNT(*) AS faltas_seguidas,
      MAX(data_aula) AS ultima_falta
    FROM presencas_ordenadas
    WHERE status = 'ausente'
    GROUP BY aluno_id, aluno_nome, turma_nome, curso_nome, grp
    HAVING COUNT(*) >= 3
  ),
  risco AS (
    SELECT DISTINCT ON (s.aluno_id, s.turma_nome)
      s.aluno_nome AS nome,
      s.turma_nome,
      s.curso_nome,
      s.faltas_seguidas,
      (SELECT MAX(p2.data_aula)
       FROM presencas p2
       WHERE p2.aluno_id = s.aluno_id
         AND p2.turma_nome = s.turma_nome
         AND p2.tipo = 'individual'
         AND p2.status = 'presente'
      ) AS ultima_presenca
    FROM streaks s
    ORDER BY s.aluno_id, s.turma_nome, s.faltas_seguidas DESC
  )

  -- Montar turmas JSON
  SELECT jsonb_agg(
    jsonb_build_object(
      'turma_nome', ts.turma_nome,
      'curso_nome', ts.curso_nome,
      'professor_nome', ts.professor_nome,
      'horario', ts.horario,
      'qtd_alunos', ts.qtd_alunos,
      'qtd_aulas', ts.qtd_aulas,
      'presenca_pct', CASE WHEN ts.total > 0 THEN ROUND(ts.presentes * 100.0 / ts.total, 1) ELSE 0 END,
      'presenca_anterior_pct', ta.presenca_anterior_pct,
      'alunos', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'nome', at2.nome,
            'presentes', at2.presentes,
            'total', at2.total,
            'pct', at2.pct,
            'ultima_presenca', at2.ultima_presenca
          ) ORDER BY at2.pct ASC
        )
        FROM alunos_turma at2
        WHERE at2.turma_nome = ts.turma_nome
      ), '[]'::jsonb)
    ) ORDER BY CASE WHEN ts.total > 0 THEN ts.presentes * 100.0 / ts.total ELSE 0 END ASC
  )
  INTO v_turmas
  FROM turma_stats ts
  LEFT JOIN turma_anterior ta ON ta.turma_nome = ts.turma_nome;

  -- Montar KPIs
  SELECT jsonb_build_object(
    'total_aulas', COALESCE((
      SELECT COUNT(DISTINCT ae.id)
      FROM aulas_emusys ae
      WHERE ae.data_aula BETWEEN v_inicio AND v_fim
        AND ae.cancelada IS NOT TRUE
        AND ae.tipo = 'turma'
        AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
    ), 0),
    'presenca_geral_pct', COALESCE((
      SELECT ROUND(
        COUNT(*) FILTER (WHERE p.status = 'presente') * 100.0
        / NULLIF(COUNT(*), 0), 1
      )
      FROM presencas p
      WHERE p.tipo = 'individual'
    ), 0),
    'turmas_criticas', (
      SELECT COUNT(*)
      FROM turma_stats ts2
      WHERE ts2.total > 0 AND (ts2.presentes * 100.0 / ts2.total) < 60
    ),
    'alunos_risco', (SELECT COUNT(*) FROM risco)
  )
  INTO v_kpis;

  -- Montar alunos em risco
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'nome', r.nome,
      'turma_nome', r.turma_nome,
      'curso_nome', r.curso_nome,
      'faltas_seguidas', r.faltas_seguidas,
      'ultima_presenca', r.ultima_presenca
    ) ORDER BY r.faltas_seguidas DESC
  ), '[]'::jsonb)
  INTO v_alunos_risco
  FROM (SELECT * FROM risco ORDER BY faltas_seguidas DESC LIMIT 20) r;

  RETURN jsonb_build_object(
    'kpis', v_kpis,
    'turmas', COALESCE(v_turmas, '[]'::jsonb),
    'alunos_risco', v_alunos_risco
  );
END;
$$;
```

- [ ] **Step 2: Testar a RPC no banco**

```sql
SELECT rpc_analise_turmas('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 2026, 4);
```

Verificar que retorna JSON com kpis, turmas e alunos_risco.

- [ ] **Step 3: Testar modo consolidado**

```sql
SELECT rpc_analise_turmas(NULL, 2026, 4);
```

Verificar que retorna dados de todas as unidades.

---

### Task 2: Criar hook `useAnaliseTurmas`

**Files:**
- Criar: `src/hooks/useAnaliseTurmas.ts`

- [ ] **Step 1: Criar o hook**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

interface AlunoTurma {
  nome: string;
  presentes: number;
  total: number;
  pct: number;
  ultima_presenca: string | null;
}

interface TurmaAnalise {
  turma_nome: string;
  curso_nome: string;
  professor_nome: string | null;
  horario: string | null;
  qtd_alunos: number;
  qtd_aulas: number;
  presenca_pct: number;
  presenca_anterior_pct: number | null;
  alunos: AlunoTurma[];
}

interface AlunoRisco {
  nome: string;
  turma_nome: string;
  curso_nome: string;
  faltas_seguidas: number;
  ultima_presenca: string | null;
}

interface KPIs {
  total_aulas: number;
  presenca_geral_pct: number;
  turmas_criticas: number;
  alunos_risco: number;
}

export interface AnaliseTurmasData {
  kpis: KPIs;
  turmas: TurmaAnalise[];
  alunos_risco: AlunoRisco[];
}

export function useAnaliseTurmas(unidadeAtual: UnidadeId, ano: number, mes: number) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnaliseTurmasData | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await supabase.rpc('rpc_analise_turmas', {
      p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
      p_ano: ano,
      p_mes: mes,
    });

    if (error) {
      console.error('[useAnaliseTurmas] RPC error:', error.message);
      setData(null);
    } else {
      setData(result as AnaliseTurmasData);
    }
    setLoading(false);
  }, [unidadeAtual, ano, mes]);

  useEffect(() => { fetch(); }, [fetch]);

  return { loading, data, refetch: fetch };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAnaliseTurmas.ts
git commit -m "feat: hook useAnaliseTurmas com RPC server-side"
```

---

### Task 3: Criar componente `AnaliseTurmasTab`

**Files:**
- Criar: `src/components/App/Alunos/SucessoCliente/AnaliseTurmasTab.tsx`

- [ ] **Step 1: Criar o componente completo**

```tsx
import { useState, useMemo } from 'react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useAnaliseTurmas } from '@/hooks/useAnaliseTurmas';
import {
  BarChart3, Loader2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Users, BookOpen, Clock, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  unidadeAtual: UnidadeId;
}

type SortKey = 'turma_nome' | 'curso_nome' | 'professor_nome' | 'horario' | 'qtd_alunos' | 'qtd_aulas' | 'presenca_pct';
type SortDir = 'asc' | 'desc';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function AnaliseTurmasTab({ unidadeAtual }: Props) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const { loading, data, refetch } = useAnaliseTurmas(unidadeAtual, ano, mes);

  const [sortKey, setSortKey] = useState<SortKey>('presenca_pct');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [turmaExpandida, setTurmaExpandida] = useState<string | null>(null);

  // Navegação de mês
  const irMesAnterior = () => {
    if (mes === 1) { setAno(a => a - 1); setMes(12); }
    else setMes(m => m - 1);
  };
  const irMesProximo = () => {
    if (mes === 12) { setAno(a => a + 1); setMes(1); }
    else setMes(m => m + 1);
  };

  // Sorting
  const turmasOrdenadas = useMemo(() => {
    if (!data?.turmas) return [];
    return [...data.turmas].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [data?.turmas, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortHeader = ({ label, colKey, className = '' }: { label: string; colKey: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2 text-xs font-medium text-slate-400 cursor-pointer hover:text-white transition select-none ${className}`}
      onClick={() => toggleSort(colKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === colKey && (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </span>
    </th>
  );

  // Barra de presença colorida
  const PresencaBar = ({ pct }: { pct: number }) => {
    const cor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className={`text-xs font-medium ${
          pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {pct.toFixed(1)}%
        </span>
      </div>
    );
  };

  // Tendência
  const Tendencia = ({ atual, anterior }: { atual: number; anterior: number | null }) => {
    if (anterior === null) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">Nova</span>;
    const delta = atual - anterior;
    if (Math.abs(delta) < 2) return <Minus className="w-3.5 h-3.5 text-slate-500" />;
    if (delta > 0) return (
      <span className="flex items-center gap-0.5 text-emerald-400 text-xs">
        <TrendingUp className="w-3.5 h-3.5" />
        +{delta.toFixed(0)}%
      </span>
    );
    return (
      <span className="flex items-center gap-0.5 text-red-400 text-xs">
        <TrendingDown className="w-3.5 h-3.5" />
        {delta.toFixed(0)}%
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm">Erro ao carregar dados de análise.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refetch}>Tentar novamente</Button>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="space-y-6">
      {/* Navegação de mês */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold text-white">Análise de Turmas</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 border-slate-600" onClick={irMesAnterior}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-white min-w-[140px] text-center">
            {MESES[mes - 1]} {ano}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 border-slate-600" onClick={irMesProximo}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <BookOpen className="w-4 h-4" />
            <span className="text-xs font-medium">Total de Aulas</span>
          </div>
          <p className="text-2xl font-bold text-white">{kpis.total_aulas}</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-xs font-medium">Presença Geral</span>
          </div>
          <p className={`text-2xl font-bold ${
            kpis.presenca_geral_pct >= 80 ? 'text-emerald-400' : kpis.presenca_geral_pct >= 60 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {kpis.presenca_geral_pct}%
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-medium">Turmas Críticas</span>
          </div>
          <p className={`text-2xl font-bold ${kpis.turmas_criticas > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {kpis.turmas_criticas}
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium">Alunos em Risco</span>
          </div>
          <p className={`text-2xl font-bold ${kpis.alunos_risco > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {kpis.alunos_risco}
          </p>
        </div>
      </div>

      {/* Ranking de Turmas */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">Ranking de Turmas</h3>
          <span className="text-xs text-slate-500">({turmasOrdenadas.length} turmas)</span>
        </div>

        {turmasOrdenadas.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">Nenhuma turma encontrada no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <SortHeader label="Turma" colKey="turma_nome" className="text-left" />
                  <SortHeader label="Curso" colKey="curso_nome" className="text-left" />
                  <SortHeader label="Professor" colKey="professor_nome" className="text-left" />
                  <SortHeader label="Horário" colKey="horario" className="text-left" />
                  <SortHeader label="Alunos" colKey="qtd_alunos" className="text-center" />
                  <SortHeader label="Aulas" colKey="qtd_aulas" className="text-center" />
                  <SortHeader label="% Presença" colKey="presenca_pct" className="text-left" />
                  <th className="px-3 py-2 text-xs font-medium text-slate-400 text-center">Tend.</th>
                  <th className="w-8 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {turmasOrdenadas.map((turma) => {
                  const expandida = turmaExpandida === turma.turma_nome;
                  return (
                    <>
                      <tr
                        key={turma.turma_nome}
                        onClick={() => setTurmaExpandida(expandida ? null : turma.turma_nome)}
                        className="border-b border-slate-700/50 hover:bg-slate-700/20 transition cursor-pointer"
                      >
                        <td className="px-3 py-2.5 text-sm text-white font-medium">{turma.turma_nome}</td>
                        <td className="px-3 py-2.5 text-sm text-blue-400">{turma.curso_nome}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-300">{turma.professor_nome || '—'}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-400">{turma.horario || '—'}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-300 text-center">{turma.qtd_alunos}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-400 text-center">{turma.qtd_aulas}</td>
                        <td className="px-3 py-2.5"><PresencaBar pct={turma.presenca_pct} /></td>
                        <td className="px-3 py-2.5 text-center">
                          <Tendencia atual={turma.presenca_pct} anterior={turma.presenca_anterior_pct} />
                        </td>
                        <td className="px-1 py-2.5">
                          {expandida ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </td>
                      </tr>
                      {expandida && (
                        <tr key={`${turma.turma_nome}-detail`}>
                          <td colSpan={9} className="px-4 pb-3 pt-1 bg-slate-800/30">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-700/50">
                                  <th className="text-left px-3 py-1.5 text-xs text-slate-500">Aluno</th>
                                  <th className="text-center px-3 py-1.5 text-xs text-slate-500">Presenças</th>
                                  <th className="text-center px-3 py-1.5 text-xs text-slate-500">Faltas</th>
                                  <th className="text-left px-3 py-1.5 text-xs text-slate-500">%</th>
                                  <th className="text-left px-3 py-1.5 text-xs text-slate-500">Última presença</th>
                                </tr>
                              </thead>
                              <tbody>
                                {turma.alunos.map((aluno) => (
                                  <tr key={aluno.nome} className="border-b border-slate-700/30">
                                    <td className="px-3 py-1.5 text-sm text-slate-200">{aluno.nome}</td>
                                    <td className="px-3 py-1.5 text-sm text-emerald-400 text-center">{aluno.presentes}</td>
                                    <td className="px-3 py-1.5 text-sm text-red-400 text-center">{aluno.total - aluno.presentes}</td>
                                    <td className="px-3 py-1.5"><PresencaBar pct={aluno.pct} /></td>
                                    <td className="px-3 py-1.5 text-sm text-slate-500">{aluno.ultima_presenca || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alunos em Risco */}
      {data.alunos_risco.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-5 border border-red-500/20">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="font-semibold text-white">Alunos em Risco</h3>
            <span className="text-xs text-red-400/70">3+ faltas consecutivas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Aluno</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Turma</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Curso</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400">Faltas seguidas</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Última presença</th>
                </tr>
              </thead>
              <tbody>
                {data.alunos_risco.map((aluno, i) => (
                  <tr key={`${aluno.nome}-${i}`} className="border-b border-slate-700/50 hover:bg-red-500/5 transition">
                    <td className="px-3 py-2 text-sm text-slate-200 font-medium">{aluno.nome}</td>
                    <td className="px-3 py-2 text-sm text-slate-400">{aluno.turma_nome}</td>
                    <td className="px-3 py-2 text-sm text-blue-400">{aluno.curso_nome}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded-full">
                        {aluno.faltas_seguidas}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-500">{aluno.ultima_presenca || 'Nunca'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/App/Alunos/SucessoCliente/AnaliseTurmasTab.tsx
git commit -m "feat: componente AnaliseTurmasTab com KPIs, ranking e alunos em risco"
```

---

### Task 4: Registrar aba em `TabSucessoAluno`

**Files:**
- Modificar: `src/components/App/Alunos/SucessoCliente/TabSucessoAluno.tsx`

- [ ] **Step 1: Adicionar import do ícone e componente**

No import de lucide (linha 9), adicionar `BarChart3`:
```typescript
  Table2, Kanban, FileQuestion, CalendarDays, BarChart3
```

Adicionar import do componente (após linha 19):
```typescript
import { AnaliseTurmasTab } from './AnaliseTurmasTab';
```

- [ ] **Step 2: Expandir union type do estado**

Linha 71, alterar:
```typescript
const [subAba, setSubAba] = useState<'tabela' | 'jornada' | 'pesquisa' | 'presenca' | 'analise'>('tabela');
```

- [ ] **Step 3: Adicionar botão da aba**

Após o botão de Presença (linha 423), adicionar:
```tsx
<button
  onClick={() => setSubAba('analise')}
  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
    subAba === 'analise'
      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
  }`}
>
  <BarChart3 className="w-4 h-4" />
  Análise
</button>
```

- [ ] **Step 4: Renderizar o componente**

Após o bloco de Presença (linha 695), adicionar:
```tsx
{subAba === 'analise' && (
  <AnaliseTurmasTab unidadeAtual={unidadeAtual} />
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Alunos/SucessoCliente/TabSucessoAluno.tsx
git commit -m "feat: registrar aba Análise de Turmas no Sucesso do Cliente"
```

---

### Task 5: Commit do filtro turma/individual (PresencaTab) + push

- [ ] **Step 1: Commitar alterações pendentes da PresencaTab**

```bash
git add src/components/App/Alunos/SucessoCliente/PresencaTab.tsx
git commit -m "feat: filtro turma/individual e badges de tipo na aba Presença"
```

- [ ] **Step 2: Push completo**

```bash
git push
```

---

## Execution Order

1. **Task 1** — RPC no banco (fundação de dados)
2. **Task 2** — Hook (conexão frontend ↔ RPC)
3. **Task 3** — Componente (UI)
4. **Task 4** — Registro da aba (integração)
5. **Task 5** — Commit + push
