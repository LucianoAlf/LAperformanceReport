import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';

interface RankingItem {
  id: number | string;
  nome: string;
  valor: number | string;
  subvalor?: string;
}

interface RankingTableProps {
  data: RankingItem[];
  title: string;
  valorLabel?: string;
  className?: string;
  maxItems?: number;
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

export function RankingTable({ 
  data, 
  title, 
  valorLabel = 'Valor',
  className,
  maxItems = 10,
  valorFormatter = (v) => String(v),
  variant = 'gold'
}: RankingTableProps) {
  const colors = variantColors[variant];
  const displayData = data.slice(0, maxItems);

  const getMedalClass = (index: number) => {
    if (index === 0) return colors.first;
    if (index === 1) return colors.second;
    if (index === 2) return colors.third;
    return 'bg-slate-700 text-slate-300';
  };

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
      <div className="space-y-2">
        {displayData.map((item, index) => (
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
        ))}
      </div>
    </div>
  );
}

export default RankingTable;
