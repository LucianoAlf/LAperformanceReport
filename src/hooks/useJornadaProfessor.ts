import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { JornadaAlunoItem } from './useJornadaAluno';

export function useJornadaProfessor(professorId?: number | null) {
  const [data, setData] = useState<JornadaAlunoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!professorId) {
        setData([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: rows, error: rpcError } = await supabase.rpc('get_jornada_professor', {
        p_professor_id: professorId,
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
  }, [professorId]);

  return { data, loading, error };
}
