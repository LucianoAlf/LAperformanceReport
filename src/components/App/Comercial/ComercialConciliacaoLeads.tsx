import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Route,
  Search,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SelectOption {
  value: number;
  label: string;
}

interface ComercialConciliacaoLeadsProps {
  unidadeId: string | 'todos' | null | undefined;
  ano: number;
  mes: number;
  canais: SelectOption[];
  cursos: SelectOption[];
  onResolvido?: () => void | Promise<void>;
}

interface ConciliacaoLeadResumo {
  leads_total?: number;
  linhas_leads?: number;
  leads_sem_origem?: number;
  leads_sem_curso?: number;
  impacto_sem_origem?: number;
  impacto_sem_curso?: number;
  tarefas_total?: number;
  leads_com_pendencia?: number;
  origem_pendente?: number;
  curso_pendente?: number;
}

interface ConciliacaoLeadItem {
  lead_id: number;
  unidade_id: string | null;
  unidade_nome: string | null;
  unidade_codigo: string | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  data_contato: string | null;
  status: string | null;
  quantidade: number;
  tipo: 'origem_pendente' | 'curso_pendente' | string;
  campo: 'canal_origem_id' | 'curso_interesse_id';
  tipo_label: string;
  descricao: string;
  canal_origem_id: number | null;
  canal_origem_nome: string | null;
  curso_interesse_id: number | null;
  curso_interesse_nome: string | null;
  observacoes: string | null;
  updated_at: string | null;
}

interface ConciliacaoLeadPayload {
  resumo?: ConciliacaoLeadResumo;
  items?: ConciliacaoLeadItem[];
}

const resumoVazio: Required<ConciliacaoLeadResumo> = {
  leads_total: 0,
  linhas_leads: 0,
  leads_sem_origem: 0,
  leads_sem_curso: 0,
  impacto_sem_origem: 0,
  impacto_sem_curso: 0,
  tarefas_total: 0,
  leads_com_pendencia: 0,
  origem_pendente: 0,
  curso_pendente: 0,
};

function normalizarUnidade(unidadeId: ComercialConciliacaoLeadsProps['unidadeId']) {
  return !unidadeId || unidadeId === 'todos' ? null : unidadeId;
}

