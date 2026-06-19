import React, { useState, useMemo } from 'react';
import {
  Search,
  Users,
  MoreVertical,
  Eye,
  MessageSquare,
  Send,
  Music2,
  Backpack,
  Heart,
  Star,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// =============================================================================
// TIPOS
// =============================================================================

interface AlunoJornada {
  id: string;
  nome: string;
  curso_nome: string | null;
  professor_nome: string | null;
  unidade_codigo: string | null;
  tempo_permanencia_meses: number | null;
  fase_jornada: string;
  health_score: string | null; // verde/amarelo/vermelho (feedback professor)
  status_pagamento: string | null;
  valor_parcela: number | null;
}

interface FaseJornada {
  id: string;
  nome: string;
  icone: React.ReactNode;
  cor: string;
  faixaMeses: string;
}

interface JornadaAlunoKanbanProps {
  alunos: AlunoJornada[];
  professores: { id: string; nome: string }[];
  cursos: { id: string; nome: string }[];
  onVerDetalhes?: (aluno: AlunoJornada) => void;
  onRegistrarAcao?: (aluno: AlunoJornada) => void;
  onEnviarMensagem?: (aluno: AlunoJornada) => void;
}

// =============================================================================
// FASES FIXAS DA JORNADA
// =============================================================================

const FASES_JORNADA: FaseJornada[] = [
  { id: 'onboarding', nome: 'ONBOARDING', icone: <Backpack className="w-4 h-4" />, cor: '#8B5CF6', faixaMeses: '0-3 meses' },
  { id: 'consolidacao', nome: 'CONSOLIDAÇÃO', icone: <Heart className="w-4 h-4" />, cor: '#EC4899', faixaMeses: '3-6 meses' },
  { id: 'encantamento', nome: 'ENCANTAMENTO', icone: <Star className="w-4 h-4" />, cor: '#F59E0B', faixaMeses: '6-9 meses' },
  { id: 'renovacao', nome: 'RENOVAÇÃO', icone: <RefreshCw className="w-4 h-4" />, cor: '#10B981', faixaMeses: '9+ meses' },
];

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function JornadaAlunoKanban({
  alunos,
  professores,
  cursos,
  onVerDetalhes,
  onRegistrarAcao,
  onEnviarMensagem,
}: JornadaAlunoKanbanProps) {
  const [busca, setBusca] = useState('');
  const [filtroProfessor, setFiltroProfessor] = useState<string>('todos');
  const [filtroCurso, setFiltroCurso] = useState<string>('todos');
  const [filtroPagamento, setFiltroPagamento] = useState<string>('todos');
  const [filtroFeedback, setFiltroFeedback] = useState<string>('todos');

  // Agrupar alunos por fase
  const alunosPorFase = useMemo(() => {
    const mapa = new Map<string, AlunoJornada[]>();
    FASES_JORNADA.forEach(f => mapa.set(f.id, []));

    const alunosFiltrados = alunos.filter(a => {
      // Busca por nome
      if (busca) {
        const termo = busca.toLowerCase();
        const nome = (a.nome || '').toLowerCase();
        if (!nome.includes(termo)) return false;
      }
      // Filtro professor
      if (filtroProfessor !== 'todos' && a.professor_nome !== filtroProfessor) return false;
      // Filtro curso
      if (filtroCurso !== 'todos' && a.curso_nome !== filtroCurso) return false;
      // Filtro pagamento
      if (filtroPagamento !== 'todos' && a.status_pagamento !== filtroPagamento) return false;
      // Filtro feedback
      if (filtroFeedback !== 'todos' && a.health_score !== filtroFeedback) return false;
      return true;
    });

    alunosFiltrados.forEach(a => {
      const fase = a.fase_jornada || 'onboarding';
      const lista = mapa.get(fase);
      if (lista) {
        lista.push(a);
      } else {
        // Fallback para onboarding se fase desconhecida
        mapa.get('onboarding')?.push(a);
      }
    });

    return mapa;
  }, [alunos, busca, filtroProfessor, filtroCurso, filtroPagamento, filtroFeedback]);

  // Total de alunos filtrados
  const totalFiltrado = useMemo(() => {
    let total = 0;
    alunosPorFase.forEach(lista => total += lista.length);
    return total;
  }, [alunosPorFase]);

  // Professores únicos para filtro
  const professoresUnicos = useMemo(() => {
    const set = new Set<string>();
    alunos.forEach(a => {
      if (a.professor_nome) set.add(a.professor_nome);
    });
    return Array.from(set).sort();
  }, [alunos]);

  // Cursos únicos para filtro
  const cursosUnicos = useMemo(() => {
    const set = new Set<string>();
    alunos.forEach(a => {
      if (a.curso_nome) set.add(a.curso_nome);
    });
    return Array.from(set).sort();
  }, [alunos]);

  return (
    <div className="space-y-4">
      {/* Header com título e total */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Jornada do Aluno</h2>
          <p className="text-xs text-slate-400">Visualização por fase da jornada (somente leitura)</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Busca */}
          <div className="relative w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar aluno..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 bg-slate-800/50 border-slate-700 h-9 text-sm"
            />
          </div>
          {/* Total */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/20 border border-violet-500/30 rounded-lg">
            <Users className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-bold text-violet-300">TOTAL: {totalFiltrado} ALUNOS</span>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filtroProfessor} onValueChange={setFiltroProfessor}>
          <SelectTrigger className="w-[160px] bg-slate-800/50 border-slate-700 h-9 text-sm">
            <SelectValue placeholder="Professor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Professores</SelectItem>
            {professoresUnicos.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroCurso} onValueChange={setFiltroCurso}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700 h-9 text-sm">
            <SelectValue placeholder="Curso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Cursos</SelectItem>
            {cursosUnicos.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroPagamento} onValueChange={setFiltroPagamento}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700 h-9 text-sm">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="em_dia">Em dia</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
            <SelectItem value="inadimplente">Inadimplente</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroFeedback} onValueChange={setFiltroFeedback}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700 h-9 text-sm">
            <SelectValue placeholder="Feedback" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="verde">💚 Saudável</SelectItem>
            <SelectItem value="amarelo">💛 Atenção</SelectItem>
            <SelectItem value="vermelho">❤️ Crítico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Board */}
      <div className="pb-4">
        <div className="grid grid-cols-4 gap-3">
          {FASES_JORNADA.map(fase => {
            const alunosFase = alunosPorFase.get(fase.id) || [];
            return (
              <ColunaJornada
                key={fase.id}
                fase={fase}
                alunos={alunosFase}
                onVerDetalhes={onVerDetalhes}
                onRegistrarAcao={onRegistrarAcao}
                onEnviarMensagem={onEnviarMensagem}
              />
            );
          })}
        </div>
      </div>

      {/* Resumo Estatístico */}
      <div className="grid grid-cols-4 gap-3 mt-4">
        {FASES_JORNADA.map(fase => {
          const alunosFase = alunosPorFase.get(fase.id) || [];
          const percentual = totalFiltrado > 0 ? ((alunosFase.length / totalFiltrado) * 100).toFixed(0) : '0';
          const ticketMedio = alunosFase.length > 0
            ? (alunosFase.reduce((acc, a) => acc + (a.valor_parcela || 0), 0) / alunosFase.length).toFixed(0)
            : '0';

          return (
            <div
              key={fase.id}
              className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
              style={{ borderLeftColor: fase.cor, borderLeftWidth: '3px' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{fase.icone}</span>
                <span className="text-xs font-semibold text-slate-300">{fase.nome}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-white">{alunosFase.length}</p>
                  <p className="text-[10px] text-slate-500">Alunos</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{percentual}%</p>
                  <p className="text-[10px] text-slate-500">do Total</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">R$ {ticketMedio}</p>
                  <p className="text-[10px] text-slate-500">Ticket Médio</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// COLUNA DO KANBAN
// =============================================================================

interface ColunaJornadaProps {
  fase: FaseJornada;
  alunos: AlunoJornada[];
  onVerDetalhes?: (aluno: AlunoJornada) => void;
  onRegistrarAcao?: (aluno: AlunoJornada) => void;
  onEnviarMensagem?: (aluno: AlunoJornada) => void;
}

function ColunaJornada({ fase, alunos, onVerDetalhes, onRegistrarAcao, onEnviarMensagem }: ColunaJornadaProps) {
  return (
    <div className="flex flex-col max-h-[calc(100vh-400px)]">
      {/* Header da coluna */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl border border-b-0 border-slate-700/50"
        style={{ backgroundColor: `${fase.cor}15` }}
      >
        <span className="text-base">{fase.icone}</span>
        <div className="flex-1">
          <span className="text-xs font-semibold text-white">{fase.nome}</span>
          <p className="text-[10px] text-slate-400">{fase.faixaMeses}</p>
        </div>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${fase.cor}30`, color: fase.cor }}
        >
          {alunos.length}
        </span>
      </div>

      {/* Cards */}
      <div
        className="flex-1 overflow-y-auto space-y-2 p-2 border border-t-0 border-slate-700/50 rounded-b-xl bg-slate-900/30 scrollbar-thin scrollbar-thumb-slate-700"
      >
        {alunos.length === 0 ? (
          <div className="text-center py-6 text-[10px] text-slate-600">
            Nenhum aluno
          </div>
        ) : (
          alunos.map(aluno => (
            <CardAluno
              key={aluno.id}
              aluno={aluno}
              corFase={fase.cor}
              onVerDetalhes={onVerDetalhes}
              onRegistrarAcao={onRegistrarAcao}
              onEnviarMensagem={onEnviarMensagem}
            />
          ))
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CARD DO ALUNO
// =============================================================================

interface CardAlunoProps {
  aluno: AlunoJornada;
  corFase: string;
  onVerDetalhes?: (aluno: AlunoJornada) => void;
  onRegistrarAcao?: (aluno: AlunoJornada) => void;
  onEnviarMensagem?: (aluno: AlunoJornada) => void;
}

function CardAluno({ aluno, corFase, onVerDetalhes, onRegistrarAcao, onEnviarMensagem }: CardAlunoProps) {
  const iniciais = getIniciais(aluno.nome);
  const cursoEmoji = getCursoEmoji(aluno.curso_nome || '');
  const feedbackEmoji = getFeedbackEmoji(aluno.health_score);
  const pagamentoTag = getPagamentoTag(aluno.status_pagamento);

  return (
    <div
      className={cn(
        "bg-slate-800/70 border border-slate-700/50 rounded-lg p-2.5",
        "hover:border-slate-600 hover:bg-slate-800 transition-all group"
      )}
    >
      {/* Header: Avatar + Nome + Menu */}
      <div className="flex items-start gap-2 mb-1.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: `${corFase}40` }}
        >
          {iniciais}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
            {aluno.nome || 'Sem nome'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {feedbackEmoji && <span className="text-sm">{feedbackEmoji}</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 hover:bg-slate-700 rounded transition opacity-0 group-hover:opacity-100">
                <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onVerDetalhes?.(aluno)} className="text-xs">
                <Eye className="w-3.5 h-3.5 mr-2" />
                Ver detalhes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRegistrarAcao?.(aluno)} className="text-xs">
                <MessageSquare className="w-3.5 h-3.5 mr-2" />
                Registrar ação
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEnviarMensagem?.(aluno)} className="text-xs">
                <Send className="w-3.5 h-3.5 mr-2" />
                Enviar mensagem
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Curso */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {cursoEmoji && <span className="text-xs">{cursoEmoji}</span>}
        {aluno.curso_nome && (
          <span className="text-[10px] text-slate-400 truncate">{aluno.curso_nome}</span>
        )}
      </div>

      {/* Pagamento */}
      {pagamentoTag && (
        <div className="flex items-center justify-end">
          {pagamentoTag}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function getIniciais(nome: string): string {
  if (!nome) return '?';
  return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function getCursoEmoji(cursoNome: string): string {
  const lower = cursoNome.toLowerCase();
  if (lower.includes('violão') || lower.includes('guitarra')) return '🎸';
  if (lower.includes('piano') || lower.includes('teclado')) return '🎹';
  if (lower.includes('bateria')) return '🥁';
  if (lower.includes('canto') || lower.includes('vocal')) return '🎤';
  if (lower.includes('baixo')) return '🎸';
  if (lower.includes('ukulele')) return '🎸';
  if (lower.includes('saxofone') || lower.includes('flauta')) return '🎷';
  if (lower.includes('musicalização') || lower.includes('music')) return '🎵';
  return '🎵';
}

function getFeedbackEmoji(feedback: string | null): string | null {
  switch (feedback) {
    case 'verde': return '💚';
    case 'amarelo': return '💛';
    case 'vermelho': return '❤️';
    default: return null;
  }
}

function getPagamentoTag(status: string | null): React.ReactNode {
  switch (status) {
    case 'em_dia':
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
          Em dia
        </span>
      );
    case 'atrasado':
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
          Atrasado
        </span>
      );
    case 'inadimplente':
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
          Inadimplente
        </span>
      );
    default:
      return null;
  }
}

export default JornadaAlunoKanban;
