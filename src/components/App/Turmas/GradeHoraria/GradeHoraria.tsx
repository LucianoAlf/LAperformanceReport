import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Filter, Users, Clock, Building2, ChevronLeft, ChevronRight, Move } from 'lucide-react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  DIAS_SEMANA, 
  DIAS_SEMANA_CURTO, 
  gerarHorariosDisponiveis,
  gerarCorPorId,
  calcularHorarioFim
} from '@/lib/horarios';
import { detectarConflitos } from '@/lib/conflitos';
import { gerarSugestoes, type Sugestao } from '@/lib/sugestoes-horarios';
import { TurmaGrade, FiltrosGrade } from './types';
import { CelulaTurma } from './CelulaTurma';
import { ModalDetalhesTurma } from './ModalDetalhesTurma';
import { SlotHorario } from './SlotHorario';
import { DragOverlay as TurmaDragOverlay } from './DragOverlay';
import { ModalConfirmarMovimento, type MovimentoTurma } from './ModalConfirmarMovimento';

interface Unidade {
  id: string;
  nome: string;
}

interface Sala {
  id: number;
  nome: string;
  unidade_id: string;
}

interface Professor {
  id: number;
  nome: string;
}

interface GradeHorariaProps {
  unidadeId?: string;
  salaIdInicial?: number;
  professorIdInicial?: number;
  onTurmaClick?: (turma: TurmaGrade) => void;
  onEditarTurma?: (turma: TurmaGrade) => void;
  onExcluirTurma?: (turmaId: number) => void;
}

