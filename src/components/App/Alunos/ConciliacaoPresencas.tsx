import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Competencia = '2026-06' | '2026-07' | '2026-08';
type FiltroStatus = 'pendente' | 'todas';
type FiltroEstrutural = 'vazio_confirmado' | 'incompleto' | 'ambiguo';

interface PresencaConciliacaoAluno {
  aluno_presenca_id: string;
  aluno_id: number;
  aluno_nome: string;
  status: 'pendente' | 'confirmada' | 'corrigida';
  revisao_motivo?: string | null;
  revisado_em?: string | null;
}

interface PresencaConciliacaoAula {
  unidade_id: string;
  unidade_nome: string;
  aula_emusys_id: number | null;
  aula_emusys_evento_id: number | null;
  data_aula: string;
  horario_aula: string | null;
  data_hora_inicio: string | null;
  professor_id: number | null;
  professor_nome: string;
  curso_nome: string;
  turma_nome: string;
  total_alunos: number;
  alunos: PresencaConciliacaoAluno[];
}

interface PresencaConciliacaoResumo {
  total_alunos_pendentes: number;
  total_aulas_pendentes: number;
  total_revisados: number;
  total_grupos: number;
  limite: number;
  offset: number;
}

interface PresencaConciliacaoPayload {
  resumo: PresencaConciliacaoResumo;
  aulas: PresencaConciliacaoAula[];
}

interface RosterConciliacaoRevisao {
  aula_id: number;
  unidade_id: string;
  unidade_nome: string;
  emusys_id: number;
  data_aula: string;
  data_hora_inicio: string | null;
  curso_nome: string;
  turma_nome: string;
  estado: FiltroEstrutural;
  qtd_esperada: number;
  qtd_recebida: number;
  sincronizado_em: string;
}

interface RosterConciliacaoPayload {
  resumo: {
    total: number;
    vazios_confirmados: number;
    incompletos: number;
    ambiguos: number;
  };
  revisoes: RosterConciliacaoRevisao[];
}

interface CorrecaoSelecionada {
  aluno: PresencaConciliacaoAluno;
  aula: PresencaConciliacaoAula;
}

const PAGE_SIZE = 50;
const PAYLOAD_VAZIO: PresencaConciliacaoPayload = {
  resumo: {
    total_alunos_pendentes: 0,
    total_aulas_pendentes: 0,
    total_revisados: 0,
    total_grupos: 0,
    limite: PAGE_SIZE,
    offset: 0,
  },
  aulas: [],
};

const ROSTER_PAYLOAD_VAZIO: RosterConciliacaoPayload = {
  resumo: { total: 0, vazios_confirmados: 0, incompletos: 0, ambiguos: 0 },
  revisoes: [],
};

const FILTROS_ESTRUTURAIS: Array<{ value: FiltroEstrutural; label: string }> = [
  { value: 'vazio_confirmado', label: 'Roster vazio confirmado' },
  { value: 'incompleto', label: 'Roster incompleto' },
  { value: 'ambiguo', label: 'Identidade ambígua' },
];

const COMPETENCIAS: Array<{ value: Competencia; label: string; inicio: string; fim: string }> = [
  { value: '2026-06', label: 'Jun/2026', inicio: '2026-06-01', fim: '2026-06-30' },
  { value: '2026-07', label: 'Jul/2026', inicio: '2026-07-01', fim: '2026-07-31' },
  { value: '2026-08', label: 'Ago/2026', inicio: '2026-08-01', fim: '2026-08-31' },
];

function chaveAula(aula: PresencaConciliacaoAula): string {
  return String(
    aula.aula_emusys_id
      ?? `${aula.unidade_id}:${aula.data_aula}:${aula.horario_aula ?? ''}:${aula.professor_id ?? ''}`,
  );
}

