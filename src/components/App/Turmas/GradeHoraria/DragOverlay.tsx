// Overlay visual durante o arraste de uma turma

import { DragOverlay as DndDragOverlay } from '@dnd-kit/core';
import type { TurmaGrade } from './types';

interface DragOverlayProps {
  turma: TurmaGrade | null;
}

export function DragOverlay({ turma }: DragOverlayProps) {
  if (!turma) return null;

  return (
    <DndDragOverlay dropAnimation={{
      duration: 200,
      easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
    }}>
      <div className="bg-slate-800 border-2 border-cyan-500 rounded-lg p-2 shadow-2xl shadow-cyan-500/20 cursor-grabbing opacity-90 transform scale-105">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎵</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {turma.professor_nome?.split(' ')[0] || 'Professor'}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {turma.curso_nome || 'Curso'}
            </p>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <span>📍 {turma.sala_nome || 'A definir'}</span>
          <span>•</span>
          <span>{turma.num_alunos || 0}/{turma.sala_capacidade || 4}</span>
        </div>
      </div>
    </DndDragOverlay>
  );
}
