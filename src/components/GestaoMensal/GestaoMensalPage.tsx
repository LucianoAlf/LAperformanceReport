import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BarChart3, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TabGestao } from './TabGestao';
import { TabComercialNew } from './TabComercialNew';
import { TabProfessoresNew } from './TabProfessoresNew';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { PageTour } from '@/components/Onboarding/PageTour';
import { TourHelpButton } from '@/components/Onboarding/TourHelpButton';
import { analyticsTourSteps } from '@/components/Onboarding/tours';

type TabId = 'gestao' | 'comercial' | 'professores';

interface OutletContextType {
  filtroAtivo: string | null;
  competencia: ReturnType<typeof import('@/hooks/useCompetenciaFiltro').useCompetenciaFiltro>;
}

const tabs = [
  { id: 'gestao' as const, label: 'Gestão', shortLabel: 'Gestão', icon: BarChart3 },
  { id: 'comercial' as const, label: 'Comercial', shortLabel: 'Comercial', icon: TrendingUp },
  { id: 'professores' as const, label: 'Professores', shortLabel: 'Profs', icon: Users },
];

interface GestaoMensalPageProps {
  mesReferencia?: string; // formato: "2026-01"
}

export function GestaoMensalPage({ mesReferencia }: GestaoMensalPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('gestao');
  
  // Pegar filtros do contexto do Outlet (vem do AppLayout)
  const context = useOutletContext<OutletContextType>();
  const filtroAtivo = context?.filtroAtivo ?? null;
  const competencia = context?.competencia;
  
  // Se filtroAtivo é null = consolidado, senão é o ID da unidade
  const unidadeFiltro = filtroAtivo || 'todos';

  // Extrair valores do hook de competência
  const competenciaFiltro = competencia?.filtro;
  const competenciaRange = competencia?.range;
  const anosDisponiveis = competencia?.anosDisponiveis || [];
  const setTipo = competencia?.setTipo;
  const setAno = competencia?.setAno;
  const setMes = competencia?.setMes;
  const setTrimestre = competencia?.setTrimestre;
  const setSemestre = competencia?.setSemestre;

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
  };

  return (
    <div className="space-y-6">
      {/* Sistema de Abas com Filtro de Competência */}
      <div className="animate-in fade-in slide-in-from-top-4 duration-500">
        {/* Desktop Tabs */}
        <div className="hidden lg:block border-b border-slate-700">
          <div className="flex items-center justify-between gap-4 px-4">
            {/* Abas à esquerda */}
            <div data-tour="analytics-abas" className="flex items-center gap-2 pb-1 overflow-x-auto scrollbar-hide">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition whitespace-nowrap",
                    activeTab === tab.id
                      ? "bg-slate-800 text-white border-b-2 border-purple-500"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filtro de Competência à direita */}
            {competenciaFiltro && competenciaRange && setTipo && setAno && setMes && setTrimestre && setSemestre && (
              <div data-tour="analytics-filtro-periodo" className="flex-shrink-0">
                <CompetenciaFilter
                  filtro={competenciaFiltro}
                  range={competenciaRange}
                  anosDisponiveis={anosDisponiveis}
                  onTipoChange={setTipo}
                  onAnoChange={setAno}
                  onMesChange={setMes}
                  onTrimestreChange={setTrimestre}
                  onSemestreChange={setSemestre}
                />
              </div>
            )}
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

      {/* Conteúdo da Aba Ativa */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        {activeTab === 'gestao' && (
          <TabGestao 
            ano={competenciaRange?.ano || new Date().getFullYear()} 
            mes={competenciaRange?.mesInicio || new Date().getMonth() + 1} 
            mesFim={competenciaRange?.mesFim}
            unidade={unidadeFiltro} 
          />
        )}
        {activeTab === 'comercial' && (
          <TabComercialNew 
            ano={competenciaRange?.ano || new Date().getFullYear()} 
            mes={competenciaRange?.mesInicio || new Date().getMonth() + 1} 
            mesFim={competenciaRange?.mesFim}
            unidade={unidadeFiltro} 
          />
        )}
        {activeTab === 'professores' && (
          <TabProfessoresNew 
            ano={competenciaRange?.ano || new Date().getFullYear()} 
            mes={competenciaRange?.mesInicio || new Date().getMonth() + 1} 
            mesFim={competenciaRange?.mesFim}
            unidade={unidadeFiltro} 
          />
        )}
      </div>
      {/* Tour de Onboarding */}
      <PageTour tourName="analytics" steps={analyticsTourSteps} />
      <TourHelpButton tourName="analytics" />
    </div>
  );
}

export default GestaoMensalPage;
