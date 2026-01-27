import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, UserPlus, AlertTriangle, Loader2, Users, Clock, MapPin, CheckCircle2, BookOpen, CalendarClock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Aluno, Turma } from './AlunosPage';
import { ModalConfirmarAcao } from './ModalConfirmarAcao';
import type { useToast } from '@/hooks/useToast';

interface ModalAdicionarAlunoTurmaProps {
  turma: Turma;
  alunosDisponiveis: Aluno[];
  turmasExistentes: Turma[];
  onClose: () => void;
  onSalvar: () => void;
  toast: ReturnType<typeof useToast>;
}

interface ConflitosAluno {
  tipo: 'horario' | 'mesmo_curso' | 'professor';
  mensagem: string;
  severidade: 'erro' | 'aviso';
}

// Tipos de indicadores visuais para os alunos
type IndicadorAluno = {
  tipo: 'mesmo_curso' | 'horario_proximo' | 'conflito_horario' | 'mesmo_curso_outro_prof';
  label: string;
  cor: 'emerald' | 'cyan' | 'amber' | 'red';
  prioridade: number; // menor = mais importante
};

export function ModalAdicionarAlunoTurma({
  turma,
  alunosDisponiveis,
  turmasExistentes,
  onClose,
  onSalvar,
  toast
}: ModalAdicionarAlunoTurmaProps) {
  const [busca, setBusca] = useState('');
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null);
  const [conflitos, setConflitos] = useState<ConflitosAluno[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  
  // Filtros toggle
  const [filtroMesmoProfessor, setFiltroMesmoProfessor] = useState(false);
  const [filtroHorarioProximo, setFiltroHorarioProximo] = useState(false);
  const [filtroIdadeProxima, setFiltroIdadeProxima] = useState(false);

  // Função para verificar se horário é próximo (1h de diferença)
  const isHorarioProximo = useCallback((horario1: string, horario2: string): boolean => {
    if (!horario1 || !horario2) return false;
    const h1 = parseInt(horario1.split(':')[0]);
    const h2 = parseInt(horario2.split(':')[0]);
    return Math.abs(h1 - h2) <= 1;
  }, []);

  // Calcular indicadores para cada aluno
  const calcularIndicadores = useCallback((aluno: Aluno): IndicadorAluno[] => {
    const indicadores: IndicadorAluno[] = [];

    // 1. Mesmo curso da turma (prioridade máxima - verde)
    // Verificar se AMBOS os curso_id existem e são iguais
    if (aluno.curso_id && turma.curso_id && aluno.curso_id === turma.curso_id) {
      indicadores.push({
        tipo: 'mesmo_curso',
        label: 'Mesmo curso',
        cor: 'emerald',
        prioridade: 1
      });
    }

    // 2. Horário próximo no mesmo dia (ciano)
    const turmaDoAluno = turmasExistentes.find(t => 
      t.ids_alunos?.includes(aluno.id) &&
      t.dia_semana === turma.dia_semana
    );
    if (turmaDoAluno && isHorarioProximo(turmaDoAluno.horario_inicio, turma.horario_inicio)) {
      indicadores.push({
        tipo: 'horario_proximo',
        label: `Aula ${turmaDoAluno.horario_inicio?.substring(0, 5)} no mesmo dia`,
        cor: 'cyan',
        prioridade: 2
      });
    }

    // 3. Conflito de horário exato (amarelo/aviso)
    const conflitoHorario = turmasExistentes.find(t => 
      t.ids_alunos?.includes(aluno.id) &&
      t.dia_semana === turma.dia_semana &&
      t.horario_inicio === turma.horario_inicio
    );
    if (conflitoHorario) {
      indicadores.push({
        tipo: 'conflito_horario',
        label: 'Já tem aula neste horário',
        cor: 'amber',
        prioridade: 3
      });
    }

    // 4. Já faz o mesmo curso com outro professor (vermelho)
    // Verificar que curso_id existe em ambos antes de comparar
    const mesmoCursoOutroProf = turmasExistentes.find(t =>
      t.ids_alunos?.includes(aluno.id) &&
      t.curso_id && turma.curso_id &&
      t.curso_id === turma.curso_id &&
      t.professor_id !== turma.professor_id
    );
    if (mesmoCursoOutroProf) {
      indicadores.push({
        tipo: 'mesmo_curso_outro_prof',
        label: `Faz ${turma.curso_nome || 'curso'} com ${mesmoCursoOutroProf.professor_nome}`,
        cor: 'red',
        prioridade: 4
      });
    }

    return indicadores.sort((a, b) => a.prioridade - b.prioridade);
  }, [turma, turmasExistentes, isHorarioProximo]);

  // Calcular idade média da turma para filtro de idade próxima
  const idadeMediaTurma = useMemo(() => {
    const alunosDaTurma = alunosDisponiveis.filter(a => turma.ids_alunos?.includes(a.id));
    
    console.log('🔍 Debug idade média:', {
      totalAlunosTurma: alunosDaTurma.length,
      idades: alunosDaTurma.map(a => ({ nome: a.nome, idade: a.idade_atual })),
      turmaIds: turma.ids_alunos
    });
    
    if (alunosDaTurma.length === 0) return null;
    
    // Filtrar apenas alunos com idade válida
    const alunosComIdade = alunosDaTurma.filter(a => a.idade_atual && a.idade_atual > 0);
    if (alunosComIdade.length === 0) return null;
    
    const somaIdades = alunosComIdade.reduce((sum, a) => sum + (a.idade_atual || 0), 0);
    const media = Math.round(somaIdades / alunosComIdade.length);
    
    console.log('📊 Idade média calculada:', media);
    
    return media;
  }, [alunosDisponiveis, turma.ids_alunos]);

  // Função para verificar se aluno está na faixa etária próxima
  const isIdadeProxima = useCallback((aluno: Aluno): boolean => {
    if (!idadeMediaTurma || !aluno.idade_atual) return false;
    
    // Determinar faixa etária baseada na classificação do aluno
    const faixaEtaria = aluno.classificacao === 'LAMK' ? 3 : 5; // ±3 anos para LAMK, ±5 para EMLA
    
    const diferencaIdade = Math.abs(aluno.idade_atual - idadeMediaTurma);
    return diferencaIdade <= faixaEtaria;
  }, [idadeMediaTurma]);

  // Filtrar e ordenar alunos (mesmo curso primeiro)
  const alunosFiltrados = useMemo(() => {
    const idsNaTurma = turma.ids_alunos || [];
    
    const alunosFiltradosBase = alunosDisponiveis
      .filter(aluno => {
        // Excluir alunos já na turma
        if (idsNaTurma.includes(aluno.id)) return false;
        
        // Filtrar por busca
        if (busca) {
          const termoBusca = busca.toLowerCase();
          if (!aluno.nome.toLowerCase().includes(termoBusca)) return false;
        }
        
        // Aplicar filtros toggle
        const mesmoProfessor = turmasExistentes.some(t => 
          t.ids_alunos?.includes(aluno.id) &&
          t.professor_id === turma.professor_id
        );
        const horarioProximo = turmasExistentes.some(t => 
          t.ids_alunos?.includes(aluno.id) &&
          t.dia_semana === turma.dia_semana &&
          isHorarioProximo(t.horario_inicio, turma.horario_inicio)
        );
        const idadeProxima = isIdadeProxima(aluno);
        
        if (filtroMesmoProfessor && !mesmoProfessor) return false;
        if (filtroHorarioProximo && !horarioProximo) return false;
        if (filtroIdadeProxima && !idadeProxima) return false;
        
        return true;
      });

    // Ordenar: mesmo curso primeiro, depois horário próximo, depois alfabético
    return alunosFiltradosBase
      .map(aluno => ({
        aluno,
        indicadores: calcularIndicadores(aluno),
        mesmoCurso: !!(aluno.curso_id && turma.curso_id && aluno.curso_id === turma.curso_id),
        horarioProximo: turmasExistentes.some(t => 
          t.ids_alunos?.includes(aluno.id) &&
          t.dia_semana === turma.dia_semana &&
          isHorarioProximo(t.horario_inicio, turma.horario_inicio)
        )
      }))
      .sort((a, b) => {
        // Prioridade 1: Mesmo curso
        if (a.mesmoCurso && !b.mesmoCurso) return -1;
        if (!a.mesmoCurso && b.mesmoCurso) return 1;
        // Prioridade 2: Horário próximo
        if (a.horarioProximo && !b.horarioProximo) return -1;
        if (!a.horarioProximo && b.horarioProximo) return 1;
        // Prioridade 3: Alfabético
        return a.aluno.nome.localeCompare(b.aluno.nome);
      })
      .slice(0, 25) // Limitar a 25 resultados
      .map(item => item.aluno);
  }, [alunosDisponiveis, turma.ids_alunos, turma.curso_id, turma.dia_semana, turma.professor_id, busca, calcularIndicadores, turmasExistentes, isHorarioProximo, isIdadeProxima, filtroMesmoProfessor, filtroHorarioProximo, filtroIdadeProxima]);

  // Detectar conflitos quando um aluno é selecionado
  const detectarConflitos = useCallback((aluno: Aluno): ConflitosAluno[] => {
    const conflitosDetectados: ConflitosAluno[] = [];

    // Verificar se o aluno já tem aula no mesmo horário
    const turmaAtualDoAluno = turmasExistentes.find(t => 
      t.ids_alunos?.includes(aluno.id) &&
      t.dia_semana === turma.dia_semana &&
      t.horario_inicio === turma.horario_inicio
    );

    if (turmaAtualDoAluno) {
      conflitosDetectados.push({
        tipo: 'horario',
        mensagem: `${aluno.nome} já tem aula ${turmaAtualDoAluno.dia_semana} às ${turmaAtualDoAluno.horario_inicio} com ${turmaAtualDoAluno.professor_nome}\nO aluno será movido para esta turma e removido da turma anterior.`,
        severidade: 'aviso'
      });
    }

    // Verificar se o aluno já faz o mesmo curso (mesmo com o mesmo professor ou outro)
    const mesmoCurso = turmasExistentes.find(t =>
      t.ids_alunos?.includes(aluno.id) &&
      t.curso_id === turma.curso_id &&
      !(t.dia_semana === turma.dia_semana && t.horario_inicio === turma.horario_inicio)
    );

    if (mesmoCurso) {
      const mesmoProfessor = mesmoCurso.professor_id === turma.professor_id;
      conflitosDetectados.push({
        tipo: 'mesmo_curso',
        mensagem: `${aluno.nome} já faz ${turma.curso_nome || 'este curso'} ${mesmoCurso.dia_semana} às ${mesmoCurso.horario_inicio} com ${mesmoCurso.professor_nome}\n⚠️ O aluno será REMOVIDO da turma anterior e MOVIDO para esta turma.`,
        severidade: 'aviso'
      });
    }

    return conflitosDetectados;
  }, [turmasExistentes, turma]);

  // Atualizar conflitos quando aluno é selecionado
  useEffect(() => {
    if (alunoSelecionado) {
      const conflitosDetectados = detectarConflitos(alunoSelecionado);
      setConflitos(conflitosDetectados);
    } else {
      setConflitos([]);
    }
  }, [alunoSelecionado, detectarConflitos]);

  // Abrir modal de confirmação
  function handleSolicitarAdicao() {
    if (!alunoSelecionado) return;
    setMostrarConfirmacao(true);
  }

  // Adicionar aluno à turma (após confirmação)
  async function handleAdicionarAluno() {
    if (!alunoSelecionado) return;

    setMostrarConfirmacao(false);
    setSalvando(true);

    try {
      // Verificar se o aluno já está em alguma turma do mesmo curso
      const turmaAnteriorMesmoCurso = turmasExistentes.find(t =>
        t.ids_alunos?.includes(alunoSelecionado.id) &&
        t.curso_id === turma.curso_id &&
        !(t.dia_semana === turma.dia_semana && t.horario_inicio === turma.horario_inicio)
      );

      // Verificar se o aluno tem conflito de horário exato
      const turmaAnteriorMesmoHorario = turmasExistentes.find(t =>
        t.ids_alunos?.includes(alunoSelecionado.id) &&
        t.dia_semana === turma.dia_semana &&
        t.horario_inicio === turma.horario_inicio
      );

      // Remover da turma anterior (mesmo curso OU mesmo horário)
      const turmaParaRemover = turmaAnteriorMesmoCurso || turmaAnteriorMesmoHorario;
      
      if (turmaParaRemover && turmaParaRemover.turma_explicita_id) {
        await supabase
          .from('turmas_alunos')
          .delete()
          .eq('turma_id', turmaParaRemover.turma_explicita_id)
          .eq('aluno_id', alunoSelecionado.id);
      }

      // Atualizar o aluno com o novo horário/professor/curso
      const { error: errorAluno } = await supabase
        .from('alunos')
        .update({
          professor_atual_id: turma.professor_id,
          curso_id: turma.curso_id,
          dia_aula: turma.dia_semana,
          horario_aula: turma.horario_inicio
        })
        .eq('id', alunoSelecionado.id);

      if (errorAluno) {
        throw errorAluno;
      }

      // Se a turma é explícita, adicionar na tabela turmas_alunos
      if (turma.turma_explicita_id) {
        const { error: errorTurmaAluno } = await supabase
          .from('turmas_alunos')
          .insert({
            turma_id: turma.turma_explicita_id,
            aluno_id: alunoSelecionado.id
          });

        if (errorTurmaAluno) {
          throw errorTurmaAluno;
        }

        // Registrar no histórico
        await supabase
          .from('turmas_historico')
          .insert({
            turma_id: turma.turma_explicita_id,
            aluno_id: alunoSelecionado.id,
            acao: turmaParaRemover ? 'mover' : 'adicionar',
            turma_origem_id: turmaParaRemover?.turma_explicita_id || null,
            turma_destino_id: turma.turma_explicita_id,
            metadata: {
              conflitos: conflitos.map(c => c.mensagem),
              turma_info: `${turma.dia_semana} ${turma.horario_inicio}`,
              aluno_nome: alunoSelecionado.nome
            }
          });
      }

      setSucesso(true);
      toast.success(
        'Aluno adicionado com sucesso!',
        `${alunoSelecionado.nome} foi adicionado à turma.`
      );
      
      // Aguardar um pouco e fechar
      setTimeout(() => {
        onSalvar();
        onClose();
      }, 1500);

    } catch (error) {
      console.error('Erro ao adicionar aluno:', error);
      toast.error(
        'Erro ao adicionar aluno',
        'Não foi possível adicionar o aluno à turma. Tente novamente.'
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Adicionar Aluno à Turma</h2>
                <p className="text-sm text-slate-400">
                  {turma.dia_semana} {turma.horario_inicio} • {turma.professor_nome}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Informações da Turma */}
        <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-700">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Clock className="w-4 h-4" />
              <span>{turma.dia_semana} às {turma.horario_inicio}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <MapPin className="w-4 h-4" />
              <span>{turma.sala_nome || 'Sala'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Users className="w-4 h-4" />
              <span>{turma.total_alunos}/{turma.capacidade_maxima} alunos</span>
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6">
          {sucesso ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Aluno Adicionado!</h3>
              <p className="text-slate-400 text-center">
                {alunoSelecionado?.nome} foi adicionado à turma com sucesso.
              </p>
            </div>
          ) : (
            <>
              {/* Busca */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Buscar aluno por nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-600"
                />
              </div>

              {/* Filtros toggle - botões compactos */}
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setFiltroMesmoProfessor(!filtroMesmoProfessor)}
                  className={`
                    px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5
                    ${filtroMesmoProfessor 
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500' 
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-purple-500/50'
                    }
                  `}
                >
                  <Users className="w-3 h-3" />
                  Mesmo professor
                </button>
                <button
                  onClick={() => setFiltroHorarioProximo(!filtroHorarioProximo)}
                  className={`
                    px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5
                    ${filtroHorarioProximo 
                      ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500' 
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-cyan-500/50'
                    }
                  `}
                >
                  <CalendarClock className="w-3 h-3" />
                  Horário próximo
                </button>
                {idadeMediaTurma && (
                  <button
                    onClick={() => setFiltroIdadeProxima(!filtroIdadeProxima)}
                    className={`
                      px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5
                      ${filtroIdadeProxima 
                        ? 'bg-violet-500/30 text-violet-300 border border-violet-500' 
                        : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-violet-500/50'
                      }
                    `}
                  >
                    <Users className="w-3 h-3" />
                    Idade próxima ({idadeMediaTurma}±{idadeMediaTurma < 12 ? 3 : 5})
                  </button>
                )}
              </div>
              
              {/* Legenda de conflitos */}
              <div className="mb-3 flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                <span>Conflito</span>
              </div>

              {/* Lista de Alunos */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {alunosFiltrados.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">
                    {busca ? 'Nenhum aluno encontrado' : 'Digite para buscar alunos'}
                  </p>
                ) : (
                  alunosFiltrados.map((aluno) => {
                    const isSelected = alunoSelecionado?.id === aluno.id;
                    const indicadores = calcularIndicadores(aluno);
                    const temMesmoCurso = indicadores.some(i => i.tipo === 'mesmo_curso');
                    const temHorarioProximo = indicadores.some(i => i.tipo === 'horario_proximo');
                    const temConflito = indicadores.some(i => i.tipo === 'conflito_horario' || i.tipo === 'mesmo_curso_outro_prof');
                    const temIdadeProxima = isIdadeProxima(aluno);

                    // Determinar cor de fundo baseada nos indicadores
                    const getBgClass = () => {
                      if (isSelected) return 'bg-purple-500/20 border-purple-500';
                      if (temMesmoCurso && temIdadeProxima) return 'bg-violet-500/15 border-violet-500/40 hover:border-violet-500/60';
                      if (temMesmoCurso) return 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50';
                      if (temIdadeProxima) return 'bg-violet-500/10 border-violet-500/30 hover:border-violet-500/50';
                      if (temHorarioProximo) return 'bg-cyan-500/10 border-cyan-500/30 hover:border-cyan-500/50';
                      if (temConflito) return 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50';
                      return 'bg-slate-700/50 border-slate-600 hover:border-purple-500/50';
                    };

                    return (
                      <div
                        key={aluno.id}
                        onClick={() => setAlunoSelecionado(aluno)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${getBgClass()}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`
                            w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-sm font-bold
                            ${isSelected ? 'bg-purple-500' : temMesmoCurso ? 'bg-emerald-500' : temIdadeProxima ? 'bg-violet-500' : 'bg-slate-600'}
                          `}>
                            {aluno.nome.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-white truncate">{aluno.nome}</p>
                              {/* Badge de idade */}
                              {aluno.idade_atual && (
                                <span className={`
                                  px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap
                                  ${temIdadeProxima ? 'bg-violet-500/30 text-violet-300' : 'bg-slate-600/50 text-slate-400'}
                                `}>
                                  {aluno.idade_atual} anos
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {aluno.curso_nome || 'Sem curso'} • {aluno.professor_nome || 'Sem professor'}
                            </p>
                          </div>
                          
                          {/* Badges de indicadores */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {indicadores.slice(0, 2).map((ind, idx) => (
                              <span
                                key={idx}
                                className={`
                                  px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap
                                  ${ind.cor === 'emerald' ? 'bg-emerald-500/20 text-emerald-300' : ''}
                                  ${ind.cor === 'cyan' ? 'bg-cyan-500/20 text-cyan-300' : ''}
                                  ${ind.cor === 'amber' ? 'bg-amber-500/20 text-amber-300' : ''}
                                  ${ind.cor === 'red' ? 'bg-red-500/20 text-red-300' : ''}
                                `}
                                title={ind.label}
                              >
                                {ind.tipo === 'mesmo_curso' && 'Mesmo curso'}
                                {ind.tipo === 'horario_proximo' && 'Horário próx.'}
                                {ind.tipo === 'conflito_horario' && 'Conflito'}
                                {ind.tipo === 'mesmo_curso_outro_prof' && 'Outro prof.'}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Alertas de Conflitos */}
              {alunoSelecionado && conflitos.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Atenção
                  </h4>
                  {conflitos.map((conflito, index) => (
                    <div
                      key={index}
                      className={`
                        p-3 rounded-lg text-sm
                        ${conflito.severidade === 'erro' 
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }
                      `}
                    >
                      {conflito.mensagem}
                      {conflito.tipo === 'horario' && (
                        <p className="text-xs mt-1 opacity-75">
                          O aluno será movido para esta turma e removido da turma anterior.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!sucesso && (
          <div className="p-6 border-t border-slate-700 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSolicitarAdicao}
              disabled={!alunoSelecionado || salvando}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Adicionar à Turma
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Modal de Confirmação */}
      {mostrarConfirmacao && alunoSelecionado && (
        <ModalConfirmarAcao
          tipo="adicionar"
          aluno={alunoSelecionado}
          turmaDestino={turma}
          conflitos={conflitos.map(c => c.mensagem)}
          onConfirmar={handleAdicionarAluno}
          onCancelar={() => setMostrarConfirmacao(false)}
        />
      )}
    </div>
  );
}

export default ModalAdicionarAlunoTurma;
