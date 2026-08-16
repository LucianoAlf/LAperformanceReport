import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  FileWarning,
  Filter,
  HandCoins,
  Link2,
  Loader2,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
import { KPICard } from '@/components/ui/KPICard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useUnidades } from '@/hooks/useSupabase';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import {
  INADIMPLENCIA_CANONICA_LOADING,
  podeCobrarInadimplenciaCanonica,
  type InadimplenciaCanonicaItem,
  type InadimplenciaCanonicaState,
} from '@/lib/inadimplenciaCanonica';
import {
  carregarLeituraFaturasAlunos,
  chaveFaturaAluno,
  competenciaFatura,
  filtrarFaturasAlunos,
  type CadastroFaturaAluno,
  type CanonicalRpcClient,
  type FaturasAlunosSituacao,
} from '@/lib/faturasAlunosCanonicas';
import type { CadastroFaturaAlunoRow, FaturaAlunoSelecionada } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITUACOES: FaturasAlunosSituacao[] = ['todas', 'confirmadas', 'cobranca_d2'];

const canonicalRpcClient: CanonicalRpcClient = {
  async rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    return { data, error };
  },
};

const DATA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const COMPETENCIA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});

const dataSomenteUtc = (value: string) => {
  const [ano, mes, dia] = value.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
};

const hojeBrasilia = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const formatarData = (value: string | null) => value
  ? DATA_BR.format(dataSomenteUtc(value))
  : '—';

