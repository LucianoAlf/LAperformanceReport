import React from 'react';

interface GaugeProps {
  score: number;
  variation?: number;
  label?: string;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface SimpleGaugeProps {
  percent: number;
  size: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { width: 120, height: 75, radius: 50, strokeWidth: 12, needleLength: 45 },
  md: { width: 180, height: 110, radius: 75, strokeWidth: 18, needleLength: 65 },
  lg: { width: 220, height: 135, radius: 90, strokeWidth: 22, needleLength: 80 },
};

const SimpleGauge: React.FC<SimpleGaugeProps> = ({ percent, size }) => {
  const config = sizeConfig[size];
  const { width, height, radius, strokeWidth, needleLength } = config;
  const centerX = width / 2;
  const centerY = height - 20;
  
  // O ponteiro gira de -90° (0%) a 90° (100%)
  const needleRotation = (percent * 180) - 90;
  
  // Calcular pontos do arco
  const startX = centerX - radius;
  const endX = centerX + radius;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        {/* Gradiente Premium com ranges exatos */}
        <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#EF4444" />   {/* Vermelho */}
          <stop offset="45%" stopColor="#F59E0B" />  {/* Laranja */}
          <stop offset="75%" stopColor="#84CC16" />  {/* Verde Claro */}
          <stop offset="90%" stopColor="#22C55E" />  {/* Verde Escuro */}
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>
      </defs>
      
      {/* Arco de Fundo (Cinza sutil) */}
      <path
        d={`M ${startX} ${centerY} A ${radius} ${radius} 0 0 1 ${endX} ${centerY}`}
        fill="none"
        stroke="currentColor"
        className="text-slate-800"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      
      {/* Arco Ativo com Gradiente */}
      <path
        d={`M ${startX} ${centerY} A ${radius} ${radius} 0 0 1 ${endX} ${centerY}`}
        fill="none"
        stroke="url(#healthGradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${radius * Math.PI} ${radius * Math.PI}`}
        strokeDashoffset={radius * Math.PI * (1 - 1)}
        style={{ transition: 'all 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
      
      {/* Ponteiro (Needle) */}
      <g 
        style={{
          transform: `rotate(${needleRotation}deg)`,
          transformOrigin: `${centerX}px ${centerY}px`,
          transition: 'transform 1.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        <path
          d={`M ${centerX - 3} ${centerY} L ${centerX} ${centerY - needleLength} L ${centerX + 3} ${centerY} Z`}
          fill="#94a3b8"
          className="dark:fill-slate-400"
        />
        <circle cx={centerX} cy={centerY} r="5" fill="#94a3b8" className="dark:fill-slate-400" />
        <circle cx={centerX} cy={centerY} r="2" fill="white" />
      </g>
    </svg>
  );
};

export const Gauge: React.FC<GaugeProps> = ({ 
  score, 
  variation = 0, 
  label = "Score",
  showDetails = true,
  size = 'md'
}) => {
  const percent = Math.min(100, Math.max(0, score)) / 100;
  const config = sizeConfig[size];
  
  const textSizeClass = {
    sm: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-4xl'
  };
  
  const labelSizeClass = {
    sm: 'text-[8px]',
    md: 'text-[9px]',
    lg: 'text-[10px]'
  };

  return (
    <div className="flex flex-col items-center justify-center pt-2">
      <div style={{ width: config.width, maxWidth: '100%' }}>
        <SimpleGauge percent={percent} size={size} />
      </div>
      
      {showDetails && (
        <div className="mt-[-15px] text-center z-10">
          <span className={`${textSizeClass[size]} font-bold text-slate-800 dark:text-white tracking-tighter`}>
            {Math.round(score)}
          </span>
          <p className={`${labelSizeClass[size]} font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest`}>
            {label}
          </p>
        </div>
      )}
    </div>
  );
};

export default Gauge;
