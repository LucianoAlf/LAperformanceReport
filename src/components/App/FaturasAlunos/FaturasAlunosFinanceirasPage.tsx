import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Barcode,
  BadgeCheck,
  Banknote,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  FileCheck2,
  FileWarning,
  Landmark,
  Loader2,
  ReceiptText,
  RefreshCw,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useAuth } from '@/contexts/AuthContext';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import type { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useUnidades } from '@/hooks/useSupabase';
import {
  carregarFaturasAlunosFinanceiras,
  FATURAS_FINANCEIRAS_LOADING,
  filtrarFaturasFinanceirasLocais,
  normalizarSituacaoFaturasFinanceiras,
  type FaturaFinanceiraItem,
  type FaturasFinanceirasSituacao,
  type FaturasFinanceirasState,
  type FinanceiroRpcClient,
} from '@/lib/faturasAlunosFinanceiras';
import { supabase } from '@/lib/supabase';
import { cn, formatCurrency } from '@/lib/utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_BR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
const DATA_HORA_BR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const COMPETENCIA_BR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short', year: 'numeric' });

const financeiroRpcClient: FinanceiroRpcClient = {
  async rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    return { data, error };
  },
};

const hojeBrasilia = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const dataUtc = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatarData = (value: string | null) => value ? DATA_BR.format(dataUtc(value)) : '—';
const formatarDataHora = (value: string | null) => value ? DATA_HORA_BR.format(new Date(value)) : '—';
const formatarCompetencia = (value: string) => COMPETENCIA_BR.format(dataUtc(value));
const moeda = (value: number) => formatCurrency(value, 2);

function competenciaAtual() {
  const [year, month] = hojeBrasilia().split('-').map(Number);
  return { year, month };
}

function competenciaValida(value: string | null) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])-01$/u.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return { year, month, value };
}

function diasAtraso(dataVencimento: string, dataCorte: string) {
  const ms = dataUtc(dataCorte).getTime() - dataUtc(dataVencimento).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

const comparaData = (left: string, right: string) => (
  dataUtc(left).getTime() - dataUtc(right).getTime()
);

function rotuloStatus(item: FaturaFinanceiraItem, dataCorte: string) {
  if (item.status === 'paga') return 'Paga';
  if (item.status === 'cancelada') return 'Cancelada';
  const dias = diasAtraso(item.data_vencimento, dataCorte);
  if (dias > 0) return `Em atraso • ${dias}d`;
  if (comparaData(item.data_vencimento, dataCorte) === 0) return 'Vence hoje';
  return 'A vencer';
}

function statusTone(item: FaturaFinanceiraItem, dataCorte: string) {
  if (item.status === 'paga') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
  if (item.status === 'cancelada') return 'border-slate-600 bg-slate-700/35 text-slate-300';
  if (comparaData(item.data_vencimento, dataCorte) < 0) return 'border-rose-500/25 bg-rose-500/10 text-rose-200';
  return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
}

function motivoReconciliacao(motivo: string) {
  const labels: Record<string, string> = {
    source_missing: 'Fatura não observada na origem',
    identidade_invalida: 'Matrícula ou aluno sem vínculo exato',
    status_desconhecido: 'Status de fatura não reconhecido',
    validacao_origem: 'Metadado inválido recebido da origem',
    forma_pagamento_ausente: 'Forma de pagamento não informada',
    contato_pendente: 'Contato local ainda não resolvido',
  };
  return labels[motivo] ?? motivo.replaceAll('_', ' ');
}

function rotuloFormaPagamento(item: FaturaFinanceiraItem) {
  if (item.forma_pagamento.fonte === 'transacao') return 'Pago via';
  if (item.forma_pagamento.fonte === 'matricula') return 'Forma prevista';
  return 'Forma não informada';
}

function normalizarFormaPagamento(value: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function iconeFormaPagamento(value: string | null) {
  const nome = normalizarFormaPagamento(value);
  if (nome.includes('pix')) return QrCode;
  if (nome.includes('cartao') || nome.includes('recorrente') || nome.includes('cobranca automatica')) return CreditCard;
  if (nome.includes('boleto')) return Barcode;
  if (nome.includes('cheque')) return FileCheck2;
  if (nome.includes('dinheiro') || nome.includes('especie')) return Banknote;
  if (nome.includes('transfer') || nome.includes('ted') || nome.includes('doc')) return Landmark;
  return CircleHelp;
}

function MetricCard({
  label,
  count,
  value,
  tone,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  count: number;
  value: number;
  tone: 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    cyan: 'border-cyan-500/20 from-cyan-500/[0.13] to-slate-950/40 text-cyan-200',
    emerald: 'border-emerald-500/20 from-emerald-500/[0.13] to-slate-950/40 text-emerald-200',
    amber: 'border-amber-500/20 from-amber-500/[0.13] to-slate-950/40 text-amber-200',
    rose: 'border-rose-500/20 from-rose-500/[0.13] to-slate-950/40 text-rose-200',
    slate: 'border-slate-700 from-slate-800/75 to-slate-950/40 text-slate-200',
  } as const;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.13em] text-slate-400">{label}</span>
        <span className="rounded-full bg-slate-950/45 px-2 py-0.5 text-xs font-semibold text-slate-200">{count}</span>
      </div>
      <p className={cn('mt-5 text-xl font-semibold tabular-nums', tones[tone].split(' ').at(-1))}>{moeda(value)}</p>
    </>
  );
  if (!onClick) return <div className={cn('rounded-2xl border bg-gradient-to-br p-4 shadow-lg shadow-slate-950/15', tones[tone])}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'rounded-2xl border bg-gradient-to-br p-4 text-left shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-50',
        tones[tone],
        active && 'ring-2 ring-cyan-300/65 shadow-cyan-500/10',
      )}
    >
      {content}
    </button>
  );
}

