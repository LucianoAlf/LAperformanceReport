import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CompetenciaRange } from './useCompetenciaFiltro';

export interface DadosMensais {
  id: string;
  unidade_id: string;
  ano: number;
  mes: number;
  alunos_pagantes: number;
  novas_matriculas: number;
  evasoes: number;
  churn_rate: number;
  ticket_medio: number;
  taxa_renovacao: number;
  tempo_permanencia: number;
  inadimplencia: number;
  reajuste_parcelas: number;
  faturamento_estimado: number;
  saldo_liquido: number;
  ticket_medio_passaporte: number;
  faturamento_passaporte: number;
}

export interface DadosMensaisAgregados {
  alunos_pagantes: number;
  novas_matriculas: number;
  evasoes: number;
  churn_rate: number;
  ticket_medio: number;
  taxa_renovacao: number;
  tempo_permanencia: number;
  inadimplencia: number;
  faturamento_estimado: number;
  faturamento_realizado: number;
  mrr: number;
}

/**
 * Hook para consultar dados históricos da tabela dados_mensais
 * Funciona com filtros de período (mensal, trimestral, semestral, anual)
 */
export function useDadosMensais(
  range: CompetenciaRange,
  unidadeId?: string | null
) {
  const [dados, setDados] = useState<DadosMensais[]>([]);
  const [dadosAgregados, setDadosAgregados] = useState<DadosMensaisAgregados | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function buscarDados() {
      setLoading(true);
      setError(null);

      try {
        // Construir query base
        let query = supabase
          .from('dados_mensais')
          .select('*')
          .eq('ano', range.ano)
          .gte('mes', range.mesInicio)
          .lte('mes', range.mesFim);

        // Filtrar por unidade se especificado
        if (unidadeId && unidadeId !== 'todos') {
          query = query.eq('unidade_id', unidadeId);
        }

        const { data, error: queryError } = await query.order('mes', { ascending: true });

        if (queryError) {
          throw queryError;
        }

        setDados(data || []);

        // Calcular dados agregados
        if (data && data.length > 0) {
          const totalRegistros = data.length;
          
          const agregados: DadosMensaisAgregados = {
            alunos_pagantes: Math.round(
              data.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0) / totalRegistros
            ),
            novas_matriculas: data.reduce((acc, d) => acc + (d.novas_matriculas || 0), 0),
            evasoes: data.reduce((acc, d) => acc + (d.evasoes || 0), 0),
            churn_rate: Number(
              (data.reduce((acc, d) => acc + (d.churn_rate || 0), 0) / totalRegistros).toFixed(2)
            ),
            ticket_medio: Number(
              (data.reduce((acc, d) => acc + (d.ticket_medio || 0), 0) / totalRegistros).toFixed(2)
            ),
            taxa_renovacao: Number(
              (data.reduce((acc, d) => acc + (d.taxa_renovacao || 0), 0) / totalRegistros).toFixed(2)
            ),
            tempo_permanencia: Math.round(
              data.reduce((acc, d) => acc + (d.tempo_permanencia || 0), 0) / totalRegistros
            ),
            inadimplencia: Number(
              (data.reduce((acc, d) => acc + (d.inadimplencia || 0), 0) / totalRegistros).toFixed(2)
            ),
            faturamento_estimado: Number(
              data.reduce((acc, d) => acc + (d.faturamento_estimado || 0), 0).toFixed(2)
            ),
            faturamento_realizado: 0, // Calculado abaixo
            mrr: 0, // Calculado abaixo
          };

          // Calcular faturamento realizado (previsto - inadimplência)
          agregados.faturamento_realizado = Number(
            (agregados.faturamento_estimado * (1 - agregados.inadimplencia / 100)).toFixed(2)
          );

          // Calcular MRR médio (ticket médio * alunos pagantes)
          agregados.mrr = Number(
            (agregados.ticket_medio * agregados.alunos_pagantes).toFixed(2)
          );

          setDadosAgregados(agregados);
        } else {
          setDadosAgregados(null);
        }
      } catch (err) {
        console.error('Erro ao buscar dados mensais:', err);
        setError(err as Error);
        setDados([]);
        setDadosAgregados(null);
      } finally {
        setLoading(false);
      }
    }

    buscarDados();
  }, [range.ano, range.mesInicio, range.mesFim, unidadeId]);

  return {
    dados,
    dadosAgregados,
    loading,
    error,
  };
}

export default useDadosMensais;