function formatarData(data: string): string {
  if (!data) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${data}T12:00:00`));
}

function formatarHora(horario: string | null, dataHora: string | null): string {
  if (horario) return horario.slice(0, 5);
  if (!dataHora) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(dataHora));
}

function formatarDataHora(dataHora: string | null): string {
  if (!dataHora) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(dataHora));
}

function rotuloEstadoRoster(estado: FiltroEstrutural): string {
  return FILTROS_ESTRUTURAIS.find(item => item.value === estado)?.label ?? estado;
}

function statusAluno(status: PresencaConciliacaoAluno['status']): { label: string; classe: string } {
  if (status === 'corrigida') {
    return { label: 'Corrigida para presente', classe: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' };
  }
  if (status === 'confirmada') {
    return { label: 'Falta confirmada', classe: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' };
  }
  return { label: 'A confirmar', classe: 'border-amber-500/30 bg-amber-500/10 text-amber-300' };
}

export function ConciliacaoPresencas({ unidadeId }: { unidadeId?: string | null }) {
  const [competencia, setCompetencia] = useState<Competencia>('2026-08');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('pendente');
  const [filtroEstrutural, setFiltroEstrutural] = useState<FiltroEstrutural | null>(null);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(0);
  const [dados, setDados] = useState<PresencaConciliacaoPayload>(PAYLOAD_VAZIO);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [confirmandoAula, setConfirmandoAula] = useState<number | null>(null);
  const [correcao, setCorrecao] = useState<CorrecaoSelecionada | null>(null);
  const [motivo, setMotivo] = useState('');
  const [corrigindo, setCorrigindo] = useState(false);
  const [paginaRoster, setPaginaRoster] = useState(0);
  const [dadosRoster, setDadosRoster] = useState<RosterConciliacaoPayload>(ROSTER_PAYLOAD_VAZIO);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [erroRoster, setErroRoster] = useState<string | null>(null);
  const [reprocessandoRoster, setReprocessandoRoster] = useState<number | null>(null);

  const periodo = useMemo(
    () => COMPETENCIAS.find(item => item.value === competencia) ?? COMPETENCIAS[2],
    [competencia],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPagina(0);
      setBuscaAplicada(busca.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [busca]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.rpc('get_conciliacao_presencas', {
        p_unidade_id: unidadeId && unidadeId !== 'todos' ? unidadeId : null,
        p_data_inicio: periodo.inicio,
        p_data_fim: periodo.fim,
        p_status: filtroStatus,
        p_busca: buscaAplicada || null,
        p_limite: PAGE_SIZE,
        p_offset: pagina * PAGE_SIZE,
      });
      if (error) throw error;
      setDados((data as PresencaConciliacaoPayload) ?? PAYLOAD_VAZIO);
    } catch (error: any) {
      const mensagem = error?.message || 'Não foi possível carregar as presenças.';
      setErro(mensagem);
      setDados(PAYLOAD_VAZIO);
    } finally {
      setLoading(false);
    }
  }, [buscaAplicada, filtroStatus, pagina, periodo.fim, periodo.inicio, unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarRoster = useCallback(async () => {
    if (!filtroEstrutural) return;
    setLoadingRoster(true);
    setErroRoster(null);
    try {
      const { data, error } = await supabase.rpc('get_conciliacao_roster_operacional_v1', {
        p_unidade_id: unidadeId && unidadeId !== 'todos' ? unidadeId : null,
        p_data_inicio: periodo.inicio,
        p_data_fim: periodo.fim,
        p_estado: filtroEstrutural,
        p_limite: PAGE_SIZE,
        p_offset: paginaRoster * PAGE_SIZE,
      });
      if (error) throw error;
      setDadosRoster((data as RosterConciliacaoPayload) ?? ROSTER_PAYLOAD_VAZIO);
    } catch (error: any) {
      setErroRoster(error?.message || 'Não foi possível carregar a conciliação estrutural.');
      setDadosRoster(ROSTER_PAYLOAD_VAZIO);
    } finally {
      setLoadingRoster(false);
    }
  }, [filtroEstrutural, paginaRoster, periodo.fim, periodo.inicio, unidadeId]);

  useEffect(() => {
    void carregarRoster();
  }, [carregarRoster]);

  const totalPaginas = Math.max(1, Math.ceil(dados.resumo.total_grupos / PAGE_SIZE));
  const temPendencias = dados.resumo.total_alunos_pendentes > 0;
  const metadadosPublicacao = useMemo(() => ({
    denominador: filtroEstrutural
      ? dadosRoster.resumo.total
      : dados.resumo.total_alunos_pendentes + dados.resumo.total_revisados,
    fonte: filtroEstrutural
      ? 'roster operacional do Emusys'
      : 'Emusys + revisão administrativa',
    periodo: `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
    regra_versao: filtroEstrutural ? 'roster-operacional-v1' : 'presenca-semantica-v1.2',
    estado_publicacao: filtroEstrutural || temPendencias ? 'em_revisão' : 'operacional',
  }), [
    dados.resumo.total_alunos_pendentes,
    dados.resumo.total_revisados,
    dadosRoster.resumo.total,
    filtroEstrutural,
    periodo.fim,
    periodo.inicio,
    temPendencias,
  ]);

  const alternarAula = (aula: PresencaConciliacaoAula) => {
    const chave = chaveAula(aula);
    setExpandidas(atuais => {
      const proximas = new Set(atuais);
      proximas.has(chave) ? proximas.delete(chave) : proximas.add(chave);
      return proximas;
    });
  };

  const confirmarChamada = async (aula: PresencaConciliacaoAula) => {
    if (!aula.aula_emusys_id) {
      toast.error('Esta aula não possui vínculo Emusys para confirmação em lote.');
      return;
    }
    setConfirmandoAula(aula.aula_emusys_id);
    try {
      const { data, error } = await supabase.rpc('admin_confirmar_presencas_aula', {
        p_aula_emusys_id: aula.aula_emusys_id,
        p_motivo: 'Chamada conferida pela ADM na conciliação',
      });
      if (error) throw error;
      const confirmados = Number((data as any)?.confirmados ?? 0);
      toast.success(confirmados > 0
        ? `${confirmados} falta(s) confirmada(s).`
        : 'Esta chamada já estava conferida.');
      setPagina(0);
      await carregar();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível confirmar a chamada.');
    } finally {
      setConfirmandoAula(null);
    }
  };

  const reprocessarRoster = async (revisao: RosterConciliacaoRevisao) => {
    setReprocessandoRoster(revisao.aula_id);
    try {
      const { error } = await supabase.functions.invoke('sync-presenca-emusys', {
        body: {
          modo: 'presenca',
          unidade_id: revisao.unidade_id,
          data: revisao.data_aula,
          dias: 1,
        },
      });
      if (error) throw error;
      toast.success('Reprocessamento solicitado ao Emusys.');
      await carregarRoster();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível reprocessar esta aula.');
    } finally {
      setReprocessandoRoster(null);
    }
  };

  const abrirCorrecao = (aluno: PresencaConciliacaoAluno, aula: PresencaConciliacaoAula) => {
    setCorrecao({ aluno, aula });
    setMotivo('');
  };

  const corrigirParaPresente = async () => {
    if (!correcao || motivo.trim().length < 3) {
      toast.error('Informe o motivo da correção.');
      return;
    }
    setCorrigindo(true);
    try {
      const { error } = await supabase.rpc('admin_revisar_presenca_conciliacao', {
        p_aluno_presenca_id: correcao.aluno.aluno_presenca_id,
        p_decisao: 'corrigir_presente',
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      toast.success('Presença corrigida com registro de auditoria.');
      setCorrecao(null);
      setMotivo('');
      setPagina(0);
      await carregar();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível corrigir a presença.');
    } finally {
      setCorrigindo(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/55">
      <div className={cn(
        'flex flex-wrap items-center gap-4 border-b px-4 py-4',
        temPendencias
          ? 'border-amber-500/30 bg-amber-500/10'
          : 'border-emerald-500/25 bg-emerald-500/5',
      )}>
        <div className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-lg border',
          temPendencias
            ? 'border-amber-500/35 bg-amber-500/15 text-amber-300'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        )}>
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-100">
            {filtroEstrutural ? 'Revisão estrutural do roster' : 'Presenças a confirmar'}
          </h4>
          {filtroEstrutural ? (
            <div className="mt-1 text-xs text-slate-400">
              <span><strong className="text-2xl font-bold tabular-nums text-slate-100">{dadosRoster.resumo.total}</strong> aulas</span>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-400">
              <span><strong className="text-2xl font-bold tabular-nums text-slate-100">{dados.resumo.total_alunos_pendentes}</strong> registros</span>
              <span><strong className="font-semibold text-slate-200">{dados.resumo.total_aulas_pendentes}</strong> aulas</span>
              {dados.resumo.total_revisados > 0 && <span>{dados.resumo.total_revisados} revisados</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void (filtroEstrutural ? carregarRoster() : carregar())}
          disabled={filtroEstrutural ? loadingRoster : loading}
          title="Atualizar presenças"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600 text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', (filtroEstrutural ? loadingRoster : loading) && 'animate-spin')} />
          <span className="sr-only">Atualizar</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-700/70 bg-slate-950/20 px-4 py-2 text-[11px] text-slate-400">
        <span>Denominador: <strong className="font-medium text-slate-200">{metadadosPublicacao.denominador} registros do recorte</strong></span>
        <span>Fonte: <strong className="font-medium text-slate-200">{metadadosPublicacao.fonte}</strong></span>
        <span>Período: <strong className="font-medium text-slate-200">{metadadosPublicacao.periodo}</strong></span>
        <span>regra_versao: <strong className="font-medium text-slate-200">{metadadosPublicacao.regra_versao}</strong></span>
        <span>estado_publicacao: <strong className="font-medium text-slate-200">{metadadosPublicacao.estado_publicacao}</strong></span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-700/70 px-4 py-3">
        <div className="inline-flex h-9 items-center rounded-lg border border-slate-700 bg-slate-950/30 p-1">
          {COMPETENCIAS.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setCompetencia(item.value);
                setPagina(0);
              }}
              className={cn(
                'h-7 rounded-md px-3 text-xs font-medium transition',
                competencia === item.value
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="inline-flex h-9 items-center rounded-lg border border-slate-700 bg-slate-950/30 p-1">
          {([
            ['pendente', 'Pendentes'],
            ['todas', 'Todas'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFiltroStatus(value);
                setFiltroEstrutural(null);
                setPagina(0);
              }}
              className={cn(
                'h-7 rounded-md px-3 text-xs font-medium transition',
                filtroStatus === value
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex min-h-9 flex-wrap items-center rounded-lg border border-slate-700 bg-slate-950/30 p-1">
          {FILTROS_ESTRUTURAIS.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFiltroEstrutural(item.value);
                setPaginaRoster(0);
              }}
              className={cn(
                'h-7 rounded-md px-3 text-xs font-medium transition',
                filtroEstrutural === item.value
                  ? 'bg-violet-500/20 text-violet-200'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {!filtroEstrutural && (
          <div className="relative min-w-[210px] flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={event => setBusca(event.target.value)}
              placeholder="Buscar aluno, professor ou curso"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950/35 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500/70"
            />
          </div>
        )}
      </div>

      {filtroEstrutural ? (
        erroRoster ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{erroRoster}</span>
            <button type="button" onClick={() => void carregarRoster()} className="ml-auto text-cyan-300 hover:text-cyan-200">
              Tentar novamente
            </button>
          </div>
        ) : loadingRoster ? (
          <div className="flex items-center justify-center px-4 py-10 text-sm text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando revisão estrutural...
          </div>
        ) : dadosRoster.revisoes.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-emerald-300">
            <Check className="h-4 w-4" /> Nenhuma divergência estrutural neste recorte.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-xs">
              <thead className="border-b border-slate-700/70 bg-slate-950/25 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Unidade</th>
                  <th className="px-4 py-3 font-medium">Aula / Emusys</th>
                  <th className="px-4 py-3 font-medium">Curso</th>
                  <th className="px-4 py-3 font-medium">Turma</th>
                  <th className="px-4 py-3 font-medium">Data / hora</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Esperada / recebida</th>
                  <th className="px-4 py-3 font-medium">Última foto</th>
                  <th className="px-4 py-3 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {dadosRoster.revisoes.map(revisao => (
                  <tr key={revisao.aula_id} className="bg-slate-950/10 text-slate-300">
                    <td className="px-4 py-3">{revisao.unidade_nome}</td>
                    <td className="px-4 py-3 tabular-nums">{revisao.aula_id} / {revisao.emusys_id}</td>
                    <td className="max-w-[180px] truncate px-4 py-3">{revisao.curso_nome}</td>
                    <td className="max-w-[180px] truncate px-4 py-3">{revisao.turma_nome}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatarData(revisao.data_aula)} · {formatarDataHora(revisao.data_hora_inicio)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
                        {rotuloEstadoRoster(revisao.estado)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      {revisao.qtd_esperada} / {revisao.qtd_recebida}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatarDataHora(revisao.sincronizado_em)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void reprocessarRoster(revisao)}
                        disabled={reprocessandoRoster === revisao.aula_id}
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-cyan-500/35 px-3 font-medium text-cyan-300 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reprocessandoRoster === revisao.aula_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Reprocessar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : erro ? (
        <div className="flex items-center gap-2 px-4 py-5 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{erro}</span>
          <button type="button" onClick={() => void carregar()} className="ml-auto text-cyan-300 hover:text-cyan-200">Tentar novamente</button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center px-4 py-10 text-sm text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando presenças...
        </div>
      ) : dados.aulas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-emerald-300">
          <Check className="h-4 w-4" /> Nenhuma presença neste recorte.
        </div>
      ) : (
        <div className="divide-y divide-slate-700/60">
          {dados.aulas.map(aula => {
            const chave = chaveAula(aula);
            const expandida = expandidas.has(chave);
            const pendentes = aula.alunos.filter(aluno => aluno.status === 'pendente').length;
            const confirmando = aula.aula_emusys_id === confirmandoAula;
            return (
              <div key={chave} className="bg-slate-950/10">
                <div className="grid gap-3 px-4 py-3 md:grid-cols-[120px_minmax(190px,1fr)_minmax(170px,1fr)_110px_auto] md:items-center">
                  <div>
                    <div className="text-sm font-semibold text-slate-200">{formatarData(aula.data_aula)}</div>
                    <div className="text-xs text-slate-500">{formatarHora(aula.horario_aula, aula.data_hora_inicio)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-200">{aula.professor_nome}</div>
                    <div className="truncate text-xs text-slate-500">{aula.unidade_nome}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-300">{aula.curso_nome}</div>
                    <div className="truncate text-xs text-slate-500">{aula.turma_nome}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => alternarAula(aula)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-700 px-2 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    {aula.total_alunos} aluno(s)
                    {expandida ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmarChamada(aula)}
                    disabled={!aula.aula_emusys_id || pendentes === 0 || confirmando}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                    Confirmar chamada
                  </button>
                </div>

                {expandida && (
                  <div className="border-t border-slate-700/50 bg-slate-950/25 px-4 py-2">
                    {aula.alunos.map(aluno => {
                      const meta = statusAluno(aluno.status);
                      return (
                        <div key={aluno.aluno_presenca_id} className="flex flex-wrap items-center gap-3 border-b border-slate-800 py-2.5 last:border-b-0">
                          <UserCheck className="h-4 w-4 shrink-0 text-slate-500" />
                          <div className="min-w-[180px] flex-1">
                            <div className="text-sm text-slate-200">{aluno.aluno_nome}</div>
                            {aluno.revisao_motivo && <div className="mt-0.5 text-xs text-slate-500">{aluno.revisao_motivo}</div>}
                          </div>
                          <span className={cn('rounded-full border px-2 py-1 text-[11px] font-medium', meta.classe)}>{meta.label}</span>
                          {aluno.status === 'pendente' && (
                            <button
                              type="button"
                              onClick={() => abrirCorrecao(aluno, aula)}
                              className="h-8 rounded-lg border border-cyan-500/35 px-3 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/10"
                            >
                              Corrigir para presente
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filtroEstrutural && !loadingRoster && !erroRoster && dadosRoster.resumo.total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-700/70 px-4 py-3 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => setPaginaRoster(atual => Math.max(0, atual - 1))}
            disabled={paginaRoster === 0}
            title="Página anterior"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>Página {paginaRoster + 1} de {Math.ceil(dadosRoster.resumo.total / PAGE_SIZE)}</span>
          <button
            type="button"
            onClick={() => setPaginaRoster(atual => Math.min(Math.ceil(dadosRoster.resumo.total / PAGE_SIZE) - 1, atual + 1))}
            disabled={paginaRoster + 1 >= Math.ceil(dadosRoster.resumo.total / PAGE_SIZE)}
            title="Próxima página"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {!filtroEstrutural && !loading && !erro && dados.resumo.total_grupos > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-700/70 px-4 py-3 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => setPagina(atual => Math.max(0, atual - 1))}
            disabled={pagina === 0}
            title="Página anterior"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>Página {pagina + 1} de {totalPaginas}</span>
          <button
            type="button"
            onClick={() => setPagina(atual => Math.min(totalPaginas - 1, atual + 1))}
            disabled={pagina + 1 >= totalPaginas}
            title="Próxima página"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <Dialog open={Boolean(correcao)} onOpenChange={aberta => !aberta && setCorrecao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir para presente</DialogTitle>
            <DialogDescription>
              {correcao?.aluno.aluno_nome} em {correcao ? formatarData(correcao.aula.data_aula) : ''}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="motivo-correcao-presenca" className="mb-2 block text-sm font-medium text-slate-300">Motivo da correção</label>
            <Textarea
              id="motivo-correcao-presenca"
              value={motivo}
              onChange={event => setMotivo(event.target.value)}
              placeholder="Ex.: presença conferida na lista da turma"
              maxLength={500}
            />
            <div className="mt-1 text-right text-xs text-slate-500">{motivo.trim().length}/500</div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCorrecao(null)}
              disabled={corrigindo}
              className="h-9 rounded-lg border border-slate-600 px-4 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void corrigirParaPresente()}
              disabled={corrigindo || motivo.trim().length < 3}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {corrigindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar correção
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
