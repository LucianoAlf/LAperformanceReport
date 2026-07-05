import { useState, useEffect, useMemo } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DollarSign, Eye, MousePointerClick, MessageCircle,
  Loader2, RefreshCw, Users, Target, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// Tipos
// ============================================================================

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsight {
  spend: string;
  impressions: string;
  clicks: string;
  cpm: string;
  ctr: string;
  actions?: MetaAction[];
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
}

interface InsightsResponse {
  ok: boolean;
  error?: string;
  date_preset: string;
  conta: MetaInsight | null;
  campanhas: MetaInsight[];
}

interface LeadAtribuido {
  id: number;
  nome: string | null;
  telefone: string | null;
  data_contato: string;
  status: string;
  converteu: boolean | null;
  meta_ad_source_id: string;
  unidades: { codigo: string } | null;
}

interface AdCache {
  source_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  effective_status: string | null;
}

type Preset = 'last_7d' | 'last_30d' | 'last_90d' | 'maximum';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'last_7d', label: '7 dias' },
  { value: 'last_30d', label: '30 dias' },
  { value: 'last_90d', label: '90 dias' },
  { value: 'maximum', label: 'Tudo' },
];

// ============================================================================
// Helpers
// ============================================================================

const getAction = (insight: MetaInsight | null, tipo: string): number => {
  const v = insight?.actions?.find(a => a.action_type === tipo)?.value;
  return v ? Number(v) : 0;
};

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 1000 ? 0 : 2 });

const num = (v: number) => v.toLocaleString('pt-BR');

// ============================================================================
// Página
// ============================================================================

