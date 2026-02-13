import { cn } from '@/lib/utils';

interface FunnelStep {
  label: string;
  shortLabel?: string;
  value: number;
  color: string;
  subLabel?: string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  title?: string;
  className?: string;
}

export function FunnelChart({ steps, title, className }: FunnelChartProps) {
  if (steps.length === 0) {
    return (
      <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
        {title && <h3 className="text-lg font-bold text-white mb-4">{title}</h3>}
        <div className="flex items-center justify-center h-48 text-slate-500">
          Sem dados para exibir
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...steps.map(s => s.value));

  return (
    <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6", className)}>
      {title && <h3 className="text-lg font-bold text-white mb-6">{title}</h3>}
      
      <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          
          return (
            <div key={index} className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
              {/* Step Box */}
              <div className="flex-1 md:flex-none text-center">
                <div 
                  className="rounded-2xl px-3 py-3 border transition-all hover:scale-105"
                  style={{ 
                    backgroundColor: `${step.color}20`,
                    borderColor: `${step.color}50`,
                    minWidth: '100px'
                  }}
                >
                  <div 
                    className="text-2xl md:text-3xl font-bold"
                    style={{ color: step.color }}
                  >
                    {step.value}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 leading-tight">{step.label}</div>
                  {step.subLabel && (
                    <div className="text-xs text-slate-500 mt-1">{step.subLabel}</div>
                  )}
                </div>
              </div>
              
              {/* Arrow */}
              {!isLast && (
                <div className="hidden md:block text-slate-600 text-xl">→</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Conversion rates */}
      <div className="mt-5 flex justify-center gap-4 md:gap-6 flex-wrap">
        {steps.slice(1).map((step, index) => {
          const prevValue = steps[index].value;
          const conversionRate = prevValue > 0 ? ((step.value / prevValue) * 100).toFixed(1) : '0';
          
          return (
            <div key={index} className="text-center">
              <div className="text-[10px] md:text-xs text-slate-500 leading-tight">
                {steps[index].shortLabel || steps[index].label} → {step.shortLabel || step.label}
              </div>
              <div className="text-sm font-bold text-slate-300">
                {conversionRate}%
              </div>
            </div>
          );
        })}
        
        {/* Conversão direta Leads → Matrículas (se houver 3 etapas) */}
        {steps.length === 3 && (
          <div className="text-center">
            <div className="text-xs text-slate-500">
              {steps[0].label} → {steps[2].label}
            </div>
            <div className="text-sm font-bold text-cyan-400">
              {steps[0].value > 0 ? ((steps[2].value / steps[0].value) * 100).toFixed(1) : '0'}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FunnelChart;
