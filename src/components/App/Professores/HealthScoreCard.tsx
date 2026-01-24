import React from 'react';
import { Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Gauge } from '@/components/ui/Gauge';

interface HealthScoreCardProps {
  score: number;
  variation?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showVariation?: boolean;
}

export const HealthScoreCard: React.FC<HealthScoreCardProps> = ({
  score,
  variation = 0,
  label = 'Média Geral',
  size = 'md',
  showVariation = true
}) => {
  // Determinar cor baseada no score
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'emerald';
    if (score >= 40) return 'amber';
    return 'rose';
  };

  const color = getScoreColor(score);

  const colorClasses = {
    emerald: {
      badge: 'bg-emerald-900/20 text-emerald-400 border-emerald-800/50',
      icon: 'text-emerald-400'
    },
    amber: {
      badge: 'bg-amber-900/20 text-amber-400 border-amber-800/50',
      icon: 'text-amber-400'
    },
    rose: {
      badge: 'bg-rose-900/20 text-rose-400 border-rose-800/50',
      icon: 'text-rose-400'
    }
  };

  const sizeClasses = {
    sm: 'w-[180px] p-3',
    md: 'w-[220px] p-5',
    lg: 'w-[280px] p-6'
  };

  return (
    <div className={`bg-white dark:bg-slate-900 ${sizeClasses[size]} rounded-3xl border-2 border-slate-100 dark:border-slate-800 shadow-sm flex flex-col group hover:shadow-xl transition-all duration-300`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-50 dark:bg-violet-900/20 rounded-xl flex items-center justify-center border border-violet-100 dark:border-violet-800/50 group-hover:scale-110 transition-transform">
            <Heart className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">
            Health Score
          </span>
        </div>
        
        {showVariation && variation !== 0 && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
            variation >= 0 ? colorClasses.emerald.badge : colorClasses.rose.badge
          }`}>
            {variation > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : variation < 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {variation >= 0 ? `+${variation}` : variation} pts
          </div>
        )}
      </div>
      
      <Gauge 
        score={score} 
        label={label}
        size={size}
      />
    </div>
  );
};

export default HealthScoreCard;
