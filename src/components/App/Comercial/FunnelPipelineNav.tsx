import { cn } from '@/lib/utils';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  icon: LucideIcon;
  color: string;
  gradient: string;
}

interface FunnelPipelineNavProps {
  stages: FunnelStage[];
  activeStage: string;
  onStageClick: (key: string) => void;
}

export function FunnelPipelineNav({ stages, activeStage, onStageClick }: FunnelPipelineNavProps) {
  // Total do pipeline = soma de todos os stages
  const totalCount = stages.reduce((sum, s) => sum + s.count, 0);
  // Base do funil é a primeira etapa (Novos) — usada para % relativas
  const baseCount = stages[0]?.count || 0;

  return (
    <div className="space-y-4">
      {/* Header com total */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Pipeline</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-white">
            {totalCount} leads
          </span>
        </div>
      </div>

      {/* Pipeline horizontal */}
      <div className="flex items-stretch gap-1 md:gap-2">
        {stages.map((stage, index) => {
          const isActive = activeStage === stage.key;
          // Porcentagem relativa à base (primeira etapa)
          const pctOfBase = baseCount > 0 ? (stage.count / baseCount * 100) : 0;
          const Icon = stage.icon;

          return (
            <div key={stage.key} className="flex items-stretch flex-1 min-w-0">
              {/* Seta de conversão (antes da etapa, exceto a primeira) */}
              {index > 0 && (
                <div className="flex items-center justify-center px-1 md:px-2 shrink-0">
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              )}

              {/* Card da etapa */}
              <button
                onClick={() => onStageClick(stage.key)}
                className={cn(
                  "flex-1 min-w-0 rounded-xl px-3 py-3 transition-all cursor-pointer text-left relative overflow-hidden",
                  isActive
                    ? `bg-gradient-to-r ${stage.gradient} shadow-lg shadow-${stage.color}/20`
                    : "bg-slate-800/80 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-750/80"
                )}
              >
                {/* Ícone + Label */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    isActive ? "text-white/90" : "text-slate-400"
                  )} />
                  <span className={cn(
                    "text-xs font-medium truncate",
                    isActive ? "text-white/90" : "text-slate-400"
                  )}>
                    {stage.label}
                  </span>
                </div>

                {/* Contagem */}
                <div className={cn(
                  "text-2xl font-bold leading-none",
                  isActive ? "text-white" : "text-white"
                )}>
                  {stage.count}
                </div>

                {/* % do total (relativo à base) */}
                <div className={cn(
                  "text-[10px] mt-1",
                  isActive ? "text-white/60" : "text-slate-500"
                )}>
                  {pctOfBase > 0 ? `${pctOfBase.toFixed(1)}% do total` : '—'}
                </div>

                {/* Barra de preenchimento */}
                <div className={cn(
                  "h-[3px] rounded-full mt-2",
                  isActive ? "bg-white/20" : "bg-slate-700"
                )}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(pctOfBase, 2)}%`,
                      backgroundColor: isActive ? 'rgba(255,255,255,0.5)' : stage.color,
                    }}
                  />
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FunnelPipelineNav;
