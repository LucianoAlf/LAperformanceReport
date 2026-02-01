// Slot de horário droppable na grade

import { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface SlotHorarioProps {
  id: string;
  dia: string;
  horario: string;
  children?: ReactNode;
  ocupado?: boolean;
  disabled?: boolean;
}

export function SlotHorario({ 
  id, 
  dia, 
  horario, 
  children, 
  ocupado = false,
  disabled = false 
}: SlotHorarioProps) {
  const { isOver, setNodeRef, active } = useDroppable({
    id,
    data: { dia, horario },
    disabled
  });

  // Determinar estilo baseado no estado
  const isDragging = !!active;
  // Permitir drop em qualquer slot quando drag está habilitado
  const isValidDrop = isDragging && !disabled;
  const isInvalidDrop = isDragging && disabled;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[60px] p-1 transition-all duration-200 rounded-lg border',
        // Estado normal
        !isDragging && 'border-transparent',
        // Arrastando - slot válido
        isValidDrop && !isOver && 'border-dashed border-emerald-500/30 bg-emerald-500/5',
        // Arrastando - hover em slot válido
        isValidDrop && isOver && 'border-solid border-emerald-500 bg-emerald-500/20 scale-[1.02]',
        // Arrastando - slot inválido (ocupado)
        isInvalidDrop && 'border-dashed border-red-500/30 bg-red-500/5',
        // Arrastando - hover em slot inválido
        isInvalidDrop && isOver && 'border-solid border-red-500 bg-red-500/20'
      )}
      style={{ pointerEvents: 'auto' }}
    >
      {children}
      
      {/* Indicador de drop */}
      {isOver && isValidDrop && (
        <div className="flex items-center justify-center h-full min-h-[40px] text-emerald-400 text-xs font-medium">
          Soltar aqui
        </div>
      )}
      
      {isOver && isInvalidDrop && (
        <div className="flex items-center justify-center h-full min-h-[40px] text-red-400 text-xs font-medium">
          Slot ocupado
        </div>
      )}
    </div>
  );
}
