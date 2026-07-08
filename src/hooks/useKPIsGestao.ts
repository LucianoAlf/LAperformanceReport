import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchKPIsAlunosCanonicos, type FonteKPIAlunos } from '@/hooks/useKPIsAlunosCanonicos';

export interface KPIsGestao {
  unidade_id: string;
  unidade_nome: string;
  ano: number;
  mes: number;
  total_alunos_ativos: number;
  total_alunos_pagantes: number;
  total_bolsistas_integrais: number;
  total_bolsistas_integrais_regulares?: number;
  total_bolsistas_integrais_segundo_curso?: number;
  total_bolsistas_parciais: number;
  total_matriculas_base_alunos_ativos?: number;
  total_banda: number;
  matriculas_2_curso?: number;
  alunos_com_2_curso?: number;
  matriculas_2_curso_extras?: number;
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
  fonte?: FonteKPIAlunos;
  fonte_label?: string;
  alertas_fonte?: string[];
}

export interface KPIsGestaoConsolidado extends KPIsGestao {
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

function mapCanonicalToGestao(kpi: any): KPIsGestao {
  return {
    unidade_id: kpi.unidade_id,
    unidade_nome: kpi.unidade_nome,
    ano: kpi.ano,
    mes: kpi.mes,
    total_alunos_ativos: kpi.alunosAtivos,
    total_alunos_pagantes: kpi.alunosPagantes,
    total_bolsistas_integrais: kpi.bolsistasIntegrais,
    total_bolsistas_integrais_regulares: kpi.bolsistasIntegraisRegulares,
    total_bolsistas_integrais_segundo_curso: kpi.bolsistasIntegraisSegundoCurso,
    total_bolsistas_parciais: kpi.bolsistasParciais,
    total_matriculas_base_alunos_ativos: kpi.matriculasBaseAlunosAtivos,
    total_banda: kpi.matriculasBanda,
    matriculas_2_curso: kpi.matriculasSegundoCurso,
    alunos_com_2_curso: kpi.alunosComSegundoCurso,
    matriculas_2_curso_extras: kpi.matriculasSegundoCursoExtras,
    ticket_medio: kpi.ticketMedio,
    mrr: kpi.mrr,
    arr: kpi.arr,
    tempo_permanencia_medio: kpi.tempoPermanencia,
    ltv_medio: kpi.ltv,
    inadimplencia_pct: kpi.inadimplencia,
    faturamento_previsto: kpi.faturamentoPrevisto,
    faturamento_realizado: kpi.faturamentoRealizado,
    churn_rate: kpi.churnRate,
    total_evasoes: kpi.evasoes,
    fonte: kpi.fonte,
    fonte_label: kpi.fonteLabel,
    alertas_fonte: kpi.alertasFonte,
  };
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
      const canonical = await fetchKPIsAlunosCanonicos({
        unidadeId,
        ano: currentYear,
        mes: currentMonth,
      });

      const consolidado = mapCanonicalToGestao(canonical) as KPIsGestaoConsolidado;
      const porUnidade = canonical.porUnidade.map(row => mapCanonicalToGestao({
        ...row,
        fonte: canonical.fonte,
        fonteLabel: canonical.fonteLabel,
        alertasFonte: canonical.alertasFonte,
      }));

      setDataByUnidade(porUnidade);
      setData(consolidado);

      const mesAnterior = currentMonth === 1 ? 12 : currentMonth - 1;
      const anoAnterior = currentMonth === 1 ? currentYear - 1 : currentYear;

      let anterioresQuery = supabase
        .from('dados_mensais')
        .select('*')
        .eq('ano', anoAnterior)
        .eq('mes', mesAnterior);

      if (unidadeId !== 'todos') {
        anterioresQuery = anterioresQuery.eq('unidade_id', unidadeId);
      }

      const [{ data: dadosAnteriores }, canonicalAnterior] = await Promise.all([
        anterioresQuery,
        fetchKPIsAlunosCanonicos({
          unidadeId,
          ano: anoAnterior,
          mes: mesAnterior,
        }).catch(() => null),
      ]);

      if (canonicalAnterior && canonicalAnterior.fonte !== 'indisponivel') {
        setData(prev => prev ? {
          ...prev,
          anterior: {
            total_alunos_ativos: canonicalAnterior.alunosAtivos,
            total_alunos_pagantes: canonicalAnterior.alunosPagantes,
            ticket_medio: canonicalAnterior.ticketMedio,
            mrr: canonicalAnterior.mrr,
            churn_rate: canonicalAnterior.churnRate,
          },
        } : null);
      } else if (dadosAnteriores && dadosAnteriores.length > 0) {
        const totalPagantes = dadosAnteriores.reduce((acc, d) => acc + (Number(d.alunos_pagantes) || 0), 0);
        const mrr = dadosAnteriores.reduce((acc, d) => acc + (Number(d.faturamento_estimado) || 0), 0);
        const count = dadosAnteriores.length || 1;

        setData(prev => prev ? {
          ...prev,
          anterior: {
            total_alunos_ativos: dadosAnteriores.reduce((acc, d) => acc + (Number(d.alunos_ativos) || 0), 0),
            total_alunos_pagantes: totalPagantes,
            ticket_medio: totalPagantes > 0 ? mrr / totalPagantes : 0,
            mrr,
            churn_rate: dadosAnteriores.reduce((acc, d) => acc + (Number(d.churn_rate) || 0), 0) / count,
          },
        } : null);
      }
    } catch (err) {
      console.error('Erro ao buscar KPIs de Gestão:', err);
      setError(err as Error);
      setData(null);
      setDataByUnidade([]);
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
