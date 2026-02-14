import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, CalendarDays, Building2, GraduationCap, Tag,
  AlertTriangle, Bell, TrendingUp, Target, Zap,
  MessageSquare, PhoneCall, Clock, Ban, Send
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { KPICard } from '@/components/ui/KPICard';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { supabase } from '@/lib/supabase';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import type { LeadCRM } from '../types';

interface DashboardTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

export function DashboardTab({ unidadeId, ano, mes }: DashboardTabProps) {
  const { leads, kpis, funil, loading, error } = useLeadsCRM({ unidadeId, ano, mes });

  // ── Métricas de mensagens (crm_mensagens) ───────────────────────────────
  const [metricasMsgs, setMetricasMsgs] = useState<{
    totalMsgs: number;
    msgsHoje: number;
    mediaMsgsDia: number;
    tempoRespostaReal: string;
  }>({ totalMsgs: 0, msgsHoje: 0, mediaMsgsDia: 0, tempoRespostaReal: '--' });

  useEffect(() => {
    const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const fimMes = mes === 12
      ? `${ano + 1}-01-01`
      : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    const hoje = new Date().toISOString().split('T')[0];

    // Total de mensagens enviadas (saída) no mês
    supabase.from('crm_mensagens')
      .select('id, created_at, direcao', { count: 'exact' })
      .eq('direcao', 'saida')
      .gte('created_at', inicioMes)
      .lt('created_at', fimMes)
      .then(({ count }) => {
        const total = count || 0;
        const diasPassados = Math.max(1, new Date().getDate());
        const msgsHojePromise = supabase.from('crm_mensagens')
          .select('id', { count: 'exact', head: true })
          .eq('direcao', 'saida')
          .gte('created_at', hoje)
          .lt('created_at', hoje + 'T23:59:59');

        msgsHojePromise.then(({ count: countHoje }) => {
          setMetricasMsgs(prev => ({
            ...prev,
            totalMsgs: total,
            msgsHoje: countHoje || 0,
            mediaMsgsDia: Math.round(total / diasPassados),
          }));
        });
      });

    // Tempo médio de resposta real (diferença entre msg entrada e próxima saída)
    supabase.rpc('calcular_tempo_medio_resposta_crm', {
      p_inicio: inicioMes,
      p_fim: fimMes,
    }).then(({ data }) => {
      if (data && data > 0) {
        const min = Math.round(data);
        setMetricasMsgs(prev => ({
          ...prev,
          tempoRespostaReal: min < 60 ? `${min}min` : `${Math.round(min / 60)}h`,
        }));
      }
    });
  }, [ano, mes]);

  // ── Dados de evolução diária ─────────────────────────────────────────────
  const evolucaoDiaria = useMemo(() => {
    if (!leads.length) return [];
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const dados: { dia: string; leads: number; agendados: number; matriculas: number }[] = [];

    for (let d = 1; d <= diasNoMes; d++) {
      const diaStr = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const diaLabel = String(d).padStart(2, '0');

      const leadsNoDia = leads.filter(l => l.data_contato === diaStr).length;
      const agendadosNoDia = leads.filter(l => l.data_experimental === diaStr).length;
      const matriculasNoDia = leads.filter(l => l.data_conversao === diaStr).length;

      dados.push({ dia: diaLabel, leads: leadsNoDia, agendados: agendadosNoDia, matriculas: matriculasNoDia });
    }
    return dados;
  }, [leads, ano, mes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-rose-400 py-12">
        {error}
      </div>
    );
  }

  // Calcular alertas
  const alertas = calcularAlertas(leads);

  // Calcular distribuição por canal
  const leadsPorCanal = calcularDistribuicao(leads, l => (l.canais_origem as any)?.nome || 'Não informado');

  // Calcular KPIs de tagueamento
  const kpisTags = calcularKPIsTags(leads);

  return (
    <div className="space-y-6">
      {/* Alertas do topo */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((alerta, i) => (
            <AlertaBanner key={i} alerta={alerta} index={i} />
          ))}
        </div>
      )}

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          icon={Inbox}
          label="Leads no Mês"
          value={kpis.totalLeads}
          subvalue={`+${kpis.leadsHoje} hoje`}
          variant="cyan"
        />
        <KPICard
          icon={CalendarDays}
          label="Agendadas"
          value={kpis.agendadas}
          subvalue={`${kpis.taxaAgendamento.toFixed(1)}% dos leads`}
          variant="violet"
        />
        <KPICard
          icon={Building2}
          label="Visitaram"
          value={kpis.visitaram}
          subvalue={`${kpis.taxaShowUp.toFixed(1)}% show-up`}
          variant="emerald"
        />
        <KPICard
          icon={GraduationCap}
          label="Matriculados"
          value={kpis.matriculados}
          subvalue={`${kpis.taxaMatricula.toFixed(1)}% conversão`}
          variant="green"
        />
        <KPICard
          icon={Tag}
          label="Tags OK"
          value={`${kpis.taxaTags.toFixed(0)}%`}
          subvalue={`Faltam ${kpis.tagsPendentes} leads`}
          variant={kpis.taxaTags >= 90 ? 'emerald' : kpis.taxaTags >= 70 ? 'amber' : 'rose'}
        />
      </div>

      {/* KPIs de Mensagens */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          icon={Send}
          label="Msgs Enviadas"
          value={metricasMsgs.totalMsgs}
          subvalue={`+${metricasMsgs.msgsHoje} hoje`}
          variant="violet"
        />
        <KPICard
          icon={MessageSquare}
          label="Média/Dia"
          value={metricasMsgs.mediaMsgsDia}
          subvalue="msgs enviadas"
          variant="cyan"
        />
        <KPICard
          icon={Clock}
          label="Tempo Resposta"
          value={metricasMsgs.tempoRespostaReal}
          subvalue="média real"
          variant={metricasMsgs.tempoRespostaReal === '--' ? 'default' : 'emerald'}
        />
        <KPICard
          icon={PhoneCall}
          label="Sem Resposta"
          value={leads.filter(l => l.qtd_tentativas_sem_resposta > 0).length}
          subvalue="leads sem retorno"
          variant="rose"
        />
      </div>

      {/* Meta 30% + Funil Visual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Meta 30% Show-up */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Meta 30% — Show-up Rate</h3>
          </div>
          <div className="flex items-baseline gap-3 mb-4">
            <span className={`text-4xl font-extrabold ${
              kpis.taxaShowUp >= 30 ? 'text-emerald-400' : 
              kpis.taxaShowUp >= 20 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {kpis.taxaShowUp.toFixed(1)}%
            </span>
            <span className="text-slate-500 text-sm">de 30%</span>
          </div>
          <div className="h-4 bg-slate-700/60 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                kpis.taxaShowUp >= 30 ? 'bg-emerald-500' :
                kpis.taxaShowUp >= 20 ? 'bg-amber-500' : 'bg-gradient-to-r from-rose-500 to-amber-500'
              }`}
              style={{ width: `${Math.min((kpis.taxaShowUp / 30) * 100, 100)}%` }}
            />
          </div>
          <div className="flex gap-5 text-xs text-slate-400">
            <span>🔥 Quentes: <strong className="text-white">
              {leads.filter(l => l.temperatura === 'quente').length}
            </strong></span>
            <span>❄️ Frios: <strong className="text-white">
              {leads.filter(l => l.temperatura === 'frio').length}
            </strong></span>
            <span>Faltam: <strong className="text-amber-400">
              {Math.max(0, 30 - kpis.taxaShowUp).toFixed(1)}pp
            </strong></span>
          </div>
        </div>

        {/* Funil Visual */}
        <FunnelChart
          steps={[
            { label: 'Leads', value: funil.leads, color: '#06b6d4' },
            { label: 'Agendadas', value: funil.agendadas, color: '#8b5cf6' },
            { label: 'Visita/Experimental', shortLabel: 'Visita/Exp.', value: funil.visitaram, color: '#22c55e' },
            { label: 'Matriculados', value: funil.matriculados, color: '#059669' },
          ]}
          title="Funil Visual"
        />
      </div>

      {/* Alertas do Dia + KPIs Tagueados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas do Dia */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Alertas do Dia</h3>
          </div>
          <div className="space-y-0">
            <AlertaItem
              icone="🔴"
              texto={`${calcularLeadsSemAcao(leads)} leads sem ação há +24h`}
            />
            <AlertaItem
              icone="🟡"
              texto={`${calcularExperimentaisAmanha(leads)} experimentais amanhã — confirmar`}
            />
            <AlertaItem
              icone="🟢"
              texto={`${kpis.matriculados} matrículas este mês`}
            />
            <AlertaItem
              icone="⏱️"
              texto={`Tempo médio resposta: ${calcularTempoMedioResposta(leads)} min`}
            />
            <AlertaItem
              icone="📵"
              texto={`${leads.filter(l => l.qtd_tentativas_sem_resposta > 0).length} tentativas sem resposta`}
            />
          </div>
        </div>

        {/* KPIs Tagueados */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-5 h-5 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">KPIs Tagueados</h3>
          </div>
          <div className="space-y-3">
            {kpisTags.map(kpi => (
              <BarraProgresso
                key={kpi.label}
                label={kpi.label}
                icone={kpi.icone}
                valor={kpi.valor}
                total={kpi.total}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Top Canais + Evolução */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {leadsPorCanal.length > 0 ? (
          <DistributionChart
            data={leadsPorCanal}
            title="Top Canais de Origem"
          />
        ) : (
          <EstadoVazio titulo="Sem dados" mensagem="Nenhum lead com canal registrado." />
        )}

        {/* Gráfico de Evolução Diária */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Evolução Diária</h3>
          </div>
          {evolucaoDiaria.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={evolucaoDiaria} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradAgend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradMatric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="dia" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                <Area type="monotone" dataKey="leads" name="Leads" stroke="#06b6d4" fill="url(#gradLeads)" strokeWidth={2} />
                <Area type="monotone" dataKey="agendados" name="Agendados" stroke="#8b5cf6" fill="url(#gradAgend)" strokeWidth={2} />
                <Area type="monotone" dataKey="matriculas" name="Matrículas" stroke="#22c55e" fill="url(#gradMatric)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center border border-dashed border-slate-700 rounded-xl">
              <p className="text-slate-500 text-xs">Sem dados para o período</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

interface AlertaBannerData {
  tipo: string;
  titulo: string;
  descricao: string;
  variante: 'purple' | 'warning' | 'success';
}

function AlertaBanner(props: { key?: React.Key; alerta: AlertaBannerData; index: number }) {
  const { alerta, index } = props;
  const variantStyles = {
    purple: 'bg-violet-500/10 border-violet-500/30 text-violet-200',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
  };

  const iconMap: Record<string, string> = {
    novo_lead: '🆕',
    sem_acao: '⚠️',
    matricula: '🎓',
  };

  return (
    <div
      className={`border rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${variantStyles[alerta.variante]}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="text-xl flex-shrink-0">{iconMap[alerta.tipo] || '📌'}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{alerta.titulo}</div>
        <div className="text-xs opacity-80">{alerta.descricao}</div>
      </div>
    </div>
  );
}

function AlertaItem({ icone, texto }: { icone: string; texto: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-700/50 last:border-0 text-sm text-slate-300">
      <span>{icone}</span>
      <span>{texto}</span>
    </div>
  );
}

function BarraProgresso(props: { key?: React.Key; label: string; icone: string; valor: number; total: number }) {
  const { label, icone, valor, total } = props;
  const pct = total > 0 ? (valor / total) * 100 : 0;
  const cor = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500';
  const corTexto = pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 flex items-center gap-1.5">
          <span>{icone}</span> {label}
        </span>
        <span className={`text-xs font-bold ${corTexto}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function EstadoVazio({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 text-center">
      <h4 className="text-slate-300 font-medium mb-2">{titulo}</h4>
      <p className="text-slate-400 text-sm">{mensagem}</p>
    </div>
  );
}

// =============================================================================
// FUNÇÕES DE CÁLCULO
// =============================================================================

function calcularAlertas(leads: LeadCRM[]): AlertaBannerData[] {
  const alertas: AlertaBannerData[] = [];
  const agora = new Date();

  // Leads sem ação há +24h
  const semAcao = calcularLeadsSemAcao(leads);
  if (semAcao > 0) {
    alertas.push({
      tipo: 'sem_acao',
      titulo: `${semAcao} leads sem ação há +24h!`,
      descricao: 'Faça follow-up imediato para não perder a oportunidade',
      variante: 'warning',
    });
  }

  // Matrículas recentes
  const matriculasHoje = leads.filter(l => {
    if (!l.data_conversao) return false;
    return l.data_conversao === agora.toISOString().split('T')[0];
  }).length;

  if (matriculasHoje > 0) {
    alertas.push({
      tipo: 'matricula',
      titulo: `${matriculasHoje} matrícula${matriculasHoje > 1 ? 's' : ''} hoje!`,
      descricao: 'Bom ritmo! Continue assim.',
      variante: 'success',
    });
  }

  return alertas;
}

function calcularLeadsSemAcao(leads: LeadCRM[]): number {
  const agora = new Date();
  const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

  return leads.filter(l => {
    // Leads que não estão arquivados nem matriculados
    if (l.arquivado || l.converteu) return false;
    // Sem contato recente
    const ultimoContato = l.data_ultimo_contato ? new Date(l.data_ultimo_contato) : new Date(l.created_at);
    return ultimoContato < limite24h;
  }).length;
}

function calcularExperimentaisAmanha(leads: LeadCRM[]): number {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const amanhaStr = amanha.toISOString().split('T')[0];

  return leads.filter(l => l.data_experimental === amanhaStr && l.experimental_agendada && !l.experimental_realizada).length;
}

function calcularTempoMedioResposta(leads: LeadCRM[]): string {
  // Calcular tempo médio entre data_primeiro_contato e data_passagem_mila (ou created_at)
  const tempos: number[] = [];

  leads.forEach(l => {
    if (l.data_passagem_mila && l.data_ultimo_contato) {
      const passagem = new Date(l.data_passagem_mila).getTime();
      const contato = new Date(l.data_ultimo_contato).getTime();
      if (contato > passagem) {
        tempos.push((contato - passagem) / (1000 * 60)); // minutos
      }
    }
  });

  if (tempos.length === 0) return '--';
  const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
  return media.toFixed(0);
}

function calcularDistribuicao(leads: LeadCRM[], getKey: (l: LeadCRM) => string): { name: string; value: number }[] {
  const map = new Map<string, number>();
  leads.forEach(l => {
    const key = getKey(l);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function calcularKPIsTags(leads: LeadCRM[]) {
  const total = leads.length;
  return [
    { label: 'Canal', icone: '📡', valor: leads.filter(l => l.canal_origem_id !== null).length, total },
    { label: 'Curso', icone: '🎸', valor: leads.filter(l => l.curso_interesse_id !== null).length, total },
    { label: 'Faixa Etária', icone: '👶', valor: leads.filter(l => l.faixa_etaria !== null).length, total },
    { label: 'Sabe Preço', icone: '💰', valor: leads.filter(l => l.sabia_preco !== null).length, total },
    { label: 'Motivo Falta', icone: '❌', valor: leads.filter(l => l.motivo_nao_comparecimento_id !== null).length, total: leads.filter(l => l.faltou_experimental).length || 1 },
  ];
}

export default DashboardTab;
