import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Colaborador, Unidade } from '@/components/App/Time/types';

interface UseColaboradoresResult {
  colaboradores: Colaborador[];
  unidades: Unidade[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useColaboradores(
  unidadeFiltro: string | 'todos',
  apenasRespondidos: boolean,
): UseColaboradoresResult {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Carregar unidades em paralelo
      const { data: unidadesData } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      if (unidadesData) setUnidades(unidadesData);

      // Query base: nao listar desligados
      let query = supabase
        .from('colaboradores')
        .select(`
          id, nome, apelido, foto_url, bio, cargo, tipo, situacao,
          unidade_id, temperamento_codinome, valorizacao_codinome,
          unidades!inner ( nome )
        `)
        .neq('situacao', 'desligado')
        .order('nome');

      // Filtro por unidade (quando nao e "todos")
      if (unidadeFiltro !== 'todos') {
        query = query.eq('unidade_id', unidadeFiltro);
      }

      // Filtro "so quem ja respondeu"
      if (apenasRespondidos) {
        query = query.not('temperamento_codinome', 'is', null);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Achatar o join de unidade
      const achatar = (c: any): Colaborador => ({
        ...c,
        unidade_nome: Array.isArray(c.unidades) ? c.unidades[0]?.nome : c.unidades?.nome ?? null,
      });

      setColaboradores((data || []).map(achatar));
    } catch (err) {
      console.error('Erro ao carregar colaboradores:', err);
      setError(err as Error);
      setColaboradores([]);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeFiltro, apenasRespondidos]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { colaboradores, unidades, isLoading, error, refetch: fetchData };
}

export default useColaboradores;
