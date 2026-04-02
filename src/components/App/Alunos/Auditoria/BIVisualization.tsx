import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#f87171', '#60a5fa', '#c084fc'];

interface BIVisualizationProps {
  type: string; // bar, line, pie, kpi, table
  data: any[];
  config?: {
    xAxis?: string;
    yAxis?: string;
    title?: string;
    format?: 'number' | 'currency' | 'percent';
  };
}

function formatValue(value: any, format?: string): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  if (format === 'currency') return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  if (format === 'percent') return `${num.toFixed(1)}%`;
  return num.toLocaleString('pt-BR');
}

export function BIVisualization({ type, data, config }: BIVisualizationProps) {
  if (!data || data.length === 0) return null;

  const keys = Object.keys(data[0]);
  const xKey = config?.xAxis || keys[0];
  const yKeys = keys.filter(k => k !== xKey && typeof data[0][k] === 'number');
  const yKey = config?.yAxis || yKeys[0] || keys[1];

  if (type === 'kpi') {
    const value = data[0]?.[yKey] ?? data[0]?.[keys[0]];
    return (
      <div className="flex items-center justify-center py-4">
        <div className="bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 rounded-2xl px-8 py-5 text-center">
          <p className="text-3xl font-bold text-white">{formatValue(value, config?.format)}</p>
          <p className="text-xs text-slate-400 mt-1">{config?.title || yKey}</p>
        </div>
      </div>
    );
  }

  if (type === 'pie') {
    return (
      <div className="w-full h-[220px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={75}
              strokeWidth={1}
              stroke="#1e293b"
              label={({ name, value }) => `${name}: ${formatValue(value, config?.format)}`}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: any) => formatValue(value, config?.format)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'bar') {
    return (
      <div className="w-full h-[220px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: any) => formatValue(value, config?.format)}
            />
            {yKeys.length > 1 ? (
              yKeys.map((k, i) => (
                <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))
            ) : (
              <Bar dataKey={yKey} fill="#22d3ee" radius={[4, 4, 0, 0]} />
            )}
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: line
  return (
    <div className="w-full h-[220px] mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: any) => formatValue(value, config?.format)}
          />
          {yKeys.length > 1 ? (
            yKeys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))
          ) : (
            <Line type="monotone" dataKey={yKey} stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3, fill: '#22d3ee' }} />
          )}
          {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '11px' }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
