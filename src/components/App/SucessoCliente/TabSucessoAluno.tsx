import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  AlertTriangle, Heart, Search, MessageSquare,
  Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Table2, Kanban, FileQuestion, CalendarDays, BarChart3, UserX, Flag, Contact, Zap,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/hooks/useToast';
import { ModalDetalhesSucessoAluno } from './ModalDetalhesSucessoAluno';
import { JornadaAlunoKanban } from './JornadaAlunoKanban';
import { ModalEnviarFeedback } from './ModalEnviarFeedback';
import { PesquisasTab } from './PesquisasTab';
import { PresencaTab } from './PresencaTab';
import { AnaliseTurmasTab } from './AnaliseTurmasTab';
import { FaltasMesSection } from './FaltasMesSection';
import { MarcosJornadaSection } from './MarcosJornadaSection';
import { CartoesContatoTab } from './CartoesContatoTab';
import { AutomacoesTab } from './AutomacoesTab';
import { useWidgetOverlapSentinel } from '@/contexts/WidgetVisibilityContext';

interface AlunoSucesso {
  id: number;
  nome: string;
  unidade_id: string;
  unidade_codigo: string;
  professor_atual_id: number | null;
  professor_nome: string | null;
  curso_id: number | null;
  curso_nome: string | null;
  tempo_permanencia_meses: number | null;
  status_pagamento: string | null;
  valor_parcela: number | null;
  percentual_presenca: number | null;
  dias_sem_presenca: number | null;
  data_matricula: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
  modalidade: string | null;
  status: string;
  fase_jornada: string;
  health_score_numerico: number | null;
  health_status: string | null;
  ultimo_feedback: string | null;
  ultimo_feedback_data: string | null;
  ultimo_feedback_obs: string | null;
  total_acoes: number;
  metas_ativas: number;
  foto_url: string | null;
  // Risco de evasão do modelo (Random Forest) — separado do Health Score (regra).
  risco_probabilidade: number | null;
  risco_faixa: string | null;
  risco_fatores: Array<{ fator: string; valor: unknown; importancia: number; sinal: string }> | null;
  risco_confianca: string | null;
  risco_motivo_confianca: string | null;
}

interface AlertaSaude {
  tipo: 'critico' | 'atencao' | 'saudavel';
  quantidade: number;
  descricao: string;
}

interface Props {
  unidadeAtual: UnidadeId;
  onAbrirConversa?: (alunoId: number) => void;
}

type SortKey = 'nome' | 'health_score_numerico' | 'fase_jornada' | 'percentual_presenca' |
  'status_pagamento' | 'tempo_permanencia_meses' | 'ultimo_feedback' | 'health_status' |
  'risco_probabilidade';

const FASE_RANK: Record<string, number> = { onboarding: 0, consolidacao: 1, encantamento: 2, renovacao: 3 };
const PAGAMENTO_RANK: Record<string, number> = { inadimplente: 0, atrasado: 1, sem_parcela: 2, em_dia: 3 };
const FEEDBACK_RANK: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2 };
const STATUS_RANK: Record<string, number> = { critico: 0, atencao: 1, saudavel: 2 };

const faseLabel = (fase: string) =>
  fase === 'onboarding' ? 'Onboarding' :
  fase === 'consolidacao' ? 'Consolidação' :
  fase === 'encantamento' ? 'Encantamento' : 'Renovação';

const faseDetalhe = (mesesRaw: number | null): string[] => {
  const m = mesesRaw ?? 0;
  if (m < 3) return [`Onboarding (0-3m de casa)`, `Faltam ${3 - m} mês(es) para Consolidação`];
  if (m < 6) return [`Consolidação (3-6m de casa)`, `Faltam ${6 - m} mês(es) para Encantamento`];
  if (m < 9) return [`Encantamento (6-9m de casa)`, `Faltam ${9 - m} mês(es) para Renovação`];
  return [`Renovação (9m+ de casa)`, `Veterano`];
};

