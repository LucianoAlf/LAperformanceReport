import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

interface ComparativoProps {
  valor: number;
  label: string; // Ex: "Dez/25" ou "Jan/25"
}

export interface KPICardProps {
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
  // Meta inversa (onde menor é melhor - churn, inadimplência)
  metaInversa?: boolean;
  // Mostrar barra de progresso (default: true se target definido)
  showProgress?: boolean;
  // Atributo data-tour para onboarding
  dataTour?: string;
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

const iconBgMap: Record<string, string> = {
  default: 'bg-slate-500/20',
  cyan: 'bg-cyan-500/20',
  emerald: 'bg-emerald-500/20',
  green: 'bg-emerald-500/20',
  violet: 'bg-violet-500/20',
  purple: 'bg-violet-500/20',
  amber: 'bg-amber-500/20',
  yellow: 'bg-amber-500/20',
  rose: 'bg-rose-500/20',
  red: 'bg-rose-500/20',
};

const iconColorMap: Record<string, string> = {
  default: 'text-slate-400',
  cyan: 'text-cyan-400',
  emerald: 'text-emerald-400',
  green: 'text-emerald-400',
  violet: 'text-violet-400',
  purple: 'text-violet-400',
  amber: 'text-amber-400',
  yellow: 'text-amber-400',
  rose: 'text-rose-400',
  red: 'text-rose-400',
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
  metaInversa = false,
  showProgress = true,
  dataTour,
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

  // Calcular progresso da meta (suporta metas inversas)
  const calcularProgressoMeta = () => {
    if (!target || typeof value !== 'number') return null;
    
    if (metaInversa) {
      // Meta inversa: valor atual deve ser MENOR que o target (ex: Churn 2% meta máxima 3%)
      // Se valor <= target: atingiu (100%+)
      // Se valor > target: não atingiu (proporcional inverso)
      if (value <= target) {
        // Quanto menor, melhor. Se valor = 0, é 100% de sucesso
        // Se valor = target, é exatamente no limite (100%)
        return 100;
      } else {
        // Ultrapassou a meta máxima - calcula quanto passou
        // Ex: meta 3%, valor 4.5% = 150% do limite (ruim)
        return Math.max(0, 100 - ((value - target) / target) * 100);
      }
    } else {
      // Meta normal: valor atual deve ser MAIOR ou igual ao target
      return (value / target) * 100;
    }
  };
  
  const metaPercent = calcularProgressoMeta();
  
  const getMetaColor = () => {
    if (metaPercent === null) return 'bg-slate-600';
    
    if (metaInversa) {
      // Para metas inversas: verde se está abaixo/igual, vermelho se ultrapassou
      if (metaPercent >= 100) return 'bg-emerald-500';
      if (metaPercent >= 70) return 'bg-amber-500';
      return 'bg-rose-500';
    } else {
      // Meta normal
      if (metaPercent >= 100) return 'bg-emerald-500';
      if (metaPercent >= 80) return 'bg-cyan-500';
      if (metaPercent >= 50) return 'bg-amber-500';
      return 'bg-rose-500';
    }
  };
  
  // Largura da barra (para metas inversas, mostra quanto "consumiu" do limite)
  const getBarWidth = () => {
    if (metaPercent === null) return 0;
    if (metaInversa) {
      // Mostra quanto do limite foi usado (valor/target * 100)
      const usado = typeof value === 'number' ? (value / target!) * 100 : 0;
      return Math.min(usado, 100);
    }
    return Math.min(metaPercent, 100);
  };

  // Tamanhos
  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4 md:p-5',
    lg: 'p-5 md:p-6',
  };

  const valueSizeClasses = {
    sm: 'text-2xl',
    md: 'text-2xl md:text-3xl',
    lg: 'text-4xl md:text-5xl',
  };

  const iconSizeClasses = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  // Calcular comparativos
  const calcComparativo = (comparativo: ComparativoProps | undefined) => {
    if (!comparativo || typeof value !== 'number') return null;
    const diff = value - comparativo.valor;
    const pct = comparativo.valor !== 0 ? ((diff / comparativo.valor) * 100) : 0;
    const isPositive = diff > 0;
    const corPositiva = inverterCor ? 'text-rose-400' : 'text-emerald-400';
    const corNegativa = inverterCor ? 'text-emerald-400' : 'text-rose-400';
    const cor = diff === 0 ? 'text-slate-400' : (isPositive ? corPositiva : corNegativa);
    return { diff, pct, isPositive, cor };
  };

  const compMes = calcComparativo(comparativoMesAnterior);
  const compAno = calcComparativo(comparativoAnoAnterior);
  const hasComparativos = compMes || compAno;

  return (
    <div 
      data-tour={dataTour}
      className={cn(
        "bg-slate-800/50 border border-slate-700/50 rounded-2xl",
        "hover:border-slate-600/50 transition-all duration-300",
        sizeClasses[size],
        onClick && "cursor-pointer hover:bg-slate-800/70",
        className
      )}
      onClick={onClick}
    >
      {/* Header: Título + Ícone (alinhados) */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className={cn(
            "font-medium text-slate-400 mb-1",
            size === 'sm' ? 'text-[10px]' : 'text-xs'
          )}>
            {displayLabel}
          </div>
          {/* Valor + Meta na mesma linha */}
          <div className="flex items-baseline gap-2">
            <span className={cn(
              "font-bold text-white leading-none",
              valueSizeClasses[size]
            )}>
              {typeof value === 'number' ? formatValue(value, format) : value}
            </span>
            {target && (
              <span className="text-lg text-slate-500">
                / {formatValue(target, format)}
              </span>
            )}
          </div>
        </div>
        {Icon && (
          <div className={cn(
            "p-2 rounded-xl",
            iconBgMap[effectiveVariant]
          )}>
            <Icon size={iconSizeClasses[size]} className={iconColorMap[effectiveVariant]} />
          </div>
        )}
      </div>

      {/* Barra de progresso com percentual */}
      {target && metaPercent !== null && showProgress && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-3 bg-slate-700/60 rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all duration-500", getMetaColor())}
                style={{ width: `${getBarWidth()}%` }}
              />
            </div>
            <span className={cn(
              "text-sm font-bold tabular-nums min-w-[3rem] text-right",
              metaPercent >= 100 ? 'text-emerald-400' : 
              metaPercent >= 80 ? 'text-cyan-400' : 
              metaPercent >= 50 ? 'text-amber-400' : 'text-rose-400'
            )}>
              {metaPercent.toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Subvalue (quando não tem meta) */}
      {subvalue && !target && (
        <div className="text-xs text-slate-500 mb-2">
          {subvalue}
        </div>
      )}

      {/* Comparativos no rodapé */}
      {hasComparativos && typeof value === 'number' && (
        <div className="flex gap-4 pt-2 border-t border-slate-700/50">
          {compMes && comparativoMesAnterior && (
            <div className="flex items-center gap-1">
              <span className={cn("font-semibold text-xs flex items-center gap-0.5", compMes.cor)}>
                {compMes.isPositive ? <TrendingUp size={10} /> : compMes.pct < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                {compMes.isPositive ? '+' : ''}{compMes.pct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500">{comparativoMesAnterior.label}</span>
            </div>
          )}
          {compAno && comparativoAnoAnterior && (
            <div className="flex items-center gap-1">
              <span className={cn("font-semibold text-xs flex items-center gap-0.5", compAno.cor)}>
                {compAno.isPositive ? <TrendingUp size={10} /> : compAno.pct < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                {compAno.isPositive ? '+' : ''}{compAno.pct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500">{comparativoAnoAnterior.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default KPICard;
