import React, { useState } from 'react';
import { 
  MoreHorizontal,
  Calendar,
  Loader2,
  Edit,
  Trash2,
  Eye,
  GripVertical
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useProjetos, useUpdateProjeto } from '../../../../hooks/useProjetos';
import { ModalDetalhesProjeto, ModalEditarProjeto, ModalConfirmarExclusao } from '../components';
import type { Projeto, ProjetoStatus } from '../../../../types/projetos';

interface KanbanViewProps {
  unidadeSelecionada: string;
}

interface Coluna {
  id: ProjetoStatus;
  titulo: string;
  cor: string;
}

const colunas: Coluna[] = [
  { id: 'planejamento', titulo: 'Planejamento', cor: 'bg-violet-500' },
  { id: 'em_andamento', titulo: 'Em Andamento', cor: 'bg-blue-500' },
  { id: 'em_revisao', titulo: 'Em Revisão', cor: 'bg-amber-500' },
  { id: 'concluido', titulo: 'Concluído', cor: 'bg-emerald-500' },
];

const avatarColors = [
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-amber-500 to-orange-500',
];

// Função para formatar data
function formatarData(dataStr?: string): string {
  if (!dataStr) return '-';
  const data = new Date(dataStr + 'T00:00:00');
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// Função para calcular urgência do prazo
function calcularUrgencia(dataFim?: string): 'normal' | 'alerta' | 'urgente' | 'concluido' {
  if (!dataFim) return 'normal';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(dataFim + 'T00:00:00');
  const diffDias = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDias < 0) return 'urgente';
  if (diffDias <= 7) return 'alerta';
  return 'normal';
}

// Componente de Card Arrastável
interface SortableCardProps {
  projeto: Projeto;
  onVerDetalhes: (id: number) => void;
  onEditar: (projeto: Projeto) => void;
  onExcluir: (projeto: Projeto) => void;
  isConcluido?: boolean;
}

