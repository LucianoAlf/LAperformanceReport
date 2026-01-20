import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// Tipos de KPI que têm metas definidas
export type TipoMeta = 
  | 'alunos_pagantes'
  | 'ticket_medio'
  | 'churn_rate'
  | 'taxa_renovacao'
  | 'tempo_permanencia'
  | 'inadimplencia'
  | 'reajuste_medio'
  | 'leads'
  | 'experimentais'
  | 'matriculas'
  | 'taxa_lead_exp'
  | 'taxa_exp_mat'
  | 'ticket_passaporte'
  | 'ticket_parcela';

export interface MetasKPI {
  alunos_pagantes?: number;
  ticket_medio?: number;
  churn_rate?: number;
  taxa_renovacao?: number;
  tempo_permanencia?: number;
  inadimplencia?: number;
  reajuste_medio?: number;
  leads?: number;
  experimentais?: number;
  matriculas?: number;
  taxa_lead_exp?: number;
  taxa_exp_mat?: number;
  ticket_passaporte?: number;
  ticket_parcela?: number;
}

interface UseMetasKPIResult {
  metas: MetasKPI;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook para buscar metas do período selecionado
 * @param unidadeId - ID da unidade ou 'todos' para consolidado
 * @param ano - Ano das metas
 * @param mes - Mês das metas (para metas mensais)
 */
export function useMetasKPI(
  unidadeId: string | null,
  ano: number,
  mes: number
): UseMetasKPIResult {
  const [metas, setMetas] = useState<MetasKPI>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMetas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Buscar metas do mês específico
      let query = supabase
        .from('metas')
        .select('tipo, valor, unidade_id')
        .eq('ano', ano)
        .eq('mes', mes);

      // Se unidade específica, filtra
      if (unidadeId && unidadeId !== 'todos' && unidadeId !== 'todas') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Consolidar metas por tipo
      const metasConsolidadas: MetasKPI = {};
      
      if (data && data.length > 0) {
        // Agrupar por tipo
        const porTipo = new Map<string, number[]>();
        
        data.forEach((meta) => {
          const valores = porTipo.get(meta.tipo) || [];
          valores.push(meta.valor);
          porTipo.set(meta.tipo, valores);
        });

        // Para cada tipo, decidir como agregar
        // Metas de quantidade (alunos, leads, matriculas) = soma
        // Metas de taxa/percentual = média
        const tiposSoma = ['alunos_pagantes', 'leads', 'experimentais', 'matriculas'];
        
        porTipo.forEach((valores, tipo) => {
          if (tiposSoma.includes(tipo)) {
            // Soma para quantidades
            (metasConsolidadas as Record<string, number>)[tipo] = valores.reduce((a, b) => a + b, 0);
          } else {
            // Média para taxas/percentuais
            (metasConsolidadas as Record<string, number>)[tipo] = valores.reduce((a, b) => a + b, 0) / valores.length;
          }
        });
      }

      setMetas(metasConsolidadas);
    } catch (err) {
      console.error('Erro ao buscar metas:', err);
      setError(err instanceof Error ? err : new Error('Erro ao buscar metas'));
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, ano, mes]);

  useEffect(() => {
    fetchMetas();
  }, [fetchMetas]);

  return {
    metas,
    isLoading,
    error,
    refetch: fetchMetas,
  };
}

export default useMetasKPI;
