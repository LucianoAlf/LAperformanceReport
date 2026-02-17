import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  AlertTriangle, Heart, Search, MessageSquare,
  Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Table2, Kanban, FileQuestion
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { ModalDetalhesSucessoAluno } from './ModalDetalhesSucessoAluno';
import { JornadaAlunoKanban } from './JornadaAlunoKanban';
import { ModalEnviarFeedback } from './ModalEnviarFeedback';
import { PesquisaEvasaoTab } from './PesquisaEvasaoTab';

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
  data_matricula: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
  modalidade: string | null;
  status: string;
  fase_jornada: string;
  health_score_numerico: number | null;
  health_status: string | null;
  ultimo_feedback: string | null;
  total_acoes: number;
  metas_ativas: number;
}

interface AlertaSaude {
  tipo: 'critico' | 'atencao' | 'saudavel';
  quantidade: number;
  descricao: string;
}

interface Props {
  unidadeAtual: UnidadeId;
}

export function TabSucessoAluno({ unidadeAtual }: Props) {
  const toast = useToast();
  
  const [alunos, setAlunos] = useState<AlunoSucesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroFase, setFiltroFase] = useState<string>('todos');
  const [recalculando, setRecalculando] = useState(false);
  const [modalAluno, setModalAluno] = useState<{ open: boolean; aluno: AlunoSucesso | null }>({ open: false, aluno: null });
  const [modalFeedback, setModalFeedback] = useState(false);
  const [subAba, setSubAba] = useState<'tabela' | 'jornada' | 'pesquisa'>('tabela');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 30;

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vw_aluno_sucesso_lista')
        .select('*')
        .order('health_score_numerico', { ascending: true, nullsFirst: false });

      if (unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAlunos(data || []);
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

    // Ordenar por Health Score (menor primeiro = mais críticos)
    resultado.sort((a, b) => (a.health_score_numerico || 0) - (b.health_score_numerico || 0));

    return resultado;
  }, [alunos, filtroStatus, filtroBusca, filtroFase]);

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
          Pesquisa Evasão
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
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Aluno</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <div className="flex items-center justify-center gap-1">
                    <Heart className="w-3 h-3 text-violet-400" />
                    <span>Health</span>
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Fase</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Presença</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Pagamento</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Tempo</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">
                  <div className="flex items-center justify-center gap-1">
                    <Heart className="w-3 h-3 text-emerald-400" />
                    <span>Feedback</span>
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {alunosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
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
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradientByStatus(aluno.health_status || 'atencao')} flex items-center justify-center text-white font-bold text-sm`}>
                          {getIniciais(aluno.nome)}
                        </div>
                        <div>
                          <p className="text-white font-medium">{aluno.nome}</p>
                          <p className="text-slate-400 text-xs">{aluno.curso_nome || 'Sem curso'}</p>
                        </div>
                      </div>
                    </td>
                    {/* Health Score */}
                    <td className="text-center px-4 py-3">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border ${
                        aluno.health_status === 'saudavel' 
                          ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400' 
                          : aluno.health_status === 'atencao'
                          ? 'bg-amber-900/30 border-amber-700 text-amber-400'
                          : 'bg-rose-900/30 border-rose-700 text-rose-400'
                      }`}>
                        <span className="text-sm font-black">{aluno.health_score_numerico || 0}</span>
                      </div>
                    </td>
                    {/* Fase */}
                    <td className="text-center px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getFaseColor(aluno.fase_jornada)}`}>
                        {aluno.fase_jornada === 'onboarding' ? 'Onboarding' :
                         aluno.fase_jornada === 'consolidacao' ? 'Consolidação' :
                         aluno.fase_jornada === 'encantamento' ? 'Encantamento' : 'Renovação'}
                      </span>
                    </td>
                    {/* Presença */}
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${
                        (aluno.percentual_presenca || 0) >= 80 ? 'text-green-400' :
                        (aluno.percentual_presenca || 0) >= 60 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {aluno.percentual_presenca ? `${aluno.percentual_presenca.toFixed(0)}%` : '—'}
                      </span>
                    </td>
                    {/* Pagamento */}
                    <td className="text-center px-4 py-3">
                      <span className={`font-medium ${
                        aluno.status_pagamento === 'em_dia' ? 'text-green-400' :
                        aluno.status_pagamento === 'atrasado' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {aluno.status_pagamento === 'em_dia' ? 'Em dia' :
                         aluno.status_pagamento === 'atrasado' ? 'Atrasado' : 'Inadimplente'}
                      </span>
                    </td>
                    {/* Tempo */}
                    <td className="text-center px-4 py-3 text-white">
                      {aluno.tempo_permanencia_meses || 0}m
                    </td>
                    {/* Feedback */}
                    <td className="text-center px-4 py-3">
                      {aluno.ultimo_feedback === 'verde' ? (
                        <span className="text-lg">💚</span>
                      ) : aluno.ultimo_feedback === 'amarelo' ? (
                        <span className="text-lg">💛</span>
                      ) : aluno.ultimo_feedback === 'vermelho' ? (
                        <span className="text-lg">❤️</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="text-center px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(aluno.health_status)}`}>
                        {aluno.health_status === 'critico' ? 'Crítico' : 
                         aluno.health_status === 'atencao' ? 'Atenção' : 'Saudável'}
                      </span>
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
        <div className="p-4 border-t border-slate-700 flex items-center justify-between">
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

      {/* Conteúdo da Subaba PESQUISA EVASÃO */}
      {subAba === 'pesquisa' && (
        <PesquisaEvasaoTab unidadeAtual={unidadeAtual} />
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
