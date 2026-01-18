import { useEffect, useState } from 'react';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  TrendingUp, 
  DollarSign, 
  Percent,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  GraduationCap,
  RefreshCw,
  FileText
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface DashboardData {
  alunosAtivos: number;
  alunosPagantes: number;
  ticketMedio: number;
  faturamentoPrevisto: number;
  tempoMedioPermanencia: number;
}

interface Alerta {
  tipo: string;
  unidade: string;
  descricao: string;
  valor: number;
}

export function DashboardPage() {
  const [dados, setDados] = useState<DashboardData[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDados() {
      try {
        // Buscar dados do dashboard
        const { data: dashboardData } = await supabase
          .from('vw_dashboard_unidade')
          .select('*');

        if (dashboardData) {
          setDados(dashboardData);
        }

        // Buscar alertas
        const { data: alertasData } = await supabase
          .from('vw_alertas')
          .select('*')
          .limit(5);

        if (alertasData) {
          setAlertas(alertasData);
        }
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, []);

  // Calcular totais consolidados
  const totais = dados.reduce(
    (acc, d: any) => ({
      alunosAtivos: acc.alunosAtivos + (d.alunos_ativos || 0),
      alunosPagantes: acc.alunosPagantes + (d.alunos_pagantes || 0),
      faturamentoPrevisto: acc.faturamentoPrevisto + parseFloat(d.faturamento_previsto || 0),
    }),
    { alunosAtivos: 0, alunosPagantes: 0, faturamentoPrevisto: 0 }
  );

  const ticketMedioGeral = dados.length > 0
    ? dados.reduce((sum: number, d: any) => sum + parseFloat(d.ticket_medio || 0), 0) / dados.length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Users}
          iconColor="text-cyan-400"
          iconBg="bg-cyan-500/20"
          value={totais.alunosAtivos.toLocaleString('pt-BR')}
          label="Alunos Ativos"
          trend="up"
          trendValue="+2.3%"
        />
        <KPICard
          icon={UserPlus}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/20"
          value="--"
          label="Matrículas (Mês)"
          sublabel="Aguardando dados"
        />
        <KPICard
          icon={DollarSign}
          iconColor="text-yellow-400"
          iconBg="bg-yellow-500/20"
          value={`R$ ${ticketMedioGeral.toFixed(0)}`}
          label="Ticket Médio"
          trend="up"
          trendValue="+3.8%"
        />
        <KPICard
          icon={Percent}
          iconColor="text-rose-400"
          iconBg="bg-rose-500/20"
          value="--"
          label="Churn Rate"
          sublabel="Aguardando dados"
        />
      </div>

      {/* Alertas e Ações Rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Alertas Ativos
            </h3>
            <span className="text-xs text-gray-500">Últimos 30 dias</span>
          </div>
          
          {alertas.length > 0 ? (
            <div className="space-y-3">
              {alertas.map((alerta, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/30"
                >
                  <div className="w-2 h-2 mt-2 rounded-full bg-amber-400" />
                  <div>
                    <p className="text-sm text-white">{alerta.descricao}</p>
                    <p className="text-xs text-gray-500">{alerta.unidade}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum alerta ativo</p>
            </div>
          )}
        </div>

        {/* Ações Rápidas */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Ações Rápidas
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            <ActionButton
              icon={Phone}
              label="Novo Lead"
              href="/app/entrada/lead"
              color="from-blue-500 to-cyan-500"
            />
            <ActionButton
              icon={GraduationCap}
              label="Nova Matrícula"
              href="/app/entrada/matricula"
              color="from-emerald-500 to-green-500"
            />
            <ActionButton
              icon={UserMinus}
              label="Registrar Evasão"
              href="/app/entrada/evasao"
              color="from-rose-500 to-red-500"
            />
            <ActionButton
              icon={RefreshCw}
              label="Renovação"
              href="/app/entrada/renovacao"
              color="from-purple-500 to-violet-500"
            />
            <ActionButton
              icon={FileText}
              label="Relatório Diário"
              href="/app/relatorios/diario"
              color="from-amber-500 to-orange-500"
              className="col-span-2"
            />
          </div>
        </div>
      </div>

      {/* Resumo por Unidade */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Resumo por Unidade
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-slate-700">
                <th className="pb-3">Unidade</th>
                <th className="pb-3 text-right">Alunos Ativos</th>
                <th className="pb-3 text-right">Pagantes</th>
                <th className="pb-3 text-right">Ticket Médio</th>
                <th className="pb-3 text-right">Faturamento Previsto</th>
                <th className="pb-3 text-right">Tempo Médio</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((d: any) => (
                <tr key={d.unidade} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{d.unidade}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_ativos}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_pagantes}</td>
                  <td className="py-3 text-right text-gray-300">
                    R$ {parseFloat(d.ticket_medio || 0).toFixed(0)}
                  </td>
                  <td className="py-3 text-right text-emerald-400 font-medium">
                    R$ {parseFloat(d.faturamento_previsto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 text-right text-gray-300">
                    {parseFloat(d.tempo_medio_permanencia || 0).toFixed(1)} meses
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900/50">
                <td className="py-3 text-white font-bold">TOTAL</td>
                <td className="py-3 text-right text-white font-bold">{totais.alunosAtivos}</td>
                <td className="py-3 text-right text-white font-bold">{totais.alunosPagantes}</td>
                <td className="py-3 text-right text-white font-bold">
                  R$ {ticketMedioGeral.toFixed(0)}
                </td>
                <td className="py-3 text-right text-emerald-400 font-bold">
                  R$ {totais.faturamentoPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 text-right text-gray-400">--</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// Componente KPI Card
function KPICard({ 
  icon: Icon, 
  iconColor, 
  iconBg, 
  value, 
  label, 
  sublabel,
  trend, 
  trendValue 
}: {
  icon: any;
  iconColor: string;
  iconBg: string;
  value: string;
  label: string;
  sublabel?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 hover:border-cyan-500/30 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend === 'up' ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trendValue}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
      {sublabel && <div className="text-xs text-gray-500 mt-1">{sublabel}</div>}
    </div>
  );
}

// Componente Action Button
function ActionButton({ 
  icon: Icon, 
  label, 
  href, 
  color,
  className = ''
}: {
  icon: any;
  label: string;
  href: string;
  color: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r ${color} text-white font-medium hover:opacity-90 transition-opacity ${className}`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </a>
  );
}

export default DashboardPage;