function OperationalViewButton({
  label,
  count,
  description,
  Icon,
  active,
  disabled = false,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  description: string;
  Icon: typeof Banknote;
  active: boolean;
  disabled?: boolean;
  tone: 'amber' | 'rose' | 'slate';
  onClick: () => void;
}) {
  const styles = {
    amber: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-100 hover:bg-amber-500/[0.14] focus-visible:ring-amber-400/60',
    rose: 'border-rose-500/25 bg-rose-500/[0.08] text-rose-100 hover:bg-rose-500/[0.14] focus-visible:ring-rose-400/60',
    slate: 'border-slate-700 bg-slate-800/45 text-slate-200 hover:bg-slate-800/75 focus-visible:ring-slate-400/60',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'group flex min-w-[210px] flex-1 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45',
        styles[tone],
        active && 'ring-2 ring-current/35',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950/35"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3 text-sm font-semibold"><span>{label}</span><span className="tabular-nums">{count}</span></span>
        <span className="mt-0.5 block truncate text-[11px] opacity-65">{description}</span>
      </span>
    </button>
  );
}

function LeituraNotice({ state }: {
  state: FaturasFinanceirasState;
}) {
  const info = state.status === 'ok'
    ? {
      Icon: ShieldCheck,
      className: 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-100',
      title: 'Leitura canônica confirmada',
      description: 'O histórico e os totais vêm do último snapshot completo das três unidades.',
    }
    : state.status === 'partial'
      ? {
        Icon: FileWarning,
        className: 'border-amber-500/20 bg-slate-900/65 text-amber-100',
        title: 'Conciliação pendente — leitura financeira disponível',
        description: 'Confira os itens em Reconciliação financeira. Faturas confirmadas na origem entram nos totais; as não observadas ficam fora e não devem ser tratadas como pagas.',
      }
      : {
        Icon: Clock3,
        className: 'border-rose-500/35 bg-rose-500/[0.08] text-rose-100',
        title: 'Snapshot expirado — atualização necessária',
        description: 'Você pode revisar o histórico, mas confirme a atualização antes de tomar decisão operacional sobre os valores.',
      };
  const Icon = info.Icon;
  return (
    <section className={cn('flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-4 py-3.5', info.className)} aria-live="polite">
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-xl bg-slate-950/30 p-2.5"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-sm font-semibold">{info.title}</p>
          <p className="mt-0.5 text-xs opacity-75">{info.description}</p>
        </div>
      </div>
      <div className="text-right text-[11px] leading-5 text-slate-400">
          <p>Sync mais antigo: <span className="text-slate-200">{formatarDataHora(state.freshness.syncMaisAntigo)}</span></p>
          <p>Válido até: <span className="text-slate-200">{formatarDataHora(state.freshness.validoAte)}</span></p>
      </div>
    </section>
  );
}

type FaturasOutletContext = {
  filtroAtivo: string | null;
  unidadeSelecionada: UnidadeId;
  setUnidadeSelecionada?: (value: string | null) => void;
  competencia?: ReturnType<typeof useCompetenciaFiltro>;
};

