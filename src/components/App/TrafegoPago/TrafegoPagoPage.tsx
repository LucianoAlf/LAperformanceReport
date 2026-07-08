import { useState, useEffect, useMemo } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DollarSign, Eye, MousePointerClick, MessageCircle,
  Loader2, RefreshCw, Users, Target, AlertTriangle,
  TrendingUp, Image as ImageIcon, LayoutGrid, UsersRound, MapPin, Repeat
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid
} from 'recharts';
import { Button } from '@/components/ui/button';
import { useWidgetOverlapSentinel } from '@/contexts/WidgetVisibilityContext';

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
  reach?: string;
  frequency?: string;
  actions?: MetaAction[];
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
}

interface TendenciaPonto { data: string; spend: number; clicks: number; conversas: number; }
interface AnuncioRow {
  ad_id: string; ad_name: string; spend: number; impressions: number;
  clicks: number; ctr: number; conversas: number; thumbnail: string | null;
}
interface PosicaoRow {
  plataforma: string; posicao: string; spend: number;
  impressions: number; clicks: number; conversas: number;
}
interface DemoRow { idade: string; genero: string; spend: number; impressions: number; conversas: number; }
interface RegiaoRow { regiao: string; spend: number; impressions: number; conversas: number; }

interface InsightsResponse {
  ok: boolean;
  error?: string;
  date_preset: string;
  conta: MetaInsight | null;
  campanhas: MetaInsight[];
  tendencia: TendenciaPonto[];
  anuncios: AnuncioRow[];
  posicionamento: PosicaoRow[];
  demografico: DemoRow[];
  regiao: RegiaoRow[];
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

const PLATAFORMA_LABEL: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger',
  audience_network: 'Audience Network', threads: 'Threads', unknown: 'Outros',
};
const POSICAO_LABEL: Record<string, string> = {
  feed: 'Feed', story: 'Stories', reels: 'Reels', instagram_reels: 'Reels',
  instagram_stories: 'Stories', instant_article: 'Instant Article', instream_video: 'Vídeo in-stream',
  marketplace: 'Marketplace', video_feeds: 'Feed de vídeo', search: 'Busca',
  explore: 'Explorar', explore_home: 'Explorar', facebook_reels: 'Reels', right_hand_column: 'Coluna lateral',
  biz_disco_feed: 'Descoberta', profile_feed: 'Feed de perfil', unknown: 'Outros',
};
const GENERO_LABEL: Record<string, string> = { male: 'Masculino', female: 'Feminino', unknown: 'Não informado' };
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const plataformaLabel = (p: string) => PLATAFORMA_LABEL[p] ?? cap(p);
const posicaoLabel = (p: string) => POSICAO_LABEL[p] ?? cap(p.replace(/_/g, ' '));
const generoLabel = (g: string) => GENERO_LABEL[g] ?? cap(g);

function usePaginacaoTabela<T>(itens: T[], porPagina: number) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * porPagina;
    return itens.slice(inicio, inicio + porPagina);
  }, [itens, paginaSegura, porPagina]);
  return { pagina: paginaSegura, setPagina, totalPaginas, paginados };
}

function PaginacaoTabela({ pagina, totalPaginas, setPagina, totalItens, porPagina, labelItem }: {
  pagina: number;
  totalPaginas: number;
  setPagina: (updater: number | ((prev: number) => number)) => void;
  totalItens: number;
  porPagina: number;
  labelItem: string;
}) {
  if (totalPaginas <= 1) return null;
  const inicio = totalItens === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, totalItens);
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
    let n = i + 1;
    if (totalPaginas > 5) {
      if (pagina > 3) n = pagina - 2 + i;
      if (n > totalPaginas) n = totalPaginas - 4 + i;
    }
    return n;
  });
  return (
    <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between flex-wrap gap-3">
      <p className="text-xs text-slate-400">
        Mostrando {inicio}-{fim} de {totalItens} {labelItem}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          disabled={pagina === 1}
          className="px-2.5 py-1 bg-slate-700/70 hover:bg-slate-700 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        {paginas.map(n => (
          <button
            key={n}
            onClick={() => setPagina(n)}
            className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
              pagina === n ? 'bg-pink-600 text-white' : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          disabled={pagina === totalPaginas}
          className="px-2.5 py-1 bg-slate-700/70 hover:bg-slate-700 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Próximo
        </button>
      </div>
    </div>
  );
}

