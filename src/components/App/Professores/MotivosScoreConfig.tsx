import React, { useState } from 'react';
import { ChevronUp, ChevronDown, DoorOpen, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useMotivosScoreProfessor } from '@/hooks/useMotivosScoreProfessor';

const CATEGORIA_LABELS: Record<string, string> = {
  financeiro: 'Financeiro',
  tempo: 'Tempo',
  mudanca: 'Mudança',
  saude: 'Saúde',
  desistencia: 'Desistência',
  estudos: 'Estudos',
  inadimplencia: 'Inadimplência',
  outro: 'Outro',
};

export const MotivosScoreConfig: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { motivos, loading, toggleMotivo } = useMotivosScoreProfessor();

  const contam = motivos.filter(m => m.conta_score_professor).length;
  const total = motivos.length;

  return (
    <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <DoorOpen className="w-5 h-5 text-red-400" />
          <h3 className="font-semibold text-white text-sm">
            Evasões que Contam no Score do Professor
          </h3>
          <span className="text-xs text-slate-500">
            {contam}/{total} motivos ativos
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-3">
          <p className="text-xs text-slate-500">
            Motivos desativados não penalizam o professor no Health Score e nível de risco.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : (
            <div className="space-y-1">
              {motivos.map(motivo => (
                <div
                  key={motivo.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${motivo.conta_score_professor ? 'text-white' : 'text-slate-500'}`}>
                      {motivo.nome}
                    </span>
                    {motivo.categoria && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 uppercase tracking-wide">
                        {CATEGORIA_LABELS[motivo.categoria] || motivo.categoria}
                      </span>
                    )}
                  </div>
                  <Switch
                    checked={motivo.conta_score_professor}
                    onCheckedChange={(checked) => toggleMotivo(motivo.id, checked)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MotivosScoreConfig;
