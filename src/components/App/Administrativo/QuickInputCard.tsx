import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickInputCardProps {
  icon: LucideIcon;
  title: string;
  count: number;
  variant: 'emerald' | 'amber' | 'orange' | 'rose';
  onClick: () => void;
}

const variantStyles = {
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    iconBg: 'from-emerald-500 to-teal-500',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    iconBg: 'from-amber-500 to-yellow-500',
  },
  orange: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    iconBg: 'from-orange-500 to-amber-500',
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    iconBg: 'from-rose-500 to-pink-500',
  },
};

export function QuickInputCard({ icon: Icon, title, count, variant, onClick }: QuickInputCardProps) {
  const styles = variantStyles[variant];

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative p-5 rounded-2xl border-2 transition-all hover:scale-[1.02] hover:shadow-xl text-left',
        styles.bg,
        styles.border,
        'hover:border-opacity-60'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center',
          `bg-gradient-to-br ${styles.iconBg}`
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
          <Plus className={cn('w-4 h-4', styles.text)} />
        </div>
      </div>
      <div className="text-left">
        <p className={cn('text-3xl font-bold mb-0.5', styles.text)}>{count}</p>
        <p className="text-slate-400 text-sm font-medium">{title}</p>
      </div>
    </button>
  );
}
