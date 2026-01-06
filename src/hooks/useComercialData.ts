import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { 
  DadosComerciais, 
  KPIsComerciais, 
  UnidadeComercial, 
  DadosMensais,
  DadosUnidade,
  MetaComercial,
  MESES_ABREV
} from '../types/comercial';

export function useComercialData(ano: number = 2025, unidade: UnidadeComercial = 'Consolidado') {
  const [dados, setDados] = useState<DadosComerciais[]>([]);
  const [dadosMensais, setDadosMensais] = useState<DadosMensais[]>([]);
  const [dadosPorUnidade, setDadosPorUnidade] = useState<DadosUnidade[]>([]);
  const [kpis, setKpis] = useState<KPIsComerciais | null>(null);
  const [metas, setMetas] = useState<MetaComercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDados = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Buscar dados comerciais
      let query = supabase
        .from('dados_comerciais')
        .select('*')
        .gte('competencia', `${ano}-01-01`)
        .lte('competencia', `${ano}-12-31`)
        .order('competencia', { ascending: true });

      if (unidade !== 'Consolidado') {
        query = query.eq('unidade', unidade);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      setDados(data || []);
      
      // Calcular KPIs
      if (data && data.length > 0) {
        const kpisCalculados = calcularKPIs(data);
        setKpis(kpisCalculados);
        
        // Processar dados mensais
        const mensais = processarDadosMensais(data, unidade);
        setDadosMensais(mensais);
        
        // Processar dados por unidade (apenas se consolidado)
        if (unidade === 'Consolidado') {
          const porUnidade = processarDadosPorUnidade(data);
          setDadosPorUnidade(porUnidade);
        }
      }

      // Buscar metas
      const { data: metasData } = await supabase
        .from('metas_comerciais')
        .select('*')
        .eq('ano', ano + 1); // Metas do próximo ano

      setMetas(metasData || []);

    } catch (err: any) {
      setError(err.message);
      console.error('Erro ao buscar dados comerciais:', err);
    } finally {
      setLoading(false);
    }
  }, [ano, unidade]);

  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  return { 
    dados, 
    dadosMensais,
    dadosPorUnidade,
    kpis, 
    metas,
    loading, 
    error, 
    refetch: fetchDados 
  };
}

function calcularKPIs(data: DadosComerciais[]): KPIsComerciais {
  const totalLeads = data.reduce((sum, d) => sum + (d.total_leads || 0), 0);
  const aulasExperimentais = data.reduce((sum, d) => sum + (d.aulas_experimentais || 0), 0);
  const novasMatriculas = data.reduce((sum, d) => sum + (d.novas_matriculas_total || 0), 0);
  const matriculasLAMK = data.reduce((sum, d) => sum + (d.novas_matriculas_lamk || 0), 0);
  const matriculasEMLA = data.reduce((sum, d) => sum + (d.novas_matriculas_emla || 0), 0);
  
  const ticketsValidos = data.filter(d => d.ticket_medio_parcelas != null);
  const ticketMedioParcelas = ticketsValidos.length > 0
    ? ticketsValidos.reduce((sum, d) => sum + (d.ticket_medio_parcelas || 0), 0) / ticketsValidos.length
    : 0;
  
  const passaportesValidos = data.filter(d => d.ticket_medio_passaporte != null);
  const ticketMedioPassaporte = passaportesValidos.length > 0
    ? passaportesValidos.reduce((sum, d) => sum + (d.ticket_medio_passaporte || 0), 0) / passaportesValidos.length
    : 0;
  
  const faturamentoPassaporte = data.reduce((sum, d) => sum + (d.faturamento_passaporte || 0), 0);

  return {
    totalLeads,
    aulasExperimentais,
    novasMatriculas,
    matriculasLAMK,
    matriculasEMLA,
    taxaLeadExp: totalLeads > 0 ? (aulasExperimentais / totalLeads) * 100 : 0,
    taxaExpMat: aulasExperimentais > 0 ? (novasMatriculas / aulasExperimentais) * 100 : 0,
    taxaConversaoTotal: totalLeads > 0 ? (novasMatriculas / totalLeads) * 100 : 0,
    ticketMedioParcelas,
    ticketMedioPassaporte,
    faturamentoPassaporte,
  };
}