const TooltipList = ({ items }: { items: string[] }) => (
  <ul className="list-disc pl-3 space-y-1">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const pagamentoLabel = (status: string | null) =>
  status === 'em_dia' ? 'Em dia' :
  status === 'atrasado' ? 'Atrasado' :
  status === 'sem_parcela' ? 'Sem parcela' : 'Inadimplente';

const feedbackLabel = (fb: string | null) =>
  fb === 'verde' ? 'Verde (tudo bem)' :
  fb === 'amarelo' ? 'Amarelo (atenção)' :
  fb === 'vermelho' ? 'Vermelho (risco)' : 'Sem feedback registrado';

const statusLabel = (status: string) =>
  status === 'critico' ? 'Crítico' : status === 'atencao' ? 'Atenção' : 'Saudável';

// Risco de evasão (modelo). Faixa: baixo / atencao / critico (mesma da tabela risco_evasao).
const riscoFaixaLabel = (faixa: string | null) =>
  faixa === 'critico' ? 'Alto' : faixa === 'atencao' ? 'Médio' : faixa === 'baixo' ? 'Baixo' : '—';

const riscoColor = (faixa: string | null) =>
  faixa === 'critico' ? 'text-rose-400 bg-rose-900/30 border-rose-700' :
  faixa === 'atencao' ? 'text-amber-400 bg-amber-900/30 border-amber-700' :
  faixa === 'baixo' ? 'text-emerald-400 bg-emerald-900/30 border-emerald-700' :
  'text-slate-400 bg-slate-800/40 border-slate-700';

const sinalIcon = (sinal: string) =>
  sinal === 'risco' ? '🔴' : sinal === 'atencao' ? '🟡' : sinal === 'ok' ? '🟢' : '⚪';

const getSortValue = (aluno: AlunoSucesso, key: SortKey): number | string => {
  switch (key) {
    case 'nome': return aluno.nome?.toLowerCase() || '';
    case 'health_score_numerico': return aluno.health_score_numerico ?? -1;
    case 'fase_jornada': return FASE_RANK[aluno.fase_jornada] ?? -1;
    case 'percentual_presenca': return aluno.percentual_presenca ?? -1;
    case 'status_pagamento': return PAGAMENTO_RANK[aluno.status_pagamento || ''] ?? -1;
    case 'tempo_permanencia_meses': return aluno.tempo_permanencia_meses ?? -1;
    case 'ultimo_feedback': return FEEDBACK_RANK[aluno.ultimo_feedback || ''] ?? -1;
    case 'health_status': return STATUS_RANK[aluno.health_status || ''] ?? -1;
    case 'risco_probabilidade':
      return aluno.risco_confianca === 'baixa' ? -1 : (aluno.risco_probabilidade ?? -1);
    default: return '';
  }
};

export function TabSucessoAluno({ unidadeAtual, onAbrirConversa }: Props) {
  const toast = useToast();
  const sentinelRef = useWidgetOverlapSentinel();

  const [alunos, setAlunos] = useState<AlunoSucesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroFase, setFiltroFase] = useState<string>('todos');
  const [recalculando, setRecalculando] = useState(false);
  const [modalAluno, setModalAluno] = useState<{ open: boolean; aluno: AlunoSucesso | null }>({ open: false, aluno: null });
  const [modalFeedback, setModalFeedback] = useState(false);
  const [subAba, setSubAba] = useState<'tabela' | 'jornada' | 'pesquisa' | 'presenca' | 'faltas' | 'marcos' | 'analise' | 'cartoes' | 'automacoes'>('tabela');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 30;
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'health_score_numerico',
    dir: 'asc'
  });

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 text-slate-600" />;
    return sortConfig.dir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-emerald-400" />
      : <ArrowDown className="w-3 h-3 text-emerald-400" />;
  };

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual]);

  // PostgREST corta em 1000 linhas por padrao. Sem paginar, alunos com id/ordenacao
  // além do corte somem em silêncio (achado real: Beatriz Gonçalves Pereira, aluno_id
  // 1811, ficava de fora da lista de risco por estar na posição ~1146).
  const buscarTudoPaginado = async <T,>(montarQuery: () => any): Promise<T[]> => {
    const PAGE = 1000;
    const linhas: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await montarQuery().range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      linhas.push(...(data as T[]));
      if (data.length < PAGE) break;
    }
    return linhas;
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      const data = await buscarTudoPaginado<AlunoSucesso>(() => {
        let query = supabase
          .from('vw_aluno_sucesso_lista')
          .select('*')
          .order('health_score_numerico', { ascending: true, nullsFirst: false });
        if (unidadeAtual !== 'todos') {
          query = query.eq('unidade_id', unidadeAtual);
        }
        return query;
      });

      // Risco de evasão do modelo (view vw_risco_evasao_atual = último score por aluno).
      // Merge por aluno_id; se a tabela ainda não tiver o aluno, campos ficam null.
      const riscoData = await buscarTudoPaginado<{
        aluno_id: number;
        probabilidade: number;
        faixa: string;
        fatores: unknown;
        confianca_dado: string;
        motivo_confianca: string;
      }>(() => {
        let riscoQuery = supabase
          .from('vw_risco_evasao_atual')
          .select('aluno_id, probabilidade, faixa, fatores, confianca_dado, motivo_confianca');
        if (unidadeAtual !== 'todos') {
          riscoQuery = riscoQuery.eq('unidade_id', unidadeAtual);
        }
        return riscoQuery;
      });
      const riscoMap = new Map((riscoData || []).map(r => [r.aluno_id, r]));

      const alunosComRisco = (data || []).map(a => {
        const r = riscoMap.get(a.id);
        return {
          ...a,
          risco_probabilidade: r?.probabilidade ?? null,
          risco_faixa: r?.faixa ?? null,
          risco_fatores: r?.fatores ?? null,
          risco_confianca: r?.confianca_dado ?? null,
          risco_motivo_confianca: r?.motivo_confianca ?? null,
        };
      });
      setAlunos(alunosComRisco);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const recalcularHealthScore = async () => {
    setRecalculando(true);
    try {
      const { data, error } = await supabase.rpc('calcular_health_score_alunos_batch', {
        p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual
      });
      if (error) throw error;
      await carregarDados();
      toast.success(`Health Score recalculado para ${data?.[0]?.total_processados || 0} alunos`);
    } catch (error) {
      toast.error('Erro ao recalcular Health Score');
    } finally {
      setRecalculando(false);
    }
  };

  // Filtrar alunos
  const alunosFiltrados = useMemo(() => {
    let resultado = [...alunos];

    if (filtroStatus !== 'todos') {
      resultado = resultado.filter(a => a.health_status === filtroStatus);
    }

    if (filtroFase !== 'todos') {
      resultado = resultado.filter(a => a.fase_jornada === filtroFase);
    }

    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase();
      resultado = resultado.filter(a => 
        a.nome.toLowerCase().includes(termo) ||
        a.professor_nome?.toLowerCase().includes(termo) ||
        a.curso_nome?.toLowerCase().includes(termo)
      );
    }

    // Ordenar pela coluna selecionada
    resultado.sort((a, b) => {
      const va = getSortValue(a, sortConfig.key);
      const vb = getSortValue(b, sortConfig.key);
      const cmp = typeof va === 'string' && typeof vb === 'string'
        ? va.localeCompare(vb)
        : (va as number) - (vb as number);
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });

    return resultado;
  }, [alunos, filtroStatus, filtroBusca, filtroFase, sortConfig]);

  // Paginação
  const totalPaginas = Math.ceil(alunosFiltrados.length / itensPorPagina);
  const alunosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return alunosFiltrados.slice(inicio, inicio + itensPorPagina);
  }, [alunosFiltrados, paginaAtual, itensPorPagina]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroStatus, filtroBusca, filtroFase]);

  // Calcular alertas
  const alertas = useMemo<AlertaSaude[]>(() => {
    const criticos = alunos.filter(a => a.health_status === 'critico');
    const atencao = alunos.filter(a => a.health_status === 'atencao');
    const saudaveis = alunos.filter(a => a.health_status === 'saudavel');

    return [
      { tipo: 'critico', quantidade: criticos.length, descricao: 'Score abaixo de 40' },
      { tipo: 'atencao', quantidade: atencao.length, descricao: 'Score entre 40-69' },
      { tipo: 'saudavel', quantidade: saudaveis.length, descricao: 'Score acima de 70' }
    ];
  }, [alunos]);

  // Rankings
  const rankings = useMemo(() => {
    const comPresenca = alunos.filter(a => (a.percentual_presenca || 0) > 0);
    const comTempo = alunos.filter(a => (a.tempo_permanencia_meses || 0) > 0);
    const comScore = alunos.filter(a => (a.health_score_numerico || 0) > 0);

    return {
      topPresenca: [...comPresenca].sort((a, b) => (b.percentual_presenca || 0) - (a.percentual_presenca || 0))[0],
      topVeterano: [...comTempo].sort((a, b) => (b.tempo_permanencia_meses || 0) - (a.tempo_permanencia_meses || 0))[0],
      topEngajamento: [...comScore].sort((a, b) => (b.health_score_numerico || 0) - (a.health_score_numerico || 0))[0]
    };
  }, [alunos]);

  // Health Score médio
  const healthScoreMedio = useMemo(() => {
    if (alunos.length === 0) return { media: 0, status: 'atencao' as const };
    const soma = alunos.reduce((acc, a) => acc + (a.health_score_numerico || 0), 0);
    const media = soma / alunos.length;
    const status = media >= 70 ? 'saudavel' : media >= 40 ? 'atencao' : 'critico';
    return { media: Math.round(media * 10) / 10, status };
  }, [alunos]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critico': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'atencao': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'saudavel': return 'text-green-400 bg-green-500/20 border-green-500/30';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/30';
    }
  };

  const getFaseColor = (fase: string) => {
    switch (fase) {
      case 'onboarding': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'consolidacao': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'encantamento': return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
      case 'renovacao': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getGradientByStatus = (status: string) => {
    switch (status) {
      case 'critico': return 'from-red-400 to-red-600';
      case 'atencao': return 'from-yellow-400 to-orange-500';
      case 'saudavel': return 'from-green-400 to-emerald-600';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alertas de Saúde dos Alunos */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h2 className="font-semibold text-white">Alertas de Saúde dos Alunos</h2>
          <span className="text-xs text-slate-400 ml-auto">
            Atualizado {format(new Date(), "HH:mm", { locale: ptBR })}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {alertas.map((alerta) => (
            <div
              key={alerta.tipo}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 border cursor-pointer hover:opacity-80 transition ${getStatusColor(alerta.tipo)}`}
              onClick={() => setFiltroStatus(alerta.tipo)}
            >
              <span className="text-2xl">
                {alerta.tipo === 'critico' ? '🔴' : alerta.tipo === 'atencao' ? '🟡' : '🟢'}
              </span>
              <div>
                <p className="font-medium text-sm">
                  {alerta.quantidade} aluno{alerta.quantidade !== 1 ? 's' : ''} {alerta.tipo === 'critico' ? 'crítico' : alerta.tipo === 'atencao' ? 'atenção' : 'saudável'}{alerta.quantidade !== 1 ? 's' : ''}
                </p>
                <p className="text-xs opacity-70">{alerta.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ranking Rápido + Health Score com Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {/* Top Presença */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Presença</p>
          {rankings.topPresenca ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topPresenca.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topPresenca.percentual_presenca?.toFixed(0)}% presença</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>

        {/* Top Veterano */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Veterano</p>
          {rankings.topVeterano ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topVeterano.nome}</p>
              <p className="text-green-400 text-sm">{rankings.topVeterano.tempo_permanencia_meses} meses de casa</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>

        {/* HEALTH SCORE COM GAUGE - DESTAQUE NO CENTRO */}
        <div className={`bg-slate-900 rounded-2xl p-4 border-2 ${
          healthScoreMedio.status === 'saudavel' 
            ? 'border-violet-500/50' 
            : healthScoreMedio.status === 'atencao'
            ? 'border-amber-500/50'
            : 'border-rose-500/50'
        } shadow-lg row-span-1`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                healthScoreMedio.status === 'saudavel' 
                  ? 'bg-violet-500/20' 
                  : healthScoreMedio.status === 'atencao'
                  ? 'bg-amber-500/20'
                  : 'bg-rose-500/20'
              }`}>
                <Heart className={`w-4 h-4 ${
                  healthScoreMedio.status === 'saudavel' 
                    ? 'text-violet-400' 
                    : healthScoreMedio.status === 'atencao'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`} />
              </div>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                Health Score
              </span>
            </div>
          </div>
          
          {/* GAUGE SVG */}
          <div className="flex flex-col items-center justify-center">
            <svg width="140" height="85" viewBox="0 0 180 110" className="overflow-visible">
              <defs>
                <linearGradient id="healthGaugeGradientAluno" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="45%" stopColor="#F59E0B" />
                  <stop offset="75%" stopColor="#84CC16" />
                  <stop offset="90%" stopColor="#22C55E" />
                  <stop offset="100%" stopColor="#22C55E" />
                </linearGradient>
              </defs>
              <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="#1e293b" strokeWidth="16" strokeLinecap="round"/>
              <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="url(#healthGaugeGradientAluno)" strokeWidth="16" strokeLinecap="round"/>
              <g style={{
                transform: `rotate(${(healthScoreMedio.media / 100) * 180 - 90}deg)`,
                transformOrigin: '90px 90px',
                transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}>
                <path d="M 87 90 L 90 30 L 93 90 Z" fill="#94a3b8"/>
                <circle cx="90" cy="90" r="5" fill="#94a3b8"/>
                <circle cx="90" cy="90" r="2" fill="white"/>
              </g>
            </svg>
            <div className="mt-[-12px] text-center z-10">
              <span className={`text-2xl font-black tracking-tighter ${
                healthScoreMedio.status === 'saudavel' 
                  ? 'text-violet-400' 
                  : healthScoreMedio.status === 'atencao'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}>
                {healthScoreMedio.media}
              </span>
              <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-widest">
                Média Geral
              </p>
            </div>
          </div>
        </div>

        {/* Top Engajamento */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 h-[115px] flex flex-col justify-center">
          <p className="text-xs text-slate-400 mb-1">🏆 Top Engajamento</p>
          {rankings.topEngajamento ? (
            <>
              <p className="text-white font-semibold text-sm truncate">{rankings.topEngajamento.nome}</p>
              <p className="text-green-400 text-sm">Score {rankings.topEngajamento.health_score_numerico}/100</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm">-</p>
          )}
        </div>
      </div>

      {/* Subabas: Tabela / Jornada / Pesquisa */}
      <div className="flex items-center gap-1 bg-slate-800/30 rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubAba('tabela')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'tabela'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Table2 className="w-4 h-4" />
          Tabela
        </button>
        <button
          onClick={() => setSubAba('jornada')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'jornada'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Kanban className="w-4 h-4" />
          Jornada
        </button>
        <button
          onClick={() => setSubAba('pesquisa')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'pesquisa'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <FileQuestion className="w-4 h-4" />
          Pesquisas
        </button>
        <button
          onClick={() => setSubAba('presenca')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'presenca'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Presença
        </button>
        <button
          onClick={() => setSubAba('faltas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'faltas'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <UserX className="w-4 h-4" />
          Faltas
        </button>
        <button
          onClick={() => setSubAba('marcos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'marcos'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Flag className="w-4 h-4" />
          Marcos
        </button>
        <button
          onClick={() => setSubAba('analise')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'analise'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Análise
        </button>
        <button
          onClick={() => setSubAba('cartoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'cartoes'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Contact className="w-4 h-4" />
          Cartões
        </button>
        <button
          onClick={() => setSubAba('automacoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'automacoes'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Zap className="w-4 h-4" />
          Mensagens Automáticas
        </button>
      </div>

      {/* Conteúdo da Subaba TABELA */}
      {subAba === 'tabela' && (
        <>
          {/* Filtros e Ações */}
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="critico">🔴 Crítico</SelectItem>
                    <SelectItem value="atencao">🟡 Atenção</SelectItem>
                    <SelectItem value="saudavel">🟢 Saudável</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filtroFase} onValueChange={setFiltroFase}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Fase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as fases</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="consolidacao">Consolidação</SelectItem>
                    <SelectItem value="encantamento">Encantamento</SelectItem>
                    <SelectItem value="renovacao">Renovação</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar aluno..."
                    value={filtroBusca}
                    onChange={(e) => setFiltroBusca(e.target.value)}
                    className="pl-9 w-48"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={recalcularHealthScore}
                  disabled={recalculando}
                  className="border-slate-700"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${recalculando ? 'animate-spin' : ''}`} />
                  Recalcular
                </Button>

                <button
                  onClick={() => setModalFeedback(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-500 to-violet-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-pink-500/20"
                >
                  <MessageSquare className="w-4 h-4" />
                  Enviar Feedback Professores
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Alunos */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('nome')} className="flex items-center gap-1 hover:text-white transition-colors">
                    <span>Aluno</span>
                    <SortIcon column="nome" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('health_score_numerico')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <Heart className="w-3 h-3 text-violet-400" />
                    <span>Health</span>
                    <SortIcon column="health_score_numerico" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('risco_probabilidade')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <Zap className="w-3 h-3 text-orange-400" />
                    <span>Risco de Evasão</span>
                    <span className="text-[9px] px-1 rounded bg-orange-500/20 text-orange-300 font-semibold">IA</span>
                    <SortIcon column="risco_probabilidade" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('fase_jornada')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <span>Fase</span>
                    <SortIcon column="fase_jornada" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('percentual_presenca')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <span>Presença</span>
                    <SortIcon column="percentual_presenca" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('status_pagamento')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <span>Pagamento</span>
                    <SortIcon column="status_pagamento" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('tempo_permanencia_meses')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <span>Tempo</span>
                    <SortIcon column="tempo_permanencia_meses" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('ultimo_feedback')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <Heart className="w-3 h-3 text-emerald-400" />
                    <span>Feedback</span>
                    <SortIcon column="ultimo_feedback" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <button onClick={() => handleSort('health_status')} className="flex items-center justify-center gap-1 hover:text-white transition-colors mx-auto">
                    <span>Status</span>
                    <SortIcon column="health_status" />
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {alunosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    Nenhum aluno encontrado
                  </td>
                </tr>
              ) : (
                alunosPaginados.map((aluno) => (
                  <tr
                    key={aluno.id}
                    className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {aluno.foto_url ? (
                          <img src={aluno.foto_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradientByStatus(aluno.health_status || 'atencao')} flex items-center justify-center text-white font-bold text-sm`}>
                            {getIniciais(aluno.nome)}
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium">{aluno.nome}</p>
                          <p className="text-slate-400 text-xs">{aluno.curso_nome || 'Sem curso'}</p>
                        </div>
                      </div>
                    </td>
                    {/* Health Score */}
                    <td className="text-center px-4 py-3">
                      <Tooltip content={<TooltipList items={[
                        `Pagamento: ${pagamentoLabel(aluno.status_pagamento)} (peso 30%)`,
                        `Tempo de casa: ${aluno.tempo_permanencia_meses ?? 0}m (peso 20%)`,
                        `Fase: ${faseLabel(aluno.fase_jornada)} (peso 20%)`,
                        `Feedback: ${feedbackLabel(aluno.ultimo_feedback)} (peso 20%)`,
                        `Presença: ${aluno.percentual_presenca ?? '—'}% (peso 10%)`
                      ]} />}>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border cursor-help ${
                          aluno.health_status === 'saudavel'
                            ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400'
                            : aluno.health_status === 'atencao'
                            ? 'bg-amber-900/30 border-amber-700 text-amber-400'
                            : 'bg-rose-900/30 border-rose-700 text-rose-400'
                        }`}>
                          <span className="text-sm font-black">{aluno.health_score_numerico || 0}</span>
                        </div>
                      </Tooltip>
                    </td>
                    {/* Risco de Evasão (modelo) */}
                    <td className="text-center px-4 py-3">
                      {aluno.risco_probabilidade == null ? (
                        <span className="text-slate-600 text-xs">—</span>
                      ) : aluno.risco_confianca === 'baixa' ? (
                        <Tooltip content={<TooltipList items={[
                          aluno.risco_motivo_confianca || 'Modelo em auditoria.',
                          `Score anterior preservado apenas para auditoria tecnica: ${Math.round(aluno.risco_probabilidade * 100)}%`,
                          'Nao use este valor para priorizar contato ou retencao.',
                        ]} />}>
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-amber-700 bg-amber-900/30 text-amber-300 cursor-help">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold">Em auditoria</span>
                          </div>
                        </Tooltip>
                      ) : (
                        <Tooltip content={<TooltipList items={[
                          `Probabilidade de evasão em ~30 dias: ${Math.round(aluno.risco_probabilidade * 100)}%`,
                          `Modelo estatístico (Random Forest), separado do Health Score`,
                          ...(aluno.risco_fatores || []).slice(0, 4).map(f =>
                            `${sinalIcon(f.sinal)} ${f.fator}: ${f.valor}`),
                        ]} />}>
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border cursor-help ${riscoColor(aluno.risco_faixa)}`}>
                            <span className="text-sm font-black">{Math.round(aluno.risco_probabilidade * 100)}%</span>
                            <span className="text-[10px] font-medium opacity-80">{riscoFaixaLabel(aluno.risco_faixa)}</span>
                          </div>
                        </Tooltip>
                      )}
                    </td>
                    {/* Fase */}
                    <td className="text-center px-4 py-3">
                      <Tooltip content={<TooltipList items={faseDetalhe(aluno.tempo_permanencia_meses)} />}>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border cursor-help ${getFaseColor(aluno.fase_jornada)}`}>
                          {faseLabel(aluno.fase_jornada)}
                        </span>
                      </Tooltip>
                    </td>
                    {/* Presença */}
                    <td className="text-center px-4 py-3">
                      <Tooltip content={<TooltipList items={[
                        `${aluno.percentual_presenca ?? '—'}% de presença desde a matrícula`,
                        ...(aluno.data_matricula ? [`Matriculado em ${format(new Date(aluno.data_matricula), "dd/MM/yyyy", { locale: ptBR })}`] : []),
                        ...(aluno.dias_sem_presenca != null ? [`Última aula presente há ${aluno.dias_sem_presenca} dia(s)`] : [])
                      ]} />}>
                        <div className="inline-block cursor-help">
                          <span className={`font-medium ${
                            (aluno.percentual_presenca || 0) >= 80 ? 'text-green-400' :
                            (aluno.percentual_presenca || 0) >= 60 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {aluno.percentual_presenca ? `${aluno.percentual_presenca.toFixed(0)}%` : '—'}
                          </span>
                          {aluno.dias_sem_presenca != null && (
                            <p className={`text-[10px] mt-0.5 ${
                              aluno.dias_sem_presenca > 30 ? 'text-red-400' :
                              aluno.dias_sem_presenca > 14 ? 'text-yellow-400' :
                              'text-slate-500'
                            }`}>
                              há {aluno.dias_sem_presenca}d
                            </p>
                          )}
                        </div>
                      </Tooltip>
                    </td>
                    {/* Pagamento */}
                    <td className="text-center px-4 py-3">
                      <Tooltip content={<TooltipList items={[
                        pagamentoLabel(aluno.status_pagamento),
                        ...(aluno.valor_parcela ? [`Parcela: R$ ${aluno.valor_parcela}`] : [])
                      ]} />}>
                        <span className={`font-medium cursor-help ${
                          aluno.status_pagamento === 'em_dia' ? 'text-green-400' :
                          aluno.status_pagamento === 'atrasado' ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {pagamentoLabel(aluno.status_pagamento)}
                        </span>
                      </Tooltip>
                    </td>
                    {/* Tempo */}
                    <td className="text-center px-4 py-3 text-white">
                      <Tooltip content={<TooltipList items={[
                        aluno.data_matricula
                          ? `Matriculado em ${format(new Date(aluno.data_matricula), "dd/MM/yyyy", { locale: ptBR })}`
                          : 'Data de matrícula não registrada'
                      ]} />}>
                        <span className="cursor-help">{aluno.tempo_permanencia_meses || 0}m</span>
                      </Tooltip>
                    </td>
                    {/* Feedback */}
                    <td className="text-center px-4 py-3">
                      <Tooltip content={<TooltipList items={[
                        feedbackLabel(aluno.ultimo_feedback),
                        ...(aluno.ultimo_feedback_data ? [`Registrado em ${format(new Date(aluno.ultimo_feedback_data), "dd/MM/yyyy", { locale: ptBR })}`] : []),
                        ...(aluno.ultimo_feedback_obs ? [`"${aluno.ultimo_feedback_obs}"`] : [])
                      ]} />}>
                        <span className="cursor-help">
                          {aluno.ultimo_feedback === 'verde' ? (
                            <span className="text-lg">💚</span>
                          ) : aluno.ultimo_feedback === 'amarelo' ? (
                            <span className="text-lg">💛</span>
                          ) : aluno.ultimo_feedback === 'vermelho' ? (
                            <span className="text-lg">❤️</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </span>
                      </Tooltip>
                    </td>
                    {/* Status */}
                    <td className="text-center px-4 py-3">
                      <Tooltip content={<TooltipList items={[
                        `Health Score: ${aluno.health_score_numerico ?? 0}`,
                        `Classificação: ${statusLabel(aluno.health_status || '')}`
                      ]} />}>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border cursor-help ${getStatusColor(aluno.health_status)}`}>
                          {statusLabel(aluno.health_status || '')}
                        </span>
                      </Tooltip>
                    </td>
                    {/* Ações */}
                    <td className="text-center px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-400 hover:text-blue-300"
                        onClick={() => setModalAluno({ open: true, aluno })}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Paginação */}
        <div ref={sentinelRef} className="p-4 border-t border-slate-700 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Mostrando {((paginaAtual - 1) * itensPorPagina) + 1}-{Math.min(paginaAtual * itensPorPagina, alunosFiltrados.length)} de {alunosFiltrados.length} alunos
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
              disabled={paginaAtual === 1}
              className="border-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-300 px-2">
              {paginaAtual} / {totalPaginas || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual >= totalPaginas}
              className="border-slate-700"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Conteúdo da Subaba PESQUISAS */}
      {subAba === 'pesquisa' && (
        <PesquisasTab unidadeAtual={unidadeAtual} onAbrirConversa={onAbrirConversa} />
      )}

      {/* Conteúdo da Subaba JORNADA */}
      {subAba === 'jornada' && (
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <JornadaAlunoKanban
            alunos={alunos.map(a => ({
              id: String(a.id),
              nome: a.nome,
              curso_nome: a.curso_nome,
              professor_nome: a.professor_nome,
              unidade_codigo: a.unidade_codigo,
              tempo_permanencia_meses: a.tempo_permanencia_meses,
              fase_jornada: a.fase_jornada,
              health_score: a.ultimo_feedback,
              status_pagamento: a.status_pagamento,
              valor_parcela: a.valor_parcela,
            }))}
            professores={[]}
            cursos={[]}
            onVerDetalhes={(alunoKanban) => {
              const alunoOriginal = alunos.find(a => String(a.id) === alunoKanban.id);
              if (alunoOriginal) setModalAluno({ open: true, aluno: alunoOriginal });
            }}
          />
        </div>
      )}

      {/* Conteúdo da Subaba PRESENÇA */}
      {subAba === 'presenca' && (
        <PresencaTab unidadeAtual={unidadeAtual} />
      )}

      {/* Conteúdo da Subaba FALTAS */}
      {subAba === 'faltas' && (
        <FaltasMesSection unidadeAtual={unidadeAtual} />
      )}

      {/* Conteúdo da Subaba MARCOS */}
      {subAba === 'marcos' && (
        <MarcosJornadaSection unidadeAtual={unidadeAtual} />
      )}

      {subAba === 'analise' && (
        <AnaliseTurmasTab unidadeAtual={unidadeAtual} />
      )}

      {subAba === 'cartoes' && (
        <CartoesContatoTab unidadeAtual={unidadeAtual} />
      )}

      {subAba === 'automacoes' && (
        <AutomacoesTab unidadeAtual={unidadeAtual} />
      )}

      {/* Modal de Detalhes do Aluno */}
      <ModalDetalhesSucessoAluno
        open={modalAluno.open}
        onClose={() => setModalAluno({ open: false, aluno: null })}
        aluno={modalAluno.aluno}
        competencia={new Date().toISOString().slice(0, 7)}
      />

      {/* Modal de Enviar Feedback para Professores */}
      <ModalEnviarFeedback
        open={modalFeedback}
        onClose={() => setModalFeedback(false)}
        unidadeAtual={unidadeAtual}
      />
    </div>
  );
}
