import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isToday, isTomorrow, isPast, isSameWeek, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, CheckCircle2, Clock,
  AlertTriangle, Users, BookOpen, Target, MessageSquare, Loader2,
  LayoutList, CalendarDays, Columns, RefreshCw, Trash2, Edit2, GripVertical
} from 'lucide-react';
import { 
  DndContext, 
  DragEndEvent, 
  DragStartEvent, 
  DragOverEvent, 
  PointerSensor, 
  KeyboardSensor, 
  useSensor, 
  useSensors, 
  closestCorners,
  useDroppable,
  DragOverlay
} from '@dnd-kit/core';
import { 
  SortableContext, 
  sortableKeyboardCoordinates, 
  useSortable, 
  verticalListSortingStrategy, 
  arrayMove 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/toast';
import { ModalNovaAcao } from './ModalNovaAcao';
import { ModalTreinamento } from './ModalTreinamento';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';

interface Acao {
  id: string;
  professor_id: number;
  professor_nome: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  data_agendada: string;
  duracao_minutos: number;
  local: string | null;
  status: string;
  meta_id: string | null;
  responsavel: string | null;
}

interface Treinamento {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  foco: string;
  icone: string;
}

interface MetaEmAndamento {
  id: string;
  professor_id: number;
  professor_nome: string;
  tipo: string;
  valor_atual: number | null;
  valor_meta: number;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  acoes: Acao[];
}

interface ResumoSemana {
  treinamentos: number;
  reunioes: number;
  checkpoints: number;
  atrasados: number;
  concluidos: number;
}

interface Props {
  unidadeAtual: UnidadeId;
  competencia: string;
}

// Tipos para o Kanban
type KanbanStatus = 'pendente' | 'em_andamento' | 'concluida';

interface KanbanCardProps {
  acao: Acao;
  getTipoBadgeColor: (tipo: string) => string;
}

// Componente de Card Arrastável
function SortableKanbanCard({ acao, getTipoBadgeColor }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: acao.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-slate-900/50 rounded-lg p-3 border border-slate-700/30 hover:border-slate-600 transition group cursor-grab active:cursor-grabbing ${
        isDragging ? 'shadow-2xl ring-2 ring-blue-500/50 z-50 cursor-grabbing' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white mb-1 truncate">{acao.titulo}</p>
        <p className="text-xs text-slate-400 truncate">{acao.professor_nome || 'Geral'}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded ${getTipoBadgeColor(acao.tipo)}`}>
            {acao.tipo}
          </span>
          {/* Badge de Responsável */}
          <span className={`text-xs px-2 py-0.5 rounded ${
            acao.responsavel === 'juliana'
              ? 'bg-purple-500/30 text-purple-300'
              : acao.responsavel === 'quintela'
              ? 'bg-emerald-500/30 text-emerald-300'
              : acao.responsavel === 'ambos'
              ? 'bg-cyan-500/30 text-cyan-300'
              : 'bg-slate-500/30 text-slate-300'
          }`}>
            {acao.responsavel === 'ambos' ? 'Juliana e Quintela' : acao.responsavel === 'juliana' ? 'Juliana' : acao.responsavel === 'quintela' ? 'Quintela' : '-'}
          </span>
          {/* Badge de Unidade */}
          {(acao as any).unidade_acao && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              (acao as any).unidade_acao === 'campo_grande' ? 'bg-blue-500/30 text-blue-300' :
              (acao as any).unidade_acao === 'recreio' ? 'bg-amber-500/30 text-amber-300' :
              (acao as any).unidade_acao === 'barra' ? 'bg-rose-500/30 text-rose-300' :
              (acao as any).unidade_acao === 'online' ? 'bg-violet-500/30 text-violet-300' : 'bg-slate-500/30 text-slate-300'
            }`}>
              {(acao as any).unidade_acao === 'campo_grande' ? 'CG' :
               (acao as any).unidade_acao === 'recreio' ? 'REC' :
               (acao as any).unidade_acao === 'barra' ? 'BARRA' :
               (acao as any).unidade_acao === 'online' ? 'Online' : '-'}
            </span>
          )}
          <span className="text-xs text-slate-500">
            {format(new Date(acao.data_agendada), 'dd/MM HH:mm')}
          </span>
        </div>
      </div>
    </div>
  );
}

// Componente de Coluna do Kanban
interface KanbanColumnProps {
  id: KanbanStatus;
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  acoes: Acao[];
  getTipoBadgeColor: (tipo: string) => string;
  onExcluir: (id: string) => void;
  isOver?: boolean;
}

