import { useMemo } from 'react';
import {
  Bot,
  MessageSquare,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KPICard } from '@/components/ui/KPICard';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import type { LeadCRM } from '../types';

interface MilaTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

export function MilaTab({ unidadeId, ano, mes }: MilaTabProps) {
  const { leads, loading } = useLeadsCRM({ unidadeId, ano, mes });

  // Leads que passaram pela Mila
  const leadsMila = useMemo(() => {
    return leads.filter(l => l.data_passagem_mila !== null || l.qtd_mensagens_mila > 0);
  }, [leads]);

  // KPIs da Mila
  const kpis = useMemo(() => {
    const total = leadsMila.length;
    const comPassagem = leadsMila.filter(l => l.data_passagem_mila !== null).length;
    const msgTotal = leadsMila.reduce((acc, l) => acc + l.qtd_mensagens_mila, 0);
    const msgMedia = total > 0 ? msgTotal / total : 0;

    // Motivos de passagem
    const motivos = new Map<string, number>();
    leadsMila.forEach(l => {
      const motivo = l.motivo_passagem_mila || 'Não informado';
      motivos.set(motivo, (motivos.get(motivo) || 0) + 1);
    });

    // Qualidade dos dados (leads da Mila com KPIs preenchidos)
    const comCanal = leadsMila.filter(l => l.canal_origem_id !== null).length;
    const comCurso = leadsMila.filter(l => l.curso_interesse_id !== null).length;
    const comFaixa = leadsMila.filter(l => l.faixa_etaria !== null).length;

    return {
      total,
      comPassagem,
      msgTotal,
      msgMedia,
      motivos: Array.from(motivos.entries())
        .map(([motivo, qtd]) => ({ motivo, qtd }))
        .sort((a, b) => b.qtd - a.qtd),
      qualidade: {
        canal: total > 0 ? (comCanal / total) * 100 : 0,
        curso: total > 0 ? (comCurso / total) * 100 : 0,
        faixa: total > 0 ? (comFaixa / total) * 100 : 0,
      },
    };
  }, [leadsMila]);

  // Últimas passagens (mais recentes)
  const ultimasPassagens = useMemo(() => {
    return leadsMila
      .filter(l => l.data_passagem_mila)
      .sort((a, b) => new Date(b.data_passagem_mila!).getTime() - new Date(a.data_passagem_mila!).getTime())
      .slice(0, 10);
  }, [leadsMila]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          icon={Bot}
          label="Leads via Mila"
          value={kpis.total}
          subvalue={`de ${leads.length} total`}
          variant="violet"
        />
        <KPICard
          icon={ArrowRightLeft}
          label="Passagens de Bastão"
          value={kpis.comPassagem}
          subvalue="para Andreza"
          variant="cyan"
        />
        <KPICard
          icon={MessageSquare}
          label="Mensagens Trocadas"
          value={kpis.msgTotal}
          subvalue={`média ${kpis.msgMedia.toFixed(1)}/lead`}
          variant="amber"
        />
        <KPICard
          icon={BarChart3}
          label="% dos Leads"
          value={leads.length > 0 ? ((kpis.total / leads.length) * 100).toFixed(1) + '%' : '0%'}
          subvalue="atendidos pela Mila"
          variant="emerald"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Motivos de Passagem */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-violet-400" />
            Motivos de Passagem de Bastão
          </h3>
          {kpis.motivos.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              Nenhuma passagem registrada
            </div>
          ) : (
            <div className="space-y-2">
              {kpis.motivos.map(m => (
                <div key={m.motivo} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                  <span className="text-xs text-slate-300">{m.motivo}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-700/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${kpis.total > 0 ? (m.qtd / kpis.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white w-8 text-right">{m.qtd}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Qualidade dos Dados */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Qualidade dos Dados (Mila)
          </h3>
          <div className="space-y-4">
            <QualidadeBarra label="Canal de Origem" icone="📡" pct={kpis.qualidade.canal} />
            <QualidadeBarra label="Curso de Interesse" icone="🎸" pct={kpis.qualidade.curso} />
            <QualidadeBarra label="Faixa Etária" icone="👶" pct={kpis.qualidade.faixa} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-[10px] text-slate-500">
              💡 Dados preenchidos pela Mila antes da passagem de bastão.
              Quanto maior, menos trabalho manual para a Andreza.
            </p>
          </div>
        </div>
      </div>

      {/* Últimas Passagens */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          Últimas Passagens de Bastão
        </h3>
        {ultimasPassagens.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            Nenhuma passagem registrada neste período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left p-2 text-slate-400 font-medium text-xs">Lead</th>
                  <th className="text-left p-2 text-slate-400 font-medium text-xs">Unidade</th>
                  <th className="text-left p-2 text-slate-400 font-medium text-xs">Motivo</th>
                  <th className="text-left p-2 text-slate-400 font-medium text-xs">Msgs</th>
                  <th className="text-left p-2 text-slate-400 font-medium text-xs">Data</th>
                </tr>
              </thead>
              <tbody>
                {ultimasPassagens.map(lead => (
                  <tr key={lead.id} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                    <td className="p-2 text-xs text-white font-medium">{lead.nome || 'Sem nome'}</td>
                    <td className="p-2">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                        {getUnidadeCodigo(lead.unidade_id)}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-slate-400">{lead.motivo_passagem_mila || '—'}</td>
                    <td className="p-2 text-xs text-slate-400">{lead.qtd_mensagens_mila}</td>
                    <td className="p-2 text-xs text-slate-400">
                      {lead.data_passagem_mila
                        ? new Date(lead.data_passagem_mila).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

function QualidadeBarra(props: { label: string; icone: string; pct: number }) {
  const { label, icone, pct } = props;
  const cor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  const corTexto = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 flex items-center gap-1.5">
          <span>{icone}</span> {label}
        </span>
        <span className={cn("text-xs font-bold", corTexto)}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", cor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function getUnidadeCodigo(unidadeId: string): string {
  const map: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'CG',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'REC',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'BAR',
  };
  return map[unidadeId] || '?';
}

export default MilaTab;
