import { AreaChart as RechartsAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';

interface AreaChartProps {
  data: any[];
  title?: string;
  className?: string;
  dataKey: string;
  name: string;
  color: string;
  formatValue?: (value: number) => string;
  showAverage?: boolean;
  averageLabel?: string;
}

export function AreaChart({ 
  data, 
  title, 
  className,
  dataKey,
  name,
  color,
  formatValue = (value) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  showAverage = false,
  averageLabel = 'Média'
}: AreaChartProps) {
  // Calcular média se showAverage for true
  const average = showAverage && data.length > 0
    ? data.reduce((acc, item) => acc + (Number(item[dataKey]) || 0), 0) / data.length
    : 0;
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium mb-1">{payload[0].payload.name}</p>
          <p className="text-sm" style={{ color: color }}>
            {name}: <span className="font-bold">{formatValue(payload[0].value)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50', className)}>
      {title && (
        <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <RechartsAreaChart data={data} style={{ backgroundColor: 'transparent' }}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="name" 
            stroke="#94a3b8"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#94a3b8"
            style={{ fontSize: '12px' }}
            tickFormatter={formatValue}
          />
          <Tooltip 
            content={<CustomTooltip />}
            cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '5 5' }}
          />
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill={`url(#gradient-${dataKey})`}
          />
          {showAverage && average > 0 && (
            <ReferenceLine 
              y={average} 
              stroke="#ef4444" 
              strokeDasharray="5 5" 
              strokeWidth={2}
              label={{
                value: `${averageLabel}: ${formatValue(average)}`,
                position: 'right',
                fill: '#ef4444',
                fontSize: 12,
                fontWeight: 'bold'
              }}
            />
          )}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
