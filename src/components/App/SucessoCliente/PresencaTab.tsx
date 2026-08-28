import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAlunosAtivosAtuaisCanonicos } from '@/lib/estadoOperacionalAlunos';
import {
  avaliarPublicacaoOcorrencias,
  filtrarOcorrenciasConfirmadas,
} from '@/lib/presencaPublicacao';
import { format, parseISO, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  CalendarDays, Search, Loader2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Check, X, AlertCircle, Users, Filter,
  LayoutGrid, List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWidgetOverlapSentinel } from '@/contexts/WidgetVisibilityContext';

interface AlunoSimples {
  id: number;
  nome: string;
  unidade_id: string;
}

interface PresencaDia {
  aluno_id: number;
  aluno_nome: string;
  status: string;
  horario_aula: string | null;
  curso_nome: string | null;
  turma_nome: string | null;
  sala_nome: string | null;
  professor_nome: string | null;
  anotacoes: string | null;
  duracao_minutos: number | null;
  tipo: string | null;
  nr_da_aula: number | null;
  qtd_alunos: number | null;
  estado_publicacao: EstadoPublicacaoPresenca;
  regra_versao: string;
  fonte: string;
}

interface PresencaAula {
  data_aula: string;
  status: string;
  horario_aula: string | null;
  curso_nome: string | null;
  turma_nome: string | null;
  sala_nome: string | null;
  // Dados extras via join aulas_emusys
  professor_nome: string | null;
  anotacoes: string | null;
  duracao_minutos: number | null;
  tipo: string | null;
  nr_da_aula: number | null;
  qtd_alunos: number | null;
  estado_publicacao: EstadoPublicacaoPresenca;
  regra_versao: string;
  fonte: string;
}

interface SyncLog {
  id: string;
  data_sync: string;
  unidade_nome: string;
  total_aulas: number;
  total_registros: number;
  alunos_matched: number;
  alunos_nao_encontrados: number;
  nomes_nao_encontrados: string[] | null;
  experimentais_count: number;
  nomes_experimentais: string[] | null;
  inativos_count: number;
  nomes_inativos: string[] | null;
  executado_em: string;
}

interface Props {
  unidadeAtual: UnidadeId;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const LOGS_POR_PAGINA = 10;
const PRESENCA_POR_PAGINA = 30;
type EstadoPublicacaoPresenca = 'em_auditoria' | 'publicado';

function calcularPercentualPublicavel(
  numerador: number,
  denominador: number,
  estadoPublicacao: EstadoPublicacaoPresenca,
): number | null {
  if (estadoPublicacao !== 'publicado' || denominador <= 0) return null;
  return Math.round((numerador / denominador) * 1000) / 10;
}

function formatarPercentualPublicavel(
  percentual: number | null,
  denominador: number,
  estadoPublicacao: EstadoPublicacaoPresenca,
): string {
  if (estadoPublicacao !== 'publicado' || denominador <= 0 || percentual === null) {
    return 'Em auditoria';
  }
  return `${percentual.toFixed(1)}%`;
}

function classePercentual(percentual: number | null): string {
  if (percentual === null) return 'text-amber-400';
  return percentual >= 80 ? 'text-green-400' : percentual >= 60 ? 'text-yellow-400' : 'text-red-400';
}

function normalizarOcorrencia(linha: any, experimental = false) {
  const resultado = String(linha.resultado_canonico ?? linha.resultado ?? 'indeterminado');
  return {
    aluno_id: Number(linha.aluno_id),
    aluno_nome: String(linha.aluno_nome || 'Aluno sem nome'),
    data_aula: String(linha.data_aula),
    status: resultado === 'presente'
      ? 'presente'
      : resultado === 'falta' || resultado === 'falta_justificada'
        ? 'ausente'
        : 'em_auditoria',
    horario_aula: linha.horario_aula ? String(linha.horario_aula) : null,
    curso_nome: linha.curso_nome ? String(linha.curso_nome) : null,
    turma_nome: linha.turma_nome ? String(linha.turma_nome) : null,
    sala_nome: linha.sala_nome ? String(linha.sala_nome) : null,
    professor_nome: linha.professor_nome ? String(linha.professor_nome) : null,
    anotacoes: linha.anotacoes ? String(linha.anotacoes) : null,
    duracao_minutos: linha.duracao_minutos === null ? null : Number(linha.duracao_minutos),
    tipo: linha.tipo ? String(linha.tipo) : null,
    nr_da_aula: linha.nr_da_aula === null ? null : Number(linha.nr_da_aula),
    qtd_alunos: linha.qtd_alunos === null ? null : Number(linha.qtd_alunos),
    estado_publicacao: experimental
      ? 'em_auditoria' as const
      : linha.estado_publicacao === 'publicado' ? 'publicado' as const : 'em_auditoria' as const,
    regra_versao: String(linha.regra_versao || (experimental ? 'presenca-experimental-v1.1' : 'presenca-interface-v2.1')),
    fonte: experimental ? 'presenca-experimental' : 'get_presenca_ocorrencias_periodo_v2',
  };
}

async function buscarUltimaExperimental(aluno: AlunoSimples): Promise<string | null> {
  const { data } = await supabase.rpc('get_presenca_experimental_aluno_periodo_v1', {
    p_unidade_id: aluno.unidade_id,
    p_data_inicio: null,
    p_data_fim: null,
    p_aluno_id: aluno.id,
  });
  return (data || []).reduce<string | null>((ultima, linha: any) => {
    const dataAula = String(linha.data_aula || '');
    return !ultima || dataAula > ultima ? dataAula : ultima;
  }, null);
}

export function PresencaTab({ unidadeAtual }: Props) {
  const sentinelRef = useWidgetOverlapSentinel();

  // === Estado da Grade Semanal ===
  const [alunos, setAlunos] = useState<AlunoSimples[]>([]);
  const [busca, setBusca] = useState('');
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoSimples | null>(null);
  const [semanaInicio, setSemanaInicio] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [presencas, setPresencas] = useState<PresencaAula[]>([]);
  const [loadingPresenca, setLoadingPresenca] = useState(false);
  const [loadingAlunos, setLoadingAlunos] = useState(true);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [filtroTipoAula, setFiltroTipoAula] = useState<'todas' | 'experimental'>('todas');
  const [filtroTipoRegistro, setFiltroTipoRegistro] = useState<'todas' | 'turma' | 'individual'>('todas');

  // === Estado dos Logs ===
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logExpandido, setLogExpandido] = useState<string | null>(null);
  const [paginaLog, setPaginaLog] = useState(1);
  const [filtroData, setFiltroData] = useState('');

