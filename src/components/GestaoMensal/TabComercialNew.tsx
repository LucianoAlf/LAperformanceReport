import { useState, useEffect } from 'react';
import { Phone, Calendar, UserPlus, Percent, DollarSign, TrendingUp, Archive, XCircle, Music, Clock, Users, Target, Baby, GraduationCap, AlertTriangle, Info } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useMetasKPI } from '@/hooks/useMetasKPI';

interface TabComercialProps {
  ano: number;
  mes: number;
  mesFim?: number; // Para filtros de período (trimestre, semestre, anual)
  unidade: string;
}

type SubTabId = 'leads' | 'experimentais' | 'matriculas';

const subTabs = [
  { id: 'leads' as const, label: 'Leads', icon: Phone },
  { id: 'experimentais' as const, label: 'Experimentais', icon: Calendar },
  { id: 'matriculas' as const, label: 'Matrículas', icon: UserPlus },
];

interface DadosComercial {
  // Leads
  total_leads: number;
  leads_arquivados: number;
  leads_ativos: number;
  taxa_conversao_lead_exp: number;
  leads_por_canal: { name: string; value: number }[];
  leads_por_curso: { name: string; value: number }[];
  motivos_arquivamento: { name: string; value: number }[];
  
  // Experimentais
  experimentais_marcadas: number;
  experimentais_realizadas: number;
  faltaram: number;
  taxa_showup: number;
  taxa_conversao_exp_mat: number;
  experimentais_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  experimentais_por_canal: { name: string; value: number }[];
  
  // Matrículas
  novas_matriculas: number;
  matriculas_por_curso: { name: string; value: number }[];
  matriculas_por_canal: { name: string; value: number }[];
  matriculas_por_canal_origem: { name: string; value: number }[];
  matriculas_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  matriculas_por_horario: { name: string; value: number }[];
  matriculas_por_faixa_etaria: { name: string; value: number }[];
  ticket_medio_passaporte: number;
  ticket_medio_parcela: number;
  motivos_nao_matricula: { name: string; value: number }[];
  
  // Faturamento
  faturamento_passaportes: number;
  faturamento_parcelas: number;
  faturamento_total: number;
  projecao_mensal: number;
}

// Interface para dados comparativos
interface DadosComparativo {
  total_leads: number;
  experimentais_realizadas: number;
  novas_matriculas: number;
  ticket_medio_parcela: number;
  ticket_medio_passaporte: number;
  label: string;
}