export function GradeHoraria({ 
  unidadeId: unidadeIdProp, 
  salaIdInicial,
  professorIdInicial,
  onTurmaClick,
  onEditarTurma,
  onExcluirTurma
}: GradeHorariaProps) {
  const { isAdmin } = useAuth();
  
  // Estados
  const [loading, setLoading] = useState(true);
  const [turmas, setTurmas] = useState<TurmaGrade[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState<TurmaGrade | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  
  // Estados Drag & Drop
  const [dragEnabled, setDragEnabled] = useState(false);
  const [turmaArrastando, setTurmaArrastando] = useState<TurmaGrade | null>(null);
  const [movimentoPendente, setMovimentoPendente] = useState<MovimentoTurma | null>(null);
  const [conflitosMovimento, setConflitosMovimento] = useState<any[]>([]);
  const [sugestoesMovimento, setSugestoesMovimento] = useState<Sugestao[]>([]);
  const [salvandoMovimento, setSalvandoMovimento] = useState(false);
  
  // Filtros
  const [filtros, setFiltros] = useState<FiltrosGrade>({
    unidadeId: unidadeIdProp || 'todos',
    salaId: salaIdInicial,
    professorId: professorIdInicial,
  });

  // Horários do eixo Y
  const horarios = useMemo(() => gerarHorariosDisponiveis('08:00', '21:00', 60), []);

  // Dias da semana (excluindo domingo por padrão)
  const diasSemana = useMemo(() => DIAS_SEMANA.filter(d => d !== 'Domingo'), []);

  // Carregar dados
  useEffect(() => {
    carregarDados();
  }, [filtros.unidadeId]);

  async function carregarDados() {
    setLoading(true);
    try {
      // Carregar unidades
      const { data: unidadesData } = await supabase
        .from('unidades')
        .select('id, nome')
        .order('nome');
      
      if (unidadesData) setUnidades(unidadesData);

      // Carregar salas
      let salasQuery = supabase
        .from('salas')
        .select('id, nome, unidade_id')
        .eq('ativo', true)
        .order('nome');
      
      if (filtros.unidadeId && filtros.unidadeId !== 'todos') {
        salasQuery = salasQuery.eq('unidade_id', filtros.unidadeId);
      }
      
      const { data: salasData } = await salasQuery;
      if (salasData) setSalas(salasData);

      // Carregar professores
      const { data: professoresData } = await supabase
        .from('professores')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      
      if (professoresData) setProfessores(professoresData);

      // Carregar turmas usando a view vw_turmas_implicitas
      let turmasQuery = supabase
        .from('vw_turmas_implicitas')
        .select('*');

      if (filtros.unidadeId && filtros.unidadeId !== 'todos') {
        turmasQuery = turmasQuery.eq('unidade_id', filtros.unidadeId);
      }

      const { data: turmasData, error } = await turmasQuery;

      if (error) {
        console.error('Erro ao carregar turmas:', error);
      } else if (turmasData) {
        const turmasFormatadas: TurmaGrade[] = turmasData.map((t: any, index: number) => ({
          id: index + 1, // ID sintético já que a view não tem ID
          nome: `${t.professor_nome} - ${t.curso_nome}`,
          unidade_id: t.unidade_id,
          unidade_nome: t.unidade_nome || '',
          professor_id: t.professor_id,
          professor_nome: t.professor_nome || '',
          sala_id: null, // View não tem sala
          sala_nome: 'A definir',
          sala_capacidade: 4, // Capacidade padrão
          curso_id: t.curso_id,
          curso_nome: t.curso_nome || '',
          dia_semana: t.dia_semana,
          horario_inicio: t.horario_inicio?.substring(0, 5) || '',
          horario_fim: calcularHorarioFim(t.horario_inicio?.substring(0, 5) || '08:00', 60),
          duracao_minutos: 60,
          capacidade_maxima: 4,
          num_alunos: t.total_alunos || 0,
          alunos: t.ids_alunos || [],
          ativo: true
        }));
        setTurmas(turmasFormatadas);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrar turmas
  const turmasFiltradas = useMemo(() => {
    return turmas.filter(turma => {
      if (filtros.salaId && turma.sala_id !== filtros.salaId) return false;
      if (filtros.professorId && turma.professor_id !== filtros.professorId) return false;
      if (filtros.cursoId && turma.curso_id !== filtros.cursoId) return false;
      if (filtros.diaSemana && turma.dia_semana !== filtros.diaSemana) return false;
      return true;
    });
  }, [turmas, filtros]);

  // Organizar turmas por dia e horário
  const gradeData = useMemo(() => {
    const grade: Record<string, Record<string, TurmaGrade[]>> = {};

    for (const dia of diasSemana) {
      grade[dia] = {};
      for (const hora of horarios) {
        grade[dia][hora] = [];
      }
    }

    for (const turma of turmasFiltradas) {
      const dia = turma.dia_semana;
      const hora = turma.horario_inicio;
      
      if (grade[dia] && grade[dia][hora]) {
        grade[dia][hora].push(turma);
      }
    }

    return grade;
  }, [turmasFiltradas, diasSemana, horarios]);

  // Handlers
  function handleTurmaClick(turma: TurmaGrade) {
    if (onTurmaClick) {
      onTurmaClick(turma);
    } else {
      setTurmaSelecionada(turma);
      setModalAberto(true);
    }
  }

  function handleFiltroChange(campo: keyof FiltrosGrade, valor: string | number | undefined) {
    setFiltros(prev => ({
      ...prev,
      [campo]: valor === 'todos' ? undefined : valor
    }));
  }

  // Handlers Drag & Drop
  function handleDragStart(event: DragStartEvent) {
    const turma = event.active.data.current?.turma as TurmaGrade;
    if (turma) {
      setTurmaArrastando(turma);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setTurmaArrastando(null);
    
    const { active, over } = event;
    if (!over || !active.data.current?.turma) return;

    const turma = active.data.current.turma as TurmaGrade;
    const destino = over.data.current as { dia: string; horario: string } | undefined;
    
    if (!destino) return;

    // Verificar se é o mesmo slot
    if (turma.dia_semana === destino.dia && turma.horario_inicio === destino.horario) {
      return;
    }

    // Criar movimento pendente
    const movimento: MovimentoTurma = {
      turma,
      de: { dia: turma.dia_semana, horario: turma.horario_inicio },
      para: { dia: destino.dia, horario: destino.horario }
    };

    // Detectar conflitos
    const novaTurma = {
      ...turma,
      dia_semana: destino.dia,
      horario_inicio: destino.horario,
      horario_fim: calcularHorarioFim(destino.horario, turma.duracao_minutos || 60)
    };

    const conflitos = detectarConflitos(
      {
        id: turma.id,
        professor_id: turma.professor_id,
        sala_id: turma.sala_id,
        unidade_id: turma.unidade_id,
        curso_id: turma.curso_id,
        dia_semana: destino.dia,
        horario_inicio: destino.horario,
        horario_fim: novaTurma.horario_fim,
        duracao_minutos: turma.duracao_minutos || 60,
        alunos: turma.alunos
      },
      {
        turmasExistentes: turmas.map(t => ({
          id: t.id,
          professor_id: t.professor_id,
          sala_id: t.sala_id || 0,
          dia_semana: t.dia_semana,
          horario_inicio: t.horario_inicio,
          horario_fim: t.horario_fim,
          ativo: t.ativo
        })),
        salas: salas.map(s => ({
          id: s.id,
          nome: s.nome,
          capacidade_maxima: 4,
          unidade_id: s.unidade_id
        }))
      }
    );

    setMovimentoPendente(movimento);
    setConflitosMovimento(conflitos);
  }

  async function handleConfirmarMovimento() {
    if (!movimentoPendente) return;

    setSalvandoMovimento(true);
    try {
      const { turma, para } = movimentoPendente;
      const horarioFim = calcularHorarioFim(para.horario, turma.duracao_minutos || 60);

      const { error } = await supabase
        .from('turmas')
        .update({
          dia_semana: para.dia,
          horario_inicio: para.horario,
          horario_fim: horarioFim,
          updated_at: new Date().toISOString()
        })
        .eq('id', turma.id);

      if (error) throw error;

      // Recarregar dados
      await carregarDados();
      
      // Limpar estado
      setMovimentoPendente(null);
      setConflitosMovimento([]);
      setSugestoesMovimento([]);
    } catch (error) {
      console.error('Erro ao mover turma:', error);
      alert('Erro ao mover turma. Tente novamente.');
    } finally {
      setSalvandoMovimento(false);
    }
  }

  function handleCancelarMovimento() {
    setMovimentoPendente(null);
    setConflitosMovimento([]);
    setSugestoesMovimento([]);
  }

  function handleUsarSugestao(sugestao: Sugestao) {
    if (!movimentoPendente) return;

    setMovimentoPendente({
      ...movimentoPendente,
      para: { dia: sugestao.diaSemana, horario: sugestao.horarioInicio }
    });
    setConflitosMovimento([]);
  }

  // Salas filtradas por unidade
  const salasFiltradas = useMemo(() => {
    if (filtros.unidadeId && filtros.unidadeId !== 'todos') {
      return salas.filter(s => s.unidade_id === filtros.unidadeId);
    }
    return salas;
  }, [salas, filtros.unidadeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com filtros */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-violet-400" />
            <span className="text-white font-medium">Grade Horária</span>
          </div>

          {/* Botão Modo Arraste */}
          <button
            onClick={() => setDragEnabled(!dragEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              dragEnabled 
                ? 'bg-cyan-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Move className="w-4 h-4" />
            {dragEnabled ? 'Arraste Ativo' : 'Mover Turmas'}
          </button>

          <div className="flex-1" />

          {/* Filtro Unidade */}
          {isAdmin && (
            <Select 
              value={filtros.unidadeId || 'todos'} 
              onValueChange={(v) => handleFiltroChange('unidadeId', v)}
            >
              <SelectTrigger className="w-[160px] bg-slate-900 border-slate-700">
                <Building2 className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {unidades.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Filtro Sala */}
          <Select 
            value={filtros.salaId?.toString() || 'todos'} 
            onValueChange={(v) => handleFiltroChange('salaId', v === 'todos' ? undefined : parseInt(v))}
          >
            <SelectTrigger className="w-[160px] bg-slate-900 border-slate-700">
              <SelectValue placeholder="Sala" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as salas</SelectItem>
              {salasFiltradas.map(s => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Professor */}
          <Select 
            value={filtros.professorId?.toString() || 'todos'} 
            onValueChange={(v) => handleFiltroChange('professorId', v === 'todos' ? undefined : parseInt(v))}
          >
            <SelectTrigger className="w-[180px] bg-slate-900 border-slate-700">
              <Users className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Professor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {professores.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Dia */}
          <Select 
            value={filtros.diaSemana || 'todos'} 
            onValueChange={(v) => handleFiltroChange('diaSemana', v === 'todos' ? undefined : v)}
          >
            <SelectTrigger className="w-[140px] bg-slate-900 border-slate-700">
              <SelectValue placeholder="Dia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os dias</SelectItem>
              {diasSemana.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50">
          <span className="text-xs text-slate-500">Legenda:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-emerald-500/50" />
            <span className="text-xs text-slate-400">Disponível</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500/50" />
            <span className="text-xs text-slate-400">Quase cheio</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500/50" />
            <span className="text-xs text-slate-400">Cheio</span>
          </div>
          <div className="flex-1" />
          <span className="text-xs text-slate-500">
            {turmasFiltradas.length} turma(s) encontrada(s)
          </span>
        </div>
      </div>

      {/* Grade com Drag & Drop */}
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              {/* Header - Dias da semana */}
              <thead>
                <tr className="bg-slate-900/50">
                  <th className="w-20 p-2 text-left text-xs text-slate-400 uppercase border-r border-slate-700/50">
                    <Clock className="w-4 h-4 inline-block mr-1" />
                    Hora
                  </th>
                  {diasSemana.map(dia => (
                    <th 
                      key={dia} 
                      className="p-2 text-center text-sm font-medium text-white border-r border-slate-700/50 last:border-r-0"
                    >
                      <span className="hidden md:inline">{dia}</span>
                      <span className="md:hidden">{DIAS_SEMANA_CURTO[dia as keyof typeof DIAS_SEMANA_CURTO]}</span>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body - Horários */}
              <tbody>
                {horarios.map((hora, idx) => (
                  <tr 
                    key={hora} 
                    className={`border-t border-slate-700/50 ${idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}
                  >
                    {/* Coluna de horário */}
                    <td className="p-2 text-sm text-slate-400 font-mono border-r border-slate-700/50 align-top">
                      {hora}
                    </td>

                    {/* Células por dia */}
                    {diasSemana.map(dia => {
                      const turmasSlot = gradeData[dia]?.[hora] || [];
                      const slotId = `slot-${dia}-${hora}`;
                      const slotOcupado = turmasSlot.length > 0;
                      
                      return (
                        <td 
                          key={`${dia}-${hora}`}
                          className="p-1 border-r border-slate-700/50 last:border-r-0 align-top min-h-[60px] h-16"
                        >
                          <SlotHorario
                            id={slotId}
                            dia={dia}
                            horario={hora}
                            ocupado={slotOcupado}
                            disabled={!dragEnabled}
                          >
                            <div className="flex flex-col gap-1">
                              {turmasSlot.map(turma => (
                                <CelulaTurma
                                  key={turma.id}
                                  turma={turma}
                                  onClick={() => handleTurmaClick(turma)}
                                  draggable={dragEnabled}
                                />
                              ))}
                            </div>
                          </SlotHorario>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overlay de arraste */}
        <TurmaDragOverlay turma={turmaArrastando} />
      </DndContext>

      {/* Modal de detalhes */}
      {turmaSelecionada && (
        <ModalDetalhesTurma
          turma={turmaSelecionada}
          aberto={modalAberto}
          onClose={() => {
            setModalAberto(false);
            setTurmaSelecionada(null);
          }}
          onEditar={() => {
            setModalAberto(false);
            if (onEditarTurma && turmaSelecionada) {
              onEditarTurma(turmaSelecionada);
            }
          }}
        />
      )}

      {/* Modal de confirmação de movimento */}
      {movimentoPendente && (
        <ModalConfirmarMovimento
          movimento={movimentoPendente}
          conflitos={conflitosMovimento}
          sugestoes={sugestoesMovimento}
          carregando={salvandoMovimento}
          onConfirmar={handleConfirmarMovimento}
          onUsarSugestao={handleUsarSugestao}
          onCancelar={handleCancelarMovimento}
        />
      )}
    </div>
  );
}

export default GradeHoraria;