function processarDadosMensais(data: DadosComerciais[], unidade: UnidadeComercial): DadosMensais[] {
  const mesesMap = new Map<number, DadosMensais>();

  data.forEach(d => {
    // Usar split para evitar problemas de timezone
    const [year, month] = d.competencia.split('-').map(Number);
    const mesIndex = month - 1; // Converter para 0-indexed
    
    const existing = mesesMap.get(mesIndex);
    
    if (existing) {
      existing.leads += d.total_leads || 0;
      existing.experimentais += d.aulas_experimentais || 0;
      existing.matriculas += d.novas_matriculas_total || 0;
      existing.matriculasLAMK += d.novas_matriculas_lamk || 0;
      existing.matriculasEMLA += d.novas_matriculas_emla || 0;
      if (d.ticket_medio_parcelas) {
        existing.ticketParcelas = d.ticket_medio_parcelas;
      }
      if (d.ticket_medio_passaporte) {
        existing.ticketPassaporte = d.ticket_medio_passaporte;
      }
      existing.faturamentoPassaporte = (existing.faturamentoPassaporte || 0) + (d.faturamento_passaporte || 0);
    } else {
      mesesMap.set(mesIndex, {
        mes: `${year}-${String(mesIndex + 1).padStart(2, '0')}`,
        mesAbrev: MESES_ABREV[mesIndex],
        leads: d.total_leads || 0,
        experimentais: d.aulas_experimentais || 0,
        matriculas: d.novas_matriculas_total || 0,
        matriculasLAMK: d.novas_matriculas_lamk || 0,
        matriculasEMLA: d.novas_matriculas_emla || 0,
        ticketParcelas: d.ticket_medio_parcelas,
        ticketPassaporte: d.ticket_medio_passaporte,
        faturamentoPassaporte: d.faturamento_passaporte,
      });
    }
  });

  return Array.from(mesesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

function processarDadosPorUnidade(data: DadosComerciais[]): DadosUnidade[] {
  const unidadesMap = new Map<string, DadosComerciais[]>();

  data.forEach(d => {
    const existing = unidadesMap.get(d.unidade) || [];
    existing.push(d);
    unidadesMap.set(d.unidade, existing);
  });

  const resultado: DadosUnidade[] = [];

  unidadesMap.forEach((dadosUnidade, nomeUnidade) => {
    const kpis = calcularKPIs(dadosUnidade);
    resultado.push({
      unidade: nomeUnidade,
      totalLeads: kpis.totalLeads,
      aulasExperimentais: kpis.aulasExperimentais,
      novasMatriculas: kpis.novasMatriculas,
      matriculasLAMK: kpis.matriculasLAMK,
      matriculasEMLA: kpis.matriculasEMLA,
      taxaLeadExp: kpis.taxaLeadExp,
      taxaExpMat: kpis.taxaExpMat,
      taxaConversaoTotal: kpis.taxaConversaoTotal,
      ticketMedioParcelas: kpis.ticketMedioParcelas,
      faturamentoPassaporte: kpis.faturamentoPassaporte,
    });
  });

  return resultado.sort((a, b) => b.novasMatriculas - a.novasMatriculas);
}

// Hook para buscar dados de uma unidade específica
export function useUnidadeData(unidade: string, ano: number = 2025) {
  const [dados, setDados] = useState<DadosComerciais[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('dados_comerciais')
        .select('*')
        .eq('unidade', unidade)
        .gte('competencia', `${ano}-01-01`)
        .lte('competencia', `${ano}-12-31`)
        .order('competencia', { ascending: true });
      
      setDados(data || []);
      setLoading(false);
    }
    fetch();
  }, [unidade, ano]);

  return { dados, loading };
}
