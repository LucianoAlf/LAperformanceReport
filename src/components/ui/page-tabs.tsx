import React from 'react';
import { cn } from '@/lib/utils';

export interface PageTab<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
  disabled?: boolean;
  disabledTitle?: string;
  /** Gradient individual da aba quando ativa (ex: 'from-cyan-500 to-blue-500'). Sobrescreve o global. */
  activeGradient?: string;
  /** Sombra individual da aba quando ativa (ex: 'shadow-cyan-500/20'). Sobrescreve o global. */
  activeShadow?: string;
}

interface PageTabsProps<T extends string = string> {
  tabs: PageTab<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  variant?: 'default' | 'gradient';
  /** Cor do gradient quando ativo (ex: 'from-violet-500 to-purple-500'). Só para variant='gradient'. */
  activeGradient?: string;
  /** Cor da sombra quando ativo (ex: 'shadow-violet-500/20'). Só para variant='gradient'. */
  activeShadow?: string;
  className?: string;
  'data-tour'?: string;
}

/**
 * Componente de abas padronizado para todas as páginas do app.
 * 
 * - **default**: pill com bg-violet-600 (padrão para maioria das páginas)
 * - **gradient**: pill com gradient customizável (para páginas com abas coloridas)
 */
export function PageTabs<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  variant = 'default',
  activeGradient = 'from-violet-500 to-purple-500',
  activeShadow = 'shadow-violet-500/20',
  className,
  'data-tour': dataTour,
}: PageTabsProps<T>) {
  return (
    <div className={cn("space-y-0", className)}>
      {/* Desktop Tabs */}
      <div className="hidden lg:block">
        <div
          data-tour={dataTour}
          className="flex items-center gap-2 border-b border-slate-700 pb-2"
        >
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && onTabChange(tab.id)}
                disabled={tab.disabled}
                title={tab.disabled ? tab.disabledTitle : undefined}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-medium transition-all whitespace-nowrap",
                  tab.disabled && "opacity-50 cursor-not-allowed",
                  isActive
                    ? variant === 'gradient' || tab.activeGradient
                      ? `bg-gradient-to-r ${tab.activeGradient || activeGradient} text-white shadow-lg ${tab.activeShadow || activeShadow}`
                      : "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                )}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-full",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-700 text-slate-400"
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="lg:hidden">
        <div className="relative flex bg-[#0f172a] p-1 rounded-xl border border-slate-800/50 shadow-inner overflow-x-auto scrollbar-hide">
          {tabs.filter(t => !t.disabled).map(tab => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "relative z-10 flex-shrink-0 px-3 py-3 font-bold uppercase tracking-wider transition-all duration-300 whitespace-nowrap text-[10px]",
                  isActive
                    ? "text-violet-400 bg-slate-800/80 rounded-lg border border-slate-700/30"
                    : "text-slate-500 hover:text-slate-200"
                )}
              >
                {tab.shortLabel || tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
