import { Calendar } from 'lucide-react';

interface CalendarioViewProps {
  unidadeSelecionada: string;
}

export function CalendarioView({ unidadeSelecionada }: CalendarioViewProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-20 h-20 rounded-2xl bg-violet-500/20 flex items-center justify-center mx-auto mb-6">
          <Calendar className="w-10 h-10 text-violet-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">Visualização de Calendário</h3>
        <p className="text-slate-400 mb-6">
          Similar ao calendário da Agenda de Professores, mas focado em prazos de projetos e tarefas.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg text-sm text-slate-400">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Será implementado na Fase 7
        </div>
      </div>
    </div>
  );
}

export default CalendarioView;
