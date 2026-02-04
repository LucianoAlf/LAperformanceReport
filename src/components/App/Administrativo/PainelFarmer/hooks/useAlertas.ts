import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { 
  AlertaAniversariante, 
  AlertaInadimplente, 
  AlertaNovoMatriculado, 
  AlertaRenovacao,
  ResumoAlertas 
} from '../types';

export function useAlertas(unidadeId: string) {
  const [aniversariantes, setAniversariantes] = useState<AlertaAniversariante[]>([]);
  const [inadimplentes, setInadimplentes] = useState<AlertaInadimplente[]>([]);
  const [novosMatriculados, setNovosMatriculados] = useState<AlertaNovoMatriculado[]>([]);
  const [renovacoes, setRenovacoes] = useState<AlertaRenovacao[]>([]);
  const [resumo, setResumo] = useState<ResumoAlertas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlertas = useCallback(async () => {
    try {
      setLoading(true);
      
      // Filtro de unidade
      const unidadeFilter = unidadeId && unidadeId !== 'todos' ? unidadeId : null;

      // Buscar aniversariantes
      let aniversariantesQuery = supabase
        .from('vw_farmer_aniversariantes_hoje')
        .select('*');
      
      if (unidadeFilter) {
        aniversariantesQuery = aniversariantesQuery.eq('unidade_id', unidadeFilter);
      }
      
      const { data: aniversariantesData } = await aniversariantesQuery;
      setAniversariantes(aniversariantesData || []);

      // Buscar inadimplentes
      let inadimplentesQuery = supabase
        .from('vw_farmer_inadimplentes')
        .select('*')
        .limit(20);
      
      if (unidadeFilter) {
        inadimplentesQuery = inadimplentesQuery.eq('unidade_id', unidadeFilter);
      }
      
      const { data: inadimplentesData } = await inadimplentesQuery;
      setInadimplentes(inadimplentesData || []);

      // Buscar novos matriculados
      let novosQuery = supabase
        .from('vw_farmer_novos_matriculados')
        .select('*')
        .limit(10);
      
      if (unidadeFilter) {
        novosQuery = novosQuery.eq('unidade_id', unidadeFilter);
      }
      
      const { data: novosData } = await novosQuery;
      setNovosMatriculados(novosData || []);

      // Buscar renovações próximas
      let renovacoesQuery = supabase
        .from('vw_farmer_renovacoes_proximas')
        .select('*')
        .limit(30);
      
      if (unidadeFilter) {
        renovacoesQuery = renovacoesQuery.eq('unidade_id', unidadeFilter);
      }
      
      const { data: renovacoesData } = await renovacoesQuery;
      setRenovacoes(renovacoesData || []);

      // Buscar resumo
      let resumoQuery = supabase
        .from('vw_farmer_resumo_alertas')
        .select('*');
      
      if (unidadeFilter) {
        resumoQuery = resumoQuery.eq('unidade_id', unidadeFilter);
      }
      
      const { data: resumoData } = await resumoQuery;
      
      if (resumoData && resumoData.length > 0) {
        // Se filtrou por unidade, pegar o primeiro
        // Se não, consolidar
        if (unidadeFilter) {
          setResumo(resumoData[0]);
        } else {
          // Consolidar todas as unidades
          const consolidado: ResumoAlertas = {
            unidade_id: 'todos',
            unidade_nome: 'Todas as Unidades',
            aniversariantes_hoje: resumoData.reduce((acc, r) => acc + (r.aniversariantes_hoje || 0), 0),
            inadimplentes: resumoData.reduce((acc, r) => acc + (r.inadimplentes || 0), 0),
            novos_matriculados: resumoData.reduce((acc, r) => acc + (r.novos_matriculados || 0), 0),
            renovacoes_vencidas: resumoData.reduce((acc, r) => acc + (r.renovacoes_vencidas || 0), 0),
            renovacoes_urgentes: resumoData.reduce((acc, r) => acc + (r.renovacoes_urgentes || 0), 0),
            renovacoes_atencao: resumoData.reduce((acc, r) => acc + (r.renovacoes_atencao || 0), 0),
          };
          setResumo(consolidado);
        }
      }

    } catch (err) {
      console.error('Erro ao buscar alertas:', err);
      setError('Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    fetchAlertas();
  }, [fetchAlertas]);

  return {
    aniversariantes,
    inadimplentes,
    novosMatriculados,
    renovacoes,
    resumo,
    loading,
    error,
    refresh: fetchAlertas
  };
}
