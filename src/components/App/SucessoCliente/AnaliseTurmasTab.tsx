import { useState, useMemo, Fragment } from 'react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useAnaliseTurmas } from '@/hooks/useAnaliseTurmas';
import {
  BarChart3, Loader2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Users, BookOpen, Clock, Activity, Grid3X3, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/Tooltip';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TendenciaMes } from '@/hooks/useAnaliseTurmas';

const DIAS_SEMANA_HEATMAP = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_CURTO: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function HeatmapPresenca({ data }: { data: { dia_semana: number; faixa_horario: string; total: number; presentes: number; pct: number }[] }) {
  // Extrair horários e dias únicos
  const horarios = [...new Set(data.map(d => d.faixa_horario))].sort();
  const dias = [...new Set(data.map(d => d.dia_semana))].sort();

  // Mapa rápido para lookup
  const mapa = new Map<string, typeof data[0]>();
  for (const d of data) {
    mapa.set(`${d.dia_semana}-${d.faixa_horario}`, d);
  }

  const corCelula = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500/60';
    if (pct >= 70) return 'bg-emerald-500/30';
    if (pct >= 60) return 'bg-yellow-500/40';
    if (pct >= 40) return 'bg-orange-500/30';
    if (pct > 0) return 'bg-red-500/30';
    return 'bg-slate-700/30';
  };

  if (data.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-14"></th>
            {dias.map(d => (
              <th key={d} className="text-xs font-medium text-slate-400 text-center px-1 py-1">
                {DIAS_SEMANA_HEATMAP[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horarios.map(h => (
            <tr key={h}>
              <td className="text-xs text-slate-500 text-right pr-2 py-0.5">{h}</td>
              {dias.map(d => {
                const celula = mapa.get(`${d}-${h}`);
                if (!celula) return <td key={d} className="rounded bg-slate-800/20 min-w-[40px] h-8"></td>;
                return (
                  <Tooltip
                    key={d}
                    side="top"
                    content={
                      <div className="text-xs space-y-0.5">
                        <p className="font-medium">{DIAS_SEMANA_HEATMAP[celula.dia_semana]} {celula.faixa_horario}</p>
                        <p>{celula.presentes}/{celula.total} presentes ({celula.pct}%)</p>
                      </div>
                    }
                  >
                    <td className={`rounded ${corCelula(celula.pct)} min-w-[40px] h-8 text-center cursor-default transition hover:ring-1 hover:ring-white/20`}>
                      <span className="text-[10px] font-medium text-white/80">{celula.pct}%</span>
                    </td>
                  </Tooltip>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legenda */}
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/60" /> ≥80%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/30" /> 70-79%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/40" /> 60-69%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/30" /> 40-59%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/30" /> &lt;40%</span>
      </div>
    </div>
  );
}

interface Props {
  unidadeAtual: UnidadeId;
}

type SortKey = 'turma_nome' | 'curso_nome' | 'professor_nome' | 'horario' | 'qtd_alunos' | 'qtd_aulas' | 'presenca_pct';
type SortDir = 'asc' | 'desc';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function PresencaBar({ pct }: { pct: number }) {
  const cor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium ${
        pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'
      }`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function Tendencia({ atual, anterior }: { atual: number; anterior: number | null }) {
  if (anterior === null) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">Nova</span>;
  const delta = atual - anterior;
  if (Math.abs(delta) < 2) return <Minus className="w-3.5 h-3.5 text-slate-500" />;
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 text-emerald-400 text-xs">
      <TrendingUp className="w-3.5 h-3.5" />
      +{delta.toFixed(0)}%
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-red-400 text-xs">
      <TrendingDown className="w-3.5 h-3.5" />
      {delta.toFixed(0)}%
    </span>
  );
}

export function AnaliseTurmasTab({ unidadeAtual }: Props) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const { loading, data, refetch } = useAnaliseTurmas(unidadeAtual, ano, mes);

  const [sortKey, setSortKey] = useState<SortKey>('presenca_pct');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [turmaExpandida, setTurmaExpandida] = useState<string | null>(null);
  const [paginaTurmas, setPaginaTurmas] = useState(1);
  const [buscaTurma, setBuscaTurma] = useState('');
  const [filtroCurso, setFiltroCurso] = useState<string>('todos');
  const TURMAS_POR_PAGINA = 15;

  const irMesAnterior = () => {
    if (mes === 1) { setAno(a => a - 1); setMes(12); }
    else setMes(m => m - 1);
  };
  const irMesProximo = () => {
    if (mes === 12) { setAno(a => a + 1); setMes(1); }
    else setMes(m => m + 1);
  };

  // Cursos distintos para o filtro
  const cursosDisponiveis = useMemo(() => {
    if (!data?.turmas) return [];
    return [...new Set(data.turmas.map(t => t.curso_nome).filter(Boolean))].sort();
  }, [data?.turmas]);

  const turmasOrdenadas = useMemo(() => {
    if (!data?.turmas) return [];
    let filtradas = data.turmas;

    // Filtro por busca
    if (buscaTurma.trim()) {
      const termo = buscaTurma.toLowerCase();
      filtradas = filtradas.filter(t =>
        t.turma_nome.toLowerCase().includes(termo) ||
        t.curso_nome.toLowerCase().includes(termo) ||
        (t.professor_nome && t.professor_nome.toLowerCase().includes(termo))
      );
    }

    // Filtro por curso
    if (filtroCurso !== 'todos') {
      filtradas = filtradas.filter(t => t.curso_nome === filtroCurso);
    }

    return [...filtradas].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [data?.turmas, sortKey, sortDir]);

  const totalPaginasTurmas = Math.ceil(turmasOrdenadas.length / TURMAS_POR_PAGINA);
  const turmasPaginadas = useMemo(() => {
    const inicio = (paginaTurmas - 1) * TURMAS_POR_PAGINA;
    return turmasOrdenadas.slice(inicio, inicio + TURMAS_POR_PAGINA);
  }, [turmasOrdenadas, paginaTurmas]);

  // Reset página ao mudar filtros
  const handleBusca = (valor: string) => { setBuscaTurma(valor); setPaginaTurmas(1); };
  const handleFiltroCurso = (valor: string) => { setFiltroCurso(valor); setPaginaTurmas(1); };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPaginaTurmas(1);
  };

  const SortHeader = ({ label, colKey, className = '' }: { label: string; colKey: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2 text-xs font-medium text-slate-400 cursor-pointer hover:text-white transition select-none ${className}`}
      onClick={() => toggleSort(colKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === colKey && (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </span>
    </th>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm">Erro ao carregar dados de análise.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refetch}>Tentar novamente</Button>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="space-y-6">
      {/* Navegação de mês */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-violet-400" />
          <h2 className="font-semibold text-white">Análise de Turmas</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 border-slate-600" onClick={irMesAnterior}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-white min-w-[140px] text-center">
            {MESES[mes - 1]} {ano}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 border-slate-600" onClick={irMesProximo}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tooltip side="bottom" content={<p className="text-xs max-w-[220px]">Aulas distintas do tipo "turma" no período, excluindo canceladas</p>}>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-default">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-medium">Total de Aulas</span>
            </div>
            <p className="text-2xl font-bold text-white">{kpis.total_aulas}</p>
          </div>
        </Tooltip>
        <Tooltip side="bottom" content={<p className="text-xs max-w-[220px]">Presenças tipo "individual" / total tipo "individual", excluindo aulas canceladas</p>}>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-default">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-medium">Presença Geral</span>
            </div>
            <p className={`text-2xl font-bold ${
              kpis.presenca_geral_pct >= 80 ? 'text-emerald-400' : kpis.presenca_geral_pct >= 60 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {kpis.presenca_geral_pct}%
            </p>
          </div>
        </Tooltip>
        <Tooltip side="bottom" content={<p className="text-xs max-w-[220px]">Turmas com presença abaixo de 60% no período</p>}>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-default">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">Turmas Críticas</span>
            </div>
            <p className={`text-2xl font-bold ${kpis.turmas_criticas > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {kpis.turmas_criticas}
            </p>
          </div>
        </Tooltip>
        <Tooltip side="bottom" content={<p className="text-xs max-w-[220px]">Alunos com 3 ou mais faltas consecutivas (por sessão de aula, não dias corridos)</p>}>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-default">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium">Alunos em Risco</span>
            </div>
            <p className={`text-2xl font-bold ${kpis.alunos_risco > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {kpis.alunos_risco}
            </p>
          </div>
        </Tooltip>
      </div>

      {/* Tendência de Presença */}
      {data.tendencia && data.tendencia.length > 1 && (
        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            <h3 className="font-semibold text-white">Tendência de Presença</h3>
            <span className="text-xs text-slate-500">últimos {data.tendencia.length} meses</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.tendencia.map((t: TendenciaMes) => ({
              ...t,
              label: MESES_CURTO[t.mes.split('-')[1]] || t.mes,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#475569' }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#475569' }} tickFormatter={(v: number) => `${v}%`} />
              <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" label={{ value: '80%', fill: '#22c55e', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={60} stroke="#eab308" strokeDasharray="4 4" label={{ value: '60%', fill: '#eab308', fontSize: 10, position: 'right' }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value: number, _name: string, props: { payload: TendenciaMes }) => [
                  `${value}% (${props.payload.presentes}/${props.payload.total})`,
                  'Presença'
                ]}
              />
              <Line type="monotone" dataKey="pct" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: '#8b5cf6', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Heatmap de Presença */}
      {data.heatmap && data.heatmap.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Grid3X3 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Presença por Dia e Horário</h3>
          </div>
          <HeatmapPresenca data={data.heatmap} />
        </div>
      )}

      {/* Ranking de Turmas */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Ranking de Turmas</h3>
            <span className="text-xs text-slate-500">({turmasOrdenadas.length} turmas)</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder="Buscar turma, curso ou professor..."
              value={buscaTurma}
              onChange={(e) => handleBusca(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <select
            value={filtroCurso}
            onChange={(e) => handleFiltroCurso(e.target.value)}
            className="h-8 px-2 text-xs bg-slate-700/50 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:border-violet-500"
          >
            <option value="todos">Todos os cursos</option>
            {cursosDisponiveis.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {(buscaTurma || filtroCurso !== 'todos') && (
            <button
              onClick={() => { setBuscaTurma(''); setFiltroCurso('todos'); setPaginaTurmas(1); }}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {turmasOrdenadas.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            {buscaTurma || filtroCurso !== 'todos' ? 'Nenhuma turma encontrada com os filtros aplicados.' : 'Nenhuma turma encontrada no período.'}
          </p>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <SortHeader label="Turma" colKey="turma_nome" className="text-left" />
                  <SortHeader label="Curso" colKey="curso_nome" className="text-left" />
                  <SortHeader label="Professor" colKey="professor_nome" className="text-left" />
                  <SortHeader label="Horário" colKey="horario" className="text-left" />
                  <SortHeader label="Alunos" colKey="qtd_alunos" className="text-center" />
                  <SortHeader label="Aulas" colKey="qtd_aulas" className="text-center" />
                  <SortHeader label="% Presença" colKey="presenca_pct" className="text-left" />
                  <th className="px-3 py-2 text-xs font-medium text-slate-400 text-center">Tend.</th>
                  <th className="w-8 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {turmasPaginadas.map((turma) => {
                  const expandida = turmaExpandida === turma.turma_nome;
                  return (
                    <Fragment key={turma.turma_nome}>
                      <tr
                        onClick={() => setTurmaExpandida(expandida ? null : turma.turma_nome)}
                        className="border-b border-slate-700/50 hover:bg-slate-700/20 transition cursor-pointer"
                      >
                        <td className="px-3 py-2.5 text-sm text-white font-medium">{turma.turma_nome}</td>
                        <td className="px-3 py-2.5 text-sm text-blue-400">{turma.curso_nome}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-300">{turma.professor_nome || '—'}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-400">{turma.horario || '—'}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-300 text-center">{turma.qtd_alunos}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-400 text-center">{turma.qtd_aulas}</td>
                        <td className="px-3 py-2.5"><PresencaBar pct={turma.presenca_pct} /></td>
                        <td className="px-3 py-2.5 text-center">
                          <Tendencia atual={turma.presenca_pct} anterior={turma.presenca_anterior_pct} />
                        </td>
                        <td className="px-1 py-2.5">
                          {expandida ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </td>
                      </tr>
                      {expandida && (
                        <tr>
                          <td colSpan={9} className="px-4 pb-3 pt-1 bg-slate-800/30">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-700/50">
                                  <th className="text-left px-3 py-1.5 text-xs text-slate-500">Aluno</th>
                                  <th className="text-center px-3 py-1.5 text-xs text-slate-500">Presenças</th>
                                  <th className="text-center px-3 py-1.5 text-xs text-slate-500">Faltas</th>
                                  <th className="text-left px-3 py-1.5 text-xs text-slate-500">%</th>
                                  <th className="text-left px-3 py-1.5 text-xs text-slate-500">Última presença</th>
                                </tr>
                              </thead>
                              <tbody>
                                {turma.alunos.map((aluno) => (
                                  <tr key={aluno.nome} className="border-b border-slate-700/30">
                                    <td className="px-3 py-1.5 text-sm text-slate-200">{aluno.nome}</td>
                                    <td className="px-3 py-1.5 text-sm text-emerald-400 text-center">{aluno.presentes}</td>
                                    <td className="px-3 py-1.5 text-sm text-red-400 text-center">{aluno.total - aluno.presentes}</td>
                                    <td className="px-3 py-1.5"><PresencaBar pct={aluno.pct} /></td>
                                    <td className="px-3 py-1.5 text-sm text-slate-500">{aluno.ultima_presenca || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginasTurmas > 1 && (
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-700/50">
              <p className="text-xs text-slate-400">
                {((paginaTurmas - 1) * TURMAS_POR_PAGINA) + 1}–{Math.min(paginaTurmas * TURMAS_POR_PAGINA, turmasOrdenadas.length)} de {turmasOrdenadas.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaginaTurmas(p => Math.max(1, p - 1))}
                  disabled={paginaTurmas === 1}
                  className="h-7 border-slate-700 text-xs"
                >
                  <ChevronLeft className="w-3 h-3 mr-1" />
                  Anterior
                </Button>
                <span className="text-xs text-slate-300 px-1">
                  {paginaTurmas} / {totalPaginasTurmas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaginaTurmas(p => Math.min(totalPaginasTurmas, p + 1))}
                  disabled={paginaTurmas >= totalPaginasTurmas}
                  className="h-7 border-slate-700 text-xs"
                >
                  Próximo
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Alunos em Risco */}
      {data.alunos_risco.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-5 border border-red-500/20">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="font-semibold text-white">Alunos em Risco</h3>
            <span className="text-xs text-red-400/70">3+ faltas consecutivas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Aluno</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Turma</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Curso</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-400">Faltas seguidas</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-400">Última presença</th>
                </tr>
              </thead>
              <tbody>
                {data.alunos_risco.map((aluno, i) => (
                  <tr key={`${aluno.nome}-${i}`} className="border-b border-slate-700/50 hover:bg-red-500/5 transition">
                    <td className="px-3 py-2 text-sm text-slate-200 font-medium">{aluno.nome}</td>
                    <td className="px-3 py-2 text-sm text-slate-400">{aluno.turma_nome}</td>
                    <td className="px-3 py-2 text-sm text-blue-400">{aluno.curso_nome}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded-full">
                        {aluno.faltas_seguidas}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-500">{aluno.ultima_presenca || 'Nunca'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
