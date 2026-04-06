import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

interface DataItem {
  name: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DataItem[];
  title?: string;
  className?: string;
  centerLabel?: string;
}

const COLORS = [
  '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#a855f7',
];

export function DonutChart({ data, title, className, centerLabel }: DonutChartProps) {
  const total = data.reduce((acc, item) => acc + item.value, 0);

  const dataWithColors = data.map((item, index) => ({
    ...item,
    color: item.color || COLORS[index % COLORS.length],
    percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : '0',
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-2xl">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            <p className="text-white font-medium text-sm">{d.name}</p>
          </div>
          <p className="text-slate-300 text-sm pl-4.5">
            {d.value} — <span className="text-white font-semibold">{d.percentage}%</span>
          </p>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0 || total === 0) {
    return (
      <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5", className)}>
        {title && <h3 className="text-base font-bold text-white mb-4">{title}</h3>}
        <div className="flex items-center justify-center h-48 text-slate-500">
          Sem dados para exibir
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5", className)}>
      {title && <h3 className="text-base font-bold text-white mb-4">{title}</h3>}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Donut */}
        <div className="relative w-44 h-44 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataWithColors}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={78}
                paddingAngle={3}
                cornerRadius={6}
                dataKey="value"
                strokeWidth={0}
                animationBegin={0}
                animationDuration={600}
              >
                {dataWithColors.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    className="drop-shadow-[0_0_6px_rgba(0,0,0,0.3)]"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} cursor={false} wrapperStyle={{ zIndex: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label - z-0 para ficar atrás do tooltip */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
            <span className="text-2xl font-bold text-white">{total}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              {centerLabel || 'Total'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-1.5 w-full">
          {dataWithColors.map((item, index) => (
            <div key={index} className="flex items-center gap-2 group">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-slate-300 truncate flex-1 group-hover:text-white transition-colors">
                {item.name}
              </span>
              <span className="text-xs font-semibold text-white tabular-nums">
                {item.value}
              </span>
              <span className="text-[10px] text-slate-500 tabular-nums w-10 text-right">
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DonutChart;
