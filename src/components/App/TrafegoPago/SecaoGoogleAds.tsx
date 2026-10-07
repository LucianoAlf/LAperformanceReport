// Seção Google Ads do módulo Tráfego Pago — gêmea visual da metade do Meta.
//
// ⚠️ Lê a edge `google-ads-insights` (proxy AO VIVO, nada persistido), e não a
// tabela `google_ads_metricas_diarias`. A tabela existe e é alimentada pela
// `capturar-google-ads-diario`, mas serve a outra pergunta: ela é a MEMÓRIA do
// gasto, usada para dividir custo por leads no radar de tráfego. Aqui a pergunta
// é "como está agora", e é o mesmo contrato do Meta na mesma tela — duas metades
// que se comportam diferente confundiriam quem lê.
//
// ⚠️ A conta do Google é UMA só para as três unidades: o recorte por unidade sai
// do NOME da campanha (`[CG]`, `[BARRA]`, `[RECREIO]`), não de estrutura da conta.
// Campanha sem marca reconhecível aparece como "Sem unidade" em vez de ser
// atribuída por chute.
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid,
} from 'recharts';
import {
  DollarSign, Loader2, AlertTriangle, TrendingUp, Target,
  Smartphone, Radio, UsersRound, Building2, Layers, Users, MousePointerClick,
} from 'lucide-react';
import { usePaginacaoTabela, PaginacaoTabela } from './PaginacaoTabela';

// ============================================================================
// A conversion action que a Fase 3 criou na conta (id 7785226299, "Matricula (LA Report)").
//
// ⚠️ Reconhecida pelo NOME porque o recorte por acao da API devolve o nome, nunca o id --
// renomear a action no painel do Google quebra este destaque em silencio (a linha volta a ser
// pintada como as dos outros). Se isso acontecer, o numero segue certo; so o realce se perde.
const MARCA_ACAO_NOSSA = 'LA Report';
const ehAcaoNossa = (nome: string) => nome.includes(MARCA_ACAO_NOSSA);

// Tipos (espelham o retorno da edge)
// ============================================================================

interface ContaGoogle {
  moeda: string; gasto: number; impressoes: number; cliques: number;
  conversoes: number; todas_conversoes: number; ctr: number; cpc: number;
}
interface CampanhaGoogle {
  id: string; nome: string; status: string; canal: string;
  orcamento_diario: number; gasto: number; impressoes: number;
  cliques: number; conversoes: number; ctr: number; cpc: number;
}
interface PontoGoogle { data: string; gasto: number; cliques: number; conversoes: number }
interface AcaoGoogle { acao: string; conversoes: number; valor: number }
interface AgregadoGoogle {
  chave: string; gasto: number; impressoes: number; cliques: number; conversoes: number;
}
interface RespostaGoogle {
  ok: boolean;
  error?: string;
  falhas?: string[];
  janela: { de: string; ate: string };
  versao_api: string | null;
  conta: ContaGoogle;
  campanhas: CampanhaGoogle[];
  tendencia: PontoGoogle[];
  conversoes_por_acao: AcaoGoogle[];
  dispositivo: AgregadoGoogle[];
  rede: AgregadoGoogle[];
  idade: AgregadoGoogle[];
  genero: AgregadoGoogle[];
  grupos_ativos: AgregadoGoogle[];
}

export type PresetGoogle = 'last_7d' | 'last_30d' | 'last_90d' | 'maximum';

// ============================================================================
// Rótulos — os enums da API são SCREAMING_SNAKE e não servem para leitura humana
// ============================================================================

const DISPOSITIVO_LABEL: Record<string, string> = {
  MOBILE: 'Celular', DESKTOP: 'Computador', TABLET: 'Tablet',
  CONNECTED_TV: 'TV conectada', OTHER: 'Outros', UNKNOWN: 'Não informado',
};
const REDE_LABEL: Record<string, string> = {
  SEARCH: 'Busca do Google', SEARCH_PARTNERS: 'Parceiros de busca',
  CONTENT: 'Display', YOUTUBE_SEARCH: 'Busca do YouTube',
  YOUTUBE_WATCH: 'YouTube', YOUTUBE: 'YouTube', MIXED: 'Misto',
  GOOGLE_TV: 'Google TV', GOOGLE_SEARCH: 'Busca do Google', UNKNOWN: 'Não informado',
};
const GENERO_LABEL: Record<string, string> = {
  MALE: 'Masculino', FEMALE: 'Feminino', UNDETERMINED: 'Não informado', UNKNOWN: 'Não informado',
};
const rotuloIdade = (v: string) =>
  v.startsWith('AGE_RANGE_')
    ? v.replace('AGE_RANGE_', '').replace('_UP', '+').replace('_', '-').replace('UNDETERMINED', 'Não informado')
    : v;