export function FaturasAlunosFinanceirasPage() {
  useSetPageTitle({
    titulo: 'Faturas de Alunos',
    subtitulo: 'Visão financeira de faturas pagas, em aberto e em reconciliação',
    icone: ReceiptText,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-cyan-500 to-emerald-500',
  });

  const context = useOutletContext<FaturasOutletContext>();
  const { isAdmin, unidadeId, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: unidades = [] } = useUnidades();
  const [state, setState] = useState<FaturasFinanceirasState>(FATURAS_FINANCEIRAS_LOADING);
  const [refreshing, setRefreshing] = useState(false);
  const [faturaSelecionada, setFaturaSelecionada] = useState<FaturaFinanceiraItem | null>(null);
  const dataCorte = useMemo(hojeBrasilia, []);

  const unidadeParam = searchParams.get('unidade');
  const unidadeDeepLink = isAdmin && unidadeParam === 'todos'
    ? 'todos'
    : isAdmin && unidadeParam && UUID.test(unidadeParam)
      ? unidadeParam
      : null;
  const unidadeConsulta = isAdmin
    ? (unidadeDeepLink ?? context?.filtroAtivo ?? 'todos')
    : unidadeId;
  const unidadePronta = !authLoading && (isAdmin || Boolean(unidadeConsulta));
  const competenciaGlobal = context?.competencia;
  const competenciaParam = competenciaValida(searchParams.get('competencia'));
  const competenciaPadrao = competenciaAtual();
  const ano = competenciaParam?.year ?? competenciaGlobal?.filtro.ano ?? competenciaPadrao.year;
  const mes = competenciaParam?.month ?? competenciaGlobal?.filtro.mes ?? competenciaPadrao.month;
  const modoPeriodo = 'competencia' as const;
  const situacao = normalizarSituacaoFaturasFinanceiras(searchParams.get('situacao'));
  const busca = searchParams.get('busca') ?? '';
  const curso = searchParams.get('curso') ?? 'todos';
  const pagamento = searchParams.get('pagamento') ?? 'todos';
  const alunoId = Number(searchParams.get('aluno')) || null;
  const matriculaId = searchParams.get('matricula');

  const setFiltro = useCallback((key: string, value: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value == null || value === '' || value === 'todos') next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!unidadeParam) return;
    if (isAdmin) {
      const unidadeInicial = unidadeParam === 'todos'
        ? null
        : UUID.test(unidadeParam)
          ? unidadeParam
          : undefined;
      if (unidadeInicial !== undefined) context?.setUnidadeSelecionada?.(unidadeInicial);
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('unidade');
      return next;
    }, { replace: true });
  }, [context, isAdmin, setSearchParams, unidadeParam]);

  useEffect(() => {
    if (!competenciaGlobal) return;
    if (competenciaGlobal.filtro.tipo !== 'mensal') competenciaGlobal.setTipo('mensal');
    if (!competenciaParam) return;
    if (competenciaGlobal.filtro.ano !== competenciaParam.year) competenciaGlobal.setAno(competenciaParam.year);
    if (competenciaGlobal.filtro.mes !== competenciaParam.month) competenciaGlobal.setMes(competenciaParam.month);
  }, [competenciaGlobal, competenciaParam]);

  const selecionarCompetencia = useCallback((nextAno: number, nextMes: number) => {
    competenciaGlobal?.setTipo('mensal');
    competenciaGlobal?.setAno(nextAno);
    competenciaGlobal?.setMes(nextMes);
    setFiltro('competencia', `${nextAno}-${String(nextMes).padStart(2, '0')}-01`);
  }, [competenciaGlobal, setFiltro]);

  const carregar = useCallback(async () => {
    setState(FATURAS_FINANCEIRAS_LOADING);
    if (!unidadePronta) return;
    const next = await carregarFaturasAlunosFinanceiras(financeiroRpcClient, {
      unidadeId: unidadeConsulta,
      ano,
      mes,
      modoPeriodo,
      situacao,
      asOfDate: dataCorte,
    });
    setState(next);
  }, [ano, dataCorte, mes, modoPeriodo, situacao, unidadeConsulta, unidadePronta]);

  useEffect(() => { void carregar(); }, [carregar]);

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      const competencia = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const { data, error } = await supabase.functions.invoke('atualizar-inadimplencia-emusys', {
        body: { competencia, include_backlog: true },
      });
      if (error) throw error;
      const payload = data as Record<string, unknown> | null;
      const queueStatus = String(payload?.queue_status ?? 'pending');
      toast.success(queueStatus === 'succeeded' ? 'Leitura financeira atualizada.' : 'Atualização enviada para a fila financeira.');
      window.setTimeout(() => { void carregar(); }, queueStatus === 'succeeded' ? 300 : 3_500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível solicitar a atualização financeira.');
    } finally {
      setRefreshing(false);
    }
  }, [ano, carregar, mes]);

  const cursos = useMemo(() => [...new Set(state.items
    .map((item) => item.aluno.curso_nome)
    .filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [state.items]);
  const pagamentos = useMemo(() => [...new Set(state.items
    .map((item) => item.forma_pagamento.nome)
    .filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [state.items]);
  const itemsFiltrados = useMemo(() => filtrarFaturasFinanceirasLocais(state.items, {
    busca,
    curso: curso === 'todos' ? null : curso,
    pagamento: pagamento === 'todos' ? null : pagamento,
    alunoId,
    matriculaId,
  }), [alunoId, busca, curso, matriculaId, pagamento, state.items]);
  const unidadesPorId = useMemo(() => new Map(unidades.map((unidade) => [unidade.id, unidade.nome])), [unidades]);

  const selecionarSituacao = (next: FaturasFinanceirasSituacao) => {
    setFiltro('situacao', next === 'todas' ? null : next);
  };

  const limparFiltros = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const key of ['busca', 'curso', 'pagamento', 'aluno', 'matricula', 'situacao', 'unidade']) next.delete(key);
      return next;
    }, { replace: true });
  };

  const carregando = state.status === 'loading';
  const mostrarReconciliacao = situacao === 'reconciliacao';
  const filtroCompetencia = competenciaGlobal
    ? { ...competenciaGlobal.filtro, tipo: 'mensal' as const, ano, mes }
    : null;

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 pb-8">
      {competenciaGlobal && filtroCompetencia && (
        <PageFilterBar className="flex-wrap gap-3">
          <CompetenciaFilter
            filtro={filtroCompetencia}
            range={competenciaGlobal.range}
            anosDisponiveis={competenciaGlobal.anosDisponiveis}
            tiposPermitidos={['mensal']}
            onTipoChange={() => competenciaGlobal.setTipo('mensal')}
            onAnoChange={(nextAno) => selecionarCompetencia(nextAno, mes)}
            onMesChange={(nextMes) => selecionarCompetencia(ano, nextMes)}
            onTrimestreChange={competenciaGlobal.setTrimestre}
            onSemestreChange={competenciaGlobal.setSemestre}
          />
          <button
            type="button"
            onClick={refreshNow}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:cursor-wait disabled:opacity-60"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {refreshing ? 'Na fila...' : 'Atualizar agora'}
          </button>
        </PageFilterBar>
      )}

      <section className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900/70 shadow-2xl shadow-slate-950/25">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_34%),linear-gradient(110deg,rgba(15,23,42,0.95),rgba(2,6,23,0.85))] px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-cyan-200"><Landmark className="h-3.5 w-3.5" /> Leitura canônica</span>
            <span className="text-slate-600">•</span>
            <span>Emusys → snapshot completo</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>Atual: 15 min</span>
            <span>Anteriores: 60 min</span>
            <span>Backlog: 2 h</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <p className="text-sm text-slate-300">
            Corte em <span className="font-semibold text-slate-100">{formatarData(dataCorte)}</span>
            <span className="mx-2 text-slate-600">•</span>
            competência {formatarCompetencia(`${ano}-${String(mes).padStart(2, '0')}-01`)}
          </p>
          <p className="text-xs text-slate-500">Fonte: {state.source ?? 'aguardando leitura'}</p>
        </div>
      </section>

      {carregando ? <LoadingState /> : state.status === 'error' ? (
        <section role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.08] p-5 text-rose-100">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5" /><div><p className="font-semibold">Falha na leitura financeira</p><p className="mt-1 text-sm text-rose-100/75">{state.error}</p></div></div>
        </section>
      ) : (
        <>
          <LeituraNotice state={state} />

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Todas as faturas" count={state.totals.todas.quantidade} value={state.totals.todas.valor} tone="cyan" active={situacao === 'todas'} onClick={() => selecionarSituacao('todas')} />
            <MetricCard label="Pagas" count={state.totals.pagas.quantidade} value={state.totals.pagas.valor} tone="emerald" active={situacao === 'pagas'} onClick={() => selecionarSituacao('pagas')} />
            <MetricCard label="Em aberto" count={state.totals.em_aberto.quantidade} value={state.totals.em_aberto.valor} tone="amber" active={situacao === 'em_aberto'} onClick={() => selecionarSituacao('em_aberto')} />
            <MetricCard label="Em atraso" count={state.totals.em_atraso_d0.quantidade} value={state.totals.em_atraso_d0.valor} tone="rose" active={situacao === 'em_atraso_d0'} onClick={() => selecionarSituacao('em_atraso_d0')} />
            <MetricCard label="A vencer" count={state.totals.a_vencer.quantidade} value={state.totals.a_vencer.valor} tone="slate" active={situacao === 'a_vencer'} onClick={() => selecionarSituacao('a_vencer')} />
          </section>
          <p className="-mt-2 text-xs text-slate-500">Leitura dos valores: faturas pagas usam o valor efetivamente pago; faturas em aberto usam o valor atualizado hoje, sem desconto condicional e com multa/mora do contrato. Por isso o total pode diferir do resumo original do Emusys.</p>

          <section aria-label="Visões operacionais de faturas" className="flex flex-wrap gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/45 p-3">
            <OperationalViewButton
              label="Reconciliação financeira"
              count={state.reconciliation.total}
              description="Conferir vínculos e metadados"
              Icon={FileWarning}
              active={situacao === 'reconciliacao'}
              tone="amber"
              onClick={() => selecionarSituacao('reconciliacao')}
            />
            <OperationalViewButton
              label="Canceladas — histórico"
              count={state.totals.canceladas.quantidade}
              description="Fora dos totais desta competência"
              Icon={ReceiptText}
              active={situacao === 'canceladas'}
              tone="slate"
              onClick={() => selecionarSituacao('canceladas')}
            />
          </section>

          {mostrarReconciliacao ? (
            <ReconciliationPanelV2 state={state} unidadeNome={unidadesPorId} />
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-700/75 bg-slate-900/55 shadow-xl shadow-slate-950/20">
              <div className="border-b border-slate-800 bg-slate-900/80 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative min-w-[230px] flex-1" htmlFor="faturas-busca">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <span className="sr-only">Buscar faturas</span>
                    <input
                      id="faturas-busca"
                      value={busca}
                      onChange={(event) => setFiltro('busca', event.target.value || null)}
                      placeholder="Aluno, matrícula, fatura ou descrição..."
                      className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950/70 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus-visible:border-cyan-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20"
                    />
                  </label>
                  <Select value={curso} onValueChange={(value) => setFiltro('curso', value)}>
                    <SelectTrigger className="w-[160px] bg-slate-950/70"><SelectValue placeholder="Curso" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os cursos</SelectItem>
                      {cursos.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={pagamento} onValueChange={(value) => setFiltro('pagamento', value)}>
                    <SelectTrigger className="w-[190px] bg-slate-950/70"><SelectValue placeholder="Forma de pagamento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas as formas</SelectItem>
                      {pagamentos.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button type="button" onClick={limparFiltros} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"><RotateCcw className="h-4 w-4" /> Limpar</button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{itemsFiltrados.length} faturas nesta visão</span>
                  <span>Valores e status vêm do snapshot da competência selecionada</span>
                </div>
              </div>
              <InvoicesTable
                items={itemsFiltrados}
                dataCorte={dataCorte}
                unidadeNome={unidadesPorId}
                onDetail={setFaturaSelecionada}
              />
            </section>
          )}
        </>
      )}

      <FaturaDetailDialogV2 item={faturaSelecionada} dataCorte={dataCorte} unidadeNome={faturaSelecionada ? unidadesPorId.get(faturaSelecionada.unidade_id) ?? null : null} onClose={() => setFaturaSelecionada(null)} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-label="Carregando faturas de alunos">
      <div className="h-20 animate-pulse rounded-2xl bg-slate-800/70" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-800/70" />)}</div>
      <div className="h-80 animate-pulse rounded-2xl bg-slate-800/70" />
    </div>
  );
}

