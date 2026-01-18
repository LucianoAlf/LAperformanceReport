import { useState, useEffect } from 'react';
import { Phone, Calendar, UserPlus, Percent, DollarSign, TrendingUp, Archive, XCircle, Music, Clock, Users, Target } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface TabComercialProps {
  ano: number;
  mes: number;
  unidade: string;
}

type SubTabId = 'leads' | 'experimentais' | 'matriculas' | 'faturamento';

const subTabs = [
  { id: 'leads' as const, label: 'Leads', icon: Phone },
  { id: 'experimentais' as const, label: 'Experimentais', icon: Calendar },
  { id: 'matriculas' as const, label: 'Matrículas', icon: UserPlus },
  { id: 'faturamento' as const, label: 'Faturamento', icon: DollarSign },
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
  
  // Matrículas
  novas_matriculas: number;
  matriculas_por_curso: { name: string; value: number }[];
  matriculas_por_canal: { name: string; value: number }[];
  matriculas_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  matriculas_por_horario: { name: string; value: number }[];
  ticket_medio_passaporte: number;
  ticket_medio_parcela: number;
  motivos_nao_matricula: { name: string; value: number }[];
  
  // Faturamento
  faturamento_passaportes: number;
  faturamento_parcelas: number;
  faturamento_total: number;
  projecao_mensal: number;
}

