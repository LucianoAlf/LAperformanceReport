import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnidadeFilter, type UnidadeId } from '@/components/ui/UnidadeFilter';
import { TabDashboard } from './TabDashboard';
import { TabComercial } from './TabComercial';
import { TabRetencao } from './TabRetencao';
import { TabProfessores } from './TabProfessores';

type TabId = 'dashboard' | 'comercial' | 'retencao' | 'professores';

const tabs = [
  { id: 'dashboard' as const, label: 'Dashboard', shortLabel: 'Dash', icon: BarChart3 },
  { id: 'comercial' as const, label: 'Comercial', shortLabel: 'Comercial', icon: TrendingUp },
  { id: 'retencao' as const, label: 'Retenção', shortLabel: 'Retenção', icon: TrendingDown },
  { id: 'professores' as const, label: 'Professores', shortLabel: 'Profs', icon: Users },
];

interface GestaoMensalPageProps {
  mesReferencia?: string; // formato: "2026-01"
}

export function GestaoMensalPage({ mesReferencia }: GestaoMensalPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [unidadeFiltro, setUnidadeFiltro] = useState<UnidadeId>('todos');

  // Reset filtro quando muda de aba (como no Super Folha)
  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    setUnidadeFiltro('todos');
  };

  // Mês atual como padrão
  const [ano, mes] = (mesReferencia || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);

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
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap group",
                  activeTab === tab.id
                    ? "text-violet-400"
                    : "text-slate-500 hover:text-slate-200"
                )}
              >
                <tab.icon size={16} className={cn(
                  "transition-colors",
                  activeTab === tab.id ? "text-violet-400" : "text-slate-600 group-hover:text-slate-400"
                )} />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Tabs (Cockpit Premium Style) */}
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
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "relative z-10 flex-1 py-3 font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap text-[11px]",
                  activeTab === tab.id
                    ? "text-violet-400 scale-[1.02]"
                    : "text-slate-500 hover:text-slate-200"
                )}
              >
                {tab.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtro de Unidade */}
      <UnidadeFilter value={unidadeFiltro} onChange={setUnidadeFiltro} />

      {/* Conteúdo da Aba Ativa */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        {activeTab === 'dashboard' && (
          <TabDashboard ano={ano} mes={mes} unidade={unidadeFiltro} />
        )}
        {activeTab === 'comercial' && (
          <TabComercial ano={ano} mes={mes} unidade={unidadeFiltro} />
        )}
        {activeTab === 'retencao' && (
          <TabRetencao ano={ano} mes={mes} unidade={unidadeFiltro} />
        )}
        {activeTab === 'professores' && (
          <TabProfessores ano={ano} mes={mes} unidade={unidadeFiltro} />
        )}
      </div>
    </div>
  );
}

export default GestaoMensalPage;