function SortableCard({ projeto, onVerDetalhes, onEditar, onExcluir, isConcluido }: SortableCardProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: projeto.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const urgencia = projeto.status === 'concluido' ? 'concluido' : calcularUrgencia(projeto.data_fim);
  const progresso = projeto.progresso || 0;
  const totalTarefas = projeto.total_tarefas || 0;
  const tarefasConcluidas = projeto.tarefas_concluidas || 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        bg-slate-800/50 border border-slate-700 rounded-xl p-4 
        hover:border-slate-600 hover:shadow-lg transition-all
        ${isConcluido ? 'opacity-70' : ''}
        ${isDragging ? 'shadow-2xl ring-2 ring-violet-500' : ''}
      `}
    >
      {/* Header do Card */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-500 hover:text-slate-300"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span 
            className="text-[10px] font-semibold uppercase px-2 py-1 rounded"
            style={{ 
              backgroundColor: `${projeto.tipo?.cor || '#8b5cf6'}20`,
              color: projeto.tipo?.cor || '#8b5cf6'
            }}
          >
            {projeto.tipo?.nome || 'Projeto'}
          </span>
        </div>
        <div className="relative">
          <button 
            onClick={() => setMenuAberto(!menuAberto)}
            className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          
          {menuAberto && (
            <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1 min-w-[120px]">
              <button
                onClick={() => {
                  onVerDetalhes(projeto.id);
                  setMenuAberto(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Ver detalhes
              </button>
              <button
                onClick={() => {
                  onEditar(projeto);
                  setMenuAberto(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={() => {
                  onExcluir(projeto);
                  setMenuAberto(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-slate-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Título - clicável para ver detalhes */}
      <h4 
        onClick={() => onVerDetalhes(projeto.id)}
        className="font-semibold text-white text-sm mb-3 line-clamp-2 cursor-pointer hover:text-violet-300 transition-colors"
      >
        {projeto.nome}
      </h4>

      {/* Progresso */}
      <div className="mb-3">
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-1">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all"
            style={{ width: `${progresso}%` }}
          />
        </div>
        <span className="text-[11px] text-slate-400">{tarefasConcluidas}/{totalTarefas} tarefas</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Equipe */}
        <div className="flex -space-x-1.5">
          {projeto.equipe && projeto.equipe.length > 0 ? (
            projeto.equipe.slice(0, 3).map((membro, i) => (
              <div
                key={membro.id}
                className={`w-6 h-6 rounded-md bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[10px] font-bold border-2 border-slate-800`}
                title={membro.pessoa?.nome || `Membro ${i + 1}`}
              >
                {(membro.pessoa?.nome || 'M').charAt(0).toUpperCase()}
              </div>
            ))
          ) : (
            <span className="text-[10px] text-slate-500">Sem equipe</span>
          )}
          {projeto.equipe && projeto.equipe.length > 3 && (
            <span className="text-[10px] text-slate-400 ml-1">+{projeto.equipe.length - 3}</span>
          )}
        </div>

        {/* Prazo */}
        <span className={`text-[11px] flex items-center gap-1 ${
          urgencia === 'urgente' 
            ? 'text-rose-400' 
            : urgencia === 'alerta' 
              ? 'text-amber-400' 
              : urgencia === 'concluido'
                ? 'text-emerald-400'
                : 'text-slate-400'
        }`}>
          {urgencia === 'urgente' ? '⚠️' : urgencia === 'concluido' ? '✓' : <Calendar className="w-3 h-3" />}
          {urgencia === 'concluido' ? 'Concluído' : formatarData(projeto.data_fim)}
        </span>
      </div>
    </div>
  );
}

// Componente de Coluna Droppable
interface DroppableColumnProps {
  id: ProjetoStatus;
  children: React.ReactNode;
}

function DroppableColumn({ id, children }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div 
      ref={setNodeRef}
      className={`flex-1 p-3 space-y-3 overflow-y-auto min-h-[100px] transition-colors ${
        isOver ? 'bg-violet-500/10 ring-2 ring-violet-500/50 ring-inset rounded-lg' : ''
      }`}
    >
      {children}
    </div>
  );
}

// Componente de Card para DragOverlay (sem interatividade)
function CardOverlay({ projeto }: { projeto: Projeto }) {
  const progresso = projeto.progresso || 0;
  const totalTarefas = projeto.total_tarefas || 0;
  const tarefasConcluidas = projeto.tarefas_concluidas || 0;

  return (
    <div className="bg-slate-800 border-2 border-violet-500 rounded-xl p-4 shadow-2xl w-72 rotate-3">
      <div className="flex items-start justify-between mb-3">
        <span 
          className="text-[10px] font-semibold uppercase px-2 py-1 rounded"
          style={{ 
            backgroundColor: `${projeto.tipo?.cor || '#8b5cf6'}20`,
            color: projeto.tipo?.cor || '#8b5cf6'
          }}
        >
          {projeto.tipo?.nome || 'Projeto'}
        </span>
      </div>
      <h4 className="font-semibold text-white text-sm mb-3 line-clamp-2">
        {projeto.nome}
      </h4>
      <div className="mb-3">
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-1">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
            style={{ width: `${progresso}%` }}
          />
        </div>
        <span className="text-[11px] text-slate-400">{tarefasConcluidas}/{totalTarefas} tarefas</span>
      </div>
    </div>
  );
}

export function KanbanView({ unidadeSelecionada }: KanbanViewProps) {
  // Hooks de dados
  const { data: projetos, loading, refetch } = useProjetos(unidadeSelecionada);
  const { updateProjeto, loading: atualizando } = useUpdateProjeto();

  // Estados locais
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<ProjetoStatus | null>(null);
  const [projetoDetalhesId, setProjetoDetalhesId] = useState<number | null>(null);
  const [projetoParaEditar, setProjetoParaEditar] = useState<Projeto | null>(null);
  const [projetoParaExcluir, setProjetoParaExcluir] = useState<Projeto | null>(null);

  // Configuração dos sensores de drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Agrupar projetos por status
  const projetosPorStatus = colunas.reduce((acc, coluna) => {
    acc[coluna.id] = projetos.filter(p => p.status === coluna.id);
    return acc;
  }, {} as Record<ProjetoStatus, Projeto[]>);

  // Encontrar projeto ativo durante o drag
  const activeProjeto = activeId ? projetos.find(p => p.id === activeId) : null;

  // Handlers de drag
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      const overId = over.id;
      
      // Verificar se é uma coluna válida diretamente
      if (colunas.find(c => c.id === overId)) {
        setOverId(overId as ProjetoStatus);
        return;
      }
      
      // Se não é coluna, pode ser um card - encontrar a coluna do card
      const projetoOver = projetos.find(p => p.id === overId);
      if (projetoOver) {
        setOverId(projetoOver.status);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active } = event;
    const projetoId = active.id as number;
    const novoStatus = overId;
    
    setActiveId(null);
    setOverId(null);

    if (!novoStatus) return;

    // Encontrar o projeto
    const projeto = projetos.find(p => p.id === projetoId);
    if (!projeto || projeto.status === novoStatus) return;

    // Atualizar status no banco
    try {
      await updateProjeto(projetoId, { status: novoStatus });
      refetch();
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-320px)]">
          {colunas.map((coluna) => {
            const projetosColuna = projetosPorStatus[coluna.id] || [];
            
            return (
              <div 
                key={coluna.id}
                className="flex-shrink-0 w-80 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col max-h-[calc(100vh-320px)]"
              >
                {/* Header da Coluna */}
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${coluna.cor}`} />
                    <span className="font-semibold text-white text-sm">{coluna.titulo}</span>
                    <span className="px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-400">
                      {projetosColuna.length}
                    </span>
                  </div>
                </div>

                {/* Área de Drop */}
                <SortableContext
                  id={coluna.id}
                  items={projetosColuna.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <DroppableColumn id={coluna.id}>
                    {projetosColuna.length === 0 ? (
                      <div className="flex items-center justify-center h-20 border-2 border-dashed border-slate-700 rounded-lg text-slate-500 text-sm">
                        Arraste projetos aqui
                      </div>
                    ) : (
                      projetosColuna.map((projeto) => (
                        <SortableCard
                          key={projeto.id}
                          projeto={projeto}
                          onVerDetalhes={setProjetoDetalhesId}
                          onEditar={setProjetoParaEditar}
                          onExcluir={setProjetoParaExcluir}
                          isConcluido={coluna.id === 'concluido'}
                        />
                      ))
                    )}
                  </DroppableColumn>
                </SortableContext>
              </div>
            );
          })}
        </div>

        {/* Overlay durante o drag */}
        <DragOverlay>
          {activeProjeto ? <CardOverlay projeto={activeProjeto} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Indicador de atualização */}
      {atualizando && (
        <div className="fixed bottom-4 right-4 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 flex items-center gap-2 shadow-xl z-50">
          <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
          <span className="text-sm text-white">Atualizando...</span>
        </div>
      )}

      {/* Modais */}
      <ModalDetalhesProjeto
        isOpen={!!projetoDetalhesId}
        projetoId={projetoDetalhesId}
        onClose={() => setProjetoDetalhesId(null)}
        onSuccess={refetch}
      />

      <ModalEditarProjeto
        isOpen={!!projetoParaEditar}
        projeto={projetoParaEditar}
        onClose={() => setProjetoParaEditar(null)}
        onSuccess={refetch}
        onDelete={(p) => {
          setProjetoParaEditar(null);
          setProjetoParaExcluir(p);
        }}
      />

      <ModalConfirmarExclusao
        isOpen={!!projetoParaExcluir}
        projeto={projetoParaExcluir}
        onClose={() => setProjetoParaExcluir(null)}
        onSuccess={refetch}
      />
    </>
  );
}

export default KanbanView;