function InvoicesTable({ items, dataCorte, unidadeNome, onDetail }: {
  items: FaturaFinanceiraItem[];
  dataCorte: string;
  unidadeNome: ReadonlyMap<string, string>;
  onDetail: (item: FaturaFinanceiraItem) => void;
}) {
  if (items.length === 0) {
    return <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4"><ReceiptText className="h-8 w-8 text-slate-500" /></div><h2 className="mt-4 font-semibold text-slate-200">Nenhuma fatura nesta visão</h2><p className="mt-1 max-w-lg text-sm text-slate-500">Altere os filtros ou consulte outra competência para revisar o histórico financeiro.</p></div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1450px] w-full text-left text-sm">
        <thead className="border-b border-slate-700/70 bg-slate-950/45 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-medium">Aluno / curso</th><th className="px-3 py-3 font-medium">Situação</th><th className="px-3 py-3 font-medium">Vencimento</th><th className="px-3 py-3 font-medium">Forma de pagamento</th><th className="px-3 py-3 text-right font-medium">Valor com desconto</th><th className="px-3 py-3 text-right font-medium">Sem desconto condicional</th><th className="px-3 py-3 text-right font-medium">Valor atualizado</th><th className="px-3 py-3 font-medium">Matrícula</th><th className="px-4 py-3 text-right font-medium">Detalhe</th></tr></thead>
        <tbody className="divide-y divide-slate-800">
          {items.map((item) => {
            const valorPrincipal = item.status === 'paga' ? item.valores.valor_pago : item.valores.valor_hoje;
            const FormaPagamentoIcon = iconeFormaPagamento(item.forma_pagamento.nome);
            return (
              <tr key={`${item.unidade_id}|${item.canonical_fatura_id}`} className="group bg-slate-900/15 transition hover:bg-cyan-500/[0.035]">
                <td className="px-4 py-3.5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 group-hover:bg-cyan-500/10 group-hover:text-cyan-300"><UserRound className="h-4 w-4" /></div><div><p className="max-w-[260px] break-words font-medium text-slate-100">{item.aluno.nome}</p><p className="mt-0.5 text-[11px] text-slate-500">{unidadeNome.get(item.unidade_id) ?? item.unidade_codigo ?? 'Unidade'} • {item.aluno.curso_nome ?? 'Curso não informado'}</p></div></div></td>
                <td className="px-3 py-3.5"><span className={cn('inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium', statusTone(item, dataCorte))}>{rotuloStatus(item, dataCorte)}</span></td>
                <td className="px-3 py-3.5"><p className="text-slate-200">{formatarData(item.data_vencimento)}</p><p className="mt-0.5 text-[11px] capitalize text-slate-500">{formatarCompetencia(item.competencia)}</p></td>
                <td className="px-3 py-3.5"><span className={cn('inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-lg border px-2 py-1 text-xs', item.forma_pagamento.fonte === 'ausente' ? 'border-rose-500/25 bg-rose-500/10 text-rose-200' : item.forma_pagamento.fonte === 'transacao' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200')}><FormaPagamentoIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{item.forma_pagamento.nome ?? 'Forma não informada'}</span><p className="mt-1 text-[10px] text-slate-500">{rotuloFormaPagamento(item)}</p></td>
                <td className="px-3 py-3.5 text-right tabular-nums text-slate-300">{moeda(item.valores.valor_com_desconto)}</td>
                <td className="px-3 py-3.5 text-right tabular-nums text-slate-400">{moeda(item.valores.valor_sem_desconto_condicional)}</td>
                <td className="px-3 py-3.5 text-right"><p className={cn('font-semibold tabular-nums', item.status === 'paga' ? 'text-emerald-300' : 'text-cyan-200')}>{valorPrincipal == null ? '—' : moeda(valorPrincipal)}</p><p className="mt-0.5 text-[10px] text-slate-500">{item.status === 'paga' ? 'Valor pago' : 'Calculado pelo contrato'}</p></td>
                <td className="px-3 py-3.5 font-mono text-xs text-slate-400">{item.emusys_matricula_id ?? '—'}</td>
                <td className="px-4 py-3.5 text-right"><button type="button" onClick={() => onDetail(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-500/35 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50">Ver detalhes <ChevronRight className="h-3.5 w-3.5" /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReconciliationPanelV2({ state, unidadeNome }: { state: FaturasFinanceirasState; unidadeNome: ReadonlyMap<string, string> }) {
  const cards = [
    ['Faturas não observadas', state.reconciliation.sourceMissing, 'Não assumir pagamento; aguardar novo snapshot'],
    ['Vínculo local pendente', state.reconciliation.identidadeInvalida, 'Pode entrar nos totais, nunca na cobrança'],
    ['Dados da origem', state.reconciliation.validacoesOrigem, 'IDs opcionais inválidos ou incompletos'],
    ['Forma de pagamento', state.reconciliation.formaPagamentoAusente, 'Metadado ausente; conferir cadastro'],
    ['Contato local', state.reconciliation.contatoPendente, 'Contato único ainda não resolvido'],
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-500/25 bg-slate-900/55 shadow-xl shadow-slate-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-500/20 bg-amber-500/[0.045] px-5 py-4">
        <div>
          <p className="font-semibold text-amber-100">Conciliação financeira</p>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">{state.reconciliation.total} faturas precisam de conferência. Esta lista não é uma fila de cobrança: use a matrícula e os IDs Emusys, nunca o nome isolado.</p>
        </div>
        <span className="rounded-full border border-amber-500/25 bg-slate-950/35 px-3 py-1 text-sm font-semibold text-amber-100">{state.reconciliation.total} pendências</span>
      </div>
      <div className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, count, description]) => <div key={String(label)} className="bg-slate-900/90 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-100">{count}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>)}</div>
      <div className="border-b border-slate-800 bg-slate-950/25 px-5 py-3 text-xs text-slate-400"><span className="font-medium text-slate-200">Regra de leitura:</span> fatura confirmada na origem permanece nos totais financeiros, mas fica fora da cobrança enquanto o vínculo local não for resolvido. <span className="font-medium text-amber-200">Fatura não observada na origem não é prova de pagamento.</span></div>
      {state.reconciliation.items.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma pendência no recorte atual.</div> : <div className="divide-y divide-slate-800">{state.reconciliation.items.map((item) => {
        const semVinculo = item.aluno.id == null;
        const descricaoOrigem = item.descricao?.trim() || null;
        const isRateio = descricaoOrigem?.toLocaleLowerCase('pt-BR').includes('rateio entre unidades') ?? false;
        const origemAusente = item.motivos.includes('source_missing');
        const valorSecundario = item.status === 'paga' ? item.valores.valor_pago : item.valores.valor_hoje;
        return <div key={`${item.unidade_id}|${item.canonical_fatura_id}`} className="flex flex-wrap items-start justify-between gap-5 px-5 py-4">
          <div className="min-w-[260px] flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-100">{semVinculo ? (isRateio ? 'Lançamento interno — rateio entre unidades' : 'Registro sem vínculo local') : item.aluno.nome}</p><span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', item.status === 'paga' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : item.status === 'aberta' ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-slate-600 bg-slate-700/35 text-slate-300')}>{item.status === 'paga' ? 'Paga' : item.status === 'aberta' ? 'Em aberto' : item.status === 'cancelada' ? 'Cancelada' : 'Status não reconhecido'}</span></div>
            <p className="mt-1 text-xs text-slate-500">{unidadeNome.get(item.unidade_id) ?? item.unidade_codigo ?? 'Unidade'} • fatura Emusys {item.emusys_fatura_id} • venc. {formatarData(item.data_vencimento)}{item.data_pagamento ? ` • pago em ${formatarData(item.data_pagamento)}` : ''}</p>
            <p className="mt-1 text-[11px] text-slate-500">Matrícula Emusys: <span className="font-mono text-slate-300">{item.emusys_matricula_id ?? 'não informada'}</span> • aluno: <span className="font-mono text-slate-300">{item.emusys_student_id ?? 'não informado'}</span>{item.emusys_contrato_id ? <> • contrato: <span className="font-mono text-slate-300">{item.emusys_contrato_id}</span></> : null}</p>
            {item.aluno.vinculo_local_fonte ? <p className="mt-1 text-[11px] text-emerald-300/80">Vínculo local confirmado por {item.aluno.vinculo_local_fonte === 'aluno_unico_canonico' ? 'aluno único na visão canônica' : 'matrícula canônica sincronizada'}</p> : null}
            <p className="mt-1 text-[11px] text-slate-400"><span className="text-slate-500">Referência da origem:</span> {descricaoOrigem ?? 'sem descrição informada pelo Emusys'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{item.motivos.map((motivo) => <span key={motivo} className="rounded-md border border-amber-500/20 bg-amber-500/[0.07] px-2 py-1 text-[11px] text-amber-200">{motivoReconciliacao(motivo)}</span>)}</div>
            <p className="mt-2 text-[11px] text-slate-500">{origemAusente ? 'A origem não confirmou esta fatura neste snapshot.' : semVinculo ? 'O Emusys trouxe IDs e descrição, mas não um nome; falta vínculo local exato.' : 'Origem confirmada; falta completar o cadastro financeiro.'}</p>
          </div>
          <div className="min-w-[150px] text-right text-xs text-slate-400"><p>Original: <span className="font-semibold tabular-nums text-slate-200">{moeda(item.valores.valor_original)}</span></p><p className="mt-1">{item.status === 'paga' ? 'Pago' : 'Atualizado'}: <span className="font-semibold tabular-nums text-cyan-200">{valorSecundario == null ? '—' : moeda(valorSecundario)}</span></p><p className="mt-2 text-[11px] text-slate-600">Sync: {formatarDataHora(item.sync_completed_at)}</p></div>
        </div>;
      })}</div>}
    </section>
  );
}

function ReconciliationPanel({ state, unidadeNome }: { state: FaturasFinanceirasState; unidadeNome: ReadonlyMap<string, string> }) {
  const cards = [
    ['Faturas na origem', state.reconciliation.sourceMissing, 'Aguardando observação em novo snapshot'],
    ['Identidade inválida', state.reconciliation.identidadeInvalida, 'Matrícula ou aluno sem vínculo exato'],
    ['Validações de origem', state.reconciliation.validacoesOrigem, 'Metadados recebidos em quarentena'],
    ['Forma ausente', state.reconciliation.formaPagamentoAusente, 'Informe a forma antes de depender dela'],
    ['Contato pendente', state.reconciliation.contatoPendente, 'Fatura confirmada sem contato único'],
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-rose-500/25 bg-slate-900/55 shadow-xl shadow-slate-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-500/20 bg-rose-500/[0.07] px-5 py-4"><div><p className="font-semibold text-rose-100">Reconciliação financeira</p><p className="mt-1 text-sm text-rose-100/70">Resolva as pendências aqui. Elas não compõem os totais de cobrança.</p></div><span className="rounded-full border border-rose-500/25 bg-slate-950/30 px-3 py-1 text-sm font-semibold text-rose-100">{state.reconciliation.total} pendências</span></div>
      <div className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, count, description]) => <div key={String(label)} className="bg-slate-900/90 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-100">{count}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>)}</div>
      {state.reconciliation.items.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma pendência no recorte atual.</div> : <div className="divide-y divide-slate-800">{state.reconciliation.items.map((item) => <div key={`${item.unidade_id}|${item.canonical_fatura_id}`} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium text-slate-100">{item.aluno.nome}</p><p className="mt-0.5 text-xs text-slate-500">{unidadeNome.get(item.unidade_id) ?? item.unidade_codigo ?? 'Unidade'} • fatura {item.emusys_fatura_id} • venc. {formatarData(item.data_vencimento)}</p><div className="mt-2 flex flex-wrap gap-1.5">{item.motivos.map((motivo) => <span key={motivo} className="rounded-md border border-rose-500/20 bg-rose-500/[0.08] px-2 py-1 text-[11px] text-rose-200">{motivoReconciliacao(motivo)}</span>)}</div></div><div className="text-right text-xs text-slate-500"><p>{item.forma_pagamento.nome ?? 'Forma não informada'}</p><p className="mt-1">Sync: {formatarDataHora(item.sync_completed_at)}</p></div></div>)}</div>}
    </section>
  );
}

function FaturaDetailDialogV2({ item, dataCorte, unidadeNome, onClose }: { item: FaturaFinanceiraItem | null; dataCorte: string; unidadeNome: string | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        {item && <>
          <DialogHeader className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.16),transparent_48%)] p-6 pr-12">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-200"><ReceiptText className="h-5 w-5" /></div>
            <DialogTitle>{item.aluno.nome}</DialogTitle>
            <DialogDescription>{unidadeNome ?? item.unidade_codigo ?? 'Unidade'} • {item.aluno.curso_nome ?? 'Curso não informado'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <ValueBox label="Valor com desconto" value={moeda(item.valores.valor_com_desconto)} tone="slate" />
              <ValueBox label="Sem desconto condicional" value={moeda(item.valores.valor_sem_desconto_condicional)} tone="amber" />
              <ValueBox label={item.status === 'paga' ? 'Valor pago' : 'Valor atualizado'} value={item.status === 'paga' ? moeda(item.valores.valor_pago ?? 0) : moeda(item.valores.valor_hoje ?? 0)} tone="cyan" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailGroup title="Fatura" lines={[
                ['Situação', rotuloStatus(item, dataCorte)],
                ['Competência', formatarCompetencia(item.competencia)],
                ['Vencimento', formatarData(item.data_vencimento)],
                ['Pagamento', formatarData(item.data_pagamento)],
                ['Descrição', item.descricao ?? '—'],
                ['Forma de pagamento', `${rotuloFormaPagamento(item)}: ${item.forma_pagamento.nome ?? 'não informada'}`],
              ]} />
              <DetailGroup title="Valores e atualização" lines={[
                ['Multa contratual (2%)', moeda(item.valores.multa)],
                ['Mora pro rata', moeda(item.valores.mora)],
                ['Situação de atraso', item.cobranca.d0 ? 'Em atraso' : 'Não está em atraso'],
                ['Último sync', formatarDataHora(item.sync_completed_at)],
                ['Válido até', formatarDataHora(item.sync_fresh_until)],
              ]} />
            </div>
            <DetailGroup title="Rastreabilidade" mono lines={[
              ['Fatura canônica', item.canonical_fatura_id],
              ['Fatura Emusys', item.emusys_fatura_id],
              ['Matrícula Emusys', item.emusys_matricula_id ?? '—'],
              ['Contrato Emusys', item.emusys_contrato_id ?? '—'],
              ['Aluno Emusys', item.emusys_student_id ?? '—'],
            ]} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4 text-xs text-cyan-100/75">
              <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-cyan-300" /> Consulta somente leitura: não altera fatura nem envia cobrança.</span>
              {item.aluno.id != null && <Link to={`/app/alunos?aluno=${item.aluno.id}`} className="inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100">Abrir ficha do aluno <ChevronRight className="h-3.5 w-3.5" /></Link>}
            </div>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function FaturaDetailDialog({ item, dataCorte, unidadeNome, onClose }: { item: FaturaFinanceiraItem | null; dataCorte: string; unidadeNome: string | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        {item && <><DialogHeader className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.16),transparent_48%)] p-6 pr-12"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-200"><ReceiptText className="h-5 w-5" /></div><DialogTitle>{item.aluno.nome}</DialogTitle><DialogDescription>{unidadeNome ?? item.unidade_codigo ?? 'Unidade'} • {item.aluno.curso_nome ?? 'Curso não informado'}</DialogDescription></DialogHeader><div className="space-y-5 p-6"><div className="grid gap-3 sm:grid-cols-3"><ValueBox label="Valor com desconto" value={moeda(item.valores.valor_com_desconto)} tone="slate" /><ValueBox label="Sem desconto condicional" value={moeda(item.valores.valor_sem_desconto_condicional)} tone="amber" /><ValueBox label={item.status === 'paga' ? 'Valor pago' : 'Valor atualizado'} value={item.status === 'paga' ? moeda(item.valores.valor_pago ?? 0) : moeda(item.valores.valor_hoje ?? 0)} tone="cyan" /></div><div className="grid gap-3 sm:grid-cols-2"><DetailGroup title="Fatura" lines={[['Situação', rotuloStatus(item, dataCorte)], ['Competência', formatarCompetencia(item.competencia)], ['Vencimento', formatarData(item.data_vencimento)], ['Pagamento', formatarData(item.data_pagamento)], ['Descrição', item.descricao ?? '—'], ['Forma de pagamento', `${rotuloFormaPagamento(item)}: ${item.forma_pagamento.nome ?? 'não informada'}`]]} /><DetailGroup title="Atualização e cobrança" lines={[['Multa (2%)', moeda(item.valores.multa)], ['Mora pro rata', moeda(item.valores.mora)], ['D+0', item.cobranca.d0 ? 'Em atraso' : 'Não está em atraso'], ['D+2', item.cobranca.d2_elegivel ? 'Elegível para cobrar agora' : item.cobranca.motivo_nao_elegivel ?? 'Não elegível'], ['Último sync', formatarDataHora(item.sync_completed_at)], ['Válido até', formatarDataHora(item.sync_fresh_until)]]} /></div><DetailGroup title="Rastreabilidade" mono lines={[['Fatura canônica', item.canonical_fatura_id], ['Fatura Emusys', item.emusys_fatura_id], ['Matrícula Emusys', item.emusys_matricula_id ?? '—'], ['Contrato Emusys', item.emusys_contrato_id ?? '—'], ['Aluno Emusys', item.emusys_student_id ?? '—']]} /><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4 text-xs text-cyan-100/75"><span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-cyan-300" /> Consulta somente leitura: não altera fatura nem envia cobrança.</span>{item.aluno.id != null && <Link to={`/app/alunos?aluno=${item.aluno.id}`} className="inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100">Abrir ficha do aluno <ChevronRight className="h-3.5 w-3.5" /></Link>}</div></div></>}
      </DialogContent>
    </Dialog>
  );
}

function ValueBox({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'amber' | 'cyan' }) {
  const styles = { slate: 'border-slate-800 bg-slate-950/45 text-slate-100', amber: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-200', cyan: 'border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-200' } as const;
  return <div className={cn('rounded-xl border p-3', styles[tone])}><p className="text-[10px] uppercase tracking-wide opacity-65">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}

function DetailGroup({ title, lines, mono = false }: { title: string; lines: Array<[string, string]>; mono?: boolean }) {
  return <section className="rounded-xl border border-slate-800 bg-slate-950/35 p-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>{lines.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 border-t border-slate-800 py-2.5 first:border-t-0 first:pt-0"><span className="text-xs text-slate-500">{label}</span><span className={cn('max-w-[65%] break-words text-right text-sm text-slate-200', mono && 'font-mono text-xs')}>{value}</span></div>)}</section>;
}

export default FaturasAlunosFinanceirasPage;