// Barra de ranking (gasto relativo ao topo) — usada em posicionamento/demográfico/região.
function BarraRanking({ label, valor, max, extra }: { label: string; valor: number; max: number; extra?: string }) {
  const pct = max > 0 ? Math.max((valor / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-300 w-40 flex-shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 bg-slate-900/60 rounded-full h-6 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-pink-600 to-fuchsia-500 rounded-full flex items-center px-2"
          style={{ width: `${pct}%` }}
        >
          <span className="text-[11px] font-bold text-white whitespace-nowrap">{brl(valor)}</span>
        </div>
      </div>
      {extra && <span className="text-xs text-slate-500 w-24 text-right flex-shrink-0">{extra}</span>}
    </div>
  );
}

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
  const sentinelRef = useWidgetOverlapSentinel();

  const [preset, setPreset] = useState<Preset>('last_30d');
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [erroInsights, setErroInsights] = useState<string | null>(null);

  const [leadsAtribuidos, setLeadsAtribuidos] = useState<LeadAtribuido[]>([]);
  const [adsCache, setAdsCache] = useState<Map<string, AdCache>>(new Map());
  const [loadingLeads, setLoadingLeads] = useState(true);
  const paginacaoLeads = usePaginacaoTabela(leadsAtribuidos, 15);

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
      paginacaoLeads.setPagina(1);
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

  // ----- Grupo A: reach/frequência + rankings -----
  const alcance = conta?.reach ? Number(conta.reach) : 0;
  const frequencia = conta?.frequency ? Number(conta.frequency) : 0;
  // Frequência alta = mesma pessoa vendo o anúncio muitas vezes (saturação/fadiga).
  const fadiga = frequencia >= 4 ? 'alta' : frequencia >= 2.5 ? 'media' : 'ok';

  const anuncios = insights?.anuncios ?? [];
  const paginacaoAnuncios = usePaginacaoTabela(anuncios, 10);
  useEffect(() => { paginacaoAnuncios.setPagina(1); }, [preset, paginacaoAnuncios.setPagina]);
  const posicionamento = insights?.posicionamento ?? [];
  const demografico = useMemo(
    () => [...(insights?.demografico ?? [])].sort((a, b) => b.spend - a.spend),
    [insights]
  );
  const regiao = insights?.regiao ?? [];
  // Região só rende se a Meta segmentou (mais de 1 linha real); senão vem tudo agregado.
  const regiaoUtil = regiao.length > 1;

  const tendencia = useMemo(
    () => (insights?.tendencia ?? []).map(t => ({
      ...t,
      label: t.data ? format(new Date(`${t.data}T12:00:00`), 'dd/MM', { locale: ptBR }) : '',
    })),
    [insights]
  );

  const maxPosic = Math.max(1, ...posicionamento.map(p => p.spend));
  const maxDemo = Math.max(1, ...demografico.map(d => d.spend));
  const maxRegiao = Math.max(1, ...regiao.map(r => r.spend));

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

      {/* Alcance & Frequência (fadiga de anúncio) */}
      {!loadingInsights && conta && alcance > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Alcance</p>
            <p className="text-xl font-bold text-white">{num(alcance)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">pessoas únicas atingidas</p>
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Frequência</p>
            <p className={`text-xl font-bold ${
              fadiga === 'alta' ? 'text-rose-400' : fadiga === 'media' ? 'text-amber-400' : 'text-white'
            }`}>{frequencia.toFixed(1)}x</p>
            <p className="text-[11px] text-slate-500 mt-0.5">vezes que cada pessoa viu o anúncio</p>
          </div>
          <div className={`rounded-2xl border p-4 flex flex-col justify-center ${
            fadiga === 'alta'
              ? 'bg-rose-900/20 border-rose-700/50'
              : fadiga === 'media' ? 'bg-amber-900/15 border-amber-700/40' : 'bg-emerald-900/15 border-emerald-700/40'
          }`}>
            <p className="text-xs font-medium mb-1 flex items-center gap-1.5 text-slate-300">
              {fadiga !== 'ok' && <AlertTriangle className="w-3.5 h-3.5" />} Saturação do público
            </p>
            <p className={`text-sm font-semibold ${
              fadiga === 'alta' ? 'text-rose-300' : fadiga === 'media' ? 'text-amber-300' : 'text-emerald-300'
            }`}>
              {fadiga === 'alta'
                ? 'Alta — considere renovar o criativo'
                : fadiga === 'media' ? 'Moderada — de olho' : 'Saudável'}
            </p>
          </div>
        </div>
      )}

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

      {/* Tendência diária */}
      {!loadingInsights && tendencia.length > 1 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Tendência diária — gasto e conversas
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={tendencia} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="gGasto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis yAxisId="l" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value: number, name: string) =>
                  name === 'Gasto' ? [brl(value), name] : [num(value), name]}
              />
              <Area yAxisId="l" type="monotone" dataKey="spend" name="Gasto" stroke="#ec4899" strokeWidth={2} fill="url(#gGasto)" />
              <Line yAxisId="r" type="monotone" dataKey="conversas" name="Conversas" stroke="#34d399" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Por anúncio / criativo */}
      {!loadingInsights && anuncios.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Por anúncio / criativo
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="text-left px-5 py-3 font-medium">Anúncio</th>
                  <th className="text-right px-4 py-3 font-medium">Gasto</th>
                  <th className="text-right px-4 py-3 font-medium">Impressões</th>
                  <th className="text-right px-4 py-3 font-medium">Cliques</th>
                  <th className="text-right px-4 py-3 font-medium">CTR</th>
                  <th className="text-right px-4 py-3 font-medium">Conversas</th>
                  <th className="text-right px-5 py-3 font-medium">Custo/conversa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {paginacaoAnuncios.paginados.map(a => (
                  <tr key={a.ad_id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {a.thumbnail ? (
                          <img src={a.thumbnail} alt="" loading="lazy"
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-slate-900" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                        <span className="text-sm text-white">{a.ad_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-white">{brl(a.spend)}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-300">{num(a.impressions)}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-300">{num(a.clicks)}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-300">{a.ctr.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-400">{num(a.conversas)}</td>
                    <td className="px-5 py-3 text-sm text-right text-amber-400">
                      {a.conversas > 0 ? brl(a.spend / a.conversas) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginacaoTabela
            pagina={paginacaoAnuncios.pagina}
            totalPaginas={paginacaoAnuncios.totalPaginas}
            setPagina={paginacaoAnuncios.setPagina}
            totalItens={anuncios.length}
            porPagina={10}
            labelItem="anúncios"
          />
        </div>
      )}

      {/* Posicionamento + Demográfico lado a lado */}
      {!loadingInsights && (posicionamento.length > 0 || demografico.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {posicionamento.length > 0 && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
              <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" /> Por posicionamento
              </h3>
              <div className="space-y-2.5">
                {posicionamento.map((p, i) => (
                  <BarraRanking
                    key={`${p.plataforma}-${p.posicao}-${i}`}
                    label={`${plataformaLabel(p.plataforma)} · ${posicaoLabel(p.posicao)}`}
                    valor={p.spend}
                    max={maxPosic}
                    extra={`${num(p.conversas)} conv.`}
                  />
                ))}
              </div>
            </div>
          )}
          {demografico.length > 0 && (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
              <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
                <UsersRound className="w-4 h-4" /> Por público (idade e gênero)
              </h3>
              <div className="space-y-2.5">
                {demografico.map((d, i) => (
                  <BarraRanking
                    key={`${d.idade}-${d.genero}-${i}`}
                    label={`${d.idade} · ${generoLabel(d.genero)}`}
                    valor={d.spend}
                    max={maxDemo}
                    extra={`${num(d.conversas)} conv.`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Por região */}
      {!loadingInsights && regiaoUtil && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Por região
          </h3>
          <div className="space-y-2.5">
            {regiao.slice(0, 12).map((r, i) => (
              <BarraRanking
                key={`${r.regiao}-${i}`}
                label={r.regiao}
                valor={r.spend}
                max={maxRegiao}
                extra={`${num(r.conversas)} conv.`}
              />
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
                {paginacaoLeads.paginados.map(lead => {
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
        <PaginacaoTabela
          pagina={paginacaoLeads.pagina}
          totalPaginas={paginacaoLeads.totalPaginas}
          setPagina={paginacaoLeads.setPagina}
          totalItens={leadsAtribuidos.length}
          porPagina={15}
          labelItem="leads"
        />
      </div>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
    </div>
  );
}