function KanbanColumn({ id, title, icon, iconColor, acoes, getTipoBadgeColor, onExcluir }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  return (
    <div 
      ref={setNodeRef}
      className={`bg-slate-800/50 rounded-2xl border transition-all duration-200 p-4 min-h-[400px] ${
        isOver 
          ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30' 
          : 'border-slate-700/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className={iconColor}>{icon}</div>
        <h3 className="font-medium text-white">{title}</h3>
        <span className="ml-auto bg-slate-700/50 text-slate-300 text-xs px-2 py-0.5 rounded-full">
          {acoes.length}
        </span>
      </div>
      
      <SortableContext items={acoes.map(a => a.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[100px]">
          {acoes.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-slate-700/50 rounded-lg">
              Arraste ações aqui
            </div>
          ) : (
            acoes.map(acao => (
              <SortableKanbanCard
                key={acao.id}
                acao={acao}
                getTipoBadgeColor={getTipoBadgeColor}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// Componente Principal do Kanban Board
interface KanbanBoardProps {
  acoes: Acao[];
  getTipoBadgeColor: (tipo: string) => string;
  onStatusChange: (acaoId: string, novoStatus: string) => Promise<void>;
  onExcluir: (id: string) => void;
  onReorder: (novaOrdem: Acao[]) => void;
}

function KanbanBoard({ acoes, getTipoBadgeColor, onStatusChange, onExcluir, onReorder }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Separar ações por status
  const acoesPendentes = acoes.filter(a => a.status === 'pendente' || a.status === 'reagendada');
  const acoesEmAndamento = acoes.filter(a => a.status === 'em_andamento');
  const acoesConcluidas = acoes.filter(a => a.status === 'concluida');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeAcao = activeId ? acoes.find(a => a.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedId = active.id as string;
    const droppedOnId = over.id as string;

    // Encontrar a ação que está sendo arrastada
    const draggedAcao = acoes.find(a => a.id === draggedId);
    if (!draggedAcao) return;

    // Determinar o container de destino
    let destinationContainer: KanbanStatus | null = null;
    let targetAcao: Acao | undefined;
    
    // Se soltou diretamente em uma coluna
    if (['pendente', 'em_andamento', 'concluida'].includes(droppedOnId)) {
      destinationContainer = droppedOnId as KanbanStatus;
    } else {
      // Se soltou em cima de outro card, encontrar a coluna desse card
      targetAcao = acoes.find(a => a.id === droppedOnId);
      if (targetAcao) {
        if (targetAcao.status === 'pendente' || targetAcao.status === 'reagendada') {
          destinationContainer = 'pendente';
        } else if (targetAcao.status === 'em_andamento') {
          destinationContainer = 'em_andamento';
        } else if (targetAcao.status === 'concluida') {
          destinationContainer = 'concluida';
        }
      }
    }

    if (!destinationContainer) return;

    // Determinar o container de origem
    let sourceContainer: KanbanStatus;
    if (draggedAcao.status === 'pendente' || draggedAcao.status === 'reagendada') {
      sourceContainer = 'pendente';
    } else if (draggedAcao.status === 'em_andamento') {
      sourceContainer = 'em_andamento';
    } else {
      sourceContainer = 'concluida';
    }
    
    // Se mudou de coluna, atualizar status
    if (sourceContainer !== destinationContainer) {
      await onStatusChange(draggedId, destinationContainer);
    } else if (targetAcao && draggedId !== droppedOnId) {
      // Mesma coluna - reordenar verticalmente
      // Pegar todas as ações da coluna atual
      const acoesColuna = sourceContainer === 'pendente' ? acoesPendentes :
                          sourceContainer === 'em_andamento' ? acoesEmAndamento : acoesConcluidas;
      
      const oldIndex = acoesColuna.findIndex(a => a.id === draggedId);
      const newIndex = acoesColuna.findIndex(a => a.id === droppedOnId);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // Criar nova ordem da coluna
        const novaOrdemColuna = [...acoesColuna];
        const [removed] = novaOrdemColuna.splice(oldIndex, 1);
        novaOrdemColuna.splice(newIndex, 0, removed);
        
        // Atualizar ordem_kanban localmente
        novaOrdemColuna.forEach((acao, index) => {
          (acao as any).ordem_kanban = index + 1;
        });
        
        // Criar nova lista completa de ações com a ordem atualizada
        const outrasAcoes = acoes.filter(a => !acoesColuna.some(ac => ac.id === a.id));
        const novaListaCompleta = [...outrasAcoes, ...novaOrdemColuna];
        
        // Atualizar UI imediatamente (otimista)
        onReorder(novaListaCompleta);
        
        // Atualizar ordem_kanban no banco em background
        const updates = novaOrdemColuna.map((acao, index) => 
          supabase
            .from('professor_acoes')
            .update({ ordem_kanban: index + 1 })
            .eq('id', acao.id)
        );
        
        await Promise.all(updates);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <style>{`body { cursor: ${activeId ? 'grabbing !important' : 'auto'} }`}</style>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KanbanColumn
          id="pendente"
          title="Pendente"
          icon={<Clock className="w-4 h-4" />}
          iconColor="text-amber-400"
          acoes={acoesPendentes}
          getTipoBadgeColor={getTipoBadgeColor}
          onExcluir={onExcluir}
        />
        <KanbanColumn
          id="em_andamento"
          title="Em Andamento"
          icon={<RefreshCw className="w-4 h-4" />}
          iconColor="text-blue-400"
          acoes={acoesEmAndamento}
          getTipoBadgeColor={getTipoBadgeColor}
          onExcluir={onExcluir}
        />
        <KanbanColumn
          id="concluida"
          title="Concluída"
          icon={<CheckCircle2 className="w-4 h-4" />}
          iconColor="text-emerald-400"
          acoes={acoesConcluidas}
          getTipoBadgeColor={getTipoBadgeColor}
          onExcluir={onExcluir}
        />
      </div>

      {/* Overlay do card sendo arrastado */}
      <DragOverlay>
        {activeAcao ? (
          <div className="bg-slate-900 rounded-lg p-3 border-2 border-blue-500 shadow-2xl rotate-3 scale-105">
            <div className="flex items-start gap-2">
              <GripVertical className="w-4 h-4 text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white mb-1">{activeAcao.titulo}</p>
                <p className="text-xs text-slate-400">{activeAcao.professor_nome || 'Geral'}</p>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function TabAgendaProfessores({ unidadeAtual, competencia }: Props) {
  const toast = useToast();

  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [metas, setMetas] = useState<MetaEmAndamento[]>([]);
  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([]);
  const [professores, setProfessores] = useState<{ id: number; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanaAtual, setSemanaAtual] = useState(new Date());
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroProfessor, setFiltroProfessor] = useState('todos');
  const [filtroResponsavel, setFiltroResponsavel] = useState<'todos' | 'juliana' | 'quintela'>('todos');
  const [visualizacao, setVisualizacao] = useState<'lista' | 'calendario' | 'kanban'>('lista');
  const [modoCalendario, setModoCalendario] = useState<'semana' | 'mes'>('semana');

  const [modalAcao, setModalAcao] = useState<{ 
    open: boolean; 
    professorId: number | null; 
    dataInicial?: Date; 
    responsavelInicial?: string;
    acaoParaEditar?: Acao | null;
  }>({
    open: false,
    professorId: null,
    acaoParaEditar: null
  });
  const [mostrarTodosTreinamentos, setMostrarTodosTreinamentos] = useState(false);
  const [modalTreinamento, setModalTreinamento] = useState<{ open: boolean; slug: string }>({
    open: false,
    slug: ''
  });
  const [alertExcluir, setAlertExcluir] = useState<{ open: boolean; acaoId: string | null }>({
    open: false,
    acaoId: null
  });
  const [modalReagendar, setModalReagendar] = useState<{ open: boolean; acao: Acao | null; novaData: Date | null }>({
    open: false,
    acao: null,
    novaData: null
  });

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual, semanaAtual]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const inicioSemana = startOfWeek(semanaAtual, { weekStartsOn: 1 });
      const fimSemana = endOfWeek(addWeeks(semanaAtual, 1), { weekStartsOn: 1 });

      // Carregar ações da semana
      let queryAcoes = supabase
        .from('professor_acoes')
        .select(`
          id, professor_id, tipo, titulo, descricao, data_agendada, 
          duracao_minutos, local, status, meta_id, responsavel, unidade_acao, ordem_kanban,
          professores:professor_id (nome)
        `)
        .gte('data_agendada', inicioSemana.toISOString())
        .lte('data_agendada', fimSemana.toISOString())
        .order('ordem_kanban')
        .order('data_agendada');

      // Também carregar atrasados (antes da semana atual, ainda pendentes)
      const { data: acoesData } = await queryAcoes;

      const { data: atrasadosData } = await supabase
        .from('professor_acoes')
        .select(`
          id, professor_id, tipo, titulo, descricao, data_agendada, 
          duracao_minutos, local, status, meta_id, responsavel, unidade_acao, ordem_kanban,
          professores:professor_id (nome)
        `)
        .lt('data_agendada', inicioSemana.toISOString())
        .eq('status', 'pendente')
        .order('ordem_kanban')
        .order('data_agendada');

      const todasAcoes: Acao[] = [...(atrasadosData || []), ...(acoesData || [])].map((a: any) => ({
        ...a,
        professor_nome: a.professores?.nome || 'Professor'
      }));

      setAcoes(todasAcoes);

      // Carregar catálogo de treinamentos
      const { data: treinamentosData } = await supabase
        .from('catalogo_treinamentos')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      setTreinamentos(treinamentosData || []);

      // Carregar professores para filtro
      const { data: professoresData } = await supabase
        .from('professores')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      setProfessores(professoresData || []);

      // Carregar metas em andamento com ações relacionadas
      const { data: metasData } = await supabase
        .from('professor_metas')
        .select(`
          id, professor_id, tipo, valor_atual, valor_meta, 
          data_inicio, data_fim, status,
          professores:professor_id (nome)
        `)
        .eq('status', 'em_andamento')
        .order('data_fim');

      if (metasData) {
        // Para cada meta, buscar ações relacionadas
        const metasComAcoes: MetaEmAndamento[] = await Promise.all(
          metasData.map(async (meta: any) => {
            const { data: acoesMetaData } = await supabase
              .from('professor_acoes')
              .select('id, tipo, titulo, data_agendada, status')
              .eq('professor_id', meta.professor_id)
              .order('data_agendada');

            return {
              ...meta,
              professor_nome: meta.professores?.nome || 'Professor',
              acoes: (acoesMetaData || []).map((a: any) => ({
                ...a,
                professor_id: meta.professor_id,
                professor_nome: meta.professores?.nome || 'Professor',
                descricao: null,
                duracao_minutos: 60,
                local: null,
                meta_id: meta.id
              }))
            };
          })
        );
        setMetas(metasComAcoes);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar agenda');
    } finally {
      setLoading(false);
    }
  };

  const handleConcluirAcao = async (acaoId: string) => {
    try {
      const { error } = await supabase
        .from('professor_acoes')
        .update({ status: 'concluida', data_conclusao: new Date().toISOString() })
        .eq('id', acaoId);

      if (error) throw error;

      toast.success('Ação concluída!');
      carregarDados();
    } catch (error) {
      console.error('Erro ao concluir ação:', error);
      toast.error('Erro ao concluir ação');
    }
  };

  const handleReagendarAcao = (acaoId: string) => {
    // Abrir modal de reagendamento
    const acao = acoes.find(a => a.id === acaoId);
    if (acao) {
      // Definir data inicial como amanhã no mesmo horário
      const dataAtual = new Date(acao.data_agendada);
      const novaData = new Date();
      novaData.setDate(novaData.getDate() + 1);
      novaData.setHours(dataAtual.getHours(), dataAtual.getMinutes(), 0, 0);
      
      setModalReagendar({ open: true, acao, novaData });
    }
  };

  const confirmarReagendamento = async () => {
    if (!modalReagendar.acao || !modalReagendar.novaData) return;
    
    try {
      const { error } = await supabase
        .from('professor_acoes')
        .update({ 
          data_agendada: modalReagendar.novaData.toISOString(), 
          status: 'reagendada' 
        })
        .eq('id', modalReagendar.acao.id);

      if (error) throw error;

      toast.success('Ação reagendada com sucesso!');
      setModalReagendar({ open: false, acao: null, novaData: null });
      carregarDados();
    } catch (error) {
      console.error('Erro ao reagendar ação:', error);
      toast.error('Erro ao reagendar ação');
    }
  };

  const abrirAlertExcluir = (acaoId: string) => {
    setAlertExcluir({ open: true, acaoId });
  };

  const confirmarExclusao = async () => {
    const acaoId = alertExcluir.acaoId;
    if (!acaoId) return;

    console.log('Confirmando exclusão da ação:', acaoId);
    
    try {
      console.log('Tentando excluir ação do banco...');
      const { error, data } = await supabase
        .from('professor_acoes')
        .delete()
        .eq('id', acaoId)
        .select();

      console.log('Resposta do banco:', { error, data });

      if (error) {
        console.error('Erro do Supabase:', error);
        throw error;
      }

      toast.success('Ação excluída com sucesso!');
      
      // Atualização otimista - remover do estado local
      setAcoes(prevAcoes => prevAcoes.filter(a => a.id !== acaoId));
      
      // Fechar o alert
      setAlertExcluir({ open: false, acaoId: null });
    } catch (error) {
      console.error('Erro ao excluir ação:', error);
      toast.error(`Erro ao excluir ação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      // Recarregar em caso de erro
      carregarDados();
      // Fechar o alert
      setAlertExcluir({ open: false, acaoId: null });
    }
  };

  const handleExcluirAcao = abrirAlertExcluir;

  // Filtrar ações
  const acoesFiltradas = useMemo(() => {
    let resultado = [...acoes];

    if (filtroTipo !== 'todos') {
      resultado = resultado.filter(a => a.tipo === filtroTipo);
    }

    if (filtroProfessor !== 'todos') {
      resultado = resultado.filter(a => a.professor_id === parseInt(filtroProfessor));
    }

    if (filtroResponsavel !== 'todos') {
      resultado = resultado.filter(a => {
        // Se filtrar por Juliana, mostrar ações de Juliana E de Ambos
        if (filtroResponsavel === 'juliana') {
          return a.responsavel === 'juliana' || a.responsavel === 'ambos';
        }
        // Se filtrar por Quintela, mostrar ações de Quintela E de Ambos
        if (filtroResponsavel === 'quintela') {
          return a.responsavel === 'quintela' || a.responsavel === 'ambos';
        }
        // Se filtrar por Ambos, mostrar apenas ações de Ambos
        return a.responsavel === filtroResponsavel;
      });
    }

    return resultado;
  }, [acoes, filtroTipo, filtroProfessor, filtroResponsavel]);

  // Função para obter cor do responsável
  const getResponsavelColor = (responsavel: string | null) => {
    if (responsavel === 'juliana') return 'border-l-purple-500 bg-purple-500/10';
    if (responsavel === 'quintela') return 'border-l-emerald-500 bg-emerald-500/10';
    if (responsavel === 'ambos') return 'border-l-cyan-500 bg-gradient-to-r from-purple-500/10 to-emerald-500/10';
    return 'border-l-slate-500 bg-slate-700/50';
  };

  // Função para obter cor e label da unidade da ação
  const getUnidadeAcaoBadge = (unidade: string | null) => {
    switch (unidade) {
      case 'campo_grande':
        return { label: 'CG', cor: 'bg-blue-500/30 text-blue-300' };
      case 'recreio':
        return { label: 'REC', cor: 'bg-amber-500/30 text-amber-300' };
      case 'barra':
        return { label: 'BARRA', cor: 'bg-rose-500/30 text-rose-300' };
      case 'online':
        return { label: 'Online', cor: 'bg-violet-500/30 text-violet-300' };
      default:
        return { label: '-', cor: 'bg-slate-500/30 text-slate-300' };
    }
  };

  // Função para abrir modal com data específica
  const abrirModalNovaAcao = (data?: Date) => {
    setModalAcao({ 
      open: true, 
      professorId: null, 
      dataInicial: data,
      responsavelInicial: filtroResponsavel !== 'todos' ? filtroResponsavel : undefined,
      acaoParaEditar: null
    });
  };

  // Função para abrir modal de edição
  const abrirModalEditarAcao = (acao: Acao) => {
    setModalAcao({
      open: true,
      professorId: acao.professor_id,
      acaoParaEditar: acao
    });
  };

  // Agrupar ações por período
  const acoesAgrupadas = useMemo(() => {
    const hoje: Acao[] = [];
    const amanha: Acao[] = [];
    const atrasados: Acao[] = [];
    const proximaSemana: Acao[] = [];

    acoesFiltradas.forEach(acao => {
      const dataAcao = new Date(acao.data_agendada);

      if (acao.status === 'pendente' && isPast(dataAcao) && !isToday(dataAcao)) {
        atrasados.push(acao);
      } else if (isToday(dataAcao)) {
        hoje.push(acao);
      } else if (isTomorrow(dataAcao)) {
        amanha.push(acao);
      } else {
        proximaSemana.push(acao);
      }
    });

    return { hoje, amanha, atrasados, proximaSemana };
  }, [acoesFiltradas]);

  // Resumo da semana
  const resumo = useMemo<ResumoSemana>(() => {
    const inicioSemana = startOfWeek(semanaAtual, { weekStartsOn: 1 });
    const fimSemana = endOfWeek(semanaAtual, { weekStartsOn: 1 });

    const acoesSemana = acoes.filter(a => {
      const data = new Date(a.data_agendada);
      return data >= inicioSemana && data <= fimSemana;
    });

    return {
      treinamentos: acoesSemana.filter(a => a.tipo === 'treinamento').length,
      reunioes: acoesSemana.filter(a => a.tipo === 'reuniao').length,
      checkpoints: acoesSemana.filter(a => a.tipo === 'checkpoint').length,
      atrasados: acoes.filter(a => a.status === 'pendente' && isPast(new Date(a.data_agendada)) && !isToday(new Date(a.data_agendada))).length,
      concluidos: acoesSemana.filter(a => a.status === 'concluida').length
    };
  }, [acoes, semanaAtual]);

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'treinamento': return 'bg-blue-500';
      case 'reuniao': return 'bg-purple-500';
      case 'checkpoint': return 'bg-green-500';
      case 'remanejamento': return 'bg-amber-500';
      case 'feedback': return 'bg-cyan-500';
      case 'mentoria': return 'bg-pink-500';
      case 'plantao': return 'bg-orange-500';
      default: return 'bg-slate-500';
    }
  };

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'treinamento': return 'bg-blue-500/20 text-blue-400';
      case 'reuniao': return 'bg-purple-500/20 text-purple-400';
      case 'checkpoint': return 'bg-green-500/20 text-green-400';
      case 'remanejamento': return 'bg-amber-500/20 text-amber-400';
      case 'feedback': return 'bg-cyan-500/20 text-cyan-400';
      case 'mentoria': return 'bg-pink-500/20 text-pink-400';
      case 'plantao': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const formatarSemana = () => {
    const inicio = startOfWeek(semanaAtual, { weekStartsOn: 1 });
    const fim = endOfWeek(semanaAtual, { weekStartsOn: 1 });
    return `${format(inicio, 'dd/MM')} - ${format(fim, 'dd/MM')}`;
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
      {/* Resumo da Semana */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            Resumo da Semana ({formatarSemana()})
          </h2>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSemanaAtual(subWeeks(semanaAtual, 1))}>
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSemanaAtual(addWeeks(semanaAtual, 1))}>
              Próxima
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{resumo.treinamentos}</p>
            <p className="text-xs text-slate-400">Treinamentos</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{resumo.reunioes}</p>
            <p className="text-xs text-slate-400">Reuniões</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{resumo.checkpoints}</p>
            <p className="text-xs text-slate-400">Checkpoints</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold ${resumo.atrasados > 0 ? 'text-yellow-400' : 'text-white'}`}>
              {resumo.atrasados}
            </p>
            <p className="text-xs text-slate-400">Atrasados</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{resumo.concluidos}</p>
            <p className="text-xs text-slate-400">Concluídos</p>
          </div>
        </div>
      </div>

      {/* Filtro de Coordenadores */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Agenda de:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFiltroResponsavel('juliana')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition ${
                  filtroResponsavel === 'juliana'
                    ? 'bg-purple-500/20 text-purple-300 border-2 border-purple-500'
                    : 'bg-slate-700/50 text-slate-400 border-2 border-transparent hover:border-purple-500/50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                Juliana
              </button>
              <button
                onClick={() => setFiltroResponsavel('quintela')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition ${
                  filtroResponsavel === 'quintela'
                    ? 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500'
                    : 'bg-slate-700/50 text-slate-400 border-2 border-transparent hover:border-emerald-500/50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                Quintela
              </button>
              <button
                onClick={() => setFiltroResponsavel('todos')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition ${
                  filtroResponsavel === 'todos'
                    ? 'bg-cyan-500/20 text-cyan-300 border-2 border-cyan-500'
                    : 'bg-slate-700/50 text-slate-400 border-2 border-transparent hover:border-cyan-500/50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-emerald-500" />
                Ambos
              </button>
            </div>
          </div>
          <Button
            onClick={() => abrirModalNovaAcao()}
            className="bg-gradient-to-r from-blue-500 to-purple-500"
          >
            <Plus className="w-4 h-4 mr-1" />
            Nova Ação
          </Button>
        </div>
      </div>

      {/* Filtros e Visualização */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Visualização:</span>
          <div className="flex gap-1">
            {[
              { value: 'lista', icon: LayoutList, label: 'Lista' },
              { value: 'calendario', icon: CalendarDays, label: 'Calendário' },
              { value: 'kanban', icon: Columns, label: 'Kanban' }
            ].map((v) => (
              <button
                key={v.value}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
                  visualizacao === v.value
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white'
                }`}
                onClick={() => setVisualizacao(v.value as any)}
              >
                <v.icon className="w-3 h-3" />
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="treinamento">Treinamentos</SelectItem>
              <SelectItem value="reuniao">Reuniões</SelectItem>
              <SelectItem value="checkpoint">Checkpoints</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroProfessor} onValueChange={setFiltroProfessor}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Professor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os prof.</SelectItem>
              {professores.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Visualização Lista */}
      {visualizacao === 'lista' && (
      <div className="space-y-4">
        {/* Atrasados */}
        {acoesAgrupadas.atrasados.length > 0 && (
          <div className="bg-slate-800/50 rounded-2xl border border-red-500/30 overflow-hidden">
            <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20">
              <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Atrasados
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {acoesAgrupadas.atrasados.length}
                </span>
              </p>
            </div>
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.atrasados.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  isAtrasado
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                  onExcluir={handleExcluirAcao}
                />
              ))}
            </div>
          </div>
        )}

        {/* Hoje */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20">
            <p className="text-sm font-medium text-blue-400 flex items-center gap-2">
              📌 Hoje
              <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                {acoesAgrupadas.hoje.length}
              </span>
              <span className="text-slate-400 font-normal ml-2">
                {format(new Date(), "EEEE, dd/MM", { locale: ptBR })}
              </span>
            </p>
          </div>
          {acoesAgrupadas.hoje.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">
              Nenhuma ação para hoje
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.hoje.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                  onExcluir={handleExcluirAcao}
                />
              ))}
            </div>
          )}
        </div>

        {/* Amanhã */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700/50">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              Amanhã
              <span className="bg-slate-600 text-white text-xs px-2 py-0.5 rounded-full">
                {acoesAgrupadas.amanha.length}
              </span>
              <span className="text-slate-400 font-normal ml-2">
                {format(new Date(Date.now() + 86400000), "EEEE, dd/MM", { locale: ptBR })}
              </span>
            </p>
          </div>
          {acoesAgrupadas.amanha.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">
              Nenhuma ação para amanhã
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.amanha.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                  onExcluir={handleExcluirAcao}
                />
              ))}
            </div>
          )}
        </div>

        {/* Próxima Semana */}
        {acoesAgrupadas.proximaSemana.length > 0 && (
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700/50">
              <p className="text-sm font-medium text-slate-400 flex items-center gap-2">
                Próximos dias
                <span className="bg-slate-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {acoesAgrupadas.proximaSemana.length}
                </span>
              </p>
            </div>
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.proximaSemana.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                  onExcluir={handleExcluirAcao}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Visualização Calendário */}
      {visualizacao === 'calendario' && (() => {
        const inicioSemana = startOfWeek(semanaAtual, { weekStartsOn: 0 });
        const diasSemana = Array.from({ length: 7 }).map((_, i) => {
          const dia = new Date(inicioSemana);
          dia.setDate(dia.getDate() + i);
          return dia;
        });

        // Para visualização mensal
        const inicioMes = startOfMonth(semanaAtual);
        const fimMes = endOfMonth(semanaAtual);
        const primeiroDiaSemana = getDay(inicioMes); // 0 = domingo
        const totalDiasMes = fimMes.getDate();
        const diasCalendarioMes = Array.from({ length: 42 }).map((_, i) => {
          const diaNumero = i - primeiroDiaSemana + 1;
          if (diaNumero < 1 || diaNumero > totalDiasMes) return null;
          const dia = new Date(inicioMes);
          dia.setDate(diaNumero);
          return dia;
        });

        return (
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
            {/* Header com navegação e toggle */}
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => modoCalendario === 'semana' 
                    ? setSemanaAtual(subWeeks(semanaAtual, 1))
                    : setSemanaAtual(subMonths(semanaAtual, 1))
                  }
                  className="p-1.5 hover:bg-slate-700 rounded-lg transition"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-400" />
                </button>
                <h3 className="text-lg font-semibold text-white min-w-[200px] text-center">
                  {modoCalendario === 'semana' 
                    ? `${format(inicioSemana, "d 'de' MMM", { locale: ptBR })} - ${format(diasSemana[6], "d 'de' MMM", { locale: ptBR })}`
                    : format(semanaAtual, "MMMM 'de' yyyy", { locale: ptBR })
                  }
                </h3>
                <button
                  onClick={() => modoCalendario === 'semana'
                    ? setSemanaAtual(addWeeks(semanaAtual, 1))
                    : setSemanaAtual(addMonths(semanaAtual, 1))
                  }
                  className="p-1.5 hover:bg-slate-700 rounded-lg transition"
                >
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
                <button
                  onClick={() => setSemanaAtual(new Date())}
                  className="ml-2 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition"
                >
                  Hoje
                </button>
              </div>
              
              {/* Toggle Semana/Mês */}
              <div className="flex bg-slate-700/50 rounded-lg p-1">
                <button
                  onClick={() => setModoCalendario('semana')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    modoCalendario === 'semana' 
                      ? 'bg-blue-500 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semana
                </button>
                <button
                  onClick={() => setModoCalendario('mes')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    modoCalendario === 'mes' 
                      ? 'bg-blue-500 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mês
                </button>
              </div>
            </div>

            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 border-b border-slate-700/50">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => (
                <div key={dia} className="p-2 text-center text-xs font-medium text-slate-400 uppercase">
                  {dia}
                </div>
              ))}
            </div>

            {/* VISUALIZAÇÃO SEMANAL */}
            {modoCalendario === 'semana' && (
              <>
                {/* Header com números dos dias */}
                <div className="grid grid-cols-7 border-b border-slate-700/50">
                  {diasSemana.map((dia, i) => {
                    const isDiaHoje = isToday(dia);
                    const acoesNoDia = acoesFiltradas.filter(a => 
                      format(new Date(a.data_agendada), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd')
                    );
                    
                    return (
                      <div 
                        key={i} 
                        className={`p-3 text-center border-r border-slate-700/50 last:border-r-0 ${
                          isDiaHoje ? 'bg-blue-500/10' : ''
                        }`}
                      >
                        <div className={`text-2xl font-bold ${
                          isDiaHoje ? 'text-blue-400' : 'text-white'
                        }`}>
                          {format(dia, 'd')}
                        </div>
                        {acoesNoDia.length > 0 && (
                          <div className="text-xs text-cyan-400 mt-1">
                            {acoesNoDia.length} ação{acoesNoDia.length > 1 ? 'ões' : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Corpo com ações por dia */}
                <div className="grid grid-cols-7 min-h-[350px]">
                  {diasSemana.map((dia, i) => {
                    const isDiaHoje = isToday(dia);
                    const acoesNoDia = acoesFiltradas
                      .filter(a => format(new Date(a.data_agendada), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd'))
                      .sort((a, b) => new Date(a.data_agendada).getTime() - new Date(b.data_agendada).getTime());
                    
                    return (
                      <div 
                        key={i}
                        onClick={() => abrirModalNovaAcao(dia)}
                        className={`p-2 border-r border-slate-700/50 last:border-r-0 cursor-pointer transition ${
                          isDiaHoje ? 'bg-blue-500/5' : 'hover:bg-slate-800/50'
                        }`}
                      >
                        {acoesNoDia.length === 0 ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-xs text-slate-600">Clique para adicionar ação</span>
                          </div>
                        ) : (
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            {acoesNoDia.map(acao => (
                              <div 
                                key={acao.id}
                                onClick={() => abrirModalEditarAcao(acao)}
                                className={`p-2 rounded-lg border cursor-pointer hover:scale-[1.02] transition-all border-l-4 ${
                                  acao.responsavel === 'juliana'
                                    ? 'border-l-purple-500 bg-purple-500/10 border-purple-500/30'
                                    : acao.responsavel === 'quintela'
                                    ? 'border-l-emerald-500 bg-emerald-500/10 border-emerald-500/30'
                                    : acao.responsavel === 'ambos'
                                    ? 'border-l-cyan-500 bg-gradient-to-r from-purple-500/10 to-emerald-500/10 border-cyan-500/30'
                                    : 'border-l-slate-500 bg-slate-700/50 border-slate-600/50'
                                } hover:shadow-lg`}
                              >
                                <div className="flex items-center gap-1 mb-1 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getTipoBadgeColor(acao.tipo)}`}>
                                    {acao.tipo}
                                  </span>
                                  {/* Badge de Responsável */}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    acao.responsavel === 'juliana'
                                      ? 'bg-purple-500/30 text-purple-300'
                                      : acao.responsavel === 'quintela'
                                      ? 'bg-emerald-500/30 text-emerald-300'
                                      : acao.responsavel === 'ambos'
                                      ? 'bg-cyan-500/30 text-cyan-300'
                                      : 'bg-slate-500/30 text-slate-300'
                                  }`}>
                                    {acao.responsavel === 'ambos' ? 'Juliana e Quintela' : acao.responsavel === 'juliana' ? 'Juliana' : acao.responsavel === 'quintela' ? 'Quintela' : '-'}
                                  </span>
                                  {/* Badge de Unidade */}
                                  {(acao as any).unidade_acao && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      (acao as any).unidade_acao === 'campo_grande' ? 'bg-blue-500/30 text-blue-300' :
                                      (acao as any).unidade_acao === 'recreio' ? 'bg-amber-500/30 text-amber-300' :
                                      (acao as any).unidade_acao === 'barra' ? 'bg-rose-500/30 text-rose-300' :
                                      (acao as any).unidade_acao === 'online' ? 'bg-violet-500/30 text-violet-300' : 'bg-slate-500/30 text-slate-300'
                                    }`}>
                                      {(acao as any).unidade_acao === 'campo_grande' ? 'CG' :
                                       (acao as any).unidade_acao === 'recreio' ? 'REC' :
                                       (acao as any).unidade_acao === 'barra' ? 'BARRA' :
                                       (acao as any).unidade_acao === 'online' ? 'Online' : '-'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-medium text-white truncate">{acao.titulo}</p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {acao.professor_nome || 'Professor'}
                                </p>
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(acao.data_agendada), 'HH:mm')}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* VISUALIZAÇÃO MENSAL */}
            {modoCalendario === 'mes' && (
              <div className="grid grid-cols-7">
                {diasCalendarioMes.map((dia, i) => {
                  if (!dia) {
                    return (
                      <div key={i} className="min-h-[100px] p-2 border-r border-b border-slate-700/30 last:border-r-0 bg-slate-900/30" />
                    );
                  }
                  
                  const isDiaHoje = isToday(dia);
                  const acoesNoDia = acoesFiltradas
                    .filter(a => format(new Date(a.data_agendada), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd'))
                    .sort((a, b) => new Date(a.data_agendada).getTime() - new Date(b.data_agendada).getTime());
                  
                  return (
                    <div 
                      key={i} 
                      onClick={() => abrirModalNovaAcao(dia)}
                      className={`min-h-[100px] p-2 border-r border-b border-slate-700/30 last:border-r-0 cursor-pointer transition ${
                        isDiaHoje ? 'bg-blue-500/10' : 'hover:bg-slate-800/70'
                      }`}
                    >
                      <div className={`text-sm font-medium mb-1 flex items-center justify-between ${
                        isDiaHoje ? 'text-blue-400' : 'text-slate-400'
                      }`}>
                        <span>{format(dia, 'd')}</span>
                        <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 text-slate-500" />
                      </div>
                      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                        {acoesNoDia.slice(0, 3).map(acao => {
                          const unidadeBadge = getUnidadeAcaoBadge((acao as any).unidade_acao);
                          const responsavelLabel = acao.responsavel === 'ambos' ? 'Juliana e Quintela' : 
                                                   acao.responsavel === 'juliana' ? 'Juliana' : 
                                                   acao.responsavel === 'quintela' ? 'Quintela' : '-';
                          
                          return (
                            <Tooltip
                              key={acao.id}
                              content={
                                <div className="space-y-1 text-xs">
                                  <div className="font-semibold">{acao.titulo}</div>
                                  <div>📅 {format(new Date(acao.data_agendada), 'dd/MM/yyyy HH:mm')}</div>
                                  <div>⏱️ {acao.duracao_minutos} min</div>
                                  <div>👤 {acao.professor_nome || 'Geral'}</div>
                                  <div>📋 {acao.tipo.charAt(0).toUpperCase() + acao.tipo.slice(1)}</div>
                                  <div>👥 {responsavelLabel}</div>
                                  <div>📍 {unidadeBadge.label}</div>
                                  {acao.local && <div>🏢 {acao.local}</div>}
                                  {acao.descricao && <div className="text-slate-400 mt-1">{acao.descricao}</div>}
                                </div>
                              }
                              side="top"
                            >
                              <div 
                                onClick={() => abrirModalEditarAcao(acao)}
                                className={`px-1.5 py-0.5 rounded text-[10px] truncate cursor-pointer border-l-2 hover:opacity-80 transition ${
                                  acao.responsavel === 'juliana'
                                    ? 'border-l-purple-500 bg-purple-500/20 text-purple-200'
                                    : acao.responsavel === 'quintela'
                                    ? 'border-l-emerald-500 bg-emerald-500/20 text-emerald-200'
                                    : acao.responsavel === 'ambos'
                                    ? 'border-l-cyan-500 bg-gradient-to-r from-purple-500/20 to-emerald-500/20 text-cyan-200'
                                    : 'border-l-slate-500 bg-slate-700 text-slate-300'
                                }`}
                              >
                                {format(new Date(acao.data_agendada), 'HH:mm')} {acao.titulo}
                              </div>
                            </Tooltip>
                          );
                        })}
                        {acoesNoDia.length > 3 && (
                          <div className="text-[10px] text-cyan-400 px-1">
                            +{acoesNoDia.length - 3} mais
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legenda */}
            <div className="p-3 border-t border-slate-700/50 flex items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-purple-500/20 border-l-2 border-l-purple-500" />
                <span>Juliana</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-emerald-500/20 border-l-2 border-l-emerald-500" />
                <span>Quintela</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-gradient-to-r from-purple-500/20 to-emerald-500/20 border-l-2 border-l-cyan-500" />
                <span>Ambos</span>
              </div>
              <div className="border-l border-slate-600 h-4 mx-2" />
              <span className="text-slate-500">Clique em um dia para adicionar ação</span>
              <div className="flex-1" />
              <span className="text-slate-500">
                {acoesFiltradas.length} ação{acoesFiltradas.length !== 1 ? 'ões' : ''} no período
              </span>
            </div>
          </div>
        );
      })()}

      {/* Visualização Kanban com Drag & Drop */}
      {visualizacao === 'kanban' && (
        <KanbanBoard 
          acoes={acoesFiltradas}
          getTipoBadgeColor={getTipoBadgeColor}
          onStatusChange={async (acaoId: string, novoStatus: string) => {
            // Atualização otimista - atualizar estado local imediatamente
            setAcoes(prevAcoes => 
              prevAcoes.map(acao => 
                acao.id === acaoId 
                  ? { 
                      ...acao, 
                      status: novoStatus,
                      ...(novoStatus === 'concluida' ? { data_conclusao: new Date().toISOString() } : {})
                    } 
                  : acao
              )
            );

            // Atualizar no banco em background
            try {
              const { error } = await supabase
                .from('professor_acoes')
                .update({ 
                  status: novoStatus,
                  ...(novoStatus === 'concluida' ? { data_conclusao: new Date().toISOString() } : {})
                })
                .eq('id', acaoId);

              if (error) throw error;
              toast.success(`Ação movida para ${novoStatus === 'pendente' ? 'Pendente' : novoStatus === 'em_andamento' ? 'Em Andamento' : 'Concluída'}!`);
            } catch (error) {
              console.error('Erro ao atualizar status:', error);
              toast.error('Erro ao mover ação');
              // Reverter mudança em caso de erro
              carregarDados();
            }
          }}
          onExcluir={handleExcluirAcao}
          onReorder={(novaOrdem) => setAcoes(novaOrdem)}
        />
      )}

      {/* Metas e Ações em Andamento */}
      {metas.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              🎯 Metas e Ações em Andamento
            </h2>
            <span className="text-xs text-slate-400">{metas.length} meta{metas.length > 1 ? 's' : ''} ativa{metas.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-4">
            {metas.map((meta) => {
              const diasRestantes = meta.data_fim 
                ? Math.max(0, Math.floor((new Date(meta.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                : null;
              const progresso = meta.valor_meta > 0 && meta.valor_atual !== null
                ? Math.min(100, ((meta.valor_atual - (meta.valor_atual * 0.8)) / (meta.valor_meta - (meta.valor_atual * 0.8))) * 100)
                : 0;
              const acoesConcluidas = meta.acoes.filter(a => a.status === 'concluida');
              const acoesPendentes = meta.acoes.filter(a => a.status === 'pendente');

              const formatarTipo = (tipo: string) => {
                switch (tipo) {
                  case 'media_turma': return 'Média de turma';
                  case 'retencao': return 'Retenção';
                  case 'conversao': return 'Conversão';
                  case 'presenca': return 'Taxa de Presença';
                  default: return tipo;
                }
              };

              const formatarValor = (valor: number | null, tipo: string) => {
                if (valor === null) return '-';
                if (tipo === 'media_turma') return valor.toFixed(1);
                return `${valor.toFixed(0)}%`;
              };

              return (
                <div key={meta.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/30">
                  {/* Header da Meta */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">👤</span>
                        <span className="text-white font-semibold">{meta.professor_nome}</span>
                      </div>
                      <p className="text-slate-300 text-sm">
                        Meta: {formatarTipo(meta.tipo)} {formatarValor(meta.valor_atual, meta.tipo)} → {formatarValor(meta.valor_meta, meta.tipo)}
                      </p>
                    </div>
                    {diasRestantes !== null && (
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        diasRestantes <= 7 ? 'bg-red-500/20 text-red-400' :
                        diasRestantes <= 30 ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {diasRestantes} dias restantes
                      </span>
                    )}
                  </div>

                  {/* Prazo */}
                  {meta.data_fim && (
                    <p className="text-xs text-slate-400 mb-3">
                      Prazo: {format(new Date(meta.data_fim), "MMM/yyyy", { locale: ptBR })}
                    </p>
                  )}

                  {/* Barra de Progresso */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Progresso</span>
                      <span className="text-slate-300">{Math.round(progresso)}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2.5">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2.5 rounded-full transition-all"
                        style={{ width: `${Math.max(5, progresso)}%` }}
                      />
                    </div>
                  </div>

                  {/* Checkpoints / Ações */}
                  {meta.acoes.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Checkpoints:</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {acoesConcluidas.slice(0, 3).map((acao) => (
                          <div key={acao.id} className="flex items-center gap-2 text-xs">
                            <span className="text-green-400">✅</span>
                            <span className="text-slate-300">
                              {format(new Date(acao.data_agendada), "dd/MM")} - {acao.titulo}
                            </span>
                          </div>
                        ))}
                        {acoesPendentes.slice(0, 3).map((acao) => (
                          <div key={acao.id} className="flex items-center gap-2 text-xs">
                            <span className="text-yellow-400">⏳</span>
                            <span className="text-slate-400">
                              {format(new Date(acao.data_agendada), "dd/MM")} - {acao.titulo}
                            </span>
                          </div>
                        ))}
                        {meta.acoes.length > 6 && (
                          <p className="text-slate-500 text-xs pl-5">
                            + {meta.acoes.length - 6} outras ações
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Catálogo de Treinamentos */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            Catálogo de Treinamentos
          </h2>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-blue-400"
            onClick={() => setMostrarTodosTreinamentos(!mostrarTodosTreinamentos)}
          >
            {mostrarTodosTreinamentos ? '← Ver menos' : 'Ver todos →'}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(mostrarTodosTreinamentos ? treinamentos : treinamentos.slice(0, 3)).map((treinamento) => (
            <div
              key={treinamento.id}
              className="bg-slate-800/50 rounded-xl p-4 hover:bg-slate-800/70 cursor-pointer transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{treinamento.icone}</span>
                <p className="text-white font-medium">{treinamento.nome}</p>
              </div>
              <p className="text-slate-400 text-xs mb-3 line-clamp-2">{treinamento.descricao}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">⏱️ {treinamento.duracao_minutos} min</span>
                <div className="flex items-center gap-2">
                  {treinamento.nome === 'Conversão de Experimentais' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 text-xs"
                      onClick={() => setModalTreinamento({ open: true, slug: 'conversao-experimentais' })}
                    >
                      Ver Treinamento
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-400 text-xs"
                    onClick={() => setModalAcao({ open: true, professorId: null })}
                  >
                    Agendar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Nova Ação / Editar Ação */}
      <ModalNovaAcao
        open={modalAcao.open}
        onClose={() => setModalAcao({ open: false, professorId: null, acaoParaEditar: null })}
        professorId={modalAcao.professorId}
        dataInicial={modalAcao.dataInicial}
        responsavelInicial={modalAcao.responsavelInicial}
        acaoParaEditar={modalAcao.acaoParaEditar}
        professores={professores}
        onSave={() => {
          setModalAcao({ open: false, professorId: null, acaoParaEditar: null });
          toast.success(modalAcao.acaoParaEditar ? 'Ação atualizada!' : 'Ação agendada!');
          carregarDados();
        }}
        onDelete={() => {
          setModalAcao({ open: false, professorId: null, acaoParaEditar: null });
          toast.success('Ação excluída!');
          carregarDados();
        }}
      />

      {/* Modal Treinamento */}
      <ModalTreinamento
        isOpen={modalTreinamento.open}
        onClose={() => setModalTreinamento({ open: false, slug: '' })}
        treinamentoSlug={modalTreinamento.slug}
      />

      {/* Modal de Reagendamento */}
      <AlertDialog open={modalReagendar.open} onOpenChange={(open) => !open && setModalReagendar({ open: false, acao: null, novaData: null })}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-yellow-400" />
              Reagendar Ação
            </AlertDialogTitle>
            <AlertDialogDescription>
              {modalReagendar.acao && (
                <div className="mt-2 p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-white font-medium">{modalReagendar.acao.titulo}</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Data atual: {format(new Date(modalReagendar.acao.data_agendada), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-slate-400 block mb-2">Nova Data</label>
              <DatePicker
                date={modalReagendar.novaData || undefined}
                onDateChange={(date) => {
                  if (date && modalReagendar.novaData) {
                    const novaData = new Date(date);
                    novaData.setHours(modalReagendar.novaData.getHours(), modalReagendar.novaData.getMinutes(), 0, 0);
                    setModalReagendar(prev => ({ ...prev, novaData }));
                  } else if (date) {
                    setModalReagendar(prev => ({ ...prev, novaData: date }));
                  }
                }}
                placeholder="Selecione a nova data"
              />
            </div>
            
            <div>
              <label className="text-sm text-slate-400 block mb-2">Horário</label>
              <div className="flex gap-2">
                <Select
                  value={modalReagendar.novaData ? modalReagendar.novaData.getHours().toString().padStart(2, '0') : '10'}
                  onValueChange={(value) => {
                    if (modalReagendar.novaData) {
                      const novaData = new Date(modalReagendar.novaData);
                      novaData.setHours(parseInt(value), novaData.getMinutes(), 0, 0);
                      setModalReagendar(prev => ({ ...prev, novaData }));
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Hora" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={i.toString().padStart(2, '0')}>
                        {i.toString().padStart(2, '0')}h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-slate-400 flex items-center">:</span>
                <Select
                  value={modalReagendar.novaData ? modalReagendar.novaData.getMinutes().toString().padStart(2, '0') : '00'}
                  onValueChange={(value) => {
                    if (modalReagendar.novaData) {
                      const novaData = new Date(modalReagendar.novaData);
                      novaData.setMinutes(parseInt(value), 0, 0);
                      setModalReagendar(prev => ({ ...prev, novaData }));
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Min" />
                  </SelectTrigger>
                  <SelectContent>
                    {['00', '15', '30', '45'].map((min) => (
                      <SelectItem key={min} value={min}>
                        {min}min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {modalReagendar.novaData && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-400">
                  📅 Nova data: {format(modalReagendar.novaData, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarReagendamento}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              Reagendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={alertExcluir.open} onOpenChange={(open) => setAlertExcluir({ open, acaoId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta ação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

// Componente de item de ação
function AcaoItem({
  acao,
  isAtrasado = false,
  getTipoColor,
  getTipoBadgeColor,
  onConcluir,
  onReagendar,
  onEditar,
  onExcluir
}: {
  acao: Acao;
  isAtrasado?: boolean;
  getTipoColor: (tipo: string) => string;
  getTipoBadgeColor: (tipo: string) => string;
  onConcluir: (id: string) => void;
  onReagendar: (id: string) => void;
  onEditar?: (acao: Acao) => void;
  onExcluir?: (id: string) => void;
}) {
  const dataAcao = new Date(acao.data_agendada);

  // Cor baseada no responsável
  const getResponsavelBorderColor = () => {
    if (isAtrasado) return 'border-l-red-500';
    if (acao.responsavel === 'juliana') return 'border-l-purple-500';
    if (acao.responsavel === 'quintela') return 'border-l-emerald-500';
    if (acao.responsavel === 'ambos') return 'border-l-cyan-500';
    return 'border-l-slate-500';
  };

  const getResponsavelBgColor = () => {
    if (acao.responsavel === 'juliana') return 'bg-purple-500/5';
    if (acao.responsavel === 'quintela') return 'bg-emerald-500/5';
    if (acao.responsavel === 'ambos') return 'bg-gradient-to-r from-purple-500/5 to-emerald-500/5';
    return '';
  };

  return (
    <div 
      onClick={() => onEditar?.(acao)}
      className={`group px-4 py-3 hover:bg-slate-700/30 cursor-pointer flex items-center gap-4 border-l-4 ${getResponsavelBorderColor()} ${getResponsavelBgColor()} transition-all hover:shadow-md`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded text-xs ${getTipoBadgeColor(acao.tipo)}`}>
            {acao.tipo.charAt(0).toUpperCase() + acao.tipo.slice(1)}
          </span>
          <span className="text-white font-medium">{acao.titulo}</span>
          {isAtrasado && (() => {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const dataAcaoNormalizada = new Date(dataAcao);
            dataAcaoNormalizada.setHours(0, 0, 0, 0);
            const diasAtraso = Math.floor((hoje.getTime() - dataAcaoNormalizada.getTime()) / (1000 * 60 * 60 * 24));
            return (
              <span className="text-red-400 text-xs bg-red-500/20 px-2 py-0.5 rounded">
                {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} atrasado
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>🕐 {format(dataAcao, "HH:mm")} - {format(new Date(dataAcao.getTime() + acao.duracao_minutos * 60000), "HH:mm")}</span>
          <span>👤 {acao.professor_nome || 'Professor'}</span>
          {acao.local && <span>📍 {acao.local}</span>}
          {acao.responsavel && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              acao.responsavel === 'juliana' ? 'bg-purple-500/20 text-purple-300' :
              acao.responsavel === 'quintela' ? 'bg-emerald-500/20 text-emerald-300' :
              acao.responsavel === 'ambos' ? 'bg-cyan-500/20 text-cyan-300' : ''
            }`}>
              {acao.responsavel === 'ambos' ? 'Juliana e Quintela' : acao.responsavel.charAt(0).toUpperCase() + acao.responsavel.slice(1)}
            </span>
          )}
          {/* Badge de Unidade */}
          {(acao as any).unidade_acao && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              (acao as any).unidade_acao === 'campo_grande' ? 'bg-blue-500/20 text-blue-300' :
              (acao as any).unidade_acao === 'recreio' ? 'bg-amber-500/20 text-amber-300' :
              (acao as any).unidade_acao === 'barra' ? 'bg-rose-500/20 text-rose-300' :
              (acao as any).unidade_acao === 'online' ? 'bg-violet-500/20 text-violet-300' : ''
            }`}>
              {(acao as any).unidade_acao === 'campo_grande' ? 'CG' :
               (acao as any).unidade_acao === 'recreio' ? 'REC' :
               (acao as any).unidade_acao === 'barra' ? 'BARRA' :
               (acao as any).unidade_acao === 'online' ? 'Online' : '-'}
            </span>
          )}
        </div>
      </div>
      
      {/* Ações do card */}
      <div className="flex items-center gap-1">
        {acao.status === 'concluida' ? (
          <span className="text-green-400 text-xs flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Concluída
          </span>
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Editar */}
            <Tooltip content="Editar" side="top">
              <button
                onClick={(e) => { e.stopPropagation(); onEditar?.(acao); }}
                className="p-1.5 hover:bg-blue-500/20 rounded text-blue-400 hover:text-blue-300 transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </Tooltip>
            
            {/* Concluir ou Reagendar */}
            {isAtrasado ? (
              <Tooltip content="Reagendar" side="top">
                <button
                  onClick={(e) => { e.stopPropagation(); onReagendar(acao.id); }}
                  className="p-1.5 hover:bg-yellow-500/20 rounded text-yellow-400 hover:text-yellow-300 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Concluir" side="top">
                <button
                  onClick={(e) => { e.stopPropagation(); onConcluir(acao.id); }}
                  className="p-1.5 hover:bg-green-500/20 rounded text-green-400 hover:text-green-300 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
            
            {/* Excluir */}
            <Tooltip content="Excluir" side="top">
              <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onExcluir?.(acao.id);
                }}
                className="p-1.5 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
