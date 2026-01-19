'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react';

interface RankingItem {
  id: number | string;
  nome: string;
  valor: number | string;
  subvalor?: string;
}

interface RankingTableCollapsibleProps {
  data: RankingItem[];
  title: string;
  valorLabel?: string;
  className?: string;
  topCount?: number;
  valorFormatter?: (valor: number | string) => string;
  variant?: 'gold' | 'emerald' | 'cyan' | 'violet';
}

const variantColors = {
  gold: {
    icon: 'text-amber-400',
    first: 'bg-amber-500 text-black',
    second: 'bg-slate-400 text-black',
    third: 'bg-amber-700 text-white',
  },
  emerald: {
    icon: 'text-emerald-400',
    first: 'bg-emerald-500 text-black',
    second: 'bg-slate-400 text-black',
    third: 'bg-emerald-700 text-white',
  },
  cyan: {
    icon: 'text-cyan-400',
    first: 'bg-cyan-500 text-black',
    second: 'bg-slate-400 text-black',
    third: 'bg-cyan-700 text-white',
  },
  violet: {
    icon: 'text-violet-400',
    first: 'bg-violet-500 text-black',
    second: 'bg-slate-400 text-black',
    third: 'bg-violet-700 text-white',
  },
};

export function RankingTableCollapsible({ 
  data, 
  title, 
  valorLabel = 'Valor',
  className,
  topCount = 3,
  valorFormatter = (v) => String(v),
  variant = 'gold'
}: RankingTableCollapsibleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colors = variantColors[variant];
  
  // Separar top 3 e restante
  const topData = data.slice(0, topCount);
  const restData = data.slice(topCount);
  const hasMore = restData.length > 0;

  const getMedalClass = (index: number) => {
    if (index === 0) return colors.first;
    if (index === 1) return colors.second;
    if (index === 2) return colors.third;
    return 'bg-slate-700 text-slate-300';
  };

  const renderItem = (item: RankingItem, index: number) => (
    <div 
      key={item.id} 
      className={cn(
        "flex items-center justify-between p-2 rounded-lg transition-colors",
        index < 3 ? "bg-slate-900/50" : "hover:bg-slate-900/30"
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
          getMedalClass(index)
        )}>
          {index + 1}
        </span>
        <div>
          <span className="text-white font-medium text-sm">{item.nome}</span>
          {item.subvalor && (
            <span className="text-slate-500 text-xs ml-2">{item.subvalor}</span>
          )}
        </div>
      </div>
      <span className={cn(
        "font-bold text-sm",
        index === 0 ? colors.icon : "text-slate-300"
      )}>
        {valorFormatter(item.valor)}
      </span>
    </div>
  );

  if (data.length === 0) {
    return (
      <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className={colors.icon} size={20} />
          <h3 className="font-bold text-white">{title}</h3>
        </div>
        <div className="flex items-center justify-center h-32 text-slate-500">
          Sem dados para exibir
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Trophy className={colors.icon} size={20} />
        <h3 className="font-bold text-white">{title}</h3>
      </div>
      
      {/* Top 3 sempre visíveis */}
      <div className="space-y-2">
        {topData.map((item, index) => renderItem(item, index))}
      </div>

      {/* Botão para expandir/colapsar */}
      {hasMore && (
        <>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full mt-3 py-2 px-3 flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
          >
            {isExpanded ? (
              <>
                <ChevronUp size={16} />
                Recolher lista
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                Ver todos ({restData.length} restantes)
              </>
            )}
          </button>

          {/* Lista expandida com animação */}
          <div 
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              isExpanded ? "max-h-[2000px] opacity-100 mt-2" : "max-h-0 opacity-0"
            )}
          >
            <div className="space-y-2 pt-2 border-t border-slate-700/50">
              {restData.map((item, index) => renderItem(item, index + topCount))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default RankingTableCollapsible;
