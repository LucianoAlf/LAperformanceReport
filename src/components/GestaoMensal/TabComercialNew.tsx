import { useState, useEffect } from 'react';
import { Phone, Calendar, UserPlus, Percent, DollarSign, TrendingUp, Archive, XCircle, Music, Clock, Users, Target, Baby, GraduationCap, AlertTriangle, Info } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

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
  
  // Matrículas
  novas_matriculas: number;
  matriculas_por_curso: { name: string; value: number }[];
  matriculas_por_canal: { name: string; value: number }[];
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

export function TabComercialNew({ ano, mes, mesFim, unidade }: TabComercialProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('leads');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosComercial | null>(null);
  const [mesFechado, setMesFechado] = useState(false);

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

        // Buscar leads_diarios
        let leadsQuery = supabase
          .from('leads_diarios')
          .select(`
            *,
            canais_origem(nome),
            cursos(nome),
            professores:professor_experimental_id(nome),
            motivos_arquivamento(nome),
            motivos_nao_matricula(nome)
          `)
          .gte('data', startDate)
          .lte('data', endDate);

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

        // Matrículas por Faixa Etária (LA Kids vs LA 12+)
        const matriculasLaKids = matriculas.filter(m => m.idade_atual !== null && m.idade_atual <= 11).length;
        const matriculasLaAdultos = matriculas.filter(m => m.idade_atual !== null && m.idade_atual >= 12).length;

        // Motivos de Não Matrícula (experimentais que não converteram)
        const motivosNaoMatMap = new Map<string, number>();
        leads.filter(l => l.tipo === 'experimental_nao_matriculou' || (l.tipo === 'experimental_realizada' && l.motivo_nao_matricula_id)).forEach(l => {
          const motivo = (l as any).motivos_nao_matricula?.nome || 'Não informado';
          motivosNaoMatMap.set(motivo, (motivosNaoMatMap.get(motivo) || 0) + (l.quantidade || 1));
        });

        // Faturamento - usar dados_mensais para passaporte (dados históricos) ou calcular de matrículas
        const dadosMensais = dadosMensaisData || [];
        const faturamentoPassaportesHistorico = dadosMensais.reduce((acc, dm) => acc + (Number(dm.faturamento_passaporte) || 0), 0);
        const ticketMedioPassaporteHistorico = dadosMensais.length > 0 
          ? dadosMensais.reduce((acc, dm) => acc + (Number(dm.ticket_medio_passaporte) || 0), 0) / dadosMensais.length 
          : 0;
        
        // Calcular de matrículas como fallback
        const faturamentoPassaportesMatriculas = matriculas.reduce((acc, m) => acc + (Number(m.valor_passaporte) || 0), 0);
        const faturamentoParcelas = matriculas.reduce((acc, m) => acc + (Number(m.valor_parcela) || 0), 0);
        const ticketMedioPassaporteMatriculas = matriculas.length > 0 ? faturamentoPassaportesMatriculas / matriculas.length : 0;
        const ticketMedioParcela = matriculas.length > 0 ? faturamentoParcelas / matriculas.length : 0;
        
        // Usar dados históricos se disponíveis, senão calcular de matrículas
        const faturamentoPassaportes = faturamentoPassaportesHistorico > 0 ? faturamentoPassaportesHistorico : faturamentoPassaportesMatriculas;
        const ticketMedioPassaporte = ticketMedioPassaporteHistorico > 0 ? ticketMedioPassaporteHistorico : ticketMedioPassaporteMatriculas;

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
              variant="emerald"
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
              value={formatCurrency(dados.ticket_medio_passaporte)}
              subvalue="Média por matrícula"
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Ticket Parcela"
              value={formatCurrency(dados.ticket_medio_parcela)}
              subvalue="Média por matrícula"
              variant="emerald"
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
            {dados.matriculas_por_canal.length > 0 ? (
              <DistributionChart
                data={dados.matriculas_por_canal}
                title="Matrículas por Canal"
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
