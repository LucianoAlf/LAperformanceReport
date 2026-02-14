import React, { useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
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
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
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

const baseTabs: PageTab<TabId>[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dash', icon: LayoutDashboard },
  { id: 'lista', label: 'Lista', shortLabel: 'Lista', icon: List },
  { id: 'kanban', label: 'Kanban', shortLabel: 'Kanban', icon: Columns3 },
  { id: 'calendario', label: 'Calendário', shortLabel: 'Cal.', icon: Calendar },
  { id: 'timeline', label: 'Timeline', shortLabel: 'Timeline', icon: GitBranch },
  { id: 'pessoa', label: 'Por Pessoa', shortLabel: 'Pessoa', icon: Users },
  { id: 'configuracoes', label: 'Configurações', shortLabel: 'Config', icon: Settings },
];

export function ProjetosPage() {
  useSetPageTitle({
    titulo: 'Gestão de Projetos',
    subtitulo: 'Gerencie todos os projetos pedagógicos da escola',
    icone: FolderKanban,
    iconeCor: 'text-violet-400',
    iconeWrapperCor: 'bg-gradient-to-br from-violet-500/20 to-purple-500/20',
  });

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isModalNovoProjetoOpen, setIsModalNovoProjetoOpen] = useState(false);
  const context = useOutletContext<{ unidadeSelecionada: string }>();
  const unidadeSelecionada = context?.unidadeSelecionada || 'todas';

  // Hook para buscar projetos e atualizar contagem
  const { data: projetos, refetch: refetchProjetos } = useProjetos(unidadeSelecionada);
  const totalProjetos = projetos.length;

  // Tabs com contagem dinâmica
  const tabs: PageTab<TabId>[] = baseTabs.map(tab => ({
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
      {/* Header actions */}
      <div className="flex items-center justify-end">
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
      <PageTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

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
