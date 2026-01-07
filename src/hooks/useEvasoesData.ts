import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Evasao, 
  KPIsRetencao, 
  DadosMensaisRetencao, 
  DadosUnidadeRetencao,
  ProfessorEvasao,
  MotivoEvasao,
  UnidadeRetencao,
  MESES_ABREV,
  CORES_MOTIVOS
} from '../types/retencao';

export function useEvasoesData(ano: number = 2025, unidade: UnidadeRetencao = 'Consolidado') {
  const [evasoes, setEvasoes] = useState<Evasao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvasoes();
  }, [ano, unidade]);

  const fetchEvasoes = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('evasoes')
        .select('*')
        .gte('competencia', `${ano}-01-01`)
        .lte('competencia', `${ano}-12-31`)
        .order('competencia', { ascending: true });

      if (unidade !== 'Consolidado') {
        query = query.eq('unidade', unidade);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      setEvasoes(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Erro ao buscar evasões:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calcular KPIs
  const kpis = useMemo((): KPIsRetencao | null => {
    if (evasoes.length === 0) return null;

    const totalEvasoes = evasoes.length;
    const totalInterrompidos = evasoes.filter(e => e.tipo === 'Interrompido').length;
    const totalNaoRenovacoes = evasoes.filter(e => e.tipo === 'Não Renovação').length;
    const mrrPerdidoTotal = evasoes.reduce((sum, e) => sum + (e.parcela || 0), 0);
    const ticketMedioEvasao = mrrPerdidoTotal / totalEvasoes;

    // Contar motivos
    const motivosCount: Record<string, number> = {};
    evasoes.forEach(e => {
      motivosCount[e.motivo_categoria] = (motivosCount[e.motivo_categoria] || 0) + 1;
    });
    const motivoPrincipal = Object.entries(motivosCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Contar professores
    const professoresCount: Record<string, number> = {};
    evasoes.forEach(e => {
      if (e.professor && e.professor !== 'Desconhecido') {
        professoresCount[e.professor] = (professoresCount[e.professor] || 0) + 1;
      }
    });
    const professorCritico = Object.entries(professoresCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return {
      totalEvasoes,
      totalInterrompidos,
      totalNaoRenovacoes,
      mrrPerdidoTotal,
      mrrPerdidoMensal: mrrPerdidoTotal / 12,
      ticketMedioEvasao,
      churnMedio: 4.86,
      motivoPrincipal,
      professorCritico,
      taxaRenovacao: 80,
    };
  }, [evasoes]);

  // Dados mensais
  const dadosMensais = useMemo((): DadosMensaisRetencao[] => {
    const porMes: Record<string, DadosMensaisRetencao> = {};

    evasoes.forEach(e => {
      const mes = e.competencia.substring(0, 7);
      const mesNum = parseInt(e.competencia.substring(5, 7)) - 1;

      if (!porMes[mes]) {
        porMes[mes] = {
          mes,
          mesAbrev: MESES_ABREV[mesNum],
          evasoes: 0,
          churn: 0,
          mrrPerdido: 0,
          renovacoes: 0,
          taxaRenovacao: 0,
        };
      }

      porMes[mes].evasoes += 1;
      porMes[mes].mrrPerdido += e.parcela || 0;
    });

    return Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [evasoes]);

  // Dados por unidade
  const dadosPorUnidade = useMemo((): DadosUnidadeRetencao[] => {
    const CORES_UNIDADES: Record<string, string> = {
      'Campo Grande': '#06b6d4',
      'Recreio': '#8b5cf6',
      'Barra': '#22c55e',
    };

    const porUnidade: Record<string, DadosUnidadeRetencao> = {};

    evasoes.forEach(e => {
      if (!porUnidade[e.unidade]) {
        porUnidade[e.unidade] = {
          unidade: e.unidade,
          totalEvasoes: 0,
          churnMedio: 0,
          mrrPerdido: 0,
          motivoPrincipal: '',
          professorCritico: '',
          cor: CORES_UNIDADES[e.unidade] || '#666',
        };
      }

      porUnidade[e.unidade].totalEvasoes += 1;
      porUnidade[e.unidade].mrrPerdido += e.parcela || 0;
    });

    return Object.values(porUnidade);
  }, [evasoes]);

  // Ranking de professores
  const professores = useMemo((): ProfessorEvasao[] => {
    const porProfessor: Record<string, ProfessorEvasao> = {};

    evasoes.forEach(e => {
      if (!e.professor || e.professor === 'Desconhecido') return;

      const key = `${e.unidade}-${e.professor}`;
      if (!porProfessor[key]) {
        porProfessor[key] = {
          professor: e.professor,
          unidade: e.unidade,
          total_evasoes: 0,
          mrr_perdido: 0,
          ticket_medio: 0,
          motivo_principal: '',
          percentual: 0,
          risco: 'normal',
        };
      }

      porProfessor[key].total_evasoes += 1;
      porProfessor[key].mrr_perdido += e.parcela || 0;
    });

    // Calcular médias e percentuais
    const lista = Object.values(porProfessor);
    const totalGeral = lista.reduce((sum, p) => sum + p.total_evasoes, 0);

    lista.forEach(p => {
      p.ticket_medio = p.mrr_perdido / p.total_evasoes;
      p.percentual = (p.total_evasoes / totalGeral) * 100;
      
      // Definir nível de risco
      if (p.total_evasoes >= 15) p.risco = 'crítico';
      else if (p.total_evasoes >= 10) p.risco = 'alto';
      else if (p.total_evasoes >= 5) p.risco = 'médio';
      else p.risco = 'normal';
    });

    return lista.sort((a, b) => b.total_evasoes - a.total_evasoes);
  }, [evasoes]);

  // Motivos de evasão
  const motivos = useMemo((): MotivoEvasao[] => {
    const porMotivo: Record<string, MotivoEvasao> = {};

    evasoes.forEach(e => {
      if (!porMotivo[e.motivo_categoria]) {
        porMotivo[e.motivo_categoria] = {
          motivo_categoria: e.motivo_categoria,
          quantidade: 0,
          mrr_perdido: 0,
          percentual: 0,
          cor: CORES_MOTIVOS[e.motivo_categoria] || '#666',
          icone: e.motivo_categoria,
        };
      }

      porMotivo[e.motivo_categoria].quantidade += 1;
      porMotivo[e.motivo_categoria].mrr_perdido += e.parcela || 0;
    });

    // Calcular percentuais
    const lista = Object.values(porMotivo);
    const total = lista.reduce((sum, m) => sum + m.quantidade, 0);
    lista.forEach(m => {
      m.percentual = (m.quantidade / total) * 100;
    });

    return lista.sort((a, b) => b.quantidade - a.quantidade);
  }, [evasoes]);

  return {
    evasoes,
    kpis,
    dadosMensais,
    dadosPorUnidade,
    professores,
    motivos,
    loading,
    error,
    refetch: fetchEvasoes,
  };
}

// Hook auxiliar para buscar apenas professores
export function useProfessoresEvasao(ano: number = 2025, unidade: UnidadeRetencao = 'Consolidado') {
  const { professores, loading, error } = useEvasoesData(ano, unidade);
  return { professores, loading, error };
}

// Hook auxiliar para buscar apenas motivos
export function useMotivosEvasao(ano: number = 2025, unidade: UnidadeRetencao = 'Consolidado') {
  const { motivos, loading, error } = useEvasoesData(ano, unidade);
  return { motivos, loading, error };
}
