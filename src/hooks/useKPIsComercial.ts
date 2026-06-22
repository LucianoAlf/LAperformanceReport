import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchComercialOperacionalResumoV2,
  fetchExperimentaisDiagnosticoComercialV2,
} from '@/hooks/useComercialOperacionalResumoV2';

export interface KPIsComercial {
  unidade_id: string;
  unidade_nome: string;
  ano: number;
  mes: number;
  total_leads: number;
  leads_arquivados: number;
  experimentais_agendadas: number;
  experimentais_realizadas: number;
  faltaram: number;
  taxa_showup: number;
  novas_matriculas: number;
  taxa_conversao_lead_exp: number;
  taxa_conversao_exp_mat: number;
  taxa_conversao_geral: number;
  faturamento_novos: number;
  ticket_medio_novos: number;
  leads_por_canal: Record<string, number>;
  matriculas_por_professor: Record<string, number>;
}

export interface LeadsPorCanal {
  name: string;
  value: number;
}

export interface MatriculasPorProfessor {
  id: number;
  nome: string;
  valor: number;
}

interface UseKPIsComercialResult {
  data: KPIsComercial | null;
  dataByUnidade: KPIsComercial[];
  leadsPorCanal: LeadsPorCanal[];
  matriculasPorProfessor: MatriculasPorProfessor[];
  funnelData: { name: string; value: number; color: string }[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function buildEmptyKpis(unidadeId: string | 'todos', ano: number, mes: number): KPIsComercial {
  return {
    unidade_id: unidadeId === 'todos' ? 'todos' : unidadeId,
    unidade_nome: unidadeId === 'todos' ? 'Consolidado' : '',
    ano,
    mes,
    total_leads: 0,
    leads_arquivados: 0,
    experimentais_agendadas: 0,
    experimentais_realizadas: 0,
    faltaram: 0,
    taxa_showup: 0,
    novas_matriculas: 0,
    taxa_conversao_lead_exp: 0,
    taxa_conversao_exp_mat: 0,
    taxa_conversao_geral: 0,
    faturamento_novos: 0,
    ticket_medio_novos: 0,
    leads_por_canal: {},
    matriculas_por_professor: {},
  };
}

export function useKPIsComercial(
  unidadeId: string | 'todos' = 'todos',
  ano?: number,
  mes?: number,
): UseKPIsComercialResult {
  const [data, setData] = useState<KPIsComercial | null>(null);
  const [dataByUnidade, setDataByUnidade] = useState<KPIsComercial[]>([]);
  const [leadsPorCanal, setLeadsPorCanal] = useState<LeadsPorCanal[]>([]);
  const [matriculasPorProfessor, setMatriculasPorProfessor] = useState<MatriculasPorProfessor[]>([]);
  const [funnelData, setFunnelData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const currentYear = ano || new Date().getFullYear();
  const currentMonth = mes || new Date().getMonth() + 1;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(
        new Date(currentYear, currentMonth, 0).getDate(),
      ).padStart(2, '0')}`;

      const [resumoV2, diagnosticoV2] = await Promise.all([
        fetchComercialOperacionalResumoV2({
          unidadeId,
          ano: currentYear,
          mesInicio: currentMonth,
          mesFim: currentMonth,
        }),
        fetchExperimentaisDiagnosticoComercialV2({
          unidadeId,
          ano: currentYear,
          mesInicio: currentMonth,
          mesFim: currentMonth,
        }),
      ]);

      let leadsArquivadosQuery = supabase
        .from('leads')
        .select('id, quantidade, arquivado, status')
        .gte('data_contato', startDate)
        .lte('data_contato', endDate);

      let matriculasQuery = supabase
        .from('alunos')
        .select('valor_parcela, professores:professor_atual_id(nome)')
        .gte('data_matricula', startDate)
        .lte('data_matricula', endDate);

      if (unidadeId !== 'todos') {
        leadsArquivadosQuery = leadsArquivadosQuery.eq('unidade_id', unidadeId);
        matriculasQuery = matriculasQuery.eq('unidade_id', unidadeId);
      }

      const [{ data: leadsData }, { data: matriculasData }] = await Promise.all([
        leadsArquivadosQuery,
        matriculasQuery,
      ]);

      const leadsArquivados = (leadsData || [])
        .filter((lead: any) => lead.arquivado === true || lead.status === 'arquivado')
        .reduce((acc: number, lead: any) => acc + (Number(lead.quantidade) || 1), 0);

      const matriculas = matriculasData || [];
      const novasMatriculas = matriculas.length;
      const faturamentoNovos = matriculas.reduce(
        (acc: number, matricula: any) => acc + (Number(matricula.valor_parcela) || 0),
        0,
      );

      const canaisMap = new Map<string, number>();
      resumoV2.origemCanal.forEach((item) => {
        canaisMap.set(item.canal, item.leads);
      });

      const profsMap = new Map<string, number>();
      matriculas.forEach((matricula: any) => {
        const prof = matricula.professores?.nome || 'Sem Professor';
        profsMap.set(prof, (profsMap.get(prof) || 0) + 1);
      });

      const totalLeads = resumoV2.leadsEntrantes;
      const presencaConfirmada = diagnosticoV2.realizadasPresencaConfirmada;
      const agendadas = diagnosticoV2.agendadasEventos;

      const consolidado: KPIsComercial = {
        ...buildEmptyKpis(unidadeId, currentYear, currentMonth),
        total_leads: totalLeads,
        leads_arquivados: leadsArquivados,
        experimentais_agendadas: agendadas,
        experimentais_realizadas: presencaConfirmada,
        faltaram: diagnosticoV2.noShowStatusOperacional,
        taxa_showup: agendadas > 0 ? (presencaConfirmada / agendadas) * 100 : 0,
        novas_matriculas: novasMatriculas,
        taxa_conversao_lead_exp: totalLeads > 0 ? (presencaConfirmada / totalLeads) * 100 : 0,
        taxa_conversao_exp_mat: diagnosticoV2.taxaExpMatLiberada
          ? diagnosticoV2.taxaExpMatCanonica || 0
          : 0,
        taxa_conversao_geral: totalLeads > 0 ? (novasMatriculas / totalLeads) * 100 : 0,
        faturamento_novos: faturamentoNovos,
        ticket_medio_novos: novasMatriculas > 0 ? faturamentoNovos / novasMatriculas : 0,
        leads_por_canal: Object.fromEntries(canaisMap),
        matriculas_por_professor: Object.fromEntries(profsMap),
      };

      setData(consolidado);
      setDataByUnidade(
        unidadeId === 'todos'
          ? resumoV2.seriesMensais[0]?.porUnidade.map((item) => ({
              ...buildEmptyKpis(item.unidadeNome, currentYear, currentMonth),
              unidade_id: item.unidadeNome,
              unidade_nome: item.unidadeNome,
              total_leads: item.leadsEntrantes,
            })) || []
          : [consolidado],
      );

      setLeadsPorCanal(
        Array.from(canaisMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      );

      setMatriculasPorProfessor(
        Array.from(profsMap.entries())
          .map(([nome, valor], index) => ({ id: index, nome, valor }))
          .sort((a, b) => b.valor - a.valor),
      );

      setFunnelData([
        { name: 'Leads', value: consolidado.total_leads, color: '#06b6d4' },
        { name: 'Presenca confirmada', value: consolidado.experimentais_realizadas, color: '#8b5cf6' },
        { name: 'Matriculas', value: consolidado.novas_matriculas, color: '#10b981' },
      ]);
    } catch (err) {
      console.error('Erro ao buscar KPIs Comerciais v2:', err);
      setError(err as Error);
      setData(null);
      setDataByUnidade([]);
      setLeadsPorCanal([]);
      setMatriculasPorProfessor([]);
      setFunnelData([]);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, currentYear, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    dataByUnidade,
    leadsPorCanal,
    matriculasPorProfessor,
    funnelData,
    isLoading,
    error,
    refetch: fetchData,
  };
}

export default useKPIsComercial;
