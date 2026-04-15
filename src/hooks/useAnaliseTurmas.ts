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

interface HeatmapCell {
  dia_semana: number; // 0=Dom, 1=Seg, ..., 6=Sáb
  faixa_horario: string; // "08:00", "09:00", etc.
  total: number;
  presentes: number;
  pct: number;
}

export interface TendenciaMes {
  mes: string; // "2026-03"
  total: number;
  presentes: number;
  pct: number;
}

export interface AnaliseTurmasData {
  kpis: KPIs;
  turmas: TurmaAnalise[];
  alunos_risco: AlunoRisco[];
  heatmap: HeatmapCell[];
  tendencia: TendenciaMes[];
}

export function useAnaliseTurmas(unidadeAtual: UnidadeId, ano: number, mes: number) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnaliseTurmasData | null>(null);

  const fetchData = useCallback(async () => {
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

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, refetch: fetchData };
}
