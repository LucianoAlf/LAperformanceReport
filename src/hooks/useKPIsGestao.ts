import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface KPIsGestao {
  unidade_id: string;
  unidade_nome: string;
  ano: number;
  mes: number;
  total_alunos_ativos: number;
  total_alunos_pagantes: number;
  total_bolsistas_integrais: number;
  total_bolsistas_parciais: number;
  total_banda: number;
  ticket_medio: number;
  mrr: number;
  arr: number;
  tempo_permanencia_medio: number;
  ltv_medio: number;
  inadimplencia_pct: number;
  faturamento_previsto: number;
  faturamento_realizado: number;
  churn_rate: number;
  total_evasoes: number;
}

export interface KPIsGestaoConsolidado extends KPIsGestao {
  // Valores do mês anterior para cálculo de tendência
  anterior?: {
    total_alunos_ativos: number;
    total_alunos_pagantes: number;
    ticket_medio: number;
    mrr: number;
    churn_rate: number;
  };
}

interface UseKPIsGestaoResult {
  data: KPIsGestaoConsolidado | null;
  dataByUnidade: KPIsGestao[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useKPIsGestao(
  unidadeId: string | 'todos' = 'todos',
  ano?: number,
  mes?: number
): UseKPIsGestaoResult {
  const [data, setData] = useState<KPIsGestaoConsolidado | null>(null);
  const [dataByUnidade, setDataByUnidade] = useState<KPIsGestao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const currentYear = ano || new Date().getFullYear();
  const currentMonth = mes || new Date().getMonth() + 1;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Buscar dados da view
      let query = supabase
        .from('vw_kpis_gestao_mensal')
        .select('*');

      if (unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data: kpisData, error: kpisError } = await query;

      if (kpisError) throw kpisError;

      if (kpisData && kpisData.length > 0) {
        setDataByUnidade(kpisData);

        // Consolidar dados se for "todos"
        if (unidadeId === 'todos') {
          const consolidado: KPIsGestaoConsolidado = {
            unidade_id: 'todos',
            unidade_nome: 'Consolidado',
            ano: currentYear,
            mes: currentMonth,
            total_alunos_ativos: kpisData.reduce((acc, k) => acc + (k.total_alunos_ativos || 0), 0),
            total_alunos_pagantes: kpisData.reduce((acc, k) => acc + (k.total_alunos_pagantes || 0), 0),
            total_bolsistas_integrais: kpisData.reduce((acc, k) => acc + (k.total_bolsistas_integrais || 0), 0),
            total_bolsistas_parciais: kpisData.reduce((acc, k) => acc + (k.total_bolsistas_parciais || 0), 0),
            total_banda: kpisData.reduce((acc, k) => acc + (k.total_banda || 0), 0),
            ticket_medio: kpisData.reduce((acc, k) => acc + (k.ticket_medio || 0), 0) / kpisData.length,
            mrr: kpisData.reduce((acc, k) => acc + (k.mrr || 0), 0),
            arr: kpisData.reduce((acc, k) => acc + (k.arr || 0), 0),
            tempo_permanencia_medio: kpisData.reduce((acc, k) => acc + (k.tempo_permanencia_medio || 0), 0) / kpisData.length,
            ltv_medio: kpisData.reduce((acc, k) => acc + (k.ltv_medio || 0), 0) / kpisData.length,
            inadimplencia_pct: kpisData.reduce((acc, k) => acc + (k.inadimplencia_pct || 0), 0) / kpisData.length,
            faturamento_previsto: kpisData.reduce((acc, k) => acc + (k.faturamento_previsto || 0), 0),
            faturamento_realizado: kpisData.reduce((acc, k) => acc + (k.faturamento_realizado || 0), 0),
            churn_rate: kpisData.reduce((acc, k) => acc + (k.churn_rate || 0), 0) / kpisData.length,
            total_evasoes: kpisData.reduce((acc, k) => acc + (k.total_evasoes || 0), 0),
          };
          setData(consolidado);
        } else {
          setData(kpisData[0] as KPIsGestaoConsolidado);
        }
      } else {
        // Fallback para dados_mensais se a view não existir
        const { data: dadosMensais, error: dmError } = await supabase
          .from('dados_mensais')
          .select('*')
          .eq('ano', currentYear)
          .eq('mes', currentMonth);

        if (dmError) throw dmError;

        if (dadosMensais && dadosMensais.length > 0) {
          const consolidado: KPIsGestaoConsolidado = {
            unidade_id: 'todos',
            unidade_nome: 'Consolidado',
            ano: currentYear,
            mes: currentMonth,
            total_alunos_ativos: dadosMensais.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0),
            total_alunos_pagantes: dadosMensais.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0),
            total_bolsistas_integrais: 0,
            total_bolsistas_parciais: 0,
            total_banda: 0,
            ticket_medio: dadosMensais.reduce((acc, d) => acc + (d.ticket_medio || 0), 0) / dadosMensais.length,
            mrr: dadosMensais.reduce((acc, d) => acc + (d.alunos_pagantes * d.ticket_medio || 0), 0),
            arr: dadosMensais.reduce((acc, d) => acc + (d.alunos_pagantes * d.ticket_medio * 12 || 0), 0),
            tempo_permanencia_medio: dadosMensais.reduce((acc, d) => acc + (d.tempo_permanencia || 0), 0) / dadosMensais.length,
            ltv_medio: 0,
            inadimplencia_pct: dadosMensais.reduce((acc, d) => acc + (d.inadimplencia || 0), 0) / dadosMensais.length,
            faturamento_previsto: dadosMensais.reduce((acc, d) => acc + (d.faturamento_estimado || 0), 0),
            faturamento_realizado: dadosMensais.reduce((acc, d) => acc + (d.faturamento_estimado * (1 - d.inadimplencia/100) || 0), 0),
            churn_rate: dadosMensais.reduce((acc, d) => acc + (d.churn_rate || 0), 0) / dadosMensais.length,
            total_evasoes: dadosMensais.reduce((acc, d) => acc + (d.evasoes || 0), 0),
          };
          setData(consolidado);
        }
      }

      // Buscar dados do mês anterior para tendência
      const mesAnterior = currentMonth === 1 ? 12 : currentMonth - 1;
      const anoAnterior = currentMonth === 1 ? currentYear - 1 : currentYear;

      const { data: dadosAnteriores } = await supabase
        .from('dados_mensais')
        .select('*')
        .eq('ano', anoAnterior)
        .eq('mes', mesAnterior);

      if (dadosAnteriores && dadosAnteriores.length > 0 && data) {
        setData(prev => prev ? {
          ...prev,
          anterior: {
            total_alunos_ativos: dadosAnteriores.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0),
            total_alunos_pagantes: dadosAnteriores.reduce((acc, d) => acc + (d.alunos_pagantes || 0), 0),
            ticket_medio: dadosAnteriores.reduce((acc, d) => acc + (d.ticket_medio || 0), 0) / dadosAnteriores.length,
            mrr: dadosAnteriores.reduce((acc, d) => acc + (d.alunos_pagantes * d.ticket_medio || 0), 0),
            churn_rate: dadosAnteriores.reduce((acc, d) => acc + (d.churn_rate || 0), 0) / dadosAnteriores.length,
          }
        } : null);
      }

    } catch (err) {
      console.error('Erro ao buscar KPIs de Gestão:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, currentYear, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, dataByUnidade, isLoading, error, refetch: fetchData };
}

export default useKPIsGestao;
