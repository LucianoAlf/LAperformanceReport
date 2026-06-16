import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface FaltaAluno {
  aluno_id: number;
  nome: string;
  unidade_id: string;
  unidade_codigo: string | null;
  curso_nome: string | null;
  professor_nome: string | null;
  telefone: string | null;
  whatsapp: string | null;
  responsavel_telefone: string | null;
  total_aulas: number;
  faltas: number;
  presencas: number;
  pct_presenca: number;
  is_projeto_banda: boolean;
}

interface Params {
  unidadeId: UnidadeId;
  dataInicio: string; // yyyy-MM-dd
  dataFim: string; // yyyy-MM-dd
}

/**
 * Ranking de faltas por aluno no período, via RPC get_faltas_periodo.
 * A RPC já deduplica a aula duplicada do Emusys (individual + turma) por
 * (aluno, dia, curso), priorizando a visão individual — ver pendencias-emusys.md.
 */
export function useFaltasPeriodo({ unidadeId, dataInicio, dataFim }: Params) {
  const [faltas, setFaltas] = useState<FaltaAluno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('get_faltas_periodo', {
      p_unidade_id: unidadeId === 'todos' ? null : unidadeId,
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
    });
    if (error) {
      setError(error.message);
      setFaltas([]);
    } else {
      // Coage numéricos que o PostgREST pode devolver como string (bigint/numeric)
      setFaltas(
        (data || []).map((f: any) => ({
          ...f,
          total_aulas: Number(f.total_aulas),
          faltas: Number(f.faltas),
          presencas: Number(f.presencas),
          pct_presenca: Number(f.pct_presenca),
        })) as FaltaAluno[]
      );
    }
    setLoading(false);
  }, [unidadeId, dataInicio, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { faltas, loading, error, refetch: carregar };
}
