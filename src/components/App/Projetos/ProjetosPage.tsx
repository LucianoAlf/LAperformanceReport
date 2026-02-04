import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  FolderKanban, 
  LayoutDashboard, 
  List, 
  Columns3, 
  Calendar, 
  GitBranch, 
  Users, 
  Settings,
  Plus
} from 'lucide-react';
import { PageTour, TourHelpButton } from '@/components/Onboarding';
import { projetosTourSteps } from '@/components/Onboarding/tours';
import { Button } from '../../ui/button';
import { DashboardView } from './views/DashboardView';
import { ListaView } from './views/ListaView';
import { KanbanView } from './views/KanbanView';
import { TimelineView } from './views/TimelineView';
import { CalendarioView } from './views/CalendarioView';
import { PorPessoaView } from './views/PorPessoaView';
import { ConfiguracoesView } from './views/ConfiguracoesView';
import { FabioChatFlutuante, ModalNovoProjeto } from './components';
import { useProjetos } from '../../../hooks/useProjetos';

type TabId = 'dashboard' | 'lista' | 'kanban' | 'calendario' | 'timeline' | 'pessoa' | 'configuracoes';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
  count?: number;
}

const baseTabs: Omit<Tab, 'count'>[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'lista', label: 'Lista', icon: List },
  { id: 'kanban', label: 'Kanban', icon: Columns3 },
  { id: 'calendario', label: 'Calendário', icon: Calendar },
  { id: 'timeline', label: 'Timeline', icon: GitBranch },
  { id: 'pessoa', label: 'Por Pessoa', icon: Users },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];

export function ProjetosPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isModalNovoProjetoOpen, setIsModalNovoProjetoOpen] = useState(false);
  const context = useOutletContext<{ unidadeSelecionada: string }>();
  const unidadeSelecionada = context?.unidadeSelecionada || 'todas';

  // Hook para buscar projetos e atualizar contagem
  const { data: projetos, refetch: refetchProjetos } = useProjetos(unidadeSelecionada);
  const totalProjetos = projetos.length;

  // Tabs com contagem dinâmica
  const tabs: Tab[] = baseTabs.map(tab => ({
    ...tab,
    count: tab.id === 'lista' ? totalProjetos : undefined,
  }));

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView unidadeSelecionada={unidadeSelecionada} />;
      case 'lista':
        return <ListaView unidadeSelecionada={unidadeSelecionada} onNovoProjeto={() => setIsModalNovoProjetoOpen(true)} />;
      case 'kanban':
        return <KanbanView unidadeSelecionada={unidadeSelecionada} />;
      case 'calendario':
        return <CalendarioView unidadeSelecionada={unidadeSelecionada} />;
      case 'timeline':
        return <TimelineView unidadeSelecionada={unidadeSelecionada} />;
      case 'pessoa':
        return <PorPessoaView unidadeSelecionada={unidadeSelecionada} />;
      case 'configuracoes':
        return <ConfiguracoesView />;
      default:
        return <DashboardView unidadeSelecionada={unidadeSelecionada} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30">
            <FolderKanban className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Projetos</h1>
            <p className="text-slate-400 text-sm">Gerencie todos os projetos pedagógicos da escola</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Botão Novo Projeto */}
          <Button
            data-tour="btn-novo-projeto"
            onClick={() => setIsModalNovoProjetoOpen(true)}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Projeto
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-1 -mb-px overflow-x-auto pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap
                  ${isActive 
                    ? 'bg-slate-800/50 text-violet-400 border-b-2 border-violet-500' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`
                    px-2 py-0.5 text-xs rounded-full
                    ${isActive 
                      ? 'bg-violet-500/20 text-violet-400' 
                      : 'bg-slate-700 text-slate-400'
                    }
                  `}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Conteúdo da Tab */}
      <div className="min-h-[calc(100vh-280px)]">
        {renderTabContent()}
      </div>

      {/* Modal Novo Projeto */}
      <ModalNovoProjeto
        isOpen={isModalNovoProjetoOpen}
        onClose={() => setIsModalNovoProjetoOpen(false)}
        onSuccess={refetchProjetos}
      />

      {/* Chat Flutuante do Fábio - Disponível em todas as abas */}
      <FabioChatFlutuante unidadeSelecionada={unidadeSelecionada} />

      {/* Tour e Botão de Ajuda */}
      <PageTour tourName="projetos" steps={projetosTourSteps} />
      <TourHelpButton tourName="projetos" />
    </div>
  );
}

export default ProjetosPage;
