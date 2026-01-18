import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

interface TrendIndicatorProps {
  value: number;
  previousValue?: number;
  format?: 'number' | 'percent' | 'currency';
  isGoodWhenUp?: boolean;
  showIcon?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

function formatValue(value: number, format: 'number' | 'percent' | 'currency'): string {
  switch (format) {
    case 'currency':
      return formatCurrency(Math.abs(value));
    case 'percent':
      return `${Math.abs(value).toFixed(1)}%`;
    case 'number':
    default:
      return Math.abs(value).toLocaleString('pt-BR');
  }
}

export function TrendIndicator({
  value,
  previousValue,
  format = 'number',
  isGoodWhenUp = true,
  showIcon = true,
  size = 'sm',
  className,
}: TrendIndicatorProps) {
  // Calcular diferença e percentual se previousValue fornecido
  let displayValue = value;
  let percentChange = 0;
  
  if (previousValue !== undefined && previousValue !== 0) {
    displayValue = value - previousValue;
    percentChange = ((value - previousValue) / previousValue) * 100;
  }

  // Determinar direção
  const isUp = displayValue > 0;
  const isDown = displayValue < 0;
  const isNeutral = displayValue === 0;

  // Determinar cor baseado na direção e se é bom quando sobe
  const getColor = () => {
    if (isNeutral) return 'text-slate-400';
    if (isGoodWhenUp) {
      return isUp ? 'text-emerald-400' : 'text-rose-400';
    } else {
      return isUp ? 'text-rose-400' : 'text-emerald-400';
    }
  };

  // Tamanhos
  const sizeClasses = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
  };

  const iconSizes = {
    xs: 10,
    sm: 12,
    md: 14,
  };

  // Formatar texto de exibição
  const prefix = isUp ? '+' : isDown ? '-' : '';
  const formattedValue = formatValue(displayValue, format);
  const percentText = previousValue !== undefined ? ` (${Math.abs(percentChange).toFixed(1)}%)` : '';

  return (
    <div className={cn(
      "inline-flex items-center gap-1 font-medium",
      sizeClasses[size],
      getColor(),
      className
    )}>
      {showIcon && (
        <>
          {isUp && <TrendingUp size={iconSizes[size]} />}
          {isDown && <TrendingDown size={iconSizes[size]} />}
          {isNeutral && <Minus size={iconSizes[size]} />}
        </>
      )}
      <span>
        {prefix}{formattedValue}{percentText}
      </span>
    </div>
  );
}

export default TrendIndicator;
