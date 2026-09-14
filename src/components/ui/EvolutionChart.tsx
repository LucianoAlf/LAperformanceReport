import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';

interface DataPoint {
  name: string;
  [key: string]: string | number;
}

interface LineConfig {
  dataKey: string;
  color: string;
  name: string;
}

interface EvolutionChartProps {
  data: DataPoint[];
  lines: LineConfig[];
  title?: string;
  className?: string;
  yAxisFormatter?: (value: number) => string;
  /**
   * Tela estreita (celular). Encolhe as margens e o eixo Y e deixa o Recharts
   * pular rotulos do eixo X em vez de sobrepo-los. Aditivo e opcional: sem a
   * prop, o grafico e byte a byte o de antes — nenhum dos consumidores de
   * desktop muda.
   */
  compacto?: boolean;
}

export function EvolutionChart({
  data,
  lines,
  title,
  className,
  yAxisFormatter = (value) => value.toString(),
  compacto = false,
}: EvolutionChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-bold">{yAxisFormatter(entry.value)}</span>
            </p>
          ))}
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

  return (
    <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
      {title && <h3 className="text-lg font-bold text-white mb-4">{title}</h3>}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={compacto ? { top: 5, right: 8, left: 0, bottom: 0 } : { top: 5, right: 20, left: 10, bottom: 5 }}
            style={{ backgroundColor: 'transparent' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: compacto ? 10 : 12 }}
              // Em ~330px os 12 meses se sobrepoem ate virar borrao. Com
              // minTickGap o Recharts esconde os rotulos que nao cabem, em vez
              // de desenhar todos por cima uns dos outros.
              minTickGap={compacto ? 18 : 5}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: compacto ? 10 : 12 }}
              width={compacto ? 34 : undefined}
              tickFormatter={yAxisFormatter}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '5 5' }}
            />
            <Legend 
              formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
            />
            {lines.map((line, index) => (
              <Line
                key={index}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color}
                name={line.name}
                strokeWidth={2}
                dot={{ fill: line.color, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                animationDuration={800}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default EvolutionChart;