  // === Estado da Presença do Dia (filtro por data) ===
  const [presencasDoDia, setPresencasDoDia] = useState<PresencaDia[]>([]);
  const [loadingDia, setLoadingDia] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'tabela'>(() => {
    return (localStorage.getItem('presenca_view_mode') as 'cards' | 'tabela') || 'cards';
  });
  const [paginaPresenca, setPaginaPresenca] = useState(1);
  const [filtroProfessor, setFiltroProfessor] = useState('');
  const [buscaProfessor, setBuscaProfessor] = useState('');
  const [comboProfessorAberto, setComboProfessorAberto] = useState(false);
  const comboProfessorRef = useRef<HTMLDivElement>(null);

  // Dias da semana (Seg a Sáb)
  const diasDaSemana = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => addDays(semanaInicio, i));
  }, [semanaInicio]);

  // Buscar alunos (paginado para superar limite de 1000 rows do PostgREST)
  useEffect(() => {
    const fetchAlunos = async () => {
      setLoadingAlunos(true);
      const ativos = await fetchAlunosAtivosAtuaisCanonicos(unidadeAtual);
      const todos: AlunoSimples[] = ativos.map((aluno) => ({
        id: aluno.id,
        nome: aluno.nome,
        unidade_id: aluno.unidade_id,
      }));

      setAlunos(todos);
      setLoadingAlunos(false);
    };
    fetchAlunos();
    setAlunoSelecionado(null);
    setBusca('');
    setPresencas([]);
  }, [unidadeAtual]);

  // Buscar logs (limit maior para paginação client-side)
  useEffect(() => {
    const fetchLogs = async () => {
      setLoadingLogs(true);
      let query = supabase
        .from('emusys_sync_log')
        .select('id, data_sync, unidade_nome, total_aulas, total_registros, alunos_matched, alunos_nao_encontrados, nomes_nao_encontrados, experimentais_count, nomes_experimentais, inativos_count, nomes_inativos, executado_em')
        .order('executado_em', { ascending: false })
        .limit(100);

      if (unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data } = await query;
      setLogs(data || []);
      setLoadingLogs(false);
      setPaginaLog(1);
    };
    fetchLogs();
  }, [unidadeAtual]);

  // Buscar todas as presenças do dia (quando filtro de data ativo)
  useEffect(() => {
    if (!filtroData) { setPresencasDoDia([]); return; }
    const fetchDia = async () => {
      setLoadingDia(true);
      const { data } = await supabase.rpc('get_presenca_ocorrencias_periodo_v2', {
        p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
        p_data_inicio: filtroData,
        p_data_fim: filtroData,
        p_professor_id: null,
        p_aluno_id: null,
      });
      setPresencasDoDia((data || [])
        .map((linha: any) => normalizarOcorrencia(linha)));
      setLoadingDia(false);
    };
    fetchDia();
  }, [filtroData, unidadeAtual]);

  // Buscar presença da semana
  const carregarPresencaSemana = useCallback(async () => {
    if (!alunoSelecionado) return;
    setLoadingPresenca(true);

    const inicio = format(semanaInicio, 'yyyy-MM-dd');
    const fim = format(addDays(semanaInicio, 5), 'yyyy-MM-dd');

    const experimental = filtroTipoAula === 'experimental';
    const resultado = experimental
      ? await supabase.rpc('get_presenca_experimental_aluno_periodo_v1', {
        p_unidade_id: alunoSelecionado.unidade_id,
        p_data_inicio: inicio,
        p_data_fim: fim,
        p_aluno_id: alunoSelecionado.id,
      })
      : await supabase.rpc('get_presenca_ocorrencias_periodo_v2', {
        p_unidade_id: alunoSelecionado.unidade_id,
        p_data_inicio: inicio,
        p_data_fim: fim,
        p_professor_id: null,
        p_aluno_id: alunoSelecionado.id,
      });

    setPresencas((resultado.data || [])
      .map((linha: any) => normalizarOcorrencia(linha, experimental)));
    setLoadingPresenca(false);
  }, [alunoSelecionado, semanaInicio, filtroTipoAula]);

  useEffect(() => {
    carregarPresencaSemana();
  }, [carregarPresencaSemana]);

  // Fecha combobox de professor ao clicar fora
  useEffect(() => {
    if (!comboProfessorAberto) return;
    const handler = (e: MouseEvent) => {
      if (comboProfessorRef.current && !comboProfessorRef.current.contains(e.target as Node)) {
        setComboProfessorAberto(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [comboProfessorAberto]);

  // Ao trocar filtro de tipo com aluno selecionado, navegar para semana relevante
  useEffect(() => {
    if (!alunoSelecionado) return;
    if (filtroTipoAula === 'experimental') {
      (async () => {
        const ultima = await buscarUltimaExperimental(alunoSelecionado);
        if (ultima) {
          setSemanaInicio(startOfWeek(parseISO(ultima), { weekStartsOn: 1 }));
        }
      })();
    } else {
      setSemanaInicio(startOfWeek(new Date(), { weekStartsOn: 1 }));
    }
  }, [filtroTipoAula]);

  // Filtrar presenças do dia por tipo de registro
  const presencasDoDiaFiltradas = useMemo(() => {
    let resultado = filtrarOcorrenciasConfirmadas(presencasDoDia);
    if (filtroTipoRegistro !== 'todas') {
      resultado = resultado.filter(p => p.tipo === filtroTipoRegistro);
    }
    if (filtroProfessor !== '') {
      resultado = resultado.filter(p => p.professor_nome === filtroProfessor);
    }
    return resultado;
  }, [presencasDoDia, filtroTipoRegistro, filtroProfessor]);

  const professoresDisponiveis = useMemo(() => {
    const nomes = presencasDoDia
      .map(p => p.professor_nome)
      .filter((n): n is string => !!n);
    return [...new Set(nomes)].sort();
  }, [presencasDoDia]);

  // Slice paginado dos cards de presença do dia
  const presencasDoDiaPaginadas = useMemo(() => {
    const inicio = (paginaPresenca - 1) * PRESENCA_POR_PAGINA;
    return presencasDoDiaFiltradas.slice(inicio, inicio + PRESENCA_POR_PAGINA);
  }, [presencasDoDiaFiltradas, paginaPresenca]);

  const totalPaginasPresenca = Math.ceil(presencasDoDiaFiltradas.length / PRESENCA_POR_PAGINA);

  // Filtrar presenças da semana por tipo de registro
  const presencasFiltradas = useMemo(() => {
    const confirmadas = filtrarOcorrenciasConfirmadas(presencas);
    if (filtroTipoRegistro === 'todas') return confirmadas;
    return confirmadas.filter(p => p.tipo === filtroTipoRegistro);
  }, [presencas, filtroTipoRegistro]);

  // Agrupar presença por dia
  const presencaPorDia = useMemo(() => {
    const mapa = new Map<string, PresencaAula[]>();
    for (const p of presencasFiltradas) {
      const key = p.data_aula;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key)!.push(p);
    }
    return mapa;
  }, [presencasFiltradas]);

  // Resumo da semana
  const resumoSemana = useMemo(() => {
    const total = presencasFiltradas.length;
    const pres = presencasFiltradas.filter(p => p.status === 'presente').length;
    const estado = avaliarPublicacaoOcorrencias(
      presencas,
      filtroTipoAula === 'experimental',
    ).estado_publicacao;
    const pct = calcularPercentualPublicavel(pres, total, estado);
    return { total, presentes: pres, pct };
  }, [filtroTipoAula, presencas, presencasFiltradas]);

  // Filtrar alunos para busca
  const alunosFiltrados = useMemo(() => {
    if (!busca.trim()) return alunos.slice(0, 50);
    const termo = busca.toLowerCase();
    return alunos.filter(a => a.nome.toLowerCase().includes(termo)).slice(0, 50);
  }, [alunos, busca]);

  const selecionarAluno = async (aluno: AlunoSimples) => {
    setAlunoSelecionado(aluno);
    setBusca(aluno.nome);
    setDropdownAberto(false);

    // Se filtro é experimental, navegar para a semana da experimental mais recente
    if (filtroTipoAula === 'experimental') {
      const ultimaExp = await buscarUltimaExperimental(aluno);
      if (ultimaExp) {
        setSemanaInicio(startOfWeek(parseISO(ultimaExp), { weekStartsOn: 1 }));
      }
    }
  };

  // Paginação dos logs
  const totalPaginasLog = Math.ceil(logs.length / LOGS_POR_PAGINA);
  const logsPaginados = useMemo(() => {
    const inicio = (paginaLog - 1) * LOGS_POR_PAGINA;
    return logs.slice(inicio, inicio + LOGS_POR_PAGINA);
  }, [logs, paginaLog]);

  // Total de não encontrados nos logs
  const totalNaoEncontrados = useMemo(() => {
    const nomesSet = new Set<string>();
    for (const log of logs) {
      if (log.nomes_nao_encontrados) {
        for (const nome of log.nomes_nao_encontrados) {
          nomesSet.add(nome);
        }
      }
    }
    return nomesSet.size;
  }, [logs]);

  const publicacaoPresenca = useMemo(() => {
    const inicio = filtroData || format(semanaInicio, 'yyyy-MM-dd');
    const fim = filtroData || format(addDays(semanaInicio, 5), 'yyyy-MM-dd');
    const linhas = filtroData ? presencasDoDia : presencas;
    const avaliacao = avaliarPublicacaoOcorrencias(
      linhas,
      filtroTipoAula === 'experimental',
    );
    return {
      denominador: avaliacao.denominador,
      fonte: [...new Set(linhas.map(linha => linha.fonte))].join(', ') || 'get_presenca_ocorrencias_periodo_v2',
      periodo: `${format(parseISO(inicio), 'dd/MM/yyyy')} a ${format(parseISO(fim), 'dd/MM/yyyy')}`,
      regra_versao: [...new Set(linhas.map(linha => linha.regra_versao))].join(', ') || 'presenca-interface-v2.1',
      estado_publicacao: avaliacao.estado_publicacao,
    };
  }, [filtroData, filtroTipoAula, presencasDoDia, presencas, semanaInicio]);

  return (
    <div className="space-y-6">
      {/* === SEÇÃO 1: GRADE SEMANAL DE PRESENÇA === */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold text-white">Grade de Presença</h2>
        </div>

        {/* Filtros: data + tipo de registro */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Data:</span>
          </div>
          <input
            type="date"
            value={filtroData}
            onChange={(e) => { setFiltroData(e.target.value); setPaginaPresenca(1); setFiltroProfessor(''); setBuscaProfessor(''); }}
            className="h-7 px-2 text-xs bg-slate-700/50 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:border-violet-500"
          />
          {filtroData && (
            <button
              onClick={() => { setFiltroData(''); }}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Limpar
            </button>
          )}

          {/* Filtro tipo de registro */}
          <div className="flex items-center bg-slate-900 border border-slate-600 rounded-md overflow-hidden text-xs">
            <button
              onClick={() => { setFiltroTipoRegistro('todas'); setPaginaPresenca(1); }}
              className={`px-2.5 py-1.5 transition ${filtroTipoRegistro === 'todas' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Todas
            </button>
            <button
              onClick={() => { setFiltroTipoRegistro('turma'); setPaginaPresenca(1); }}
              className={`px-2.5 py-1.5 transition ${filtroTipoRegistro === 'turma' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Turma
            </button>
            <button
              onClick={() => { setFiltroTipoRegistro('individual'); setPaginaPresenca(1); }}
              className={`px-2.5 py-1.5 transition ${filtroTipoRegistro === 'individual' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Individual
            </button>
          </div>

          {filtroData && professoresDisponiveis.length > 0 && (
            <div ref={comboProfessorRef} className="relative">
              <div className="flex items-center gap-1 h-7 px-2 bg-slate-700/50 border border-slate-600 rounded-md focus-within:border-violet-500">
                <Search className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Professor..."
                  value={filtroProfessor || buscaProfessor}
                  onFocus={() => { setBuscaProfessor(filtroProfessor); setFiltroProfessor(''); setComboProfessorAberto(true); }}
                  onChange={(e) => { setBuscaProfessor(e.target.value); setComboProfessorAberto(true); }}
                  className="w-32 bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none"
                />
                {filtroProfessor && (
                  <button
                    onClick={() => { setFiltroProfessor(''); setBuscaProfessor(''); setPaginaPresenca(1); }}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {comboProfessorAberto && (
                <div className="absolute z-50 top-8 left-0 w-56 bg-slate-800 border border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700"
                    onMouseDown={() => { setFiltroProfessor(''); setBuscaProfessor(''); setPaginaPresenca(1); setComboProfessorAberto(false); }}
                  >
                    Todos os professores
                  </button>
                  {professoresDisponiveis
                    .filter(n => n.toLowerCase().includes(buscaProfessor.toLowerCase()))
                    .map(nome => (
                      <button
                        key={nome}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 truncate"
                        onMouseDown={() => { setFiltroProfessor(nome); setBuscaProfessor(''); setPaginaPresenca(1); setComboProfessorAberto(false); }}
                      >
                        {nome}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-slate-700/60 bg-slate-900/35 px-3 py-2 text-[11px] text-slate-400">
          <span>Universo: <strong className="font-medium text-slate-200">{publicacaoPresenca.denominador === null ? 'Em auditoria' : `${publicacaoPresenca.denominador} eventos confirmados`}</strong></span>
          <span>Fonte: <strong className="font-medium text-slate-200">{publicacaoPresenca.fonte}</strong></span>
          <span>Período: <strong className="font-medium text-slate-200">{publicacaoPresenca.periodo}</strong></span>
          <span>Equação: <strong className="font-medium text-slate-200">presentes / eventos confirmados</strong></span>
          <span>regra_versao: <strong className="font-medium text-slate-200">{publicacaoPresenca.regra_versao}</strong></span>
          <span>estado_publicacao: <strong className={publicacaoPresenca.estado_publicacao === 'publicado' ? 'font-medium text-emerald-300' : 'font-medium text-amber-300'}>{publicacaoPresenca.estado_publicacao}</strong></span>
        </div>

        {/* Conteúdo: filtro por data OU busca de aluno */}
        {filtroData ? (
          /* === MODO DATA: todos os alunos do dia === */
          <div>
            {loadingDia ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : presencasDoDiaFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <CalendarDays className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">
                  {presencasDoDia.length === 0
                    ? `Nenhuma aula registrada em ${format(parseISO(filtroData), "dd/MM/yyyy")}.`
                    : `Nenhuma aula do tipo "${filtroTipoRegistro}" em ${format(parseISO(filtroData), "dd/MM/yyyy")}.`
                  }
                </p>
              </div>
            ) : (
              <>
                {/* Resumo + Toggle */}
                {(() => {
                  const presentes = presencasDoDiaFiltradas.filter(p => p.status === 'presente').length;
                  const total = presencasDoDiaFiltradas.length;
                  const pct = calcularPercentualPublicavel(presentes, total, publicacaoPresenca.estado_publicacao);
                  return (
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full border bg-violet-500/20 text-violet-400 border-violet-500/30">
                          {total} registro{total !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-slate-400">
                          {presentes} presentes / {total - presentes} ausentes
                          <span className={`ml-1 font-bold ${classePercentual(pct)}`}>
                            ({formatarPercentualPublicavel(pct, total, publicacaoPresenca.estado_publicacao)})
                          </span>
                        </span>
                        <span className="text-xs text-slate-500">
                          em {format(parseISO(filtroData), "dd/MM/yyyy")}
                        </span>
                      </div>
                      {/* Toggle visualização */}
                      <div className="flex items-center bg-slate-900 border border-slate-600 rounded-md overflow-hidden">
                        <button
                          onClick={() => { setViewMode('cards'); localStorage.setItem('presenca_view_mode', 'cards'); }}
                          className={`p-1.5 transition ${viewMode === 'cards' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                          title="Visualização em cards"
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setViewMode('tabela'); localStorage.setItem('presenca_view_mode', 'tabela'); }}
                          className={`p-1.5 transition ${viewMode === 'tabela' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                          title="Visualização em tabela"
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Visualização: Cards ou Tabela */}
                {viewMode === 'cards' ? (
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {presencasDoDiaPaginadas.map((p, i) => (
                      <Tooltip
                        key={`${p.aluno_id}-${i}`}
                        side="right"
                        content={
                          <div className="space-y-1.5 max-w-[260px]">
                            {p.professor_nome && (
                              <p className="text-slate-200"><span className="text-slate-400">Professor:</span> {p.professor_nome}</p>
                            )}
                            {p.tipo && (
                              <p className="text-slate-200"><span className="text-slate-400">Tipo:</span> {p.tipo === 'turma' ? 'Turma' : p.tipo === 'individual' ? 'Individual' : p.tipo}</p>
                            )}
                            {p.duracao_minutos && (
                              <p className="text-slate-200"><span className="text-slate-400">Duração:</span> {p.duracao_minutos} min</p>
                            )}
                            {p.nr_da_aula && (
                              <p className="text-slate-200"><span className="text-slate-400">Aula nº:</span> {p.nr_da_aula}</p>
                            )}
                            {p.qtd_alunos != null && (
                              <p className="text-slate-200"><span className="text-slate-400">Alunos na turma:</span> {p.qtd_alunos}</p>
                            )}
                            {p.sala_nome && (
                              <p className="text-slate-200"><span className="text-slate-400">Sala:</span> {p.sala_nome}</p>
                            )}
                            {p.anotacoes && (
                              <div className="pt-1 border-t border-slate-600">
                                <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Anotações</p>
                                <p className="text-slate-200 whitespace-pre-wrap">{p.anotacoes}</p>
                              </div>
                            )}
                            {!p.professor_nome && !p.tipo && !p.anotacoes && (
                              <p className="text-slate-500">Sem detalhes adicionais</p>
                            )}
                          </div>
                        }
                      >
                        <div
                          className={`rounded-lg p-3.5 border cursor-default ${
                            p.status === 'presente'
                              ? 'bg-emerald-500/10 border-emerald-500/20'
                              : 'bg-red-500/10 border-red-500/20'
                          }`}
                        >
                          {/* Linha 1: Nome + Badge status */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-sm font-medium text-slate-200 truncate flex-1">{p.aluno_nome}</p>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                              p.status === 'presente'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {p.status === 'presente' ? 'Presente' : 'Ausente'}
                            </span>
                          </div>

                          {/* Linha 2: Tipo + Horário + Nº aula + Duração */}
                          <div className="flex items-center gap-1.5 mb-1">
                            {p.tipo && (
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
                                p.tipo === 'turma'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-cyan-500/20 text-cyan-400'
                              }`}>
                                {p.tipo === 'turma' ? 'T' : 'I'}
                              </span>
                            )}
                            {p.horario_aula && (
                              <span className="text-xs text-slate-400">{p.horario_aula.slice(0, 5)}</span>
                            )}
                            {p.nr_da_aula && (
                              <span className="text-xs text-slate-500">· Aula #{p.nr_da_aula}</span>
                            )}
                            {p.duracao_minutos && (
                              <span className="text-xs text-slate-500">· {p.duracao_minutos} min</span>
                            )}
                          </div>

                          {/* Linha 3: Curso */}
                          {p.curso_nome && (
                            <p className="text-xs text-blue-400 truncate mb-1">{p.curso_nome}</p>
                          )}

                          {/* Linha 4: Professor + Sala */}
                          {(p.professor_nome || p.sala_nome) && (
                            <p className="text-xs text-slate-500 truncate">
                              {p.professor_nome && `Prof.: ${p.professor_nome}`}
                              {p.professor_nome && p.sala_nome && ' · '}
                              {p.sala_nome}
                            </p>
                          )}
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                  {/* Paginação */}
                  {totalPaginasPresenca > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
                      <span className="text-xs text-slate-500">
                        Mostrando {(paginaPresenca - 1) * PRESENCA_POR_PAGINA + 1}–{Math.min(paginaPresenca * PRESENCA_POR_PAGINA, presencasDoDiaFiltradas.length)} de {presencasDoDiaFiltradas.length} registros
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 border-slate-600"
                          onClick={() => setPaginaPresenca(p => Math.max(1, p - 1))}
                          disabled={paginaPresenca === 1}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-xs text-slate-400 min-w-[80px] text-center">
                          Página {paginaPresenca} de {totalPaginasPresenca}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 border-slate-600"
                          onClick={() => setPaginaPresenca(p => Math.min(totalPaginasPresenca, p + 1))}
                          disabled={paginaPresenca === totalPaginasPresenca}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                  </>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[50px]">Tipo</th>
                          <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[60px]">Status</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Nome</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-[70px]">Horário</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Instrumento</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Turma</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-[120px]">Professor</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-[80px]">Sala</th>
                        </tr>
                      </thead>
                      <tbody>
                        {presencasDoDiaFiltradas.map((p, i) => (
                          <Tooltip
                            key={`${p.aluno_id}-${i}`}
                            side="top"
                            content={
                              <div className="space-y-1.5 max-w-[260px]">
                                {p.tipo && (
                                  <p className="text-slate-200"><span className="text-slate-400">Tipo:</span> {p.tipo === 'turma' ? 'Turma' : p.tipo === 'individual' ? 'Individual' : p.tipo}</p>
                                )}
                                {p.duracao_minutos && (
                                  <p className="text-slate-200"><span className="text-slate-400">Duração:</span> {p.duracao_minutos} min</p>
                                )}
                                {p.nr_da_aula && (
                                  <p className="text-slate-200"><span className="text-slate-400">Aula nº:</span> {p.nr_da_aula}</p>
                                )}
                                {p.qtd_alunos != null && (
                                  <p className="text-slate-200"><span className="text-slate-400">Alunos na turma:</span> {p.qtd_alunos}</p>
                                )}
                                {p.anotacoes && (
                                  <div className="pt-1 border-t border-slate-600">
                                    <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Anotações</p>
                                    <p className="text-slate-200 whitespace-pre-wrap">{p.anotacoes}</p>
                                  </div>
                                )}
                              </div>
                            }
                          >
                            <tr className={`border-b border-slate-700/50 hover:bg-slate-700/20 transition cursor-default ${
                              p.status === 'presente' ? 'bg-emerald-500/5' : 'bg-red-500/5'
                            }`}>
                              <td className="px-3 py-2 text-center">
                                {p.tipo && (
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                    p.tipo === 'turma'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : 'bg-cyan-500/20 text-cyan-400'
                                  }`}>
                                    {p.tipo === 'turma' ? 'T' : 'I'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {p.status === 'presente' ? (
                                  <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-red-400 mx-auto" />
                                )}
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-200 font-medium">{p.aluno_nome}</td>
                              <td className="px-3 py-2 text-sm text-slate-400">{p.horario_aula ? p.horario_aula.slice(0, 5) : '—'}</td>
                              <td className="px-3 py-2 text-sm text-blue-400">{p.curso_nome || '—'}</td>
                              <td className="px-3 py-2 text-sm text-slate-400">{p.turma_nome || '—'}</td>
                              <td className="px-3 py-2 text-sm text-slate-400">{p.professor_nome || '—'}</td>
                              <td className="px-3 py-2 text-sm text-slate-500">{p.sala_nome || '—'}</td>
                            </tr>
                          </Tooltip>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* === MODO NORMAL: busca de aluno + grade semanal === */
          <>
        {/* Filtro tipo aula + Busca de aluno */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center bg-slate-900 border border-slate-600 rounded-md overflow-hidden text-sm">
            <button
              onClick={() => setFiltroTipoAula('todas')}
              className={`px-3 py-2 transition ${filtroTipoAula === 'todas' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Todas as aulas
            </button>
            <button
              onClick={() => setFiltroTipoAula('experimental')}
              className={`px-3 py-2 transition ${filtroTipoAula === 'experimental' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Experimentais
            </button>
          </div>
        </div>
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={loadingAlunos ? 'Carregando alunos...' : 'Buscar aluno por nome...'}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setDropdownAberto(true);
              if (!e.target.value.trim()) {
                setAlunoSelecionado(null);
                setPresencas([]);
              }
            }}
            onFocus={() => setDropdownAberto(true)}
            className="pl-9"
            disabled={loadingAlunos}
          />
          {dropdownAberto && busca.trim() && alunosFiltrados.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {alunosFiltrados.map((a) => (
                <button
                  key={a.id}
                  onClick={() => selecionarAluno(a)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition ${
                    alunoSelecionado?.id === a.id ? 'bg-violet-500/20 text-violet-300' : 'text-slate-200'
                  }`}
                >
                  {a.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grade semanal */}
        {alunoSelecionado ? (
          <>
            {/* Navegação de semana */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-600"
                onClick={() => setSemanaInicio(subWeeks(semanaInicio, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium text-white">
                {format(diasDaSemana[0], "dd 'de' MMM", { locale: ptBR })} — {format(diasDaSemana[5], "dd 'de' MMM yyyy", { locale: ptBR })}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-600"
                onClick={() => setSemanaInicio(addWeeks(semanaInicio, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {loadingPresenca ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : (
              <>
                {/* Grid de dias */}
                <div className="grid grid-cols-6 gap-2">
                  {/* Headers */}
                  {diasDaSemana.map((dia, i) => (
                    <div key={i} className="text-center pb-2 border-b border-slate-700/50">
                      <p className="text-xs font-medium text-slate-400">{DIAS_SEMANA[i]}</p>
                      <p className="text-sm font-semibold text-white">{format(dia, 'dd/MM')}</p>
                    </div>
                  ))}

                  {/* Conteúdo dos dias */}
                  {diasDaSemana.map((dia, i) => {
                    const key = format(dia, 'yyyy-MM-dd');
                    const aulasDia = presencaPorDia.get(key) || [];
                    return (
                      <div key={i} className="min-h-[80px] space-y-1.5 pt-2">
                        {aulasDia.length === 0 ? (
                          <div className="text-center py-4">
                            <span className="text-slate-600 text-xs">—</span>
                          </div>
                        ) : (
                          aulasDia.map((aula, j) => (
                            <Tooltip
                              key={j}
                              side="right"
                              content={
                                <div className="space-y-1.5 max-w-[260px]">
                                  {aula.professor_nome && (
                                    <p className="text-slate-200"><span className="text-slate-400">Professor:</span> {aula.professor_nome}</p>
                                  )}
                                  {aula.tipo && (
                                    <p className="text-slate-200"><span className="text-slate-400">Tipo:</span> {aula.tipo === 'turma' ? 'Turma' : aula.tipo === 'individual' ? 'Individual' : aula.tipo}</p>
                                  )}
                                  {aula.duracao_minutos && (
                                    <p className="text-slate-200"><span className="text-slate-400">Duração:</span> {aula.duracao_minutos} min</p>
                                  )}
                                  {aula.nr_da_aula && (
                                    <p className="text-slate-200"><span className="text-slate-400">Aula nº:</span> {aula.nr_da_aula}</p>
                                  )}
                                  {aula.qtd_alunos != null && (
                                    <p className="text-slate-200"><span className="text-slate-400">Alunos na turma:</span> {aula.qtd_alunos}</p>
                                  )}
                                  {aula.anotacoes && (
                                    <div className="pt-1 border-t border-slate-600">
                                      <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">Anotações</p>
                                      <p className="text-slate-200 whitespace-pre-wrap">{aula.anotacoes}</p>
                                    </div>
                                  )}
                                  {!aula.professor_nome && !aula.tipo && !aula.anotacoes && (
                                    <p className="text-slate-500">Sem detalhes adicionais</p>
                                  )}
                                </div>
                              }
                            >
                              <div
                                className={`rounded-lg p-2.5 border text-xs space-y-1 cursor-default ${
                                  aula.status === 'presente'
                                    ? 'bg-emerald-500/10 border-emerald-500/30'
                                    : 'bg-red-500/10 border-red-500/30'
                                }`}
                              >
                                {/* Tipo + Horário + Status */}
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    {aula.tipo && (
                                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                        aula.tipo === 'turma'
                                          ? 'bg-blue-500/20 text-blue-400'
                                          : 'bg-cyan-500/20 text-cyan-400'
                                      }`}>
                                        {aula.tipo === 'turma' ? 'T' : 'I'}
                                      </span>
                                    )}
                                    <span className="text-slate-300 font-medium">
                                      {aula.horario_aula ? aula.horario_aula.slice(0, 5) : '—'}
                                    </span>
                                  </span>
                                  {aula.status === 'presente' ? (
                                    <span className="flex items-center gap-1 text-emerald-400">
                                      <Check className="w-3 h-3" />
                                      <span className="text-[10px] font-medium">Presente</span>
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-red-400">
                                      <X className="w-3 h-3" />
                                      <span className="text-[10px] font-medium">Ausente</span>
                                    </span>
                                  )}
                                </div>
                                {/* Curso */}
                                {aula.curso_nome && (
                                  <p className="text-blue-400 font-semibold truncate">
                                    {aula.curso_nome}
                                  </p>
                                )}
                                {/* Turma */}
                                {aula.turma_nome && (
                                  <p className="text-slate-400 truncate">
                                    {aula.turma_nome}
                                  </p>
                                )}
                                {/* Sala */}
                                {aula.sala_nome && (
                                  <p className="text-slate-500 truncate">
                                    {aula.sala_nome}
                                  </p>
                                )}
                              </div>
                            </Tooltip>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Legenda + Resumo */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" /> Presente
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" /> Ausente
                    </span>
                  </div>
                  {presencas.length > 0 && (
                    <p className="text-sm text-slate-300">
                      <span className="font-medium text-white">{resumoSemana.presentes}</span> presenças /{' '}
                      <span className="font-medium text-white">{resumoSemana.total}</span> aulas{' '}
                      <span className={`font-bold ${classePercentual(resumoSemana.pct)}`}>
                        ({formatarPercentualPublicavel(
                          resumoSemana.pct,
                          resumoSemana.total,
                          publicacaoPresenca.estado_publicacao,
                        )})
                      </span>
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Search className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Busque um aluno acima para ver a grade de presença</p>
          </div>
        )}
          </>
        )}
      </div>

      {/* === SEÇÃO 2: LOG DE SINCRONIZAÇÃO === */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-orange-400" />
          <h2 className="font-semibold text-white">Log de Sincronização Emusys</h2>
          {totalNaoEncontrados > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full border border-red-500/30">
              {totalNaoEncontrados} aluno{totalNaoEncontrados !== 1 ? 's' : ''} não vinculado{totalNaoEncontrados !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loadingLogs ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            {logs.length === 0 ? 'Nenhum log de sincronização encontrado.' : 'Nenhum log encontrado com os filtros selecionados.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-[90px]">Data</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400 w-[100px]">Unidade</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[70px]">Aulas</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[80px]">Registros</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[90px]">Vinculados</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[100px]">Experimentais</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[90px]">Inativos</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[130px]">Não Encontrados</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[80px]">Executado</th>
                  <th className="w-8 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {logsPaginados.map((log) => {
                  const expandido = logExpandido === log.id;
                  const temNaoEncontrados = (log.alunos_nao_encontrados || 0) > 0;
                  const temExperimentais = (log.experimentais_count || 0) > 0;
                  const temInativos = (log.inativos_count || 0) > 0;
                  const temDetalhes = temNaoEncontrados || temExperimentais || temInativos;
                  return (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() => temDetalhes && setLogExpandido(expandido ? null : log.id)}
                        className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition ${
                          temDetalhes ? 'cursor-pointer' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 text-sm text-slate-200">
                          {format(parseISO(log.data_sync), 'dd/MM/yy')}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-300">
                          {log.unidade_nome}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-400 text-center">
                          {log.total_aulas}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-400 text-center">
                          {log.total_registros}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-green-400 text-center font-medium">
                          {log.alunos_matched}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {temExperimentais ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full border border-amber-500/30">
                              {log.experimentais_count}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {temInativos ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs font-medium rounded-full border border-orange-500/30">
                              {log.inativos_count}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {temNaoEncontrados ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full border border-red-500/30">
                              <AlertCircle className="w-3 h-3" />
                              {log.alunos_nao_encontrados}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 text-center">
                          {log.executado_em ? format(parseISO(log.executado_em), 'HH:mm') : '—'}
                        </td>
                        <td className="px-1 py-2.5">
                          {temDetalhes && (
                            expandido
                              ? <ChevronUp className="w-4 h-4 text-slate-400" />
                              : <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </td>
                      </tr>
                      {/* Nomes expandidos */}
                      {expandido && (
                        <tr>
                          <td colSpan={10} className="px-4 pb-3 pt-1 bg-slate-800/30 space-y-3">
                            {log.nomes_experimentais && log.nomes_experimentais.length > 0 && (
                              <div>
                                <p className="text-xs text-amber-500/80 mb-2">Participantes de aula experimental (leads):</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {log.nomes_experimentais.map((nome, i) => (
                                    <span
                                      key={`exp-${i}`}
                                      className="px-2 py-1 bg-amber-500/10 text-amber-300 text-xs rounded-md border border-amber-500/20"
                                    >
                                      {nome}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {log.nomes_inativos && log.nomes_inativos.length > 0 && (
                              <div>
                                <p className="text-xs text-orange-500/80 mb-2">Alunos com matrícula inativa no sistema:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {log.nomes_inativos.map((nome, i) => (
                                    <span
                                      key={`ina-${i}`}
                                      className="px-2 py-1 bg-orange-500/10 text-orange-300 text-xs rounded-md border border-orange-500/20"
                                    >
                                      {nome}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {log.nomes_nao_encontrados && log.nomes_nao_encontrados.length > 0 && (
                              <div>
                                <p className="text-xs text-slate-500 mb-2">Alunos não encontrados no sistema:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {log.nomes_nao_encontrados.map((nome, i) => (
                                    <span
                                      key={`nf-${i}`}
                                      className="px-2 py-1 bg-red-500/10 text-red-300 text-xs rounded-md border border-red-500/20"
                                    >
                                      {nome}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Paginação */}
            <div ref={sentinelRef} className="flex items-center justify-between pt-3 mt-2 border-t border-slate-700/50">
              <p className="text-xs text-slate-400">
                {((paginaLog - 1) * LOGS_POR_PAGINA) + 1}–{Math.min(paginaLog * LOGS_POR_PAGINA, logs.length)} de {logs.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaginaLog(p => Math.max(1, p - 1))}
                  disabled={paginaLog === 1}
                  className="h-7 border-slate-700 text-xs"
                >
                  <ChevronLeft className="w-3 h-3 mr-1" />
                  Anterior
                </Button>
                <span className="text-xs text-slate-300 px-1">
                  {paginaLog} / {totalPaginasLog || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaginaLog(p => Math.min(totalPaginasLog, p + 1))}
                  disabled={paginaLog >= totalPaginasLog}
                  className="h-7 border-slate-700 text-xs"
                >
                  Próximo
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
