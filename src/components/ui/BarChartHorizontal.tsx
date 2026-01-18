import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/utils';

interface DataItem {
  name: string;
  value: number;
  color?: string;
}

interface BarChartHorizontalProps {
  data: DataItem[];
  title?: string;
  className?: string;
  color?: string;
  valueFormatter?: (value: number) => string;
  showValues?: boolean;
}

const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

export function BarChartHorizontal({ 
  data, 
  title, 
  className,
  color = '#8b5cf6',
  valueFormatter = (value) => value.toString(),
  showValues = true
}: BarChartHorizontalProps) {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium">{item.name}</p>
          <p className="text-slate-300 text-sm">
            Valor: <span className="text-white font-bold">{valueFormatter(item.value)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
        {title && <h3 className="text-lg font-bold text-white mb-4">{title}</h3>}
        <div className="flex items-center justify-center h-48 text-slate-500">
          Sem dados para exibir
        </div>
      </div>
    );
  }

  // Ordenar por valor decrescente
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  return (
    <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
      {title && <h3 className="text-lg font-bold text-white mb-4">{title}</h3>}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={sortedData} 
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis 
              type="number" 
              stroke="#64748b" 
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={valueFormatter}
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              stroke="#64748b" 
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              width={75}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="value" 
              radius={[0, 4, 4, 0]}
              animationDuration={800}
              label={showValues ? {
                position: 'right',
                fill: '#94a3b8',
                fontSize: 11,
                formatter: valueFormatter
              } : undefined}
            >
              {sortedData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color || COLORS[index % COLORS.length]} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default BarChartHorizontal;