export function TrafegoPagoPage() {
  useSetPageTitle({
    titulo: 'Tráfego Pago',
    subtitulo: 'Investimento e atribuição de anúncios pagos — Meta Ads hoje, Google Ads no futuro',
    icone: MousePointerClick,
    iconeCor: 'text-pink-400',
    iconeWrapperCor: 'bg-pink-500/20',
  });

  const [preset, setPreset] = useState<Preset>('last_30d');
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [erroInsights, setErroInsights] = useState<string | null>(null);

  const [leadsAtribuidos, setLeadsAtribuidos] = useState<LeadAtribuido[]>([]);
  const [adsCache, setAdsCache] = useState<Map<string, AdCache>>(new Map());
  const [loadingLeads, setLoadingLeads] = useState(true);

  // ----- Insights (via edge function meta-ads-insights, token fica no servidor) -----
  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoadingInsights(true);
      setErroInsights(null);
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-insights', {
          body: { date_preset: preset },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Erro ao consultar a Meta');
        if (ativo) setInsights(data as InsightsResponse);
      } catch (e) {
        console.error('Erro ao buscar insights Meta:', e);
        if (ativo) setErroInsights(e instanceof Error ? e.message : 'Erro ao consultar a Meta');
      } finally {
        if (ativo) setLoadingInsights(false);
      }
    })();
    return () => { ativo = false; };
  }, [preset]);

  // ----- Leads atribuídos + cache de anúncios -----
  const carregarLeads = async () => {
    setLoadingLeads(true);
    try {
      const [{ data: leads }, { data: cache }] = await Promise.all([
        supabase
          .from('leads')
          .select('id, nome, telefone, data_contato, status, converteu, meta_ad_source_id, unidades:unidade_id(codigo)')
          .not('meta_ad_source_id', 'is', null)
          .order('data_contato', { ascending: false })
          .limit(200),
        supabase.from('meta_ads_cache').select('source_id, ad_name, campaign_name, adset_name, effective_status'),
      ]);
      setLeadsAtribuidos((leads as unknown as LeadAtribuido[]) || []);
      setAdsCache(new Map((cache || []).map((c: AdCache) => [c.source_id, c])));
    } catch (e) {
      console.error('Erro ao buscar leads atribuídos:', e);
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => { carregarLeads(); }, []);

  // ----- Derivados -----
  const conta = insights?.conta ?? null;
  const gasto = conta ? Number(conta.spend) : 0;
  const conversas = getAction(conta, 'onsite_conversion.messaging_conversation_started_7d');
  const custoPorConversa = conversas > 0 ? gasto / conversas : 0;

  const funil = useMemo(() => {
    const iniciadas = conversas;
    const primeiraResposta = getAction(conta, 'onsite_conversion.messaging_first_reply');
    const prof2 = getAction(conta, 'onsite_conversion.messaging_user_depth_2_message_send');
    const prof3 = getAction(conta, 'onsite_conversion.messaging_user_depth_3_message_send');
    const base = Math.max(iniciadas, 1);
    return [
      { label: 'Conversas iniciadas', valor: iniciadas, pct: 100 },
      { label: 'Primeira resposta', valor: primeiraResposta, pct: Math.round(100 * primeiraResposta / base) },
      { label: 'Engajou (2+ mensagens)', valor: prof2, pct: Math.round(100 * prof2 / base) },
      { label: 'Conversa profunda (3+)', valor: prof3, pct: Math.round(100 * prof3 / base) },
    ];
  }, [conta, conversas]);

  const campanhas = useMemo(() => {
    return (insights?.campanhas ?? [])
      .map(c => {
        const conv = getAction(c, 'onsite_conversion.messaging_conversation_started_7d');
        const spend = Number(c.spend);
        return { ...c, conversas: conv, spendNum: spend, custoConversa: conv > 0 ? spend / conv : null };
      })
      .sort((a, b) => b.spendNum - a.spendNum);
  }, [insights]);

  const convertidos = leadsAtribuidos.filter(l => l.converteu === true).length;

  // ============================================================================
  return (
    <div className="space-y-6">
      {/* Seletor de período */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                preset === p.value
                  ? 'bg-pink-600 text-white'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={carregarLeads}
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {erroInsights && (
        <div className="bg-rose-900/20 border border-rose-700/50 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-300">Erro ao consultar a Meta: {erroInsights}</p>
        </div>
      )}

      {/* KPIs de investimento */}
      <div>
        <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Investimento — Meta Ads
        </h3>
        {loadingInsights ? (
          <div className="flex items-center justify-center h-28 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-1">Gasto</p>
              <p className="text-xl font-bold text-white">{brl(gasto)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-1">Impressões</p>
              <p className="text-xl font-bold text-white">{num(conta ? Number(conta.impressions) : 0)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-1">Cliques</p>
              <p className="text-xl font-bold text-white">{num(conta ? Number(conta.clicks) : 0)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-1">CTR</p>
              <p className="text-xl font-bold text-white">{conta ? Number(conta.ctr).toFixed(2) : '0'}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-1">Conversas iniciadas</p>
              <p className="text-xl font-bold text-emerald-400">{num(conversas)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-1">Custo / conversa</p>
              <p className="text-xl font-bold text-amber-400">{custoPorConversa > 0 ? brl(custoPorConversa) : '—'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Funil de conversas WhatsApp */}
      {!loadingInsights && conta && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> Funil de conversas WhatsApp (dados da Meta)
          </h3>
          <div className="space-y-3">
            {funil.map(etapa => (
              <div key={etapa.label} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-44 flex-shrink-0">{etapa.label}</span>
                <div className="flex-1 bg-slate-900/60 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pink-600 to-fuchsia-500 rounded-full flex items-center px-2 transition-all"
                    style={{ width: `${Math.max(etapa.pct, 4)}%` }}
                  >
                    <span className="text-[11px] font-bold text-white whitespace-nowrap">{num(etapa.valor)}</span>
                  </div>
                </div>
                <span className="text-xs text-slate-500 w-10 text-right">{etapa.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela por campanha */}
      {!loadingInsights && campanhas.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Target className="w-4 h-4" /> Por campanha (Meta)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="text-left px-5 py-3 font-medium">Campanha</th>
                  <th className="text-right px-4 py-3 font-medium">Gasto</th>
                  <th className="text-right px-4 py-3 font-medium">Impressões</th>
                  <th className="text-right px-4 py-3 font-medium">Cliques</th>
                  <th className="text-right px-4 py-3 font-medium">CTR</th>
                  <th className="text-right px-4 py-3 font-medium">Conversas</th>
                  <th className="text-right px-5 py-3 font-medium">Custo/conversa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {campanhas.map(c => (
                  <tr key={c.campaign_id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3 text-sm text-white">{c.campaign_name}</td>
                    <td className="px-4 py-3 text-sm text-right text-white">{brl(c.spendNum)}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-300">{num(Number(c.impressions))}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-300">{num(Number(c.clicks))}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-300">{Number(c.ctr).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-400">{num(c.conversas)}</td>
                    <td className="px-5 py-3 text-sm text-right text-amber-400">
                      {c.custoConversa != null ? brl(c.custoConversa) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Atribuição de leads */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <Users className="w-4 h-4" /> Leads atribuídos a anúncios
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400">
              Atribuídos: <span className="text-white font-bold">{leadsAtribuidos.length}</span>
            </span>
            <span className="text-slate-400">
              Matricularam: <span className="text-emerald-400 font-bold">{convertidos}</span>
            </span>
          </div>
        </div>

        {loadingLeads ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 text-pink-400 animate-spin" />
          </div>
        ) : leadsAtribuidos.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <MousePointerClick className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum lead atribuído ainda.</p>
            <p className="text-xs text-slate-500 mt-1">
              A captura de atribuição foi ligada em 05/07/2026 — leads que clicarem em anúncio
              Click-to-WhatsApp a partir de agora aparecem aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="text-left px-5 py-3 font-medium">Lead</th>
                  <th className="text-left px-4 py-3 font-medium">Anúncio</th>
                  <th className="text-left px-4 py-3 font-medium">Campanha</th>
                  <th className="text-center px-4 py-3 font-medium">Unidade</th>
                  <th className="text-center px-4 py-3 font-medium">Data</th>
                  <th className="text-center px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {leadsAtribuidos.map(lead => {
                  const ad = adsCache.get(lead.meta_ad_source_id);
                  return (
                    <tr key={lead.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 text-sm text-white">{lead.nome || '(sem nome)'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{ad?.ad_name || lead.meta_ad_source_id}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{ad?.campaign_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-center text-slate-300">{lead.unidades?.codigo || '—'}</td>
                      <td className="px-4 py-3 text-sm text-center text-slate-300">
                        {format(new Date(`${lead.data_contato}T12:00:00`), 'dd/MM/yy', { locale: ptBR })}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                          lead.converteu
                            ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400'
                            : 'bg-slate-700/40 border-slate-600 text-slate-300'
                        }`}>
                          {lead.converteu ? 'Matriculou' : lead.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