const CANAL_LABEL: Record<string, string> = {
  PERFORMANCE_MAX: 'Performance Max', SEARCH: 'Rede de Pesquisa',
  DISPLAY: 'Display', VIDEO: 'Vídeo', SHOPPING: 'Shopping',
};

// A unidade vem do nome da campanha — é a única fonte que existe (conta única).
function unidadeDaCampanha(nome: string): string {
  const n = nome.toUpperCase();
  if (n.includes('[CG]') || n.includes('CAMPO GRANDE')) return 'Campo Grande';
  if (n.includes('[BARRA]')) return 'Barra';
  if (n.includes('[RECREIO]')) return 'Recreio';
  return 'Sem unidade';
}

const brl = (v: number) => formatCurrency(v, v >= 1000 ? 0 : 2);
const num = (v: number) => v.toLocaleString('pt-BR');
const dec = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// Lead que chegou por clique de anúncio do Google. `gclid` é a prova do clique e
// `google_ads_campanha_id` vem do gad_campaignid da URL de destino — os dois são gravados
// pela edge `registrar-atribuicao-google-ads`, a partir do webhook da onpromedia.
interface LeadGoogle {
  id: number;
  nome: string | null;
  data_contato: string;
  status: string;
  converteu: boolean | null;
  gclid: string;
  google_ads_campanha_id: string | null;
  unidades: { codigo: string } | null;
}

// ============================================================================
// Ranking horizontal — mesma linguagem da metade do Meta, em azul
// ============================================================================

function BarraGoogle({ label, valor, max, extra }: {
  label: string; valor: number; max: number; extra?: string;
}) {
  const pct = max > 0 ? Math.max((valor / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-300 w-40 flex-shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 bg-slate-900/60 rounded-full h-6 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-sky-400 rounded-full flex items-center px-2"
          style={{ width: `${pct}%` }}
        >
          <span className="text-[11px] font-bold text-white whitespace-nowrap">{brl(valor)}</span>
        </div>
      </div>
      {extra && <span className="text-xs text-slate-500 w-24 text-right flex-shrink-0">{extra}</span>}
    </div>
  );
}

function CardKpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
      <p className="text-xs text-slate-400 mb-1">{titulo}</p>
      <p className="text-xl font-bold text-white">{valor}</p>
      {nota && <p className="text-[11px] text-slate-500 mt-0.5">{nota}</p>}
    </div>
  );
}

function Painel({ titulo, icone: Icone, children }: {
  titulo: string; icone: typeof Target; children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
      <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
        <Icone className="w-4 h-4" /> {titulo}
      </h3>
      {children}
    </div>
  );
}

// ============================================================================
// Seção
// ============================================================================