export function TabComercialNew({ ano, mes, mesFim, unidade }: TabComercialProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('leads');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosComercial | null>(null);
  
  // Buscar metas do período
  const unidadeIdParaMetas = unidade === 'todos' ? null : unidade;
  const { metas } = useMetasKPI(unidadeIdParaMetas, ano, mes);
  const [mesFechado, setMesFechado] = useState(false);
  
  // Estados para comparativos históricos
  const [dadosMesAnterior, setDadosMesAnterior] = useState<DadosComparativo | null>(null);
  const [dadosAnoAnterior, setDadosAnoAnterior] = useState<DadosComparativo | null>(null);

  // Usar mesFim se fornecido, senão usar mes (para filtro mensal)
  const mesInicio = mes;
  const mesFinal = mesFim || mes;

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Calcular datas de início e fim do período
        const startDate = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
        const ultimoDia = new Date(ano, mesFinal, 0).getDate();
        const endDate = `${ano}-${String(mesFinal).padStart(2, '0')}-${ultimoDia}`;

        // Detectar se é período histórico (antes do mês atual)
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const isHistorico = ano < currentYear || (ano === currentYear && mesFinal < currentMonth);

        // ========== BUSCAR DADOS COMPARATIVOS (Mês Anterior e Ano Anterior) ==========
        const mesAnterior = mes === 1 ? 12 : mes - 1;
        const anoMesAnterior = mes === 1 ? ano - 1 : ano;
        
        // Mapeamento de unidades para nomes
        const unidadeNomesMap: Record<string, string> = {
          '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
          '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
          '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra'
        };

        // Buscar dados do mês anterior de dados_comerciais
        let mesAnteriorQuery = supabase
          .from('dados_comerciais')
          .select('*')
          .eq('competencia', `${anoMesAnterior}-${String(mesAnterior).padStart(2, '0')}-01`);

        if (unidade !== 'todos') {
          mesAnteriorQuery = mesAnteriorQuery.eq('unidade', unidadeNomesMap[unidade] || unidade);
        }

        // Buscar dados do mesmo mês do ano anterior
        let anoAnteriorQuery = supabase
          .from('dados_comerciais')
          .select('*')
          .eq('competencia', `${ano - 1}-${String(mes).padStart(2, '0')}-01`);

        if (unidade !== 'todos') {
          anoAnteriorQuery = anoAnteriorQuery.eq('unidade', unidadeNomesMap[unidade] || unidade);
        }

        // Também buscar de dados_mensais para matrículas (tem dados de 2024)
        let mesAnteriorMensalQuery = supabase
          .from('dados_mensais')
          .select('novas_matriculas, ticket_medio')
          .eq('ano', anoMesAnterior)
          .eq('mes', mesAnterior);

        if (unidade !== 'todos') {
          mesAnteriorMensalQuery = mesAnteriorMensalQuery.eq('unidade_id', unidade);
        }

        let anoAnteriorMensalQuery = supabase
          .from('dados_mensais')
          .select('novas_matriculas, ticket_medio')
          .eq('ano', ano - 1)
          .eq('mes', mes);

        if (unidade !== 'todos') {
          anoAnteriorMensalQuery = anoAnteriorMensalQuery.eq('unidade_id', unidade);
        }

        const [mesAnteriorResult, anoAnteriorResult, mesAnteriorMensalResult, anoAnteriorMensalResult] = await Promise.all([
          mesAnteriorQuery,
          anoAnteriorQuery,
          mesAnteriorMensalQuery,
          anoAnteriorMensalQuery
        ]);

        // Consolidar dados do mês anterior
        const dadosMesAnt = mesAnteriorResult.data || [];
        const dadosMesAntMensal = mesAnteriorMensalResult.data || [];
        if (dadosMesAnt.length > 0 || dadosMesAntMensal.length > 0) {
          const totalLeadsMesAnt = dadosMesAnt.reduce((acc, d) => acc + (d.total_leads || 0), 0);
          const expMesAnt = dadosMesAnt.reduce((acc, d) => acc + (d.aulas_experimentais || 0), 0);
          const matMesAnt = dadosMesAnt.length > 0 
            ? dadosMesAnt.reduce((acc, d) => acc + (d.novas_matriculas_total || 0), 0)
            : dadosMesAntMensal.reduce((acc, d) => acc + (d.novas_matriculas || 0), 0);
          const ticketParcelaMesAnt = dadosMesAnt.length > 0 && dadosMesAnt.some(d => d.ticket_medio_parcelas)
            ? dadosMesAnt.reduce((acc, d) => acc + (Number(d.ticket_medio_parcelas) || 0), 0) / dadosMesAnt.filter(d => d.ticket_medio_parcelas).length
            : dadosMesAntMensal.length > 0 
              ? dadosMesAntMensal.reduce((acc, d) => acc + (Number(d.ticket_medio) || 0), 0) / dadosMesAntMensal.length
              : 0;
          const ticketPassMesAnt = dadosMesAnt.length > 0 && dadosMesAnt.some(d => d.ticket_medio_passaporte)
            ? dadosMesAnt.reduce((acc, d) => acc + (Number(d.ticket_medio_passaporte) || 0), 0) / dadosMesAnt.filter(d => d.ticket_medio_passaporte).length
            : 0;

          setDadosMesAnterior({
            total_leads: totalLeadsMesAnt,
            experimentais_realizadas: expMesAnt,
            novas_matriculas: matMesAnt,
            ticket_medio_parcela: ticketParcelaMesAnt,
            ticket_medio_passaporte: ticketPassMesAnt,
            label: `${getMesNomeCurto(mesAnterior)}/${String(anoMesAnterior).slice(2)}`,
          });
        } else {
          setDadosMesAnterior(null);
        }

        // Consolidar dados do ano anterior
        const dadosAnoAnt = anoAnteriorResult.data || [];
        const dadosAnoAntMensal = anoAnteriorMensalResult.data || [];
        if (dadosAnoAnt.length > 0 || dadosAnoAntMensal.length > 0) {
          const totalLeadsAnoAnt = dadosAnoAnt.reduce((acc, d) => acc + (d.total_leads || 0), 0);
          const expAnoAnt = dadosAnoAnt.reduce((acc, d) => acc + (d.aulas_experimentais || 0), 0);
          const matAnoAnt = dadosAnoAnt.length > 0 
            ? dadosAnoAnt.reduce((acc, d) => acc + (d.novas_matriculas_total || 0), 0)
            : dadosAnoAntMensal.reduce((acc, d) => acc + (d.novas_matriculas || 0), 0);
          const ticketParcelaAnoAnt = dadosAnoAnt.length > 0 && dadosAnoAnt.some(d => d.ticket_medio_parcelas)
            ? dadosAnoAnt.reduce((acc, d) => acc + (Number(d.ticket_medio_parcelas) || 0), 0) / dadosAnoAnt.filter(d => d.ticket_medio_parcelas).length
            : dadosAnoAntMensal.length > 0 
              ? dadosAnoAntMensal.reduce((acc, d) => acc + (Number(d.ticket_medio) || 0), 0) / dadosAnoAntMensal.length
              : 0;
          const ticketPassAnoAnt = dadosAnoAnt.length > 0 && dadosAnoAnt.some(d => d.ticket_medio_passaporte)
            ? dadosAnoAnt.reduce((acc, d) => acc + (Number(d.ticket_medio_passaporte) || 0), 0) / dadosAnoAnt.filter(d => d.ticket_medio_passaporte).length
            : 0;

          setDadosAnoAnterior({
            total_leads: totalLeadsAnoAnt,
            experimentais_realizadas: expAnoAnt,
            novas_matriculas: matAnoAnt,
            ticket_medio_parcela: ticketParcelaAnoAnt,
            ticket_medio_passaporte: ticketPassAnoAnt,
            label: `${getMesNomeCurto(mes)}/${String(ano - 1).slice(2)}`,
          });
        } else {
          setDadosAnoAnterior(null);
        }

        // Se for período histórico, buscar dados da view histórica
        if (isHistorico) {
          // Buscar dados históricos consolidados
          let historicoQuery = supabase
            .from('vw_kpis_comercial_historico')
            .select('*')
            .eq('ano', ano)
            .gte('mes', mesInicio)
            .lte('mes', mesFinal);

          if (unidade !== 'todos') {
            historicoQuery = historicoQuery.eq('unidade_id', unidade);
          }

          // Buscar origem dos leads históricos
          let origemQuery = supabase
            .from('origem_leads')
            .select('*')
            .gte('competencia', startDate)
            .lte('competencia', endDate);

          if (unidade !== 'todos') {
            // origem_leads usa nome da unidade, não UUID
            const unidadeNomes: Record<string, string> = {
              '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
              '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
              '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra'
            };
            origemQuery = origemQuery.eq('unidade', unidadeNomes[unidade] || unidade);
          }

          // Buscar experimentais por professor históricos
          let expProfQuery = supabase
            .from('experimentais_professor_mensal')
            .select('*, professores(nome)')
            .eq('ano', ano)
            .gte('mes', mesInicio)
            .lte('mes', mesFinal);

          if (unidade !== 'todos') {
            expProfQuery = expProfQuery.eq('unidade_id', unidade);
          }

          // Buscar cursos matriculados históricos
          let cursosMatQuery = supabase
            .from('cursos_matriculados')
            .select('*')
            .gte('competencia', startDate)
            .lte('competencia', endDate);

          if (unidade !== 'todos') {
            const unidadeNomes: Record<string, string> = {
              '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
              '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
              '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra'
            };
            cursosMatQuery = cursosMatQuery.eq('unidade', unidadeNomes[unidade] || unidade);
          }

          const [historicoResult, origemResult, expProfResult, cursosMatResult] = await Promise.all([
            historicoQuery,
            origemQuery,
            expProfQuery,
            cursosMatQuery
          ]);

          const historico = historicoResult.data || [];
          const origemLeads = origemResult.data || [];
          const expProf = expProfResult.data || [];
          const cursosMat = cursosMatResult.data || [];

          // Consolidar dados históricos
          const totalLeads = historico.reduce((acc, h) => acc + (h.total_leads || 0), 0);
          const expRealizadas = historico.reduce((acc, h) => acc + (h.experimentais_realizadas || 0), 0);
          const novasMatriculas = historico.reduce((acc, h) => acc + (h.novas_matriculas_total || 0), 0);
          const matriculasLamk = historico.reduce((acc, h) => acc + (h.novas_matriculas_lamk || 0), 0);
          const matriculasEmla = historico.reduce((acc, h) => acc + (h.novas_matriculas_emla || 0), 0);
          const ticketMedioParcela = historico.length > 0 
            ? historico.reduce((acc, h) => acc + (Number(h.ticket_medio_parcelas) || 0), 0) / historico.filter(h => h.ticket_medio_parcelas).length || 0
            : 0;
          const ticketMedioPassaporte = historico.length > 0 
            ? historico.reduce((acc, h) => acc + (Number(h.ticket_medio_passaporte) || 0), 0) / historico.filter(h => h.ticket_medio_passaporte).length || 0
            : 0;
          const faturamentoPassaportes = historico.reduce((acc, h) => acc + (Number(h.faturamento_passaporte) || 0), 0);

          // Processar origem dos leads
          const leadsCanaisMap = new Map<string, number>();
          const expCanaisMap = new Map<string, number>();
          const matCanaisMap = new Map<string, number>();
          origemLeads.forEach(o => {
            if (o.tipo === 'leads') leadsCanaisMap.set(o.canal, (leadsCanaisMap.get(o.canal) || 0) + (o.quantidade || 0));
            if (o.tipo === 'experimentais') expCanaisMap.set(o.canal, (expCanaisMap.get(o.canal) || 0) + (o.quantidade || 0));
            if (o.tipo === 'matriculas') matCanaisMap.set(o.canal, (matCanaisMap.get(o.canal) || 0) + (o.quantidade || 0));
          });

          // Processar experimentais por professor
          const expProfMap = new Map<string, { id: number; total: number }>();
          expProf.forEach(e => {
            const nome = (e.professores as any)?.nome || 'Desconhecido';
            const current = expProfMap.get(nome) || { id: e.professor_id || 0, total: 0 };
            current.total += e.experimentais || 0;
            expProfMap.set(nome, current);
          });

          // Processar cursos matriculados
          const cursosMatMap = new Map<string, number>();
          cursosMat.forEach(c => {
            cursosMatMap.set(c.curso, (cursosMatMap.get(c.curso) || 0) + (c.quantidade || 0));
          });

          setMesFechado(true); // Dados históricos são sempre "fechados"

          setDados({
            // Leads
            total_leads: totalLeads,
            leads_arquivados: 0, // Não disponível no histórico
            leads_ativos: totalLeads,
            taxa_conversao_lead_exp: totalLeads > 0 ? (expRealizadas / totalLeads) * 100 : 0,
            leads_por_canal: Array.from(leadsCanaisMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            leads_por_curso: [], // Não disponível no histórico
            motivos_arquivamento: [], // Não disponível no histórico
            
            // Experimentais
            experimentais_marcadas: expRealizadas, // Só temos realizadas no histórico
            experimentais_realizadas: expRealizadas,
            faltaram: 0, // Não disponível no histórico
            taxa_showup: 100, // Não disponível no histórico
            taxa_conversao_exp_mat: expRealizadas > 0 ? (novasMatriculas / expRealizadas) * 100 : 0,
            experimentais_por_professor: Array.from(expProfMap.entries()).map(([nome, data]) => ({
              id: data.id,
              nome,
              valor: data.total,
              subvalor: ''
            })).sort((a, b) => b.valor - a.valor),
            experimentais_por_canal: Array.from(expCanaisMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            
            // Matrículas
            novas_matriculas: novasMatriculas,
            matriculas_por_curso: Array.from(cursosMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            matriculas_por_canal: Array.from(matCanaisMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            matriculas_por_canal_origem: Array.from(matCanaisMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            matriculas_por_professor: [], // Não disponível no histórico
            matriculas_por_horario: [], // Não disponível no histórico
            matriculas_por_faixa_etaria: [
              { name: 'LA Music Kids (até 11)', value: matriculasLamk },
              { name: 'LA Music School (12+)', value: matriculasEmla },
            ],
            ticket_medio_passaporte: ticketMedioPassaporte,
            ticket_medio_parcela: ticketMedioParcela,
            motivos_nao_matricula: [], // Não disponível no histórico
            
            // Faturamento
            faturamento_passaportes: faturamentoPassaportes,
            faturamento_parcelas: novasMatriculas * ticketMedioParcela,
            faturamento_total: faturamentoPassaportes + (novasMatriculas * ticketMedioParcela),
            projecao_mensal: (novasMatriculas * ticketMedioParcela) * 12,
          });

          setLoading(false);
          return; // Sair da função, dados históricos já processados
        }

        // ========== CÓDIGO ORIGINAL PARA PERÍODO ATUAL ==========
        // Buscar leads
        let leadsQuery = supabase
          .from('leads')
          .select(`
            *,
            canais_origem(nome),
            cursos(nome),
            professores:professor_experimental_id(nome),
            motivos_arquivamento(nome),
            motivos_nao_matricula(nome)
          `)
          .gte('data_contato', startDate)
          .lte('data_contato', endDate);

        if (unidade !== 'todos') {
          leadsQuery = leadsQuery.eq('unidade_id', unidade);
        }

        const { data: leadsData, error: leadsError } = await leadsQuery;

        if (leadsError) throw leadsError;

        // Buscar dados mensais para ticket de passaporte (dados históricos)
        let dadosMensaisQuery = supabase
          .from('dados_mensais')
          .select('ticket_medio_passaporte, faturamento_passaporte, unidade_id')
          .eq('ano', ano)
          .gte('mes', mesInicio)
          .lte('mes', mesFinal);

        if (unidade !== 'todos') {
          dadosMensaisQuery = dadosMensaisQuery.eq('unidade_id', unidade);
        }

        const { data: dadosMensaisData } = await dadosMensaisQuery;

        // Verificar se o mês está fechado (tem dados em dados_mensais)
        const temDadosMes = dadosMensaisData && dadosMensaisData.length > 0 && 
          dadosMensaisData.some(d => d.ticket_medio_passaporte !== null && d.ticket_medio_passaporte > 0);
        setMesFechado(temDadosMes);

        // Buscar matrículas do mês
        let matriculasQuery = supabase
          .from('alunos')
          .select(`
            *,
            cursos(nome),
            canais_origem(nome),
            professores:professor_atual_id(nome)
          `)
          .gte('data_matricula', startDate)
          .lte('data_matricula', endDate);

        if (unidade !== 'todos') {
          matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
        }

        const { data: matriculasData, error: matriculasError } = await matriculasQuery;

        if (matriculasError) throw matriculasError;

        const leads = leadsData || [];
        const matriculas = matriculasData || [];

        // Processar Leads
        const totalLeads = leads.filter(l => ['novo','agendado'].includes(l.status)).reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const leadsArquivados = leads.filter(l => l.arquivado === true).reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const expMarcadas = leads.filter(l => l.status === 'experimental_agendada').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        // REGRA DE NEGÓCIO: Exp/Visita = realizada + visita_escola (não inclui agendada/faltou)
        const expRealizadas = leads.filter(l => ['experimental_realizada','compareceu','visita_escola'].includes(l.status)).reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const faltaram = leads.filter(l => l.status === 'experimental_faltou').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const novasMatriculas = leads.filter(l => ['matriculado','convertido'].includes(l.status)).reduce((acc, l) => acc + (l.quantidade || 1), 0) || matriculas.length;

        // Leads por Canal
        const canaisMap = new Map<string, number>();
        leads.filter(l => ['novo','agendado'].includes(l.status)).forEach(l => {
          const canal = (l.canais_origem as any)?.nome || 'Outros';
          canaisMap.set(canal, (canaisMap.get(canal) || 0) + (l.quantidade || 1));
        });

        // Leads por Curso
        const cursosLeadMap = new Map<string, number>();
        leads.filter(l => ['novo','agendado'].includes(l.status)).forEach(l => {
          const curso = (l.cursos as any)?.nome || 'Não informado';
          cursosLeadMap.set(curso, (cursosLeadMap.get(curso) || 0) + (l.quantidade || 1));
        });

        // Motivos Arquivamento
        const motivosArqMap = new Map<string, number>();
        leads.filter(l => l.arquivado).forEach(l => {
          const motivo = (l.motivos_arquivamento as any)?.nome || 'Outros';
          motivosArqMap.set(motivo, (motivosArqMap.get(motivo) || 0) + (l.quantidade || 1));
        });

        // Experimentais por Professor
        const expProfMap = new Map<string, { id: number; total: number; convertidas: number }>();
        leads.filter(l => ['experimental_realizada','compareceu','matriculado','convertido'].includes(l.status)).forEach(l => {
          const prof = (l.professores as any)?.nome || 'Sem Professor';
          const profId = l.professor_experimental_id || 0;
          const current = expProfMap.get(prof) || { id: profId, total: 0, convertidas: 0 };
          current.total += l.quantidade || 1;
          if (['matriculado','convertido'].includes(l.status)) current.convertidas += l.quantidade || 1;
          expProfMap.set(prof, current);
        });

        // Experimentais por Canal (origem das pessoas que fizeram experimentais)
        const expCanalMap = new Map<string, number>();
        leads.filter(l => ['experimental_realizada','compareceu'].includes(l.status)).forEach(l => {
          const canal = (l.canais_origem as any)?.nome || 'Outros';
          expCanalMap.set(canal, (expCanalMap.get(canal) || 0) + (l.quantidade || 1));
        });

        // CORREÇÃO: Usar leads convertidos (não alunos.data_matricula) para gráficos de matrículas
        // Isso garante consistência com o funil comercial (5 matrículas, não 36)
        const leadsMatriculados = leads.filter(l => ['matriculado', 'convertido'].includes(l.status));

        // Matrículas por Curso (via leads convertidos)
        const cursoMatMap = new Map<string, number>();
        leadsMatriculados.forEach(l => {
          const curso = (l as any).cursos?.nome || 'Não informado';
          cursoMatMap.set(curso, (cursoMatMap.get(curso) || 0) + (l.quantidade || 1));
        });

        // Matrículas por Canal (via leads convertidos)
        const canalMatMap = new Map<string, number>();
        leadsMatriculados.forEach(l => {
          const canal = (l as any).canais_origem?.nome || 'Outros';
          canalMatMap.set(canal, (canalMatMap.get(canal) || 0) + (l.quantidade || 1));
        });

        // Matrículas por Professor (via leads convertidos - professor da experimental)
        const profMatMap = new Map<string, { id: number; count: number }>();
        leadsMatriculados.forEach(l => {
          const prof = (l as any).professores?.nome || 'Sem Professor';
          const profId = l.professor_id || 0;
          const current = profMatMap.get(prof) || { id: profId, count: 0 };
          current.count += (l.quantidade || 1);
          profMatMap.set(prof, current);
        });

        // Matrículas por Horário (via leads convertidos)
        const horarioMap = new Map<string, number>();
        leadsMatriculados.forEach(l => {
          const hora = l.horario_preferido ? (parseInt(l.horario_preferido.split(':')[0]) < 12 ? 'Manhã' : parseInt(l.horario_preferido.split(':')[0]) < 18 ? 'Tarde' : 'Noite') : 'Não informado';
          horarioMap.set(hora, (horarioMap.get(hora) || 0) + (l.quantidade || 1));
        });

        // Matrículas por Faixa Etária (LA Kids vs LA 12+) - usar leads convertidos, mesma lógica do Funil
        const leadsConvertidosFaixa = leads.filter(l => ['matriculado', 'convertido'].includes(l.status));
        const matriculasLaKids = leadsConvertidosFaixa.filter(l => l.idade !== null && l.idade <= 11).reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const matriculasLaAdultos = leadsConvertidosFaixa.filter(l => l.idade !== null && l.idade > 11).reduce((acc, l) => acc + (l.quantidade || 1), 0);

        // Motivos de Não Matrícula (experimentais que não converteram)
        const motivosNaoMatMap = new Map<string, number>();
        leads.filter(l => l.status === 'experimental_nao_matriculou' || (l.status === 'experimental_realizada' && l.motivo_nao_matricula_id)).forEach(l => {
          const motivo = (l as any).motivos_nao_matricula?.nome || 'Não informado';
          motivosNaoMatMap.set(motivo, (motivosNaoMatMap.get(motivo) || 0) + (l.quantidade || 1));
        });

        // Faturamento - calcular de leads convertidos (mesma lógica do Funil/ComercialPage)
        const leadsConvertidos = leads.filter(l => ['matriculado', 'convertido'].includes(l.status));
        
        // Regra de negócio: matrículas com passaporte zerado (ex: re-matrícula) não entram no ticket médio
        const leadsComPassaporte = leadsConvertidos.filter(l => (Number(l.valor_passaporte) || 0) > 0);
        const faturamentoPassaportes = leadsComPassaporte.reduce((acc, l) => acc + (Number(l.valor_passaporte) || 0), 0);
        const faturamentoParcelas = leadsConvertidos.reduce((acc, l) => acc + (Number(l.valor_parcela) || 0), 0);
        const ticketMedioPassaporte = leadsComPassaporte.length > 0 ? faturamentoPassaportes / leadsComPassaporte.length : 0;
        const ticketMedioParcela = leadsConvertidos.length > 0 ? faturamentoParcelas / leadsConvertidos.length : 0;

        setDados({
          // Leads
          total_leads: totalLeads,
          leads_arquivados: leadsArquivados,
          leads_ativos: totalLeads - leadsArquivados - expMarcadas,
          taxa_conversao_lead_exp: totalLeads > 0 ? (expRealizadas / totalLeads) * 100 : 0,
          leads_por_canal: Array.from(canaisMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          leads_por_curso: Array.from(cursosLeadMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          motivos_arquivamento: Array.from(motivosArqMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          
          // Experimentais
          experimentais_marcadas: expMarcadas + expRealizadas + faltaram,
          experimentais_realizadas: expRealizadas,
          faltaram: faltaram,
          taxa_showup: (expMarcadas + expRealizadas + faltaram) > 0 ? (expRealizadas / (expMarcadas + expRealizadas + faltaram)) * 100 : 0,
          taxa_conversao_exp_mat: expRealizadas > 0 ? (novasMatriculas / expRealizadas) * 100 : 0,
          experimentais_por_professor: Array.from(expProfMap.entries()).map(([nome, data]) => ({
            id: data.id,
            nome,
            valor: data.total,
            subvalor: `${data.convertidas} matrículas (${data.total > 0 ? ((data.convertidas / data.total) * 100).toFixed(0) : 0}%)`
          })).sort((a, b) => b.valor - a.valor),
          experimentais_por_canal: Array.from(expCanalMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          
          // Matrículas
          novas_matriculas: novasMatriculas || matriculas.length,
          matriculas_por_curso: Array.from(cursoMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_canal: Array.from(canalMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_canal_origem: Array.from(canalMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_professor: Array.from(profMatMap.entries()).map(([nome, data]) => ({
            id: data.id,
            nome,
            valor: data.count,
          })).sort((a, b) => b.valor - a.valor),
          matriculas_por_horario: Array.from(horarioMap.entries()).map(([name, value]) => ({ name, value })),
          matriculas_por_faixa_etaria: [
            { name: 'LA Music Kids (até 11)', value: matriculasLaKids },
            { name: 'LA Music School (12+)', value: matriculasLaAdultos },
          ],
          ticket_medio_passaporte: ticketMedioPassaporte,
          ticket_medio_parcela: ticketMedioParcela,
          motivos_nao_matricula: Array.from(motivosNaoMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          
          // Faturamento
          faturamento_passaportes: faturamentoPassaportes,
          faturamento_parcelas: faturamentoParcelas,
          faturamento_total: faturamentoPassaportes + faturamentoParcelas,
          projecao_mensal: faturamentoParcelas * 12, // Projeção anual das parcelas
        });

      } catch (err) {
        console.error('Erro ao carregar dados comerciais:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mesInicio, mesFinal, unidade]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="text-center text-slate-400 py-12">
        Nenhum dado encontrado para o período selecionado.
      </div>
    );
  }

  // Componente de estado vazio informativo
  const EstadoVazio = ({ titulo, mensagem }: { titulo: string; mensagem: string }) => (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-8 text-center">
      <Info className="w-12 h-12 text-slate-500 mx-auto mb-3" />
      <h4 className="text-slate-300 font-medium mb-2">{titulo}</h4>
      <p className="text-slate-400 text-sm">{mensagem}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1 flex-wrap">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeSubTab === tab.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-aba: Leads */}
      {activeSubTab === 'leads' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>Mês não fechado:</strong> Os dados de {getMesNomeCurto(mes)}/{ano} ainda não foram populados. Novas Matrículas, Evasões e Saldo Líquido mostram dados do mês atual em andamento.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Phone}
              label="Total Leads"
              value={dados.total_leads}
              target={metas.leads}
              format="number"
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.total_leads, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.total_leads, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Archive}
              label="Leads Arquivados"
              value={dados.leads_arquivados}
              subvalue={`${dados.total_leads > 0 ? ((dados.leads_arquivados / dados.total_leads) * 100).toFixed(0) : 0}% do total`}
              variant="amber"
            />
            <KPICard
              icon={TrendingUp}
              label="Leads Ativos"
              value={dados.leads_ativos}
              variant="emerald"
            />
            <KPICard
              icon={Percent}
              label="Conversão Lead → Exp"
              value={dados.taxa_conversao_lead_exp}
              target={metas.taxa_lead_exp}
              format="percent"
              variant="violet"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {dados.leads_por_canal.length > 0 ? (
              <DistributionChart
                data={dados.leads_por_canal}
                title="Leads por Canal"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum lead registrado no período selecionado."
              />
            )}
            {dados.leads_por_curso.length > 0 ? (
              <DistributionChart
                data={dados.leads_por_curso}
                title="Leads por Curso de Interesse"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum lead com curso de interesse registrado."
              />
            )}
            {dados.motivos_arquivamento.length > 0 ? (
              <DistributionChart
                data={dados.motivos_arquivamento}
                title="Motivos de Arquivamento"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum lead arquivado no período."
              />
            )}
          </div>
        </div>
      )}

      {/* Sub-aba: Experimentais */}
      {activeSubTab === 'experimentais' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>Mês não fechado:</strong> Os dados de {getMesNomeCurto(mes)}/{ano} ainda não foram populados. Novas Matrículas, Evasões e Saldo Líquido mostram dados do mês atual em andamento.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Calendar}
              label="Aulas Marcadas"
              value={dados.experimentais_marcadas}
              variant="cyan"
            />
            <KPICard
              icon={Calendar}
              label="Aulas Realizadas"
              value={dados.experimentais_realizadas}
              target={metas.experimentais}
              format="number"
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.experimentais_realizadas, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.experimentais_realizadas, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={XCircle}
              label="Faltaram"
              value={dados.faltaram}
              variant="rose"
            />
            <KPICard
              icon={Percent}
              label="Taxa Show-up"
              value={dados.taxa_showup}
              format="percent"
              variant="violet"
            />
            <KPICard
              icon={Target}
              label="Conversão Exp → Mat"
              value={dados.taxa_conversao_exp_mat}
              target={metas.taxa_exp_mat}
              format="percent"
              variant="emerald"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FunnelChart
              steps={[
                { label: 'Leads', value: dados.total_leads, color: '#06b6d4' },
                { label: 'Experimentais', value: dados.experimentais_realizadas, color: '#8b5cf6' },
                { label: 'Matrículas', value: dados.novas_matriculas, color: '#10b981' },
              ]}
              title="Funil de Conversão"
            />
            {dados.experimentais_por_canal.length > 0 ? (
              <DistributionChart
                data={dados.experimentais_por_canal}
                title="Experimentais por Canal"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhuma experimental com canal de origem registrado."
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dados.experimentais_por_professor.length > 0 ? (
              <RankingTable
                data={dados.experimentais_por_professor}
                title="Experimentais por Professor"
                valorLabel="Aulas"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhuma aula experimental com professor vinculado no período."
              />
            )}
          </div>
        </div>
      )}

      {/* Sub-aba: Matrículas */}
      {activeSubTab === 'matriculas' && (
        <div className="space-y-6">
          {/* Aviso se o mês não está fechado */}
          {!mesFechado && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-amber-200 text-sm">
                <strong>Mês não fechado:</strong> Os dados de {getMesNomeCurto(mes)}/{ano} ainda não foram populados. Novas Matrículas, Evasões e Saldo Líquido mostram dados do mês atual em andamento.
              </p>
            </div>
          )}
          {/* Linha 1: Quantidade e Receitas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={UserPlus}
              label="Novas Matrículas"
              value={dados.novas_matriculas}
              target={metas.matriculas}
              format="number"
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior ? { valor: dadosMesAnterior.novas_matriculas, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior ? { valor: dadosAnoAnterior.novas_matriculas, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={DollarSign}
              label="Receita Passaportes"
              value={formatCurrency(dados.faturamento_passaportes)}
              subvalue={`${dados.novas_matriculas} vendidos`}
              variant="cyan"
            />
            <KPICard
              icon={TrendingUp}
              label="MRR Novos"
              value={formatCurrency(dados.faturamento_parcelas)}
              subvalue="Receita recorrente"
              variant="amber"
            />
            <KPICard
              icon={Clock}
              label="Por Horário"
              value={dados.matriculas_por_horario.length > 0 ? dados.matriculas_por_horario[0].name : '-'}
              subvalue={dados.matriculas_por_horario.length > 0 ? `${dados.matriculas_por_horario[0].value} matrículas` : ''}
              variant="violet"
            />
          </div>

          {/* Linha 2: Tickets e Faixa Etária */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Ticket Passaporte"
              value={dados.ticket_medio_passaporte}
              format="currency"
              subvalue="Média por matrícula"
              variant="cyan"
              comparativoMesAnterior={dadosMesAnterior && dadosMesAnterior.ticket_medio_passaporte > 0 ? { valor: dadosMesAnterior.ticket_medio_passaporte, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior && dadosAnoAnterior.ticket_medio_passaporte > 0 ? { valor: dadosAnoAnterior.ticket_medio_passaporte, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Parcela"
              value={dados.ticket_medio_parcela}
              format="currency"
              subvalue="Média por matrícula"
              variant="emerald"
              comparativoMesAnterior={dadosMesAnterior && dadosMesAnterior.ticket_medio_parcela > 0 ? { valor: dadosMesAnterior.ticket_medio_parcela, label: dadosMesAnterior.label } : undefined}
              comparativoAnoAnterior={dadosAnoAnterior && dadosAnoAnterior.ticket_medio_parcela > 0 ? { valor: dadosAnoAnterior.ticket_medio_parcela, label: dadosAnoAnterior.label } : undefined}
            />
            <KPICard
              icon={Baby}
              label="LA Music Kids"
              value={(dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('Kids'))?.value || 0}
              subvalue={`${dados.novas_matriculas > 0 ? (((dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('Kids'))?.value || 0) / dados.novas_matriculas * 100).toFixed(0) : 0}% das matrículas`}
              variant="rose"
            />
            <KPICard
              icon={GraduationCap}
              label="LA Music School"
              value={(dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('School'))?.value || 0}
              subvalue={`${dados.novas_matriculas > 0 ? (((dados.matriculas_por_faixa_etaria || []).find(f => f.name.includes('School'))?.value || 0) / dados.novas_matriculas * 100).toFixed(0) : 0}% das matrículas`}
              variant="violet"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dados.matriculas_por_curso.length > 0 ? (
              <DistributionChart
                data={dados.matriculas_por_curso}
                title="Matrículas por Curso"
              />
            ) : (
              <EstadoVazio
                titulo="Sem matrículas no período"
                mensagem={`Nenhuma matrícula registrada em ${getMesNomeCurto(mes)}/${ano}. Isso pode indicar período de baixa ou dados ainda não lançados.`}
              />
            )}
            {dados.matriculas_por_canal_origem.length > 0 ? (
              <DistributionChart
                data={dados.matriculas_por_canal_origem}
                title="Matrículas por Canal de Origem"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhuma matrícula com canal de origem registrado."
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(dados.motivos_nao_matricula || []).length > 0 ? (
              <DistributionChart
                data={dados.motivos_nao_matricula || []}
                title="Motivos de Não Matrícula (Experimentais)"
              />
            ) : (
              <EstadoVazio
                titulo="Sem dados para exibir"
                mensagem="Nenhum motivo de não matrícula registrado no período."
              />
            )}
            {(dados.matriculas_por_professor || []).length > 0 ? (
              <RankingTable
                data={dados.matriculas_por_professor || []}
                title="Ranking de Professores Matriculadores"
                valorLabel="Matrículas"
              />
            ) : (
              <EstadoVazio
                titulo="Sem ranking de professores matriculadores"
                mensagem={`Nenhuma matrícula com professor vinculado em ${getMesNomeCurto(mes)}/${ano}.`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TabComercialNew;
