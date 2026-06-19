import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { filtrarRetencaoCanonica } from '@/lib/atividadesExtras';

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
  // Calculados
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

export function useProfessoresPerformance(ano: number = new Date().getFullYear(), unidade?: string, idsMotivosQueContam?: number[]) {
  const [professores, setProfessores] = useState<ProfessorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfessores();
  }, [ano, unidade, idsMotivosQueContam?.join(',')]);

  const fetchProfessores = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('professores_performance')
        .select('*')
        .eq('ano', ano)
        .order('evasoes', { ascending: false });

      if (unidade && unidade !== 'Consolidado') {
        query = query.eq('unidade', unidade);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Buscar evasões filtradas por motivos que contam no score
      let evasoesFiltradas: Record<number, number> | null = null;
      if (idsMotivosQueContam && idsMotivosQueContam.length > 0) {
        let evasaoQuery = supabase
          .from('movimentacoes_admin')
          .select('professor_id, curso_id, cursos:curso_id!left(nome, is_projeto_banda)')
          .in('tipo', ['evasao', 'nao_renovacao'])
          .not('professor_id', 'is', null)
          .gte('data', `${ano}-01-01`)
          .lte('data', `${ano}-12-31`);

        // Filtrar: motivo_saida_id IN (ids que contam) OU motivo_saida_id IS NULL (sem motivo = conta)
        evasaoQuery = evasaoQuery.or(`motivo_saida_id.in.(${idsMotivosQueContam.join(',')}),motivo_saida_id.is.null`);

        const { data: evasaoData } = await evasaoQuery;

        if (evasaoData) {
          evasoesFiltradas = {};
          for (const row of filtrarRetencaoCanonica(evasaoData)) {
            const pid = row.professor_id as number;
            evasoesFiltradas[pid] = (evasoesFiltradas[pid] || 0) + 1;
          }
        }
      }

      // Calcular score de saúde e nível de risco
      const processados = (data || []).map(prof => {
        const scoreConversao = (prof.taxa_conversao || 0) * 0.4;
        const scoreRenovacao = (prof.taxa_renovacao || 0) * 0.6;
        const score_saude = scoreConversao + scoreRenovacao;

        // Usar evasões filtradas se disponível, senão usar o total da view
        const evasoesParaRisco = evasoesFiltradas !== null
          ? (evasoesFiltradas[prof.id] || 0)
          : prof.evasoes;

        let nivel_risco: 'crítico' | 'alto' | 'médio' | 'normal';
        if (evasoesParaRisco >= 15) nivel_risco = 'crítico';
        else if (evasoesParaRisco >= 10) nivel_risco = 'alto';
        else if (evasoesParaRisco >= 5) nivel_risco = 'médio';
        else nivel_risco = 'normal';

        return { ...prof, evasoes: evasoesParaRisco, score_saude, nivel_risco };
      });

      setProfessores(processados);
    } catch (err: any) {
      setError(err.message);
      console.error('Erro ao buscar professores:', err);
    } finally {
      setLoading(false);
    }
  };

  // Totais consolidados
  const totais = useMemo((): TotaisPerformance | null => {
    if (professores.length === 0) return null;
    
    const total = professores.reduce((acc, p) => ({
      experimentais: acc.experimentais + (p.experimentais || 0),
      matriculas: acc.matriculas + (p.matriculas || 0),
      evasoes: acc.evasoes + (p.evasoes || 0),
      contratos_vencer: acc.contratos_vencer + (p.contratos_vencer || 0),
      renovacoes: acc.renovacoes + (p.renovacoes || 0),
    }), { experimentais: 0, matriculas: 0, evasoes: 0, contratos_vencer: 0, renovacoes: 0 });

    return {
      ...total,
      taxa_conversao: total.experimentais > 0 ? (100 * total.matriculas / total.experimentais) : 0,
      taxa_renovacao: total.contratos_vencer > 0 ? (100 * total.renovacoes / total.contratos_vencer) : 0,
      nao_renovados: total.contratos_vencer - total.renovacoes,
      totalProfessores: professores.length,
    };
  }, [professores]);

  // Por unidade
  const porUnidade = useMemo(() => {
    const agrupado: Record<string, TotaisPerformance> = {};
    
    professores.forEach(p => {
      if (!agrupado[p.unidade]) {
        agrupado[p.unidade] = {
          experimentais: 0, matriculas: 0, evasoes: 0, 
          contratos_vencer: 0, renovacoes: 0,
          taxa_conversao: 0, taxa_renovacao: 0, nao_renovados: 0,
          totalProfessores: 0
        };
      }
      agrupado[p.unidade].experimentais += p.experimentais || 0;
      agrupado[p.unidade].matriculas += p.matriculas || 0;
      agrupado[p.unidade].evasoes += p.evasoes || 0;
      agrupado[p.unidade].contratos_vencer += p.contratos_vencer || 0;
      agrupado[p.unidade].renovacoes += p.renovacoes || 0;
      agrupado[p.unidade].totalProfessores += 1;
    });

    // Calcular taxas
    Object.keys(agrupado).forEach(u => {
      const t = agrupado[u];
      t.taxa_conversao = t.experimentais > 0 ? (100 * t.matriculas / t.experimentais) : 0;
      t.taxa_renovacao = t.contratos_vencer > 0 ? (100 * t.renovacoes / t.contratos_vencer) : 0;
      t.nao_renovados = t.contratos_vencer - t.renovacoes;
    });

    return agrupado;
  }, [professores]);

  // Professores por nível de risco
  const porRisco = useMemo(() => {
    return {
      critico: professores.filter(p => p.nivel_risco === 'crítico').length,
      alto: professores.filter(p => p.nivel_risco === 'alto').length,
      medio: professores.filter(p => p.nivel_risco === 'médio').length,
      normal: professores.filter(p => p.nivel_risco === 'normal').length,
    };
  }, [professores]);

  return {
    professores,
    totais,
    porUnidade,
    porRisco,
    loading,
    error,
    refetch: fetchProfessores,
  };
}
