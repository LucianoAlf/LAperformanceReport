import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { format, parseISO, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  CalendarDays, Search, Loader2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Check, X, AlertCircle, Users
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
  executado_em: string;
}

interface Props {
  unidadeAtual: UnidadeId;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const LOGS_POR_PAGINA = 10;

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

  // === Estado dos Logs ===
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logExpandido, setLogExpandido] = useState<string | null>(null);
  const [paginaLog, setPaginaLog] = useState(1);

  // Dias da semana (Seg a Sáb)
  const diasDaSemana = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => addDays(semanaInicio, i));
  }, [semanaInicio]);

  // Buscar alunos
  useEffect(() => {
    const fetchAlunos = async () => {
      setLoadingAlunos(true);
      let query = supabase
        .from('alunos')
        .select('id, nome, unidade_id')
        .in('status', ['ativo', 'aviso_previo'])
        .order('nome');

      if (unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data } = await query;
      setAlunos(data || []);
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
        .select('id, data_sync, unidade_nome, total_aulas, total_registros, alunos_matched, alunos_nao_encontrados, nomes_nao_encontrados, executado_em')
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

  // Buscar presença da semana
  const carregarPresencaSemana = useCallback(async () => {
    if (!alunoSelecionado) return;
    setLoadingPresenca(true);

    const inicio = format(semanaInicio, 'yyyy-MM-dd');
    const fim = format(addDays(semanaInicio, 5), 'yyyy-MM-dd');

    const { data } = await supabase
      .from('aluno_presenca')
      .select('data_aula, status, horario_aula, curso_nome, turma_nome, sala_nome, aulas_emusys(professor_nome, anotacoes, duracao_minutos, tipo, nr_da_aula, qtd_alunos)')
      .eq('aluno_id', alunoSelecionado.id)
      .gte('data_aula', inicio)
      .lte('data_aula', fim)
      .in('status', ['presente', 'ausente'])
      .order('data_aula')
      .order('horario_aula');

    // Flatten join data
    setPresencas(
      (data || []).map((p: any) => ({
        data_aula: p.data_aula,
        status: p.status,
        horario_aula: p.horario_aula,
        curso_nome: p.curso_nome,
        turma_nome: p.turma_nome,
        sala_nome: p.sala_nome,
        professor_nome: p.aulas_emusys?.professor_nome || null,
        anotacoes: p.aulas_emusys?.anotacoes || null,
        duracao_minutos: p.aulas_emusys?.duracao_minutos || null,
        tipo: p.aulas_emusys?.tipo || null,
        nr_da_aula: p.aulas_emusys?.nr_da_aula || null,
        qtd_alunos: p.aulas_emusys?.qtd_alunos || null,
      }))
    );
    setLoadingPresenca(false);
  }, [alunoSelecionado, semanaInicio]);

  useEffect(() => {
    carregarPresencaSemana();
  }, [carregarPresencaSemana]);

  // Agrupar presença por dia
  const presencaPorDia = useMemo(() => {
    const mapa = new Map<string, PresencaAula[]>();
    for (const p of presencas) {
      const key = p.data_aula;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key)!.push(p);
    }
    return mapa;
  }, [presencas]);

  // Resumo da semana
  const resumoSemana = useMemo(() => {
    const total = presencas.length;
    const pres = presencas.filter(p => p.status === 'presente').length;
    const pct = total > 0 ? Math.round((pres / total) * 100) : 0;
    return { total, presentes: pres, pct };
  }, [presencas]);

  // Filtrar alunos para busca
  const alunosFiltrados = useMemo(() => {
    if (!busca.trim()) return alunos.slice(0, 50);
    const termo = busca.toLowerCase();
    return alunos.filter(a => a.nome.toLowerCase().includes(termo)).slice(0, 50);
  }, [alunos, busca]);

  const selecionarAluno = (aluno: AlunoSimples) => {
    setAlunoSelecionado(aluno);
    setBusca(aluno.nome);
    setDropdownAberto(false);
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

  return (
    <div className="space-y-6">
      {/* === SEÇÃO 1: GRADE SEMANAL DE PRESENÇA === */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold text-white">Grade de Presença</h2>
        </div>

        {/* Busca de aluno */}
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
                                {/* Horário + Status */}
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-300 font-medium">
                                    {aula.horario_aula ? aula.horario_aula.slice(0, 5) : '—'}
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
                      <span className={`font-bold ${
                        resumoSemana.pct >= 80 ? 'text-green-400' :
                        resumoSemana.pct >= 60 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        ({resumoSemana.pct}%)
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
          <p className="text-sm text-slate-500 text-center py-8">Nenhum log de sincronização encontrado.</p>
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
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[130px]">Não Encontrados</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400 w-[80px]">Executado</th>
                  <th className="w-8 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {logsPaginados.map((log) => {
                  const expandido = logExpandido === log.id;
                  const temNaoEncontrados = (log.alunos_nao_encontrados || 0) > 0;
                  return (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() => temNaoEncontrados && setLogExpandido(expandido ? null : log.id)}
                        className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition ${
                          temNaoEncontrados ? 'cursor-pointer' : ''
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
                          {temNaoEncontrados && (
                            expandido
                              ? <ChevronUp className="w-4 h-4 text-slate-400" />
                              : <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </td>
                      </tr>
                      {/* Nomes expandidos */}
                      {expandido && log.nomes_nao_encontrados && (
                        <tr>
                          <td colSpan={8} className="px-4 pb-3 pt-1 bg-slate-800/30">
                            <p className="text-xs text-slate-500 mb-2">Alunos não encontrados no sistema:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {log.nomes_nao_encontrados.map((nome, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-red-500/10 text-red-300 text-xs rounded-md border border-red-500/20"
                                >
                                  {nome}
                                </span>
                              ))}
                            </div>
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
