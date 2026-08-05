import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Colaborador, Unidade } from '@/components/App/Time/types';

interface UseColaboradoresResult {
  colaboradores: Colaborador[];
  unidades: Unidade[];
  departamentos: string[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useColaboradores(
  unidadeFiltro: string | 'todos',
  departamentoFiltro: string | 'todos',
  apenasRespondidos: boolean,
): UseColaboradoresResult {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Carregar unidades e departamentos em paralelo
      const [unidadesRes, deptosRes] = await Promise.all([
        supabase
          .from('unidades')
          .select('id, nome')
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('colaboradores')
          .select('departamento')
          .neq('situacao', 'desligado')
          .not('departamento', 'is', null)
          .order('departamento'),
      ]);

      if (unidadesRes.data) setUnidades(unidadesRes.data);

      // Departamentos distintos (a query traz duplicados; deduplica aqui)
      if (deptosRes.data) {
        const unicos = [...new Set(deptosRes.data.map((d: any) => d.departamento).filter(Boolean))] as string[];
        setDepartamentos(unicos);
      }

      // Query base: nao listar desligados
      let query = supabase
        .from('colaboradores')
        .select(`
          id, nome, apelido, foto_url, bio, cargo, tipo, situacao, departamento,
          unidade_id, temperamento_codinome, valorizacao_codinome,
          unidades!inner ( nome )
        `)
        .neq('situacao', 'desligado')
        .order('nome');

      // Filtro por unidade (quando nao e "todos")
      if (unidadeFiltro !== 'todos') {
        query = query.eq('unidade_id', unidadeFiltro);
      }

      // Filtro por departamento (quando nao e "todos")
      if (departamentoFiltro !== 'todos') {
        query = query.eq('departamento', departamentoFiltro);
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
  }, [unidadeFiltro, departamentoFiltro, apenasRespondidos]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { colaboradores, unidades, departamentos, isLoading, error, refetch: fetchData };
}

export default useColaboradores;