function formatarData(data: string | null) {
  if (!data) return '-';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function normalizarBusca(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function campoLabel(campo: ConciliacaoLeadItem['campo']) {
  return campo === 'canal_origem_id' ? 'origem' : 'curso';
}

function opcoesParaCampo(
  campo: ConciliacaoLeadItem['campo'],
  canais: SelectOption[],
  cursos: SelectOption[],
) {
  return campo === 'canal_origem_id' ? canais : cursos;
}

function agruparPorLead(items: ConciliacaoLeadItem[]) {
  const grupos = new Map<number, ConciliacaoLeadItem[]>();
  for (const item of items) {
    const atual = grupos.get(item.lead_id) || [];
    atual.push(item);
    grupos.set(item.lead_id, atual);
  }
  return Array.from(grupos.entries()).map(([leadId, itens]) => ({
    leadId,
    lead: itens[0],
    itens,
  }));
}

// Atualizacao otimista: remove o item ja resolvido (RPC ja persistiu + auditou) e recalcula
// os contadores derivaveis da lista visivel, sem refetch. Evita rebaixar tudo a cada "Aplicar".
function aplicarResolucaoLocal(
  payload: ConciliacaoLeadPayload | null,
  resolvido: ConciliacaoLeadItem,
): ConciliacaoLeadPayload | null {
  if (!payload) return payload;
  const items = (payload.items || []).filter(
    (it) => !(it.lead_id === resolvido.lead_id && it.campo === resolvido.campo),
  );
  const resumoAtual = { ...resumoVazio, ...(payload.resumo || {}) };
  const quantidade = resolvido.quantidade || 1;
  const resumo: ConciliacaoLeadResumo = {
    ...resumoAtual,
    tarefas_total: items.length,
    origem_pendente: items.filter((it) => it.campo === 'canal_origem_id').length,
    curso_pendente: items.filter((it) => it.campo === 'curso_interesse_id').length,
    leads_com_pendencia: new Set(items.map((it) => it.lead_id)).size,
    impacto_sem_origem:
      resolvido.campo === 'canal_origem_id'
        ? Math.max(0, resumoAtual.impacto_sem_origem - quantidade)
        : resumoAtual.impacto_sem_origem,
    impacto_sem_curso:
      resolvido.campo === 'curso_interesse_id'
        ? Math.max(0, resumoAtual.impacto_sem_curso - quantidade)
        : resumoAtual.impacto_sem_curso,
  };
  return { resumo, items };
}

export function ComercialConciliacaoLeads({
  unidadeId,
  ano,
  mes,
  canais,
  cursos,
  onResolvido,
}: ComercialConciliacaoLeadsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ConciliacaoLeadPayload | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);

  // Sincronizacao do pai (loadData, pesado) fica adiada: so dispara quando o usuario sai da
  // aba (unmount) se houve alguma resolucao. Ref evita closure velha no cleanup.
  const onResolvidoRef = useRef(onResolvido);
  useEffect(() => { onResolvidoRef.current = onResolvido; }, [onResolvido]);
  const paiDesatualizado = useRef(false);
  useEffect(() => {
    return () => {
      if (paiDesatualizado.current) {
        paiDesatualizado.current = false;
        void onResolvidoRef.current?.();
      }
    };
  }, []);

  const carregar = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_conciliacao_leads_qualidade_v1', {
        p_unidade_id: normalizarUnidade(unidadeId),
        p_ano: ano,
        p_mes: mes,
        p_tipo: filtroTipo,
      });

      if (rpcError) throw rpcError;
      setPayload((data || {}) as ConciliacaoLeadPayload);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar qualidade dos leads');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, ano, mes, filtroTipo]);

  const resumo = { ...resumoVazio, ...(payload?.resumo || {}) };
  const items = payload?.items || [];
  const termoBusca = normalizarBusca(busca);

  const itemsFiltrados = useMemo(() => {
    if (!termoBusca) return items;
    return items.filter((item) => {
      const alvo = [
        item.nome,
        item.telefone,
        item.email,
        item.unidade_nome,
        item.unidade_codigo,
        item.observacoes,
      ].filter(Boolean).join(' ');
      return normalizarBusca(alvo).includes(termoBusca);
    });
  }, [items, termoBusca]);

  const grupos = agruparPorLead(itemsFiltrados);

  const salvar = async (item: ConciliacaoLeadItem) => {
    const key = `${item.lead_id}:${item.campo}`;
    const valor = Number(drafts[key]);

    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error(`Escolha uma ${campoLabel(item.campo)} antes de aplicar.`);
      return;
    }

    setSalvandoKey(key);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || 'usuario_app';

      const { error: rpcError } = await supabase.rpc('resolver_conciliacao_lead_qualidade', {
        p_lead_id: item.lead_id,
        p_campo: item.campo,
        p_valor_id: valor,
        p_decidido_por: email,
        p_motivo: 'Conferido pela equipe comercial na conciliacao de leads',
      });

      if (rpcError) throw rpcError;

      toast.success('Lead atualizado com auditoria.');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      // Atualiza a lista na hora (sem refetch) e marca o pai como desatualizado — o loadData
      // pesado so roda ao sair da aba.
      setPayload((prev) => aplicarResolucaoLocal(prev, item));
      paiDesatualizado.current = true;
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao resolver pendencia do lead');
    } finally {
      setSalvandoKey(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/50">
      <div className="border-b border-slate-700/50 bg-gradient-to-r from-teal-500/10 via-slate-800/60 to-cyan-500/10 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-teal-300">
              <ClipboardCheck className="h-4 w-4" />
              Qualidade de dados comerciais
            </div>
            <h2 className="text-2xl font-bold text-white">Qualidade dos Leads</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Dados de leads a completar antes do fechamento. Origem e curso alimentam diretamente
              o relatorio mensal; cada correcao passa por RPC auditada.
            </p>
          </div>
          <button
            type="button"
            onClick={carregar}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-400/40 bg-teal-500/10 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-500/20"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <ResumoCard
            icon={Users}
            label="Leads com pendencia"
            value={resumo.leads_com_pendencia}
            helper={`${resumo.tarefas_total} tarefa(s)`}
            tone="teal"
          />
          <ResumoCard
            icon={Route}
            label="Origem pendente"
            value={resumo.origem_pendente}
            helper={`${resumo.impacto_sem_origem} lead(s) no relatorio`}
            tone="cyan"
          />
          <ResumoCard
            icon={BookOpen}
            label="Curso pendente"
            value={resumo.curso_pendente}
            helper={`${resumo.impacto_sem_curso} lead(s) no relatorio`}
            tone="violet"
          />
          <ResumoCard
            icon={ClipboardCheck}
            label="Leads no periodo"
            value={resumo.leads_total}
            helper={`${resumo.linhas_leads} linha(s)`}
            tone="slate"
          />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar lead..."
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950/60 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-teal-400/70"
            />
          </div>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-10 w-full border-slate-700 bg-slate-950/60 text-slate-100 md:w-56">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="origem_pendente">Somente origem</SelectItem>
              <SelectItem value="curso_pendente">Somente curso</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-700/60 bg-slate-950/30 p-8 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin text-teal-300" />
            Carregando pendencias de leads...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
              <div>
                <p className="font-semibold text-rose-100">Erro ao carregar qualidade dos leads</p>
                <p className="mt-1 text-sm text-rose-100/80">{error}</p>
              </div>
            </div>
          </div>
        ) : grupos.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-300" />
            <h3 className="font-semibold text-emerald-50">Nenhuma pendencia de qualidade neste filtro</h3>
            <p className="mt-1 text-sm text-emerald-100/75">
              Origem e curso dos leads estao completos para esta competencia.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map(({ leadId, lead, itens }) => (
              <div key={leadId} className="rounded-xl border border-slate-700/70 bg-slate-900/70">
                <div className="flex flex-col gap-3 border-b border-slate-700/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{lead.nome || `Lead #${lead.lead_id}`}</h3>
                      <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                        {lead.unidade_codigo || lead.unidade_nome || 'Unidade'}
                      </span>
                      <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-200">
                        {itens.length} tarefa(s)
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatarData(lead.data_contato)} · {lead.telefone || 'sem telefone'} · {lead.status || 'sem status'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Quantidade no relatorio: <span className="font-semibold text-slate-300">{lead.quantidade || 1}</span>
                  </p>
                </div>

                <div className="divide-y divide-slate-700/60">
                  {itens.map((item) => {
                    const key = `${item.lead_id}:${item.campo}`;
                    const opcoes = opcoesParaCampo(item.campo, canais, cursos);
                    const selecionado = drafts[key] || '';
                    const salvando = salvandoKey === key;

                    return (
                      <div key={key} className="grid gap-3 px-4 py-4 lg:grid-cols-[180px_1fr_280px_auto] lg:items-center">
                        <div>
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold',
                            item.campo === 'canal_origem_id'
                              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                              : 'border-violet-500/30 bg-violet-500/10 text-violet-200',
                          )}>
                            {item.campo === 'canal_origem_id' ? <Route className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
                            {item.tipo_label}
                          </span>
                        </div>

                        <div className="grid gap-1 text-sm">
                          <p className="text-slate-200">{item.descricao}</p>
                          <p className="text-xs text-slate-500">
                            Atual: {item.campo === 'canal_origem_id'
                              ? item.canal_origem_nome || 'Nao informado'
                              : item.curso_interesse_nome || 'Nao informado'}
                          </p>
                        </div>

                        <Select
                          value={selecionado}
                          onValueChange={(value) => setDrafts((prev) => ({ ...prev, [key]: value }))}
                        >
                          <SelectTrigger className="h-9 border-slate-700 bg-slate-950/70 text-slate-100">
                            <SelectValue placeholder={item.campo === 'canal_origem_id' ? 'Escolher origem' : 'Escolher curso'} />
                          </SelectTrigger>
                          <SelectContent>
                            {opcoes.map((opcao) => (
                              <SelectItem key={opcao.value} value={String(opcao.value)}>
                                {opcao.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <button
                          type="button"
                          disabled={salvando || !selecionado}
                          onClick={() => salvar(item)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                          Aplicar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface ResumoCardProps {
  icon: typeof Users;
  label: string;
  value: number;
  helper: string;
  tone: 'teal' | 'cyan' | 'violet' | 'slate';
}

const toneClasses: Record<ResumoCardProps['tone'], string> = {
  teal: 'border-teal-500/30 bg-teal-500/10 text-teal-200',
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
  slate: 'border-slate-600/70 bg-slate-900/60 text-slate-200',
};

function ResumoCard({ icon: Icon, label, value, helper, tone }: ResumoCardProps) {
  return (
    <div className={cn('rounded-xl border p-4', toneClasses[tone])}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
        <Icon className="h-4 w-4 opacity-80" />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs opacity-75">{helper}</p>
    </div>
  );
}