export function TabComercialNew({ ano, mes, unidade }: TabComercialProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('leads');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosComercial | null>(null);

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;

        // Buscar leads_diarios
        let leadsQuery = supabase
          .from('leads_diarios')
          .select(`
            *,
            canais_origem(nome),
            cursos(nome),
            professores:professor_experimental_id(nome),
            motivos_arquivamento(nome)
          `)
          .gte('data', startDate)
          .lte('data', endDate);

        if (unidade !== 'todos') {
          leadsQuery = leadsQuery.eq('unidade_id', unidade);
        }

        const { data: leadsData, error: leadsError } = await leadsQuery;

        if (leadsError) throw leadsError;

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
        const totalLeads = leads.filter(l => l.tipo === 'lead').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const leadsArquivados = leads.filter(l => l.arquivado === true).reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const expMarcadas = leads.filter(l => l.tipo === 'experimental_agendada').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const expRealizadas = leads.filter(l => l.tipo === 'experimental_realizada').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const faltaram = leads.filter(l => l.tipo === 'experimental_faltou').reduce((acc, l) => acc + (l.quantidade || 1), 0);
        const novasMatriculas = leads.filter(l => l.tipo === 'matricula').reduce((acc, l) => acc + (l.quantidade || 1), 0) || matriculas.length;

        // Leads por Canal
        const canaisMap = new Map<string, number>();
        leads.filter(l => l.tipo === 'lead').forEach(l => {
          const canal = (l.canais_origem as any)?.nome || 'Outros';
          canaisMap.set(canal, (canaisMap.get(canal) || 0) + (l.quantidade || 1));
        });

        // Leads por Curso
        const cursosLeadMap = new Map<string, number>();
        leads.filter(l => l.tipo === 'lead').forEach(l => {
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
        leads.filter(l => l.tipo === 'experimental_realizada' || l.tipo === 'matricula').forEach(l => {
          const prof = (l.professores as any)?.nome || 'Sem Professor';
          const profId = l.professor_experimental_id || 0;
          const current = expProfMap.get(prof) || { id: profId, total: 0, convertidas: 0 };
          current.total += l.quantidade || 1;
          if (l.tipo === 'matricula') current.convertidas += l.quantidade || 1;
          expProfMap.set(prof, current);
        });

        // Matrículas por Curso
        const cursoMatMap = new Map<string, number>();
        matriculas.forEach(m => {
          const curso = (m.cursos as any)?.nome || 'Não informado';
          cursoMatMap.set(curso, (cursoMatMap.get(curso) || 0) + 1);
        });

        // Matrículas por Canal
        const canalMatMap = new Map<string, number>();
        matriculas.forEach(m => {
          const canal = (m.canais_origem as any)?.nome || 'Outros';
          canalMatMap.set(canal, (canalMatMap.get(canal) || 0) + 1);
        });

        // Matrículas por Professor
        const profMatMap = new Map<string, { id: number; count: number }>();
        matriculas.forEach(m => {
          const prof = (m.professores as any)?.nome || 'Sem Professor';
          const profId = m.professor_atual_id || 0;
          const current = profMatMap.get(prof) || { id: profId, count: 0 };
          current.count += 1;
          profMatMap.set(prof, current);
        });

        // Matrículas por Horário
        const horarioMap = new Map<string, number>();
        matriculas.forEach(m => {
          const hora = m.horario_aula ? (parseInt(m.horario_aula.split(':')[0]) < 12 ? 'Manhã' : parseInt(m.horario_aula.split(':')[0]) < 18 ? 'Tarde' : 'Noite') : 'Não informado';
          horarioMap.set(hora, (horarioMap.get(hora) || 0) + 1);
        });

        // Motivos de Não Matrícula (experimentais que não converteram)
        const motivosNaoMatMap = new Map<string, number>();
        leads.filter(l => l.tipo === 'experimental_nao_matriculou' || (l.tipo === 'experimental_realizada' && l.motivo_nao_matricula_id)).forEach(l => {
          const motivo = (l as any).motivos_nao_matricula?.nome || 'Não informado';
          motivosNaoMatMap.set(motivo, (motivosNaoMatMap.get(motivo) || 0) + (l.quantidade || 1));
        });

        // Faturamento
        const faturamentoPassaportes = matriculas.reduce((acc, m) => acc + (Number(m.valor_passaporte) || 0), 0);
        const faturamentoParcelas = matriculas.reduce((acc, m) => acc + (Number(m.valor_parcela) || 0), 0);
        const ticketMedioPassaporte = matriculas.length > 0 ? faturamentoPassaportes / matriculas.length : 0;
        const ticketMedioParcela = matriculas.length > 0 ? faturamentoParcelas / matriculas.length : 0;

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
          
          // Matrículas
          novas_matriculas: novasMatriculas || matriculas.length,
          matriculas_por_curso: Array.from(cursoMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_canal: Array.from(canalMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          matriculas_por_professor: Array.from(profMatMap.entries()).map(([nome, data]) => ({
            id: data.id,
            nome,
            valor: data.count,
          })).sort((a, b) => b.valor - a.valor),
          matriculas_por_horario: Array.from(horarioMap.entries()).map(([name, value]) => ({ name, value })),
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
  }, [ano, mes, unidade]);

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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Phone}
              label="Total Leads"
              value={dados.total_leads}
              variant="cyan"
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
              value={`${dados.taxa_conversao_lead_exp.toFixed(1)}%`}
              variant="violet"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <DistributionChart
              data={dados.leads_por_canal}
              title="Leads por Canal"
            />
            <DistributionChart
              data={dados.leads_por_curso}
              title="Leads por Curso de Interesse"
            />
            <DistributionChart
              data={dados.motivos_arquivamento}
              title="Motivos de Arquivamento"
            />
          </div>
        </div>
      )}

      {/* Sub-aba: Experimentais */}
      {activeSubTab === 'experimentais' && (
        <div className="space-y-6">
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
              variant="emerald"
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
              value={`${dados.taxa_showup.toFixed(1)}%`}
              variant="violet"
            />
            <KPICard
              icon={Target}
              label="Conversão Exp → Mat"
              value={`${dados.taxa_conversao_exp_mat.toFixed(1)}%`}
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
            <RankingTable
              data={dados.experimentais_por_professor}
              title="Experimentais por Professor"
              valorLabel="Aulas"
            />
          </div>
        </div>
      )}

      {/* Sub-aba: Matrículas */}
      {activeSubTab === 'matriculas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={UserPlus}
              label="Novas Matrículas"
              value={dados.novas_matriculas}
              variant="emerald"
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Passaporte"
              value={formatCurrency(dados.ticket_medio_passaporte)}
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Parcela"
              value={formatCurrency(dados.ticket_medio_parcela)}
              variant="violet"
            />
            <KPICard
              icon={Clock}
              label="Por Horário"
              value={dados.matriculas_por_horario.length > 0 ? dados.matriculas_por_horario[0].name : '-'}
              subvalue={dados.matriculas_por_horario.length > 0 ? `${dados.matriculas_por_horario[0].value} matrículas` : ''}
              variant="amber"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionChart
              data={dados.matriculas_por_curso}
              title="Matrículas por Curso"
            />
            <DistributionChart
              data={dados.matriculas_por_canal}
              title="Matrículas por Canal"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionChart
              data={dados.motivos_nao_matricula}
              title="Motivos de Não Matrícula (Experimentais)"
            />
            <RankingTable
              data={dados.matriculas_por_professor}
              title="Ranking Matriculadores"
              valorLabel="Matrículas"
            />
          </div>
        </div>
      )}

      {/* Sub-aba: Faturamento */}
      {activeSubTab === 'faturamento' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Passaportes"
              value={formatCurrency(dados.faturamento_passaportes)}
              subvalue={`${dados.novas_matriculas} vendidos`}
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Parcelas (1ª)"
              value={formatCurrency(dados.faturamento_parcelas)}
              subvalue="Primeira mensalidade"
              variant="emerald"
            />
            <KPICard
              icon={DollarSign}
              label="Total Novos"
              value={formatCurrency(dados.faturamento_total)}
              subvalue="Passaportes + Parcelas"
              variant="violet"
            />
            <KPICard
              icon={TrendingUp}
              label="MRR Novos"
              value={formatCurrency(dados.faturamento_parcelas)}
              subvalue="Receita recorrente mensal"
              variant="amber"
            />
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Resumo Financeiro - Novos Alunos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Passaportes vendidos:</span>
                  <span className="text-white font-medium">{dados.novas_matriculas}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ticket médio passaporte:</span>
                  <span className="text-white font-medium">{formatCurrency(dados.ticket_medio_passaporte)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ticket médio parcela:</span>
                  <span className="text-white font-medium">{formatCurrency(dados.ticket_medio_parcela)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Receita passaportes:</span>
                  <span className="text-cyan-400 font-medium">{formatCurrency(dados.faturamento_passaportes)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Receita parcelas:</span>
                  <span className="text-emerald-400 font-medium">{formatCurrency(dados.faturamento_parcelas)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-700 pt-2 mt-2">
                  <span className="text-white font-bold">Total:</span>
                  <span className="text-violet-400 font-bold">{formatCurrency(dados.faturamento_total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TabComercialNew;
