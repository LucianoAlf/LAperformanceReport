import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Curso {
  id: number;
  nome: string;
  ativo: boolean;
  capacidade_maxima: number | null;
}

/**
 * Hook para buscar cursos filtrados por unidade
 * - Se unidadeId for fornecido, retorna apenas cursos ativos naquela unidade
 * - Se unidadeId for null, retorna todos os cursos ativos globalmente
 */
export function useCursosUnidade(unidadeId: string | null | undefined) {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCursos();
  }, [unidadeId]);

  async function fetchCursos() {
    setLoading(true);
    setError(null);

    try {
      if (unidadeId) {
        // Buscar cursos ativos na unidade específica
        const { data, error: err } = await supabase
          .from('unidades_cursos')
          .select(`
            curso_id,
            ativo,
            cursos (
              id,
              nome,
              ativo,
              capacidade_maxima
            )
          `)
          .eq('unidade_id', unidadeId)
          .eq('ativo', true)
          .order('cursos(nome)');

        if (err) throw err;

        // Mapear para formato Curso[] e filtrar cursos também ativos globalmente
        const cursosUnidade = data
          ?.map((uc: any) => uc.cursos)
          .filter((c: any) => c && c.ativo) || [];

        setCursos(cursosUnidade);
      } else {
        // Buscar todos os cursos ativos globalmente
        const { data, error: err } = await supabase
          .from('cursos')
          .select('*')
          .eq('ativo', true)
          .order('nome');

        if (err) throw err;
        setCursos(data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar cursos:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar cursos');
      setCursos([]);
    } finally {
      setLoading(false);
    }
  }

  return { cursos, loading, error, refetch: fetchCursos };
}

export default useCursosUnidade;
