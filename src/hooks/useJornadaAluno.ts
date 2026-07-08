import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface JornadaAlunoItem {
  id: string;
  aluno_id: number;
  curso_nome: string | null;
  professor_nome: string | null;
  status_matricula: string;
  nr_aulas_contratadas: number | null;
  nr_aulas_passadas: number | null;
  nr_aulas_futuras: number | null;
  proxima_aula_numero: number | null;
  percentual_jornada: number | null;
  jornada_label: string | null;
  presencas: number | null;
  faltas: number | null;
  percentual_presenca_contrato: number | null;
  data_primeira_aula: string | null;
  data_ultima_aula: string | null;
  dia_semana: string | null;
  horario: string | null;
}

export function useJornadaAluno(alunoId?: number | null) {
  const [data, setData] = useState<JornadaAlunoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!alunoId) {
        setData([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: rows, error: rpcError } = await supabase.rpc('get_jornada_aluno', {
        p_aluno_id: alunoId,
      });

      if (!alive) return;

      if (rpcError) {
        setError(rpcError.message);
        setData([]);
      } else {
        setData((rows || []) as JornadaAlunoItem[]);
      }

      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [alunoId]);

  return { data, loading, error };
}
