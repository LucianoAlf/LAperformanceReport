import React from 'react';

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  prefix?: string;
  suffix?: string;
  valueFormatter?: (value: number) => string;
}

export const ChartTooltip = ({ 
  active, 
  payload, 
  label, 
  prefix = '', 
  suffix = '',
  valueFormatter 
}: ChartTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div 
        className="rounded-xl px-4 py-3 shadow-2xl border min-w-[140px] z-50"
        style={{ 
          backgroundColor: '#0f172a', // slate-900
          borderColor: '#334155', // slate-700
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        {label && (
          <p 
            className="text-[10px] mb-2 uppercase tracking-widest font-bold border-b pb-1"
            style={{ 
              color: '#94a3b8', // slate-400
              borderColor: '#1e293b', // slate-800
              margin: 0
            }}
          >
            {label}
          </p>
        )}
        <div className="space-y-2">
          {payload.map((item, index) => (
            <div key={index} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full shadow-[0_0_4px_rgba(255,255,255,0.3)]" 
                  style={{ backgroundColor: item.color || item.fill || '#06b6d4' }}
                />
                {item.name && (
                  <span 
                    className="font-medium text-xs whitespace-nowrap"
                    style={{ color: '#f1f5f9', margin: 0 }} // slate-100 (mais claro)
                  >
                    {item.name}
                  </span>
                )}
              </div>
              <div className="pl-4">
                <span 
                  className="font-bold text-base whitespace-nowrap"
                  style={{ color: '#ffffff', margin: 0, display: 'block' }} // BRANCO PURO
                >
                  {prefix}
                  {valueFormatter ? valueFormatter(item.value) : (typeof item.value === 'number' ? item.value.toLocaleString('pt-BR') : item.value)}
                  {suffix}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default ChartTooltip;
