import { LucideIcon, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

interface ComparativoProps {
  valor: number;
  label: string; // Ex: "Dez/25" ou "Jan/25"
}

interface KPICardProps {
  title?: string;
  label?: string;
  icon?: LucideIcon;
  value: string | number;
  previousValue?: number;
  target?: number;
  format?: 'number' | 'currency' | 'percent';
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trendIsGood?: boolean;
  subvalue?: string;
  variant?: 'default' | 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose' | 'green' | 'red' | 'yellow' | 'purple';
  color?: 'cyan' | 'green' | 'red' | 'yellow' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
  // Novos comparativos
  comparativoMesAnterior?: ComparativoProps;
  comparativoAnoAnterior?: ComparativoProps;
  inverterCor?: boolean; // Para métricas onde menor é melhor (evasões, churn, etc.)
}

const colorMap: Record<string, string> = {
  default: 'from-slate-500 to-slate-600',
  cyan: 'from-cyan-500 to-cyan-600',
  emerald: 'from-emerald-500 to-emerald-600',
  green: 'from-emerald-500 to-emerald-600',
  violet: 'from-violet-500 to-violet-600',
  purple: 'from-violet-500 to-violet-600',
  amber: 'from-amber-500 to-amber-600',
  yellow: 'from-amber-500 to-amber-600',
  rose: 'from-rose-500 to-rose-600',
  red: 'from-rose-500 to-rose-600',
};

function formatValue(value: number | string, format?: 'number' | 'currency' | 'percent'): string {
  if (typeof value === 'string') return value;
  
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

function calculateTrend(current: number, previous: number): { trend: 'up' | 'down' | 'neutral'; diff: number; percent: number } {
  const diff = current - previous;
  const percent = previous !== 0 ? (diff / previous) * 100 : 0;
  const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
  return { trend, diff, percent };
}

export function KPICard({ 
  title,
  label,
  icon: Icon, 
  value, 
  previousValue,
  target,
  format = 'number',
  trend: propTrend,
  trendValue: propTrendValue,
  trendIsGood = true,
  subvalue, 
  variant = 'default',
  color,
  size = 'md',
  onClick,
  className,
  comparativoMesAnterior,
  comparativoAnoAnterior,
  inverterCor = false,
}: KPICardProps) {
  const displayLabel = title || label || '';
  const effectiveVariant = color || variant;
  
  // Calcular tendência automaticamente se previousValue fornecido
  let trend = propTrend;
  let trendValue = propTrendValue;
  let trendPercent = 0;
  
  if (previousValue !== undefined && typeof value === 'number') {
    const calc = calculateTrend(value, previousValue);
    trend = calc.trend;
    trendPercent = calc.percent;
    trendValue = `${calc.diff >= 0 ? '+' : ''}${formatValue(calc.diff, format)} (${Math.abs(calc.percent).toFixed(1)}%)`;
  }

  // Determinar cor da tendência
  const getTrendColor = () => {
    if (trend === 'neutral') return 'text-slate-400';
    const isPositive = trend === 'up';
    if (trendIsGood) {
      return isPositive ? 'text-emerald-400' : 'text-rose-400';
    } else {
      return isPositive ? 'text-rose-400' : 'text-emerald-400';
    }
  };

  // Calcular progresso da meta
  const metaPercent = target && typeof value === 'number' ? (value / target) * 100 : null;
  const getMetaColor = () => {
    if (!metaPercent) return 'bg-slate-600';
    if (metaPercent >= 100) return 'bg-emerald-500';
    if (metaPercent >= 80) return 'bg-cyan-500';
    if (metaPercent >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // Tamanhos
  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4 md:p-5',
    lg: 'p-5 md:p-6',
  };

  const valueSizeClasses = {
    sm: 'text-lg',
    md: 'text-xl md:text-2xl',
    lg: 'text-2xl md:text-3xl',
  };

  const iconSizeClasses = {
    sm: 16,
    md: 18,
    lg: 22,
  };

  return (
    <div 
      className={cn(
        "bg-slate-800/50 border border-slate-700/50 rounded-2xl",
        "hover:border-slate-600/50 transition-all duration-300",
        sizeClasses[size],
        onClick && "cursor-pointer hover:bg-slate-800/70",
        className
      )}
      onClick={onClick}
    >
      {/* Header com ícone e info */}
      <div className="flex items-start justify-between mb-2 md:mb-3">
        {Icon && (
          <div className={cn(
            "p-2 md:p-2.5 rounded-xl bg-gradient-to-br text-white shadow-lg shadow-black/20",
            colorMap[effectiveVariant]
          )}>
            <Icon size={iconSizeClasses[size]} />
          </div>
        )}
        
        {/* Tendência */}
        {trend && trendValue && size !== 'sm' && (
          <div className={cn(
            "flex items-center gap-1 text-[10px] md:text-xs font-medium",
            getTrendColor()
          )}>
            {trend === 'up' && <TrendingUp size={12} />}
            {trend === 'down' && <TrendingDown size={12} />}
            {trend === 'neutral' && <Minus size={12} />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>

      {/* Valor principal */}
      <div className={cn(
        "font-bold text-white mb-0.5 md:mb-1 truncate leading-tight",
        valueSizeClasses[size]
      )}>
        {typeof value === 'number' ? formatValue(value, format) : value}
      </div>

      {/* Label */}
      <div className={cn(
        "text-slate-400 truncate font-medium",
        size === 'sm' ? 'text-[10px] uppercase tracking-wider' : 'text-xs md:text-sm'
      )}>
        {displayLabel}
      </div>

      {/* Subvalue */}
      {subvalue && !comparativoMesAnterior && !comparativoAnoAnterior && (
        <div className="text-[9px] md:text-xs text-slate-500 mt-1 truncate">
          {subvalue}
        </div>
      )}

      {/* Comparativos Mês Anterior e Ano Anterior */}
      {(comparativoMesAnterior || comparativoAnoAnterior) && typeof value === 'number' && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {/* vs Mês Anterior */}
            {comparativoMesAnterior && (
              <div className="text-center">
                <div className="text-slate-500 mb-0.5">vs Mês Anterior</div>
                {(() => {
                  const diff = value - comparativoMesAnterior.valor;
                  const pct = comparativoMesAnterior.valor !== 0 
                    ? ((diff / comparativoMesAnterior.valor) * 100) 
                    : 0;
                  const isPositive = diff > 0;
                  const corPositiva = inverterCor ? 'text-rose-400' : 'text-emerald-400';
                  const corNegativa = inverterCor ? 'text-emerald-400' : 'text-rose-400';
                  const cor = diff === 0 ? 'text-slate-400' : (isPositive ? corPositiva : corNegativa);
                  return (
                    <>
                      <div className={cn("font-semibold flex items-center justify-center gap-0.5", cor)}>
                        {isPositive ? <TrendingUp size={10} /> : diff < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                        {isPositive ? '+' : ''}{pct.toFixed(1)}%
                      </div>
                      <div className="text-slate-600">({comparativoMesAnterior.label})</div>
                    </>
                  );
                })()}
              </div>
            )}
            {/* vs Ano Anterior */}
            {comparativoAnoAnterior && (
              <div className="text-center">
                <div className="text-slate-500 mb-0.5">vs Ano Anterior</div>
                {(() => {
                  const diff = value - comparativoAnoAnterior.valor;
                  const pct = comparativoAnoAnterior.valor !== 0 
                    ? ((diff / comparativoAnoAnterior.valor) * 100) 
                    : 0;
                  const isPositive = diff > 0;
                  const corPositiva = inverterCor ? 'text-rose-400' : 'text-emerald-400';
                  const corNegativa = inverterCor ? 'text-emerald-400' : 'text-rose-400';
                  const cor = diff === 0 ? 'text-slate-400' : (isPositive ? corPositiva : corNegativa);
                  return (
                    <>
                      <div className={cn("font-semibold flex items-center justify-center gap-0.5", cor)}>
                        {isPositive ? <TrendingUp size={10} /> : diff < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                        {isPositive ? '+' : ''}{pct.toFixed(1)}%
                      </div>
                      <div className="text-slate-600">({comparativoAnoAnterior.label})</div>
                    </>
                  );
                })()}
              </div>
            )}
            {/* Se só tem um comparativo, mostrar N/A no outro */}
            {comparativoMesAnterior && !comparativoAnoAnterior && (
              <div className="text-center">
                <div className="text-slate-500 mb-0.5">vs Ano Anterior</div>
                <div className="text-slate-600 font-medium">N/A</div>
              </div>
            )}
            {!comparativoMesAnterior && comparativoAnoAnterior && (
              <div className="text-center">
                <div className="text-slate-500 mb-0.5">vs Mês Anterior</div>
                <div className="text-slate-600 font-medium">N/A</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra de meta (apenas size lg) */}
      {target && metaPercent !== null && size === 'lg' && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
            <span>Meta: {formatValue(target, format)}</span>
            <span>{metaPercent.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className={cn("h-full rounded-full transition-all duration-500", getMetaColor())}
              style={{ width: `${Math.min(metaPercent, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default KPICard;
