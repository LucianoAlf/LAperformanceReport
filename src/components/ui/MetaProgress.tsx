import { cn, formatCurrency } from '@/lib/utils';

interface MetaProgressProps {
  current: number;
  target: number;
  label?: string;
  showPercentage?: boolean;
  showValues?: boolean;
  format?: 'number' | 'currency' | 'percent';
  color?: 'cyan' | 'green' | 'red' | 'yellow' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function formatValue(value: number, format: 'number' | 'currency' | 'percent'): string {
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'number':
    default:
      return value.toLocaleString('pt-BR');
  }
}

export function MetaProgress({
  current,
  target,
  label,
  showPercentage = true,
  showValues = true,
  format = 'number',
  color = 'auto',
  size = 'md',
  className,
}: MetaProgressProps) {
  const percent = target > 0 ? (current / target) * 100 : 0;
  const clampedPercent = Math.min(percent, 100);

  // Cor automática baseada no progresso
  const getBarColor = () => {
    if (color !== 'auto') {
      const colorMap = {
        cyan: 'bg-cyan-500',
        green: 'bg-emerald-500',
        red: 'bg-rose-500',
        yellow: 'bg-amber-500',
      };
      return colorMap[color];
    }
    
    // Cores automáticas baseadas no percentual
    if (percent >= 100) return 'bg-emerald-500';
    if (percent >= 80) return 'bg-cyan-500';
    if (percent >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // Tamanhos
  const barHeights = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const textSizes = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Label e Percentual */}
      {(label || showPercentage) && (
        <div className={cn(
          "flex items-center justify-between mb-1.5",
          textSizes[size]
        )}>
          {label && (
            <span className="text-slate-300 font-medium truncate">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className={cn(
              "font-bold ml-2",
              percent >= 100 ? 'text-emerald-400' :
              percent >= 80 ? 'text-cyan-400' :
              percent >= 50 ? 'text-amber-400' :
              'text-rose-400'
            )}>
              {percent.toFixed(0)}%
            </span>
          )}
        </div>
      )}

      {/* Barra de Progresso */}
      <div className={cn(
        "w-full bg-slate-700/50 rounded-full overflow-hidden",
        barHeights[size]
      )}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            getBarColor()
          )}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>

      {/* Valores */}
      {showValues && (
        <div className={cn(
          "flex items-center justify-between mt-1",
          textSizes[size],
          "text-slate-500"
        )}>
          <span>{formatValue(current, format)}</span>
          <span>/ {formatValue(target, format)}</span>
        </div>
      )}
    </div>
  );
}

export default MetaProgress;
