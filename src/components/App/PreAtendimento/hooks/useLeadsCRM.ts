import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { LeadCRM, PipelineEtapa, DashboardKPIs, FunilDados, CanalOrigem, CursoCRM, UnidadeCRM } from '../types';

interface UseLeadsCRMProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

interface UseLeadsCRMReturn {
  leads: LeadCRM[];
  setLeads: React.Dispatch<React.SetStateAction<LeadCRM[]>>;
  etapas: PipelineEtapa[];
  canais: CanalOrigem[];
  cursos: CursoCRM[];
  unidades: UnidadeCRM[];
  kpis: DashboardKPIs;
  funil: FunilDados;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  refetchSilencioso: () => void;
}

export function useLeadsCRM({ unidadeId, ano, mes }: UseLeadsCRMProps): UseLeadsCRMReturn {
  const [leads, setLeads] = useState<LeadCRM[]>([]);
  const [etapas, setEtapas] = useState<PipelineEtapa[]>([]);
  const [canais, setCanais] = useState<CanalOrigem[]>([]);
  const [cursos, setCursos] = useState<CursoCRM[]>([]);
  const [unidades, setUnidades] = useState<UnidadeCRM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Datas do período
      const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const endDate = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

      // Buscar tudo em paralelo
      const [leadsResult, etapasResult, canaisResult, cursosResult, unidadesResult] = await Promise.all([
        // Leads do período com joins
        (() => {
          let query = supabase
            .from('leads')
            .select(`
              *,
              canais_origem(nome),
              cursos:curso_interesse_id(nome),
              unidades:unidade_id(nome, codigo),
              professores:professor_experimental_id(nome),
              crm_pipeline_etapas:etapa_pipeline_id(id, nome, slug, cor, icone, ordem),
              crm_motivos_nao_comparecimento:motivo_nao_comparecimento_id(id, nome),
              atendido_por:atendido_por_id(nome, apelido),
              consultor:consultor_id(nome, apelido)
            `)
            .gte('data_contato', startDate)
            .lte('data_contato', endDate)
            .order('created_at', { ascending: false });

          if (unidadeId && unidadeId !== 'todos') {
            query = query.eq('unidade_id', unidadeId);
          }

          return query;
        })(),

        // Etapas do pipeline
        supabase
          .from('crm_pipeline_etapas')
          .select('*')
          .eq('ativo', true)
          .order('ordem'),

        // Canais de origem
        supabase
          .from('canais_origem')
          .select('id, nome')
          .eq('ativo', true)
          .order('nome'),

        // Cursos
        supabase
          .from('cursos')
          .select('id, nome')
          .eq('ativo', true)
          .order('nome'),

        // Unidades
        supabase
          .from('unidades')
          .select('id, nome, codigo')
          .eq('ativo', true)
          .order('nome'),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (etapasResult.error) throw etapasResult.error;

      const leadsData = (leadsResult.data || []) as LeadCRM[];
      const etapasData = (etapasResult.data || []) as PipelineEtapa[];

      setLeads(leadsData);
      setEtapas(etapasData);
      setCanais((canaisResult.data || []) as CanalOrigem[]);
      setCursos((cursosResult.data || []) as CursoCRM[]);
      setUnidades((unidadesResult.data || []) as UnidadeCRM[]);

    } catch (err) {
      console.error('Erro ao carregar dados do CRM:', err);
      setError('Erro ao carregar dados do CRM');
    } finally {
      setLoading(false);
    }
  }, [unidadeId, ano, mes]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calcular KPIs a partir dos leads
  const kpis: DashboardKPIs = calcularKPIs(leads);
  const funil: FunilDados = calcularFunil(leads);

  // Refetch silencioso (sem loading spinner)
  const refetchSilencioso = useCallback(async () => {
    try {
      const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const endDate = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

      let query = supabase
        .from('leads')
        .select(`
          *,
          canais_origem(nome),
          cursos:curso_interesse_id(nome),
          unidades:unidade_id(nome, codigo),
          professores:professor_experimental_id(nome),
          crm_pipeline_etapas:etapa_pipeline_id(id, nome, slug, cor, icone, ordem),
          crm_motivos_nao_comparecimento:motivo_nao_comparecimento_id(id, nome),
          atendido_por:atendido_por_id(nome, apelido),
          consultor:consultor_id(nome, apelido)
        `)
        .gte('data_contato', startDate)
        .lte('data_contato', endDate)
        .order('created_at', { ascending: false });

      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data } = await query;
      if (data) setLeads(data as LeadCRM[]);
    } catch (err) {
      console.error('Erro no refetch silencioso:', err);
    }
  }, [unidadeId, ano, mes]);

  return {
    leads,
    setLeads,
    etapas,
    canais,
    cursos,
    unidades,
    kpis,
    funil,
    loading,
    error,
    refetch: fetchData,
    refetchSilencioso,
  };
}

// Calcula KPIs do dashboard
function calcularKPIs(leads: LeadCRM[]): DashboardKPIs {
  const hoje = new Date().toISOString().split('T')[0];

  const totalLeads = leads.length;
  const leadsHoje = leads.filter(l => l.data_contato === hoje).length;

  // Agendadas = experimental_agendada OU etapa 5 (experimental_agendada) ou 6 (visita_agendada)
  const agendadas = leads.filter(l =>
    l.experimental_agendada ||
    l.etapa_pipeline_id === 5 ||
    l.etapa_pipeline_id === 6
  ).length;

  // Visitaram = experimental_realizada OU etapa 7 ou 8
  const visitaram = leads.filter(l =>
    l.experimental_realizada ||
    l.etapa_pipeline_id === 7 ||
    l.etapa_pipeline_id === 8
  ).length;

  // Matriculados = converteu OU etapa 10
  const matriculados = leads.filter(l =>
    l.converteu ||
    l.etapa_pipeline_id === 10
  ).length;

  // Tags completas = 4 KPIs preenchidos (canal, curso, faixa, sabe_preco)
  let tagsCompletas = 0;
  let tagsPendentes = 0;

  leads.forEach(l => {
    const temCanal = l.canal_origem_id !== null;
    const temCurso = l.curso_interesse_id !== null;
    const temFaixa = l.faixa_etaria !== null;
    const temPreco = l.sabia_preco !== null;
    const total = [temCanal, temCurso, temFaixa, temPreco].filter(Boolean).length;
    if (total === 4) tagsCompletas++;
    else tagsPendentes++;
  });

  return {
    totalLeads,
    leadsHoje,
    agendadas,
    taxaAgendamento: totalLeads > 0 ? (agendadas / totalLeads) * 100 : 0,
    visitaram,
    taxaShowUp: totalLeads > 0 ? (visitaram / totalLeads) * 100 : 0,
    matriculados,
    taxaMatricula: totalLeads > 0 ? (matriculados / totalLeads) * 100 : 0,
    tagsCompletas,
    tagsPendentes,
    taxaTags: totalLeads > 0 ? (tagsCompletas / totalLeads) * 100 : 0,
  };
}

// Calcula dados do funil
function calcularFunil(leads: LeadCRM[]): FunilDados {
  return {
    leads: leads.length,
    agendadas: leads.filter(l =>
      l.experimental_agendada ||
      l.etapa_pipeline_id === 5 ||
      l.etapa_pipeline_id === 6
    ).length,
    visitaram: leads.filter(l =>
      l.experimental_realizada ||
      l.etapa_pipeline_id === 7 ||
      l.etapa_pipeline_id === 8
    ).length,
    matriculados: leads.filter(l =>
      l.converteu ||
      l.etapa_pipeline_id === 10
    ).length,
  };
}