const formatarDataHora = (value: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
  : '—';

const rotuloCompetencia = (value: string) => COMPETENCIA_BR.format(dataSomenteUtc(value));

function ultimasCompetencias(dataCorte: string): string[] {
  const [ano, mes] = dataCorte.split('-').map(Number);
  return [2, 1, 0].map((offset) => {
    const data = new Date(Date.UTC(ano, mes - 1 - offset, 1));
    return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
  });
}

function cursoNome(row: CadastroFaturaAlunoRow): string | null {
  if (Array.isArray(row.cursos)) return row.cursos[0]?.nome ?? null;
  return row.cursos?.nome ?? null;
}

function StateNotice({
  state,
  visualStatus,
  onRefresh,
  refreshing,
}: {
  state: InadimplenciaCanonicaState;
  visualStatus: InadimplenciaCanonicaState['status'];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  if (visualStatus === 'ok') {
    return (
      <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-sm font-semibold text-emerald-100">Leitura completa e confirmada</p>
            <p className="text-xs text-emerald-200/70">Somente faturas abertas, vencidas e vinculadas a alunos ativos.</p>
          </div>
        </div>
        <FreshnessText state={state} />
      </div>
    );
  }

  if (visualStatus === 'partial') {
    return (
      <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <FileWarning className="h-5 w-5 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-100">Leitura parcial — confirmados disponíveis</p>
            <p className="text-xs text-amber-200/70">Pendências ficam separadas e não alteram os totais abaixo.</p>
          </div>
        </div>
        <FreshnessText state={state} />
      </div>
    );
  }

  const blocked = visualStatus === 'stale'
    ? {
      icon: Clock3,
      title: 'Snapshot expirado — lista bloqueada',
      description: 'Os dados ultrapassaram o prazo de frescor. Atualize antes de usar qualquer informação de cobrança.',
    }
    : visualStatus === 'incomplete'
      ? {
        icon: ShieldAlert,
        title: 'Leitura incompleta — lista bloqueada',
        description: 'Foi detectado um conflito estrutural entre faturas. Nenhuma lista acionável será exibida.',
      }
      : {
        icon: AlertCircle,
        title: 'Falha na leitura financeira — lista bloqueada',
        description: state.erro || 'A leitura canônica não respondeu com um contrato válido.',
      };
  const Icon = blocked.icon;

  return (
    <div role="alert" className="rounded-2xl border border-rose-500/35 bg-gradient-to-r from-rose-950/70 to-slate-900 p-5 shadow-lg shadow-rose-950/20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-rose-500/15 p-2.5"><Icon className="h-5 w-5 text-rose-300" /></div>
          <div>
            <p className="font-semibold text-rose-100">{blocked.title}</p>
            <p className="mt-1 max-w-3xl text-sm text-rose-100/70">{blocked.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? 'Solicitando sync…' : 'Atualizar agora'}
        </button>
      </div>
    </div>
  );
}

function FreshnessText({ state }: { state: InadimplenciaCanonicaState }) {
  return (
    <div className="text-right text-[11px] leading-5 text-slate-400">
      <p>Sync mais antigo: <span className="text-slate-200">{formatarDataHora(state.ultimoSyncMaisAntigo)}</span></p>
      <p>Válido até: <span className="text-slate-200">{formatarDataHora(state.freshUntil)}</span></p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5" aria-label="Carregando faturas">
      <div className="h-20 animate-pulse rounded-2xl bg-slate-800/70" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((value) => <div key={value} className="h-32 animate-pulse rounded-xl bg-slate-800/70" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-slate-800/70" />
    </div>
  );
}

export function FaturasAlunosPage() {
  useSetPageTitle({
    titulo: 'Faturas de Alunos',
    subtitulo: 'Faturas confirmadas, vencidas e em reconciliação',
    icone: ReceiptText,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-emerald-500 to-cyan-500',
  });

  const context = useOutletContext<{ unidadeSelecionada: UnidadeId }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: unidades } = useUnidades();
  const [state, setState] = useState<InadimplenciaCanonicaState>(INADIMPLENCIA_CANONICA_LOADING);
  const [cadastros, setCadastros] = useState<Map<number, CadastroFaturaAluno>>(new Map());
  const [erroEnriquecimento, setErroEnriquecimento] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [faturaSelecionada, setFaturaSelecionada] = useState<FaturaAlunoSelecionada>(null);
  const dataCorte = useMemo(hojeBrasilia, []);

  const unidadeUrl = searchParams.get('unidade');
  const unidadeContexto = context?.unidadeSelecionada || 'todos';
  const unidadeConsulta = unidadeUrl === 'todos'
    ? 'todos'
    : unidadeUrl && UUID.test(unidadeUrl) ? unidadeUrl : unidadeContexto;

  const carregar = useCallback(async () => {
    setState(INADIMPLENCIA_CANONICA_LOADING);
    setErroEnriquecimento(null);
    const next = await carregarLeituraFaturasAlunos(canonicalRpcClient, {
      unidadeId: unidadeConsulta,
      asOfDate: dataCorte,
    });
    setState(next);
    setClock(Date.now());

    const ids = [...new Set(next.items.flatMap((row) => (
      row.aluno_id_canonico === null ? [] : [row.aluno_id_canonico]
    )))];
    if (!next.collectionAllowed || ids.length === 0) {
      setCadastros(new Map());
      return;
    }

    try {
      const rows: CadastroFaturaAlunoRow[] = [];
      for (let start = 0; start < ids.length; start += 150) {
        const { data, error } = await supabase
          .from('alunos')
          .select('id, nome, unidade_id, status, cursos:curso_id(nome)')
          .in('id', ids.slice(start, start + 150))
          .is('arquivado_em', null);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as CadastroFaturaAlunoRow[]));
      }
      const mapa = new Map<number, CadastroFaturaAluno>();
      for (const row of rows) {
        mapa.set(row.id, {
          id: row.id,
          nome: row.nome,
          unidadeId: row.unidade_id,
          cursoNome: cursoNome(row),
          status: row.status,
        });
      }
      setCadastros(mapa);
    } catch (error) {
      console.error('Erro ao enriquecer faturas com cadastro local:', error);
      setCadastros(new Map());
      setErroEnriquecimento('Os valores estão disponíveis, mas alguns nomes e cursos não puderam ser carregados.');
    }
  }, [dataCorte, unidadeConsulta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!state.freshUntil || !state.collectionAllowed) return undefined;
    const delay = Date.parse(state.freshUntil) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      setClock(Date.now());
      return undefined;
    }
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(delay + 25, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [state.collectionAllowed, state.freshUntil]);

  const solicitarAtualizacao = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('atualizar-inadimplencia-emusys', {
        method: 'POST',
        body: { competencias: ['atual', 'anterior'], include_backlog: true },
      });
      const httpStatus = Number((error as { context?: { status?: number } } | null)?.context?.status ?? data?.status ?? 0);
      if (httpStatus === 429) {
        const proxima = data?.next_attempt_at ? ` Próxima tentativa: ${formatarDataHora(data.next_attempt_at)}.` : '';
        throw new Error(`O Emusys limitou temporariamente a sincronização.${proxima}`);
      }
      if (error) throw error;
      if (data?.ok === true && data?.queue_status === 'succeeded' && data?.snapshot_complete === true) {
        toast.success('Snapshot financeiro concluído.');
      } else if (['pending', 'running', 'retry_wait'].includes(String(data?.queue_status ?? ''))) {
        toast.info('Sincronização enfileirada. A tela continuará bloqueada até um snapshot completo.');
      } else {
        throw new Error(data?.erro || 'O worker não confirmou um snapshot financeiro completo.');
      }
      await carregar();
    } catch (error) {
      console.error('Erro ao atualizar faturas de alunos:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível solicitar a sincronização.');
    } finally {
      setRefreshing(false);
    }
  };

  const setFiltro = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const limparFiltros = () => setSearchParams(new URLSearchParams(), { replace: true });
  const alunoId = Number(searchParams.get('aluno')) || null;
  const situacaoParam = searchParams.get('situacao') as FaturasAlunosSituacao | null;
  const situacao = situacaoParam && SITUACOES.includes(situacaoParam) ? situacaoParam : 'confirmadas';
  const competencia = searchParams.get('competencia');
  const busca = searchParams.get('busca') ?? '';
  const curso = searchParams.get('curso');
  const matriculaId = searchParams.get('matricula');
  const leituraLiberada = state.collectionAllowed
    && podeCobrarInadimplenciaCanonica(state, new Date(clock));
  const visualStatus = state.collectionAllowed && !leituraLiberada ? 'stale' : state.status;

  const itemsFiltrados = useMemo(() => filtrarFaturasAlunos(
    leituraLiberada ? state.items : [],
    cadastros,
    {
      unidadeId: unidadeConsulta,
      alunoId,
      matriculaId,
      competencia,
      situacao,
      busca,
      curso,
    },
  ), [alunoId, busca, cadastros, competencia, curso, leituraLiberada, matriculaId, situacao, state.items, unidadeConsulta]);

  const competencias = useMemo(() => {
    const publicadas = state.items.map(competenciaFatura);
    return [...new Set([...ultimasCompetencias(dataCorte), ...publicadas])].sort();
  }, [dataCorte, state.items]);
  const cursos = useMemo(() => [...new Set(
    [...cadastros.values()].map((row) => row.cursoNome).filter((value): value is string => Boolean(value)),
  )].sort((a, b) => a.localeCompare(b, 'pt-BR')), [cadastros]);
  const unidadesPorId = useMemo(() => new Map(unidades.map((row) => [row.id, row.nome])), [unidades]);
  const faturasD2 = state.items.filter((row) => row.dias_atraso >= state.collectionGraceDays);
  const pessoasD2 = new Set(faturasD2.map((row) => (
    row.aluno_id_canonico ?? `${row.unidade_id}|${row.emusys_matricula_id}`
  ))).size;
  const totalReconciliacao = state.sourceMissingCount + state.invalidIdentityInvoiceCount;
  const rotuloPessoasD2 = `${pessoasD2} ${pessoasD2 === 1 ? 'pessoa elegível' : 'pessoas elegíveis'}`;
  const rotuloValidacoes = `${state.validationIssueCount} ${state.validationIssueCount === 1 ? 'validação' : 'validações'}`;
  const rotuloContatos = `${state.contactResolutionPendingCount} ${state.contactResolutionPendingCount === 1 ? 'contato pendente' : 'contatos pendentes'}`;

  if (state.status === 'loading') return <LoadingState />;

  return (
    <div className="space-y-5 pb-10">
      <PageFilterBar className="!justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <CalendarDays className="h-4 w-4 text-cyan-300" />
          Corte em <span className="font-medium text-slate-200">{formatarData(dataCorte)}</span>
          <span className="hidden text-slate-600 sm:inline">•</span>
          <span className="hidden sm:inline">janela de 3 competências</span>
        </div>
        <button
          type="button"
          onClick={solicitarAtualizacao}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      </PageFilterBar>

      <StateNotice
        state={state}
        visualStatus={visualStatus}
        onRefresh={solicitarAtualizacao}
        refreshing={refreshing}
      />

      {leituraLiberada && (
        <>
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KPICard
              title="Confirmadas D+0"
              tooltip="Faturas abertas e vencidas confirmadas pela leitura canônica."
              value={state.totalFaturas}
              subvalue={`${state.totalMatriculas} matrículas • ${formatCurrency(state.totalOriginal)} original`}
              icon={BadgeCheck}
              variant="cyan"
            />
            <KPICard
              title="Cobrança amigável D+2"
              tooltip="Recorte operacional que respeita a carência contratada pelo consumidor."
              value={faturasD2.length}
              subvalue={rotuloPessoasD2}
              icon={HandCoins}
              variant="amber"
            />
            <KPICard
              title="Valor atualizado"
              tooltip="Total calculado no contrato canônico; a interface não recalcula juros."
              value={state.totalAtualizado}
              format="currency"
              subvalue={`${formatCurrency(state.totalOriginal)} sem acréscimos`}
              icon={CircleDollarSign}
              variant="emerald"
            />
            <KPICard
              title="Reconciliação"
              tooltip="Registros fora da cobrança e aguardando confirmação na origem."
              value={totalReconciliacao}
              subvalue={`${rotuloValidacoes} • ${rotuloContatos}`}
              icon={Link2}
              variant={totalReconciliacao > 0 ? 'rose' : 'violet'}
            />
          </section>

          {(state.status === 'partial' || totalReconciliacao > 0 || state.contactResolutionPendingCount > 0) && (
            <section className="overflow-hidden rounded-2xl border border-amber-500/25 bg-slate-900/55">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/15 bg-amber-500/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <FileWarning className="h-5 w-5 text-amber-300" />
                  <div>
                    <h2 className="font-semibold text-slate-100">Reconciliação financeira</h2>
                    <p className="text-xs text-slate-400">Aguardando confirmação na origem — nenhum item desta área entra na cobrança.</p>
                  </div>
                </div>
                <Link
                  to="/app/alunos?tab=conciliacao"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
                >
                  Abrir conciliação Emusys <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid gap-px bg-slate-800 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Faturas na origem', state.sourceMissingCount, 'Aguardando nova observação em run fresco'],
                  ['Identidade inválida', state.invalidIdentityInvoiceCount, 'Matrícula/aluno sem vínculo exato'],
                  ['Validações', state.validationIssueCount, 'Metadados em quarentena'],
                  ['Contato local', state.contactResolutionPendingCount, 'Fatura confirmada sem contato unívoco'],
                ].map(([label, value, helper]) => (
                  <div key={String(label)} className="bg-slate-900/85 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
                    <p className="mt-1 text-xs text-slate-500">{helper}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/55 shadow-xl shadow-slate-950/20">
            <div className="border-b border-slate-700/70 bg-slate-900/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    aria-label="Buscar faturas por aluno, matrícula ou identificador"
                    autoComplete="off"
                    name="busca-faturas"
                    value={busca}
                    onChange={(event) => setFiltro('busca', event.target.value || null)}
                    placeholder="Aluno, matrícula ou fatura…"
                    className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950/70 pl-9 pr-3 text-sm text-slate-100 transition placeholder:text-slate-600 focus-visible:border-cyan-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20"
                  />
                </div>
                <label className="sr-only" htmlFor="faturas-unidade">Unidade</label>
                <select
                  id="faturas-unidade"
                  name="unidade-faturas"
                  value={unidadeConsulta || 'todos'}
                  onChange={(event) => setFiltro('unidade', event.target.value)}
                  className="h-10 rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-200 focus-visible:border-cyan-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20"
                >
                  <option value="todos">Todas as unidades</option>
                  {unidades.map((row) => <option key={row.id} value={row.id}>{row.nome}</option>)}
                </select>
                <label className="sr-only" htmlFor="faturas-competencia">Competência</label>
                <select
                  id="faturas-competencia"
                  name="competencia-faturas"
                  value={competencia ?? ''}
                  onChange={(event) => setFiltro('competencia', event.target.value || null)}
                  className="h-10 rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-200 focus-visible:border-cyan-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20"
                >
                  <option value="">3 competências</option>
                  {competencias.map((value) => <option key={value} value={value}>{rotuloCompetencia(value)}</option>)}
                </select>
                <label className="sr-only" htmlFor="faturas-situacao">Situação</label>
                <select
                  id="faturas-situacao"
                  name="situacao-faturas"
                  value={situacao}
                  onChange={(event) => setFiltro('situacao', event.target.value === 'confirmadas' ? null : event.target.value)}
                  className="h-10 rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-200 focus-visible:border-cyan-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20"
                >
                  <option value="confirmadas">Confirmadas D+0</option>
                  <option value="cobranca_d2">Cobrança D+2</option>
                  <option value="todas">Todas confirmadas</option>
                </select>
                <label className="sr-only" htmlFor="faturas-curso">Curso</label>
                <select
                  id="faturas-curso"
                  name="curso-faturas"
                  value={curso ?? ''}
                  onChange={(event) => setFiltro('curso', event.target.value || null)}
                  className="h-10 max-w-[190px] rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-200 focus-visible:border-cyan-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20"
                >
                  <option value="">Todos os cursos</option>
                  {cursos.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                >
                  <RotateCcw className="h-4 w-4" /> Limpar
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" /> {itemsFiltrados.length} de {state.totalFaturas} faturas no recorte</span>
                {erroEnriquecimento && <span role="status" aria-live="polite" className="text-amber-300">{erroEnriquecimento}</span>}
              </div>
            </div>

            {itemsFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4"><ReceiptText className="h-8 w-8 text-slate-500" /></div>
                <h2 className="mt-4 font-semibold text-slate-200">Nenhuma fatura confirmada no recorte</h2>
                <p className="mt-1 max-w-lg text-sm text-slate-500">Isso não conclui que não exista dívida fora da janela de três competências ou na carteira futura de ex-alunos.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-left text-sm">
                  <thead className="border-b border-slate-700/70 bg-slate-950/45 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Aluno</th>
                      <th className="px-3 py-3 font-medium">Unidade / curso</th>
                      <th className="px-3 py-3 font-medium">Competência</th>
                      <th className="px-3 py-3 font-medium">Vencimento</th>
                      <th className="px-3 py-3 text-right font-medium">Atraso</th>
                      <th className="px-3 py-3 font-medium">Situação</th>
                      <th className="px-3 py-3 text-right font-medium">Original</th>
                      <th className="px-3 py-3 text-right font-medium">Atualizado</th>
                      <th className="px-3 py-3 font-medium">Matrícula</th>
                      <th className="px-4 py-3 text-right font-medium">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {itemsFiltrados.map((item) => {
                      const cadastro = item.aluno_id_canonico === null ? null : cadastros.get(item.aluno_id_canonico);
                      const contatoResolvido = item.contact_resolution_status === 'resolved' && cadastro?.unidadeId === item.unidade_id;
                      return (
                        <tr key={chaveFaturaAluno(item)} className="group bg-slate-900/15 transition hover:bg-cyan-500/[0.035]">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 group-hover:bg-cyan-500/10 group-hover:text-cyan-300">
                                <UserRound className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="max-w-[240px] break-words font-medium text-slate-100">{cadastro?.nome ?? 'Cadastro não resolvido'}</p>
                                <p className={`mt-0.5 text-[11px] ${contatoResolvido ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {contatoResolvido ? 'Contato resolvido' : 'Contato aguardando vínculo'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <p className="text-slate-300">{unidadesPorId.get(item.unidade_id) ?? item.unidade_codigo ?? 'Unidade'}</p>
                            <p className="text-xs text-slate-500">{cadastro?.cursoNome ?? 'Curso não carregado'}</p>
                          </td>
                          <td className="px-3 py-3.5 capitalize text-slate-300">{rotuloCompetencia(competenciaFatura(item))}</td>
                          <td className="px-3 py-3.5 text-slate-300">{formatarData(item.data_vencimento)}</td>
                          <td className="px-3 py-3.5 text-right"><span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-300">{item.dias_atraso}d</span></td>
                          <td className="px-3 py-3.5"><span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs text-rose-200"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{item.status ?? 'aberta'}</span></td>
                          <td className="px-3 py-3.5 text-right tabular-nums text-slate-400">{formatCurrency(item.valor_original)}</td>
                          <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-emerald-300">{formatCurrency(item.valor_atualizado)}</td>
                          <td className="px-3 py-3.5 font-mono text-xs text-slate-400">{item.emusys_matricula_id}</td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setFaturaSelecionada(item)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-500/35 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                            >
                              <Eye className="h-3.5 w-3.5" /> Ver detalhes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <FaturaDetailDialog
        item={faturaSelecionada}
        cadastro={faturaSelecionada?.aluno_id_canonico == null
          ? null
          : cadastros.get(faturaSelecionada.aluno_id_canonico) ?? null}
        unidadeNome={faturaSelecionada ? unidadesPorId.get(faturaSelecionada.unidade_id) ?? null : null}
        dataCorte={dataCorte}
        freshUntil={state.freshUntil}
        onClose={() => setFaturaSelecionada(null)}
      />
    </div>
  );
}

function DetailLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800 py-2.5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span translate={mono ? 'no' : undefined} className={`max-w-[65%] text-right text-sm text-slate-200 ${mono ? 'break-all font-mono text-xs' : 'break-words'}`}>{value}</span>
    </div>
  );
}

function FaturaDetailDialog({
  item,
  cadastro,
  unidadeNome,
  dataCorte,
  freshUntil,
  onClose,
}: {
  item: InadimplenciaCanonicaItem | null;
  cadastro: CadastroFaturaAluno | null;
  unidadeNome: string | null;
  dataCorte: string;
  freshUntil: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overscroll-contain overflow-y-auto p-0">
        {item && (
          <>
            <DialogHeader className="border-b border-slate-800 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent p-6 pr-12">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300"><ReceiptText className="h-5 w-5" /></div>
              <DialogTitle>{cadastro?.nome ?? 'Fatura com cadastro não resolvido'}</DialogTitle>
              <DialogDescription>{unidadeNome ?? item.unidade_codigo ?? 'Unidade'} • {cadastro?.cursoNome ?? 'curso não carregado'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Original</p>
                  <p className="mt-1 font-semibold text-slate-100">{formatCurrency(item.valor_original)}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-400/70">Atualizado</p>
                  <p className="mt-1 font-semibold text-emerald-300">{formatCurrency(item.valor_atualizado)}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 sm:col-span-1">
                  <p className="text-[10px] uppercase tracking-wide text-rose-400/70">Em atraso</p>
                  <p className="mt-1 font-semibold text-rose-300">{item.dias_atraso} dias</p>
                </div>
              </div>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Banknote className="h-4 w-4" /> Evidência financeira</h3>
                <div className="rounded-xl border border-slate-800 bg-slate-950/35 px-4">
                  <DetailLine label="Competência" value={rotuloCompetencia(competenciaFatura(item))} />
                  <DetailLine label="Vencimento" value={formatarData(item.data_vencimento)} />
                  <DetailLine label="Situação Emusys" value={item.status ?? 'aberta'} />
                  <DetailLine label="Descrição" value={item.descricao ?? 'Parcela mensal'} />
                  <DetailLine label="Regra contratual" value="Valor original + multa de 2% + mora de 1% ao mês pro rata die" />
                  <DetailLine label="Data de corte" value={formatarData(dataCorte)} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Link2 className="h-4 w-4" /> Vínculo e origem</h3>
                <div className="rounded-xl border border-slate-800 bg-slate-950/35 px-4">
                  <DetailLine label="Fatura canônica" value={item.canonical_fatura_id} mono />
                  <DetailLine label="Fatura Emusys" value={item.emusys_fatura_id} mono />
                  <DetailLine label="Matrícula Emusys" value={item.emusys_matricula_id} mono />
                  <DetailLine label="Contrato Emusys" value={item.emusys_contrato_id ?? 'não informado'} mono />
                  <DetailLine label="Contato local" value={item.contact_resolution_status === 'resolved' ? 'resolvido por ID canônico' : 'aguardando vínculo unívoco'} />
                  <DetailLine label="Último sync" value={formatarDataHora(item.sync_completed_at)} />
                  <DetailLine label="Leitura válida até" value={formatarDataHora(freshUntil)} />
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex items-center gap-2 text-xs text-cyan-100/75">
                  <ShieldCheck className="h-4 w-4 text-cyan-300" />
                  Consulta somente leitura: nenhuma cobrança ou alteração é executada aqui.
                </div>
                {cadastro && (
                  <Link
                    to={`/app/alunos?aluno=${cadastro.id}`}
                    className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-cyan-300 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                  >
                    Abrir ficha do aluno <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FaturasAlunosPage;
