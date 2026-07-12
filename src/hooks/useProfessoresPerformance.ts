import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  buscarKpisProfessoresCanonicos,
  consolidarKpisProfessoresCanonicos,
} from '@/lib/professoresKpisCanonicos';

export interface ProfessorPerformance {
  id: number;
  professor: string;
  unidade: string;
  ano: number;
  experimentais: number;
  matriculas: number;
  taxa_conversao: number;
  evasoes: number;
  contratos_vencer: number;
  renovacoes: number;
  taxa_renovacao: number;
  taxa_conversao_diagnostica?: number;
  conversao_bloqueada?: boolean;
  score_saude?: number;
  nivel_risco?: 'crítico' | 'alto' | 'médio' | 'normal';
}

export interface TotaisPerformance {
  experimentais: number;
  matriculas: number;
  evasoes: number;
  contratos_vencer: number;
  renovacoes: number;
  taxa_conversao: number;
  taxa_renovacao: number;
  nao_renovados: number;
  totalProfessores: number;
}

export function useProfessoresPerformance(
  ano: number = new Date().getFullYear(),
  unidade?: string,
  idsMotivosQueContam?: number[]
) {
  const [professores, setProfessores] = useState<ProfessorPerformance[]>([]);
  const [porUnidade, setPorUnidade] = useState<Record<string, TotaisPerformance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfessores = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: unidades } = await supabase.from('unidades').select('id, nome');
      const unidadeSelecionada = unidade && unidade !== 'Consolidado'
        ? (unidades || []).find((item: any) => item.nome === unidade)
        : null;
      const nomesUnidades = new Map((unidades || []).map((item: any) => [item.id, item.nome]));
      const linhas = await buscarKpisProfessoresCanonicos({
        ano,
        mes: 1,
        unidadeId: unidadeSelecionada?.id || null,
        dataInicio: `${ano}-01-01`,
        dataFim: `${ano}-12-31`,
      });
      const consolidados = consolidarKpisProfessoresCanonicos(linhas);

      const totaisPorUnidade: Record<string, TotaisPerformance> = {};
      linhas.forEach((kpi) => {
        const chave = kpi.unidade_id ? (nomesUnidades.get(kpi.unidade_id) || kpi.unidade_id) : 'Sem unidade';
        totaisPorUnidade[chave] ||= {
          experimentais: 0, matriculas: 0, evasoes: 0, contratos_vencer: 0,
          renovacoes: 0, taxa_conversao: 0, taxa_renovacao: 0,
          nao_renovados: 0, totalProfessores: 0,
        };
        const total = totaisPorUnidade[chave];
        total.experimentais += kpi.experimentais;
        total.matriculas += kpi.matriculas_pos_exp;
        total.evasoes += kpi.evasoes;
        total.contratos_vencer += kpi.renovacoes + kpi.nao_renovacoes;
        total.renovacoes += kpi.renovacoes;
        total.totalProfessores += 1;
      });
      Object.values(totaisPorUnidade).forEach((total) => {
        total.taxa_conversao = total.experimentais > 0 ? 100 * total.matriculas / total.experimentais : 0;
        total.taxa_renovacao = total.contratos_vencer > 0 ? 100 * total.renovacoes / total.contratos_vencer : 0;
        total.nao_renovados = total.contratos_vencer - total.renovacoes;
      });
      setPorUnidade(totaisPorUnidade);

      setProfessores(consolidados.map((kpi) => {
        const contratosVencer = kpi.renovacoes + kpi.nao_renovacoes;
        let nivelRisco: ProfessorPerformance['nivel_risco'] = 'normal';
        if (kpi.evasoes >= 15) nivelRisco = 'crítico';
        else if (kpi.evasoes >= 10) nivelRisco = 'alto';
        else if (kpi.evasoes >= 5) nivelRisco = 'médio';

        return {
          id: kpi.professor_id,
          professor: kpi.professor_nome,
          unidade: kpi.unidade_id ? (nomesUnidades.get(kpi.unidade_id) || '') : (unidade || 'Consolidado'),
          ano,
          experimentais: kpi.experimentais,
          matriculas: kpi.matriculas_pos_exp,
          taxa_conversao: kpi.taxa_conversao,
          evasoes: kpi.evasoes,
          contratos_vencer: contratosVencer,
          renovacoes: kpi.renovacoes,
          taxa_renovacao: kpi.taxa_renovacao,
          taxa_conversao_diagnostica: kpi.taxa_conversao,
          conversao_bloqueada: false,
          score_saude: kpi.taxa_renovacao,
          nivel_risco: nivelRisco,
        };
      }));
    } catch (err: any) {
      setError(err.message);
      console.error('Erro ao buscar performance canônica de professores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfessores();
  }, [ano, unidade, idsMotivosQueContam?.join(',')]);

  const totais = useMemo((): TotaisPerformance | null => {
    if (professores.length === 0) return null;
    const total = professores.reduce((acc, professor) => ({
      experimentais: acc.experimentais + professor.experimentais,
      matriculas: acc.matriculas + professor.matriculas,
      evasoes: acc.evasoes + professor.evasoes,
      contratos_vencer: acc.contratos_vencer + professor.contratos_vencer,
      renovacoes: acc.renovacoes + professor.renovacoes,
    }), { experimentais: 0, matriculas: 0, evasoes: 0, contratos_vencer: 0, renovacoes: 0 });

    return {
      ...total,
      taxa_conversao: total.experimentais > 0 ? (100 * total.matriculas / total.experimentais) : 0,
      taxa_renovacao: total.contratos_vencer > 0 ? (100 * total.renovacoes / total.contratos_vencer) : 0,
      nao_renovados: total.contratos_vencer - total.renovacoes,
      totalProfessores: professores.length,
    };
  }, [professores]);

  const porRisco = useMemo(() => ({
    critico: professores.filter((p) => p.nivel_risco === 'crítico').length,
    alto: professores.filter((p) => p.nivel_risco === 'alto').length,
    medio: professores.filter((p) => p.nivel_risco === 'médio').length,
    normal: professores.filter((p) => p.nivel_risco === 'normal').length,
  }), [professores]);

  return { professores, totais, porUnidade, porRisco, loading, error, refetch: fetchProfessores };
}
