import type { ReactNode } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

interface DataItem {
  name: string;
  value: number;
  color?: string;
}

interface DistributionChartProps {
  data: DataItem[];
  title?: string;
  className?: string;
  showLegend?: boolean;
  showPercentage?: boolean;
  footer?: ReactNode;
}

const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export function DistributionChart({ 
  data, 
  title, 
  className,
  showLegend = true,
  showPercentage = true,
  footer
}: DistributionChartProps) {
  const total = data.reduce((acc, item) => acc + item.value, 0);

  const dataWithColors = data.map((item, index) => ({
    ...item,
    color: item.color || COLORS[index % COLORS.length],
    percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : '0',
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium">{data.name}</p>
          <p className="text-slate-300 text-sm">
            Valor: <span className="text-white font-bold">{data.value}</span>
          </p>
          {showPercentage && (
            <p className="text-slate-400 text-xs">
              {data.percentage}% do total
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Não mostrar label se < 5%
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (data.length === 0 || total === 0) {
    return (
      <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
        {title && <h3 className="text-lg font-bold text-white mb-4">{title}</h3>}
        <div className="flex items-center justify-center h-48 text-slate-500">
          Sem dados para exibir
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
      {title && <h3 className="text-lg font-bold text-white mb-4">{title}</h3>}
      <div className="h-64 min-h-[200px] min-w-[200px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
          <PieChart style={{ backgroundColor: 'transparent' }}>
            <Pie
              data={dataWithColors}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={showPercentage ? renderCustomLabel : undefined}
              outerRadius={80}
              innerRadius={40}
              fill="#8884d8"
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {dataWithColors.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} cursor={false} />
            {showLegend && (
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
      {footer && (
        <div className="mt-2 border-t border-slate-700/50 pt-3 text-sm text-slate-300">
          {footer}
        </div>
      )}
    </div>
  );
}

export default DistributionChart;
