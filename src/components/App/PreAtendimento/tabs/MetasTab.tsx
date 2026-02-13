import { useMemo } from 'react';
import {
  Target,
  TrendingUp,
  Clock,
  Tag,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KPICard } from '@/components/ui/KPICard';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import type { LeadCRM } from '../types';

interface MetasTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

// Metas por unidade (configurável futuramente via banco)
const METAS_UNIDADE: Record<string, { nome: string; codigo: string; metaShowUp: number; metaVisitas: number }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': { nome: 'Campo Grande', codigo: 'CG', metaShowUp: 30, metaVisitas: 30 },
  '95553e96-971b-4590-a6eb-0201d013c14d': { nome: 'Recreio', codigo: 'REC', metaShowUp: 30, metaVisitas: 25 },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': { nome: 'Barra', codigo: 'BAR', metaShowUp: 30, metaVisitas: 20 },
};

export function MetasTab({ unidadeId, ano, mes }: MetasTabProps) {
  const { leads, loading } = useLeadsCRM({ unidadeId, ano, mes });

  // Calcular métricas por unidade
  const metricasPorUnidade = useMemo(() => {
    const unidades = Object.keys(METAS_UNIDADE);
    return unidades.map(uid => {
      const leadsUnidade = leads.filter(l => l.unidade_id === uid);
      const meta = METAS_UNIDADE[uid];
      return calcularMetricas(leadsUnidade, meta, uid);
    });
  }, [leads]);

  // Métricas consolidadas
  const consolidado = useMemo(() => {
    const total = leads.length;
    const agendadas = leads.filter(l => l.experimental_agendada).length;
    const visitaram = leads.filter(l => l.experimental_realizada).length;
    const matriculados = leads.filter(l => l.converteu).length;
    const faltaram = leads.filter(l => l.faltou_experimental).length;
    const desmarcacoes = leads.reduce((acc, l) => acc + l.qtd_desmarcacoes, 0);

    // Tags
    const tagsCompletas = leads.filter(l =>
      l.canal_origem_id !== null &&
      l.curso_interesse_id !== null &&
      l.faixa_etaria !== null &&
      l.sabia_preco !== null
    ).length;

    // Tempo médio resposta (placeholder — precisa de dados reais de timestamp)
    const tempoMedioMin = '--';

    // Velocidade do pipeline (dias médios entre criação e conversão)
    const velocidades: number[] = [];
    leads.forEach(l => {
      if (l.converteu && l.data_conversao) {
        const criacao = new Date(l.created_at).getTime();
        const conversao = new Date(l.data_conversao).getTime();
        const dias = (conversao - criacao) / (1000 * 60 * 60 * 24);
        if (dias >= 0) velocidades.push(dias);
      }
    });
    const velocidadeMedia = velocidades.length > 0
      ? (velocidades.reduce((a, b) => a + b, 0) / velocidades.length).toFixed(1)
      : '--';

    return {
      total,
      agendadas,
      visitaram,
      matriculados,
      faltaram,
      desmarcacoes,
      tagsCompletas,
      taxaTags: total > 0 ? (tagsCompletas / total) * 100 : 0,
      taxaShowUp: total > 0 ? (visitaram / total) * 100 : 0,
      taxaAgendamento: total > 0 ? (agendadas / total) * 100 : 0,
      taxaConversao: total > 0 ? (matriculados / total) * 100 : 0,
      tempoMedioMin,
      velocidadeMedia,
    };
  }, [leads]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs de Performance Consolidados */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          icon={Target}
          label="Taxa Show-up"
          value={consolidado.taxaShowUp}
          target={30}
          format="percent"
          variant="violet"
          size="sm"
        />
        <KPICard
          icon={TrendingUp}
          label="Taxa Agendamento"
          value={consolidado.taxaAgendamento}
          format="percent"
          variant="cyan"
          size="sm"
        />
        <KPICard
          icon={CheckCircle2}
          label="Taxa Conversão"
          value={consolidado.taxaConversao}
          format="percent"
          variant="emerald"
          size="sm"
        />
        <KPICard
          icon={Tag}
          label="Tags Completas"
          value={consolidado.taxaTags}
          target={100}
          format="percent"
          variant={consolidado.taxaTags >= 90 ? 'emerald' : 'amber'}
          size="sm"
        />
        <KPICard
          icon={Clock}
          label="Velocidade Pipeline"
          value={`${consolidado.velocidadeMedia}d`}
          subvalue="média lead → matrícula"
          variant="cyan"
          size="sm"
        />
        <KPICard
          icon={AlertTriangle}
          label="Desmarcações"
          value={consolidado.desmarcacoes}
          subvalue={`${consolidado.faltaram} faltaram`}
          variant="rose"
          size="sm"
        />
      </div>

      {/* Termômetros por Unidade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {metricasPorUnidade.map(m => (
          <TermometroUnidade key={m.unidadeId} metricas={m} />
        ))}
      </div>

      {/* Detalhamento de KPIs Tagueados */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Tag className="w-4 h-4 text-violet-400" />
          Detalhamento de KPIs Tagueados
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <BarraKPI
            label="Canal de Origem"
            icone="📡"
            valor={leads.filter(l => l.canal_origem_id !== null).length}
            total={leads.length}
          />
          <BarraKPI
            label="Curso de Interesse"
            icone="🎸"
            valor={leads.filter(l => l.curso_interesse_id !== null).length}
            total={leads.length}
          />
          <BarraKPI
            label="Faixa Etária"
            icone="👶"
            valor={leads.filter(l => l.faixa_etaria !== null).length}
            total={leads.length}
          />
          <BarraKPI
            label="Sabe o Preço"
            icone="💰"
            valor={leads.filter(l => l.sabia_preco !== null).length}
            total={leads.length}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

interface MetricasUnidade {
  unidadeId: string;
  nome: string;
  codigo: string;
  totalLeads: number;
  visitaram: number;
  matriculados: number;
  taxaShowUp: number;
  metaShowUp: number;
  metaVisitas: number;
  progressoMeta: number;
  bonusElegivel: boolean;
}

function calcularMetricas(
  leads: LeadCRM[],
  meta: { nome: string; codigo: string; metaShowUp: number; metaVisitas: number },
  unidadeId: string
): MetricasUnidade {
  const totalLeads = leads.length;
  const visitaram = leads.filter(l => l.experimental_realizada).length;
  const matriculados = leads.filter(l => l.converteu).length;
  const taxaShowUp = totalLeads > 0 ? (visitaram / totalLeads) * 100 : 0;
  const progressoMeta = (taxaShowUp / meta.metaShowUp) * 100;

  return {
    unidadeId,
    nome: meta.nome,
    codigo: meta.codigo,
    totalLeads,
    visitaram,
    matriculados,
    taxaShowUp,
    metaShowUp: meta.metaShowUp,
    metaVisitas: meta.metaVisitas,
    progressoMeta: Math.min(progressoMeta, 100),
    bonusElegivel: taxaShowUp >= meta.metaShowUp,
  };
}

function TermometroUnidade(props: { metricas: MetricasUnidade }) {
  const { metricas: m } = props;
  const corBarra = m.taxaShowUp >= m.metaShowUp ? 'bg-emerald-500' :
    m.taxaShowUp >= m.metaShowUp * 0.7 ? 'bg-amber-500' : 'bg-rose-500';
  const corTexto = m.taxaShowUp >= m.metaShowUp ? 'text-emerald-400' :
    m.taxaShowUp >= m.metaShowUp * 0.7 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-bold text-white">{m.nome}</h4>
          <span className="text-[10px] text-slate-500">{m.totalLeads} leads</span>
        </div>
        {m.bonusElegivel ? (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
            ✅ Bônus R$150
          </span>
        ) : (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-700/50 text-slate-400">
            Meta não atingida
          </span>
        )}
      </div>

      {/* Termômetro */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2 mb-2">
          <span className={cn("text-3xl font-extrabold", corTexto)}>
            {m.taxaShowUp.toFixed(1)}%
          </span>
          <span className="text-sm text-slate-500">de {m.metaShowUp}%</span>
        </div>
        <div className="h-4 bg-slate-700/60 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", corBarra)}
            style={{ width: `${m.progressoMeta}%` }}
          />
        </div>
      </div>

      {/* Números */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-white">{m.visitaram}</div>
          <div className="text-[10px] text-slate-500">Visitaram</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{m.matriculados}</div>
          <div className="text-[10px] text-slate-500">Matriculados</div>
        </div>
        <div>
          <div className="text-lg font-bold text-slate-400">{m.metaVisitas}</div>
          <div className="text-[10px] text-slate-500">Meta visitas</div>
        </div>
      </div>
    </div>
  );
}

function BarraKPI(props: { label: string; icone: string; valor: number; total: number }) {
  const { label, icone, valor, total } = props;
  const pct = total > 0 ? (valor / total) * 100 : 0;
  const cor = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500';
  const corTexto = pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <span>{icone}</span> {label}
        </span>
        <span className={cn("text-xs font-bold", corTexto)}>
          {valor}/{total} ({pct.toFixed(0)}%)
        </span>
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

export default MetasTab;
