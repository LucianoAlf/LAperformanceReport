import { useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { BarChart3, TrendingUp, TrendingDown, History } from 'lucide-react';
import { cn } from '@/lib/utils';

// Importar os componentes embedded (sem sidebar interna)
import { GestaoEmbedded } from './GestaoEmbedded';
import { ComercialEmbedded } from './ComercialEmbedded';
import { RetencaoEmbedded } from './RetencaoEmbedded';

type TabId = 'gestao' | 'comercial' | 'retencao';

const tabs = [
  { id: 'gestao' as const, label: 'Gestão 2025', shortLabel: 'Gestão', icon: BarChart3 },
  { id: 'comercial' as const, label: 'Comercial 2025', shortLabel: 'Comercial', icon: TrendingUp },
  { id: 'retencao' as const, label: 'Retenção 2025', shortLabel: 'Retenção', icon: TrendingDown },
];

export function Apresentacoes2025Page() {
  useSetPageTitle({
    titulo: 'Apresentações 2025',
    subtitulo: 'Histórico de dashboards e análises de 2025',
    icone: History,
    iconeCor: 'text-slate-400',
    iconeWrapperCor: 'bg-slate-700/50',
  });

  const [activeTab, setActiveTab] = useState<TabId>('gestao');

  return (
    <div className="space-y-6">
      {/* Sistema de Abas */}
      <div className="animate-in fade-in slide-in-from-top-4 duration-500">
        {/* Desktop Tabs */}
        <div className="hidden lg:block border-b border-slate-800/60 bg-slate-900/20 backdrop-blur-sm rounded-t-xl">
          <div className="flex items-center gap-1 overflow-x-auto pb-px scrollbar-hide px-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap group",
                  activeTab === tab.id
                    ? "text-amber-400"
                    : "text-slate-500 hover:text-slate-200"
                )}
              >
                <tab.icon size={16} className={cn(
                  "transition-colors",
                  activeTab === tab.id ? "text-amber-400" : "text-slate-600 group-hover:text-slate-400"
                )} />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="lg:hidden mb-6">
          <div className="relative flex bg-[#0f172a] p-1 rounded-xl border border-slate-800/50 shadow-inner overflow-hidden">
            <div
              className="absolute top-1.5 bottom-1.5 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) bg-slate-800/80 rounded-lg border border-slate-700/30 shadow-lg"
              style={{
                width: `calc(${100 / tabs.length}% - 10px)`,
                left: `calc(${(tabs.findIndex(t => t.id === activeTab) * 100) / tabs.length}% + 5px)`,
              }}
            />
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative z-10 flex-1 py-3 font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap text-[11px]",
                  activeTab === tab.id
                    ? "text-amber-400 scale-[1.02]"
                    : "text-slate-500 hover:text-slate-200"
                )}
              >
                {tab.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 bg-slate-900/30 rounded-2xl border border-slate-800/50 overflow-hidden">
        {activeTab === 'gestao' && (
          <div className="w-full">
            <GestaoEmbedded />
          </div>
        )}
        {activeTab === 'comercial' && (
          <div className="w-full">
            <ComercialEmbedded />
          </div>
        )}
        {activeTab === 'retencao' && (
          <div className="w-full">
            <RetencaoEmbedded />
          </div>
        )}
      </div>
    </div>
  );
}

export default Apresentacoes2025Page;
