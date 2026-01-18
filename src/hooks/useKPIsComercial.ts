import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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

export function useKPIsComercial(
  unidadeId: string | 'todos' = 'todos',
  ano?: number,
  mes?: number
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
      // Tentar buscar da view primeiro
      let query = supabase
        .from('vw_kpis_comercial_mensal')
        .select('*');

      if (unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data: kpisData, error: kpisError } = await query;

      if (kpisError) {
        // Fallback: buscar dados diretamente das tabelas
        await fetchFromTables();
        return;
      }

      if (kpisData && kpisData.length > 0) {
        setDataByUnidade(kpisData);

        // Consolidar dados
        const consolidado: KPIsComercial = {
          unidade_id: unidadeId === 'todos' ? 'todos' : kpisData[0].unidade_id,
          unidade_nome: unidadeId === 'todos' ? 'Consolidado' : kpisData[0].unidade_nome,
          ano: currentYear,
          mes: currentMonth,
          total_leads: kpisData.reduce((acc, k) => acc + (k.total_leads || 0), 0),
          leads_arquivados: kpisData.reduce((acc, k) => acc + (k.leads_arquivados || 0), 0),
          experimentais_agendadas: kpisData.reduce((acc, k) => acc + (k.experimentais_agendadas || 0), 0),
          experimentais_realizadas: kpisData.reduce((acc, k) => acc + (k.experimentais_realizadas || 0), 0),
          faltaram: kpisData.reduce((acc, k) => acc + (k.faltaram || 0), 0),
          taxa_showup: kpisData.reduce((acc, k) => acc + (k.taxa_showup || 0), 0) / kpisData.length,
          novas_matriculas: kpisData.reduce((acc, k) => acc + (k.novas_matriculas || 0), 0),
          taxa_conversao_lead_exp: kpisData.reduce((acc, k) => acc + (k.taxa_conversao_lead_exp || 0), 0) / kpisData.length,
          taxa_conversao_exp_mat: kpisData.reduce((acc, k) => acc + (k.taxa_conversao_exp_mat || 0), 0) / kpisData.length,
          taxa_conversao_geral: kpisData.reduce((acc, k) => acc + (k.taxa_conversao_geral || 0), 0) / kpisData.length,
          faturamento_novos: kpisData.reduce((acc, k) => acc + (k.faturamento_novos || 0), 0),
          ticket_medio_novos: kpisData.reduce((acc, k) => acc + (k.ticket_medio_novos || 0), 0) / kpisData.length,
          leads_por_canal: {},
          matriculas_por_professor: {},
        };

        // Consolidar leads por canal
        const canaisMap = new Map<string, number>();
        kpisData.forEach(k => {
          if (k.leads_por_canal) {
            Object.entries(k.leads_por_canal).forEach(([canal, count]) => {
              canaisMap.set(canal, (canaisMap.get(canal) || 0) + (count as number));
            });
          }
        });
        consolidado.leads_por_canal = Object.fromEntries(canaisMap);

        // Consolidar matrículas por professor
        const profsMap = new Map<string, number>();
        kpisData.forEach(k => {
          if (k.matriculas_por_professor) {
            Object.entries(k.matriculas_por_professor).forEach(([prof, count]) => {
              profsMap.set(prof, (profsMap.get(prof) || 0) + (count as number));
            });
          }
        });
        consolidado.matriculas_por_professor = Object.fromEntries(profsMap);

        setData(consolidado);

        // Formatar dados para gráficos
        setLeadsPorCanal(
          Array.from(canaisMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
        );

        setMatriculasPorProfessor(
          Array.from(profsMap.entries())
            .map(([nome, valor], index) => ({ id: index, nome, valor }))
            .sort((a, b) => b.valor - a.valor)
        );

        // Criar dados do funil
        setFunnelData([
          { name: 'Leads', value: consolidado.total_leads, color: '#06b6d4' },
          { name: 'Experimentais', value: consolidado.experimentais_realizadas, color: '#8b5cf6' },
          { name: 'Matrículas', value: consolidado.novas_matriculas, color: '#10b981' },
        ]);
      } else {
        await fetchFromTables();
      }

    } catch (err) {
      console.error('Erro ao buscar KPIs Comerciais:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, currentYear, currentMonth]);

  // Fallback: buscar dados diretamente das tabelas
  const fetchFromTables = async () => {
    try {
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;

      // Buscar leads
      let leadsQuery = supabase
        .from('leads')
        .select('*')
        .gte('data_contato', startDate)
        .lte('data_contato', endDate);

      if (unidadeId !== 'todos') {
        leadsQuery = leadsQuery.eq('unidade_id', unidadeId);
      }

      const { data: leadsData } = await leadsQuery;

      // Buscar matrículas
      let matriculasQuery = supabase
        .from('alunos')
        .select('*, professores(nome)')
        .gte('data_matricula', startDate)
        .lte('data_matricula', endDate);

      if (unidadeId !== 'todos') {
        matriculasQuery = matriculasQuery.eq('unidade_id', unidadeId);
      }

      const { data: matriculasData } = await matriculasQuery;

      const leads = leadsData || [];
      const matriculas = matriculasData || [];

      const totalLeads = leads.length;
      const leadsArquivados = leads.filter(l => l.status === 'arquivado').length;
      const expAgendadas = leads.filter(l => l.status === 'experimental_agendada' || l.status === 'experimental_realizada' || l.status === 'matriculado').length;
      const expRealizadas = leads.filter(l => l.status === 'experimental_realizada' || l.status === 'matriculado').length;
      const novasMatriculas = matriculas.length;

      const consolidado: KPIsComercial = {
        unidade_id: unidadeId === 'todos' ? 'todos' : unidadeId,
        unidade_nome: unidadeId === 'todos' ? 'Consolidado' : '',
        ano: currentYear,
        mes: currentMonth,
        total_leads: totalLeads,
        leads_arquivados: leadsArquivados,
        experimentais_agendadas: expAgendadas,
        experimentais_realizadas: expRealizadas,
        faltaram: expAgendadas - expRealizadas,
        taxa_showup: expAgendadas > 0 ? (expRealizadas / expAgendadas) * 100 : 0,
        novas_matriculas: novasMatriculas,
        taxa_conversao_lead_exp: totalLeads > 0 ? (expRealizadas / totalLeads) * 100 : 0,
        taxa_conversao_exp_mat: expRealizadas > 0 ? (novasMatriculas / expRealizadas) * 100 : 0,
        taxa_conversao_geral: totalLeads > 0 ? (novasMatriculas / totalLeads) * 100 : 0,
        faturamento_novos: matriculas.reduce((acc, m) => acc + (m.valor_parcela || 0), 0),
        ticket_medio_novos: novasMatriculas > 0 ? matriculas.reduce((acc, m) => acc + (m.valor_parcela || 0), 0) / novasMatriculas : 0,
        leads_por_canal: {},
        matriculas_por_professor: {},
      };

      // Agrupar leads por canal
      const canaisMap = new Map<string, number>();
      leads.forEach(l => {
        const canal = l.canal_origem || 'Outros';
        canaisMap.set(canal, (canaisMap.get(canal) || 0) + 1);
      });
      consolidado.leads_por_canal = Object.fromEntries(canaisMap);

      // Agrupar matrículas por professor
      const profsMap = new Map<string, number>();
      matriculas.forEach((m: any) => {
        const prof = m.professores?.nome || 'Sem Professor';
        profsMap.set(prof, (profsMap.get(prof) || 0) + 1);
      });
      consolidado.matriculas_por_professor = Object.fromEntries(profsMap);

      setData(consolidado);

      setLeadsPorCanal(
        Array.from(canaisMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      setMatriculasPorProfessor(
        Array.from(profsMap.entries())
          .map(([nome, valor], index) => ({ id: index, nome, valor }))
          .sort((a, b) => b.valor - a.valor)
      );

      setFunnelData([
        { name: 'Leads', value: consolidado.total_leads, color: '#06b6d4' },
        { name: 'Experimentais', value: consolidado.experimentais_realizadas, color: '#8b5cf6' },
        { name: 'Matrículas', value: consolidado.novas_matriculas, color: '#10b981' },
      ]);

    } catch (err) {
      console.error('Erro no fallback de KPIs Comerciais:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, dataByUnidade, leadsPorCanal, matriculasPorProfessor, funnelData, isLoading, error, refetch: fetchData };
}

export default useKPIsComercial;
