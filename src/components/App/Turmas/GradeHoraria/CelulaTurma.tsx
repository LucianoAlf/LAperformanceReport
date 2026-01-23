import React from 'react';
import { Users, GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TurmaGrade } from './types';
import { gerarCorPorId } from '@/lib/horarios';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

interface CelulaTurmaProps {
  turma: TurmaGrade;
  onClick: () => void;
  draggable?: boolean;
}

export function CelulaTurma({ turma, onClick, draggable = false }: CelulaTurmaProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: `turma-${turma.id}`,
    data: { turma },
    disabled: !draggable
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  // Calcular ocupação
  const ocupacao = turma.sala_capacidade > 0 
    ? (turma.num_alunos / turma.sala_capacidade) * 100 
    : 0;

  // Cor baseada na ocupação
  const corOcupacao = ocupacao >= 90 
    ? 'bg-red-500/20 border-red-500/50 hover:bg-red-500/30' 
    : ocupacao >= 70 
      ? 'bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/30'
      : 'bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/30';

  // Cor do professor (consistente)
  const corProfessor = gerarCorPorId(turma.professor_id);

  // Handler para clique - só dispara se não estiver arrastando
  const handleClick = (e: React.MouseEvent) => {
    if (!isDragging) {
      onClick();
    }
  };

  return (
    <Tooltip 
      content={`${turma.professor_nome} - ${turma.sala_nome} (${turma.horario_inicio} - ${turma.horario_fim})`}
      side="top"
    >
      <div
        ref={setNodeRef}
        style={style}
        {...(draggable ? { ...attributes, ...listeners } : {})}
        className={cn(
          'w-full p-1.5 rounded-lg border text-left transition-all relative group',
          corOcupacao,
          'hover:scale-[1.02] hover:shadow-lg',
          'focus:outline-none focus:ring-2 focus:ring-violet-500/50',
          isDragging && 'opacity-50 scale-95 z-50',
          draggable && 'cursor-grab active:cursor-grabbing touch-none'
        )}
        onClick={handleClick}
      >
      {/* Indicador de arraste ativo */}
      {draggable && (
        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 opacity-40 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-slate-400" />
        </div>
      )}

      {/* Conteúdo */}
      <div className={cn(draggable && 'pl-2')}>
        {/* Nome do professor */}
        <div className="text-xs font-medium text-white truncate">
          {turma.professor_nome?.split(' ')[0] || 'Professor'}
        </div>

        {/* Sala e ocupação */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-[10px] text-slate-400 truncate">
            {turma.sala_nome}
          </span>
          <div className="flex items-center gap-0.5 text-[10px]">
            <Users className="w-3 h-3 text-slate-400" />
            <span className={cn(
              'font-medium',
              ocupacao >= 90 ? 'text-red-400' :
              ocupacao >= 70 ? 'text-amber-400' :
              'text-emerald-400'
            )}>
              {turma.num_alunos}/{turma.sala_capacidade}
            </span>
          </div>
        </div>

        {/* Curso (se houver) */}
        {turma.curso_nome && (
          <div className="text-[10px] text-slate-500 truncate mt-0.5">
            {turma.curso_nome}
          </div>
        )}
      </div>
      </div>
    </Tooltip>
  );
}

export default CelulaTurma;