export function SecaoGoogleAds({ preset }: { preset: PresetGoogle }) {
  const [dados, setDados] = useState<RespostaGoogle | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [leadsGoogle, setLeadsGoogle] = useState<LeadGoogle[]>([]);
  const [nomeCampanha, setNomeCampanha] = useState<Map<string, string>>(new Map());
  const [carregandoLeads, setCarregandoLeads] = useState(true);
  const paginacaoLeads = usePaginacaoTabela(leadsGoogle, 15);
  const matricularam = useMemo(() => leadsGoogle.filter(l => l.converteu).length, [leadsGoogle]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const { data, error } = await supabase.functions.invoke('google-ads-insights', {
          body: { date_preset: preset },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Erro ao consultar o Google Ads');
        if (ativo) setDados(data as RespostaGoogle);
      } catch (e) {
        console.error('Erro ao buscar insights Google Ads:', e);
        if (ativo) setErro(e instanceof Error ? e.message : 'Erro ao consultar o Google Ads');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [preset]);

  // ----- Leads atribuídos ao Google (gêmea da tabela do Meta) -----
  //
  // ⚠️ Não filtra por `preset` de propósito, igual à do Meta: a lista responde "quem já
  // veio do Google", não "quanto gastei na janela". O período de cima é das métricas.
  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregandoLeads(true);
      try {
        const [{ data: leads }, { data: campanhas }] = await Promise.all([
          supabase
            .from('leads')
            .select('id, nome, data_contato, status, converteu, gclid, google_ads_campanha_id, unidades:unidade_id(codigo)')
            .not('gclid', 'is', null)
            .order('data_contato', { ascending: false })
            .limit(200),
          // Equivalente ao meta_ads_cache: é daqui que sai o NOME da campanha. Sem tabela
          // de anúncios porque o Performance Max não expõe anúncio individual.
          supabase.from('google_ads_metricas_diarias').select('campanha_id, campanha_nome'),
        ]);
        if (!ativo) return;
        setLeadsGoogle((leads as unknown as LeadGoogle[]) || []);
        setNomeCampanha(new Map((campanhas || []).map((c: { campanha_id: string; campanha_nome: string }) => [c.campanha_id, c.campanha_nome])));
        paginacaoLeads.setPagina(1);
      } catch (e) {
        console.error('Erro ao buscar leads atribuídos ao Google:', e);
      } finally {
        if (ativo) setCarregandoLeads(false);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const conta = dados?.conta ?? null;
  const custoPorConversao = conta && conta.conversoes > 0 ? conta.gasto / conta.conversoes : 0;

  const tendencia = useMemo(
    () => (dados?.tendencia ?? []).map(t => ({
      ...t,
      label: t.data ? format(new Date(`${t.data}T12:00:00`), 'dd/MM', { locale: ptBR }) : '',
    })),
    [dados],
  );

  // Só campanhas com gasto no período: a conta tem 4 campanhas de Search paradas
  // desde 2025, e listá-las zeradas só ocuparia a tela.
  const campanhas = useMemo(
    () => (dados?.campanhas ?? []).filter(c => c.gasto > 0),
    [dados],
  );

  const porUnidade = useMemo(() => {
    const mapa = new Map<string, { unidade: string; gasto: number; cliques: number; conversoes: number }>();
    for (const c of campanhas) {
      const u = unidadeDaCampanha(c.nome);
      const acc = mapa.get(u) ?? { unidade: u, gasto: 0, cliques: 0, conversoes: 0 };
      acc.gasto += c.gasto;
      acc.cliques += c.cliques;
      acc.conversoes += c.conversoes;
      mapa.set(u, acc);
    }
    return [...mapa.values()].sort((a, b) => b.gasto - a.gasto);
  }, [campanhas]);

  const maxUnidade = Math.max(1, ...porUnidade.map(u => u.gasto));
  const maxRede = Math.max(1, ...(dados?.rede ?? []).map(r => r.gasto));
  const maxDisp = Math.max(1, ...(dados?.dispositivo ?? []).map(d => d.gasto));
  const maxIdade = Math.max(1, ...(dados?.idade ?? []).map(d => d.gasto));
  const maxGenero = Math.max(1, ...(dados?.genero ?? []).map(d => d.gasto));
  const maxAcao = Math.max(1, ...(dados?.conversoes_por_acao ?? []).map(a => a.conversoes));

  if (carregando) {
    return (
      <div>
        <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Investimento — Google Ads
        </h3>
        <div className="flex items-center justify-center h-28 bg-slate-800/50 rounded-2xl border border-slate-700/50">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-rose-900/20 border border-rose-700/50 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-rose-300">Erro ao consultar o Google Ads: {erro}</p>
          {/* O sintoma mais provável é credencial: dizer isso poupa investigação. */}
          {erro.includes('invalid_grant') && (
            <p className="text-xs text-rose-400/80 mt-1">
              O refresh token expirou ou foi revogado — é preciso refazer o consentimento OAuth.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!conta) return null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div>
        <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Investimento — Google Ads
          {dados?.janela && (
            <span className="text-[11px] text-slate-500 font-normal">
              {format(new Date(`${dados.janela.de}T12:00:00`), 'dd/MM')} a{' '}
              {format(new Date(`${dados.janela.ate}T12:00:00`), 'dd/MM')}
            </span>
          )}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <CardKpi titulo="Gasto" valor={brl(conta.gasto)} />
          <CardKpi titulo="Impressões" valor={num(conta.impressoes)} />
          <CardKpi titulo="Cliques" valor={num(conta.cliques)} />
          <CardKpi titulo="CTR" valor={`${dec(conta.ctr)}%`} />
          <CardKpi titulo="CPC médio" valor={brl(conta.cpc)} />
          <CardKpi
            titulo="Conversões"
            valor={dec(conta.conversoes)}
            nota={custoPorConversao > 0 ? `${brl(custoPorConversao)} cada` : undefined}
          />
        </div>
        {/* 🔴 Regra do handoff de 03/09: conversão de plataforma NÃO é comparável
            entre Meta e Google (no Meta é conversa de WhatsApp; aqui é a ação
            configurada na conta, que inclui visita à loja e view no YouTube).
            Com as duas como abas do mesmo layout, o convite a comparar é imediato
            — por isso o aviso é permanente, não um tooltip. */}
        <p className="text-[11px] text-slate-500 mt-2">
          As conversões do Google contam as ações configuradas nesta conta (contato no WhatsApp,
          formulário, rotas, YouTube) e <strong className="text-slate-400">não são comparáveis</strong> com
          as conversas do Meta. Cada plataforma serve para acompanhar a si mesma ao longo do tempo.
        </p>
        {/* Recorte que a API recusou não vira seção vazia sem explicação. */}
        {dados?.falhas?.length ? (
          <p className="text-[11px] text-amber-400/80 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {dados.falhas.length} recorte(s) não retornaram: {dados.falhas.join(' · ')}
          </p>
        ) : null}
      </div>

      {/* Por unidade — o corte que o negócio usa */}
      {porUnidade.length > 0 && (
        <Painel titulo="Gasto por unidade (derivado do nome da campanha)" icone={Building2}>
          <div className="space-y-3">
            {porUnidade.map(u => (
              <BarraGoogle
                key={u.unidade}
                label={u.unidade}
                valor={u.gasto}
                max={maxUnidade}
                extra={`${dec(u.conversoes)} conv.`}
              />
            ))}
          </div>
        </Painel>
      )}

      {/* Tendência diária */}
      {tendencia.length > 1 && (
        <Painel titulo="Tendência diária — gasto e conversões" icone={TrendingUp}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={tendencia} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="gGastoGoogle" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
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
                  name === 'Gasto' ? [brl(value), name] : [dec(value), name]}
              />
              <Area yAxisId="l" type="monotone" dataKey="gasto" name="Gasto" stroke="#3b82f6" strokeWidth={2} fill="url(#gGastoGoogle)" />
              <Line yAxisId="r" type="monotone" dataKey="conversoes" name="Conversões" stroke="#34d399" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Painel>
      )}

      {/* Campanhas */}
      {campanhas.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <h3 className="text-sm font-medium text-slate-400 p-5 pb-3 flex items-center gap-2">
            <Target className="w-4 h-4" /> Campanhas com investimento no período
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Campanha</th>
                  <th className="text-left px-4 py-2 font-medium">Unidade</th>
                  <th className="text-right px-4 py-2 font-medium">Gasto</th>
                  <th className="text-right px-4 py-2 font-medium">Cliques</th>
                  <th className="text-right px-4 py-2 font-medium">CTR</th>
                  <th className="text-right px-4 py-2 font-medium">CPC</th>
                  <th className="text-right px-4 py-2 font-medium">Conversões</th>
                  <th className="text-right px-4 py-2 font-medium">Custo/conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {campanhas.map(c => (
                  <tr key={c.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-2 text-slate-200">
                      {c.nome}
                      <span className="block text-[11px] text-slate-500">
                        {CANAL_LABEL[c.canal] ?? c.canal}
                        {c.orcamento_diario > 0 && ` · orçamento ${brl(c.orcamento_diario)}/dia`}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{unidadeDaCampanha(c.nome)}</td>
                    <td className="px-4 py-2 text-right text-white font-medium">{brl(c.gasto)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{num(c.cliques)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{dec(c.ctr)}%</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(c.cpc)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{dec(c.conversoes)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">
                      {c.conversoes > 0 ? brl(c.gasto / c.conversoes) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conversões por ação — recorte que o Meta não oferece */}
      {(dados?.conversoes_por_acao?.length ?? 0) > 0 && (
        <Painel titulo="Conversões por ação configurada" icone={Target}>
          {/* ⚠️ Este bloco soma TODAS as conversões; o KPI acima conta só as metas
              primárias. Os dois números não fecham por construção — a API não
              oferece o recorte por ação dentro de `conversions`. */}
          <p className="text-[11px] text-slate-500 mb-3">
            Soma todas as ações de conversão ({dec(conta.todas_conversoes)}), e não apenas as metas
            primárias do KPI acima ({dec(conta.conversoes)}) — a API só oferece este recorte sobre o total.
          </p>
          <div className="space-y-2">
            {dados!.conversoes_por_acao.filter(a => a.conversoes > 0).map(a => {
              const pct = Math.max((a.conversoes / maxAcao) * 100, 2);
              const nossa = ehAcaoNossa(a.acao);
              return (
                <div key={a.acao} className="flex items-center gap-3">
                  <span
                    className={`text-xs w-52 flex-shrink-0 truncate ${nossa ? 'text-indigo-300 font-semibold' : 'text-slate-300'}`}
                    title={nossa ? `${a.acao} — enviada por nos (Fase 3)` : a.acao}
                  >
                    {nossa ? `★ ${a.acao}` : a.acao}
                  </span>
                  <div className="flex-1 bg-slate-900/60 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r rounded-full flex items-center px-2 ${nossa ? 'from-indigo-600 to-indigo-400' : 'from-emerald-600 to-emerald-400'}`}
                      style={{ width: `${pct}%` }}
                    >
                      <span className="text-[11px] font-bold text-white whitespace-nowrap">{dec(a.conversoes)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* A nota so aparece quando a NOSSA acao ja tem numero. Antes do primeiro envio ela
              nao teria a que se referir, e explicar uma linha inexistente confunde mais que
              esclarece. */}
          {dados!.conversoes_por_acao.some(a => a.conversoes > 0 && ehAcaoNossa(a.acao)) && (
            <div className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
              <p className="text-[11px] text-indigo-200 font-semibold mb-1">
                ★ A linha destacada e nossa: matricula real, enviada por nos.
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ela <strong>nao vai bater</strong> com a tabela "Leads atribuidos a anuncios" abaixo, e
                isso e esperado — os dois numeros medem coisas diferentes:
              </p>
              <ul className="text-[11px] text-slate-400 leading-relaxed mt-1.5 space-y-1 list-disc pl-4">
                <li>
                  <strong>A data e outra.</strong> O Google lanca a conversao no dia do <em>clique</em>;
                  nos contamos no dia da <em>matricula</em>. O mesmo aluno cai em meses diferentes.
                </li>
                <li>
                  <strong>O Google reparte credito em fracoes</strong> entre pontos de contato (e por isso
                  os numeros deste painel tem decimais). Para nos, uma matricula e sempre 1 inteira.
                </li>
                <li>
                  <strong>Clique com mais de 90 dias e recusado</strong> por ele. A matricula existe no
                  nosso lado de todo jeito.
                </li>
              </ul>
              <p className="text-[11px] text-slate-500 mt-2">
                Para decisao de verba, use o numero <strong>nosso</strong>. Este aqui e o que o Google usa
                para otimizar, e segue as regras dele.
              </p>
            </div>
          )}
        </Painel>
      )}

      {/* Rede e dispositivo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(dados?.rede?.length ?? 0) > 0 && (
          <Painel titulo="Onde o anúncio apareceu" icone={Radio}>
            <div className="space-y-3">
              {dados!.rede.map(r => (
                <BarraGoogle
                  key={r.chave}
                  label={REDE_LABEL[r.chave] ?? r.chave}
                  valor={r.gasto}
                  max={maxRede}
                  extra={`${dec(r.conversoes)} conv.`}
                />
              ))}
            </div>
          </Painel>
        )}
        {(dados?.dispositivo?.length ?? 0) > 0 && (
          <Painel titulo="Por dispositivo" icone={Smartphone}>
            <div className="space-y-3">
              {dados!.dispositivo.map(d => (
                <BarraGoogle
                  key={d.chave}
                  label={DISPOSITIVO_LABEL[d.chave] ?? d.chave}
                  valor={d.gasto}
                  max={maxDisp}
                  extra={`${dec(d.conversoes)} conv.`}
                />
              ))}
            </div>
          </Painel>
        )}
      </div>

      {/* Demográfico */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(dados?.idade?.length ?? 0) > 0 && (
          <Painel titulo="Por faixa de idade" icone={UsersRound}>
            <div className="space-y-3">
              {dados!.idade.map(d => (
                <BarraGoogle key={d.chave} label={rotuloIdade(d.chave)} valor={d.gasto} max={maxIdade}
                  extra={`${dec(d.conversoes)} conv.`} />
              ))}
            </div>
          </Painel>
        )}
        {(dados?.genero?.length ?? 0) > 0 && (
          <Painel titulo="Por gênero" icone={UsersRound}>
            <div className="space-y-3">
              {dados!.genero.map(d => (
                <BarraGoogle key={d.chave} label={GENERO_LABEL[d.chave] ?? d.chave} valor={d.gasto} max={maxGenero}
                  extra={`${dec(d.conversoes)} conv.`} />
              ))}
            </div>
          </Painel>
        )}
      </div>

      {/* Grupos de ativos */}
      {(dados?.grupos_ativos?.length ?? 0) > 0 && (
        <Painel titulo="Grupos de ativos" icone={Layers}>
          {/* ⚠️ NÃO é "por criativo". O Performance Max não expõe desempenho de
              anúncio individual como o Meta — o grão mais fino que existe aqui é o
              grupo de ativos. Rotular isso de criativo faria a coluna parecer
              comparável com a aba do Meta, e ela não é. */}
          <p className="text-[11px] text-slate-500 mb-3">
            O Performance Max não expõe desempenho por anúncio individual como o Meta; este é o
            recorte mais fino disponível no Google.
          </p>
          <div className="space-y-3">
            {dados!.grupos_ativos.map(g => (
              <BarraGoogle
                key={g.chave}
                label={g.chave}
                valor={g.gasto}
                max={Math.max(1, ...dados!.grupos_ativos.map(x => x.gasto))}
                extra={`${dec(g.conversoes)} conv.`}
              />
            ))}
          </div>
        </Painel>
      )}

      {/* Atribuição de leads — gêmea da tabela do Meta.
          ⚠️ SEM coluna "Anúncio": o Performance Max não expõe anúncio individual, então o
          grão mais fino que existe aqui é a campanha. Inventar a coluna faria a tabela
          parecer comparável com a do Meta, e ela não é. */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <Users className="w-4 h-4" /> Leads atribuídos a anúncios
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400">
              Atribuídos: <span className="text-white font-bold">{leadsGoogle.length}</span>
            </span>
            <span className="text-slate-400">
              Matricularam: <span className="text-emerald-400 font-bold">{matricularam}</span>
            </span>
          </div>
        </div>

        {carregandoLeads ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        ) : leadsGoogle.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <MousePointerClick className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum lead atribuído ainda.</p>
            <p className="text-xs text-slate-500 mt-1">
              A captura de gclid foi ligada em 17/09/2026 — leads que clicarem em anúncio do
              Google a partir de agora aparecem aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="text-left px-5 py-3 font-medium">Lead</th>
                  <th className="text-left px-4 py-3 font-medium">Campanha</th>
                  <th className="text-center px-4 py-3 font-medium">Unidade</th>
                  <th className="text-center px-4 py-3 font-medium">Data</th>
                  <th className="text-center px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {paginacaoLeads.paginados.map(lead => {
                  const campId = lead.google_ads_campanha_id;
                  // Sem nome conhecido, mostra o id cru em vez de "—": some assim que a
                  // captura diária trouxer a campanha, e enquanto isso denuncia a lacuna.
                  const campanha = campId ? (nomeCampanha.get(campId) || campId) : '—';
                  return (
                    <tr key={lead.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 text-sm text-white">{lead.nome || '(sem nome)'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300" title={lead.gclid}>{campanha}</td>
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
          totalItens={leadsGoogle.length}
          porPagina={15}
          labelItem="leads"
          corAtiva="bg-blue-600"
        />
      </div>
    </div>
  );
}
