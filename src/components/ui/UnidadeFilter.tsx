import { cn } from '@/lib/utils';

export type UnidadeId = 'todos' | 'cg' | 'rec' | 'bar';

interface UnidadeFilterProps {
  value: UnidadeId;
  onChange: (value: UnidadeId) => void;
  className?: string;
}

const unidades = [
  { id: 'todos' as const, label: 'Consolidado', short: 'Todas' },
  { id: 'cg' as const, label: 'Campo Grande', short: 'CG' },
  { id: 'rec' as const, label: 'Recreio', short: 'Recreio' },
  { id: 'bar' as const, label: 'Barra', short: 'Barra' },
];

export function UnidadeFilter({ value, onChange, className }: UnidadeFilterProps) {
  return (
    <>
      {/* Desktop */}
      <div className={cn("hidden lg:block", className)}>
        <div className="bg-slate-800 p-1 rounded-lg inline-flex">
          {unidades.map((item) => (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                value === item.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile */}
      <div className={cn("lg:hidden w-full", className)}>
        <div className="bg-slate-900/40 border border-slate-800 p-1 rounded-2xl w-full">
          <div className="grid grid-cols-4 gap-1">
            {unidades.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onChange(u.id)}
                className={cn(
                  'w-full px-2 py-2 rounded-xl text-xs font-black transition-all truncate',
                  value === u.id
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                )}
                aria-pressed={value === u.id}
                title={u.label}
              >
                {u.short}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default UnidadeFilter;
