import { useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import {
  LayoutDashboard,
  KanbanSquare,
  ClipboardList,
  CalendarDays,
  TrendingUp,
  Bot,
  FileText,
  Phone,
  MessageSquare,
} from 'lucide-react';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { DashboardTab } from './tabs/DashboardTab';
import { PipelineTab } from './tabs/PipelineTab';
import { LeadsTab } from './tabs/LeadsTab';
import { AgendaTab } from './tabs/AgendaTab';
import { MetasTab } from './tabs/MetasTab';
import { MilaTab } from './tabs/MilaTab';
import { RelatoriosTab } from './tabs/RelatoriosTab';
import { ConversasTab } from './tabs/ConversasTab';
import { LeadDrawer } from './components/LeadDrawer';
import { ModalNovoLead } from './components/ModalNovoLead';
import { ModalAgendar } from './components/ModalAgendar';
import { ModalMoverEtapa } from './components/ModalMoverEtapa';
import { ModalArquivar } from './components/ModalArquivar';
import { ModalConfigurarEtapas } from './components/ModalConfigurarEtapas';
import { ModalMatricular } from './components/ModalMatricular';
import { useLeadsCRM } from './hooks/useLeadsCRM';
import type { CRMTabId, LeadCRM } from './types';

// Definição das 8 abas
const crmTabs: PageTab<CRMTabId>[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dash', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', shortLabel: 'Pipeline', icon: KanbanSquare },
  { id: 'conversas', label: 'Conversas', shortLabel: 'Chat', icon: MessageSquare },
  { id: 'leads', label: 'Leads', shortLabel: 'Leads', icon: ClipboardList },
  { id: 'agenda', label: 'Agenda', shortLabel: 'Agenda', icon: CalendarDays },
  { id: 'metas', label: 'Metas', shortLabel: 'Metas', icon: TrendingUp },
  { id: 'mila', label: 'Painel Mila', shortLabel: 'Mila', icon: Bot },
  { id: 'relatorios', label: 'Relatórios', shortLabel: 'Relat.', icon: FileText },
];

interface OutletContextType {
  filtroAtivo: string | null;
  unidadeSelecionada: string;
  competencia: {
    filtro: any;
    range: { ano: number; mesInicio: number; mesFim?: number; label: string };
  };
}

export function PreAtendimentoPage() {
  useSetPageTitle({
    titulo: 'Pré-Atendimento',
    subtitulo: 'CRM da Andreza — Gestão de leads, experimentais, visitas e follow-ups',
    icone: Phone,
    iconeCor: 'text-violet-400',
    iconeWrapperCor: 'bg-violet-500/20',
  });

  const [activeTab, setActiveTab] = useState<CRMTabId>('dashboard');
  const [leadSelecionado, setLeadSelecionado] = useState<LeadCRM | null>(null);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [modalNovoLeadAberto, setModalNovoLeadAberto] = useState(false);
  const [modalAgendarAberto, setModalAgendarAberto] = useState(false);
  const [modalMoverEtapaAberto, setModalMoverEtapaAberto] = useState(false);
  const [modalArquivarAberto, setModalArquivarAberto] = useState(false);
  const [leadParaModal, setLeadParaModal] = useState<LeadCRM | null>(null);
  const [modalConfigurarEtapasAberto, setModalConfigurarEtapasAberto] = useState(false);
  const [modalMatricularAberto, setModalMatricularAberto] = useState(false);

  // Contexto do layout (filtro de unidade e competência)
  const context = useOutletContext<OutletContextType>();
  const unidadeId = context?.filtroAtivo || 'todos';
  const ano = context?.competencia?.range?.ano || new Date().getFullYear();
  const mes = context?.competencia?.range?.mesInicio || (new Date().getMonth() + 1);

  // Hook para obter etapas, canais e cursos (usado pelo drawer e modais)
  const { etapas, canais, cursos, refetch } = useLeadsCRM({ unidadeId, ano, mes });

  // Abrir drawer com lead
  const abrirDrawer = (lead: LeadCRM) => {
    setLeadSelecionado(lead);
    setDrawerAberto(true);
  };

  const fecharDrawer = () => {
    setDrawerAberto(false);
  };

  // Callbacks para modais do drawer
  const handleAgendar = (lead: LeadCRM) => {
    setLeadParaModal(lead);
    setModalAgendarAberto(true);
  };
  const handleMoverEtapa = (lead: LeadCRM) => {
    setLeadParaModal(lead);
    setModalMoverEtapaAberto(true);
  };
  const handleArquivar = (lead: LeadCRM) => {
    setLeadParaModal(lead);
    setModalArquivarAberto(true);
  };

  const handleMatricular = (lead: LeadCRM) => {
    setLeadParaModal(lead);
    setModalMatricularAberto(true);
  };

  return (
    <div className="space-y-6">
      {/* Sistema de Abas */}
      <PageTabs
        tabs={crmTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Conteúdo da Aba Ativa */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        {activeTab === 'dashboard' && (
          <DashboardTab unidadeId={unidadeId} ano={ano} mes={mes} />
        )}
        {activeTab === 'pipeline' && (
          <PipelineTab unidadeId={unidadeId} ano={ano} mes={mes} onLeadClick={abrirDrawer} onConfigurarEtapas={() => setModalConfigurarEtapasAberto(true)} />
        )}
        {activeTab === 'conversas' && (
          <ConversasTab
            unidadeId={unidadeId}
            onLeadClick={abrirDrawer}
            onAgendar={handleAgendar}
            onMoverEtapa={handleMoverEtapa}
            onMatricular={handleMatricular}
            onArquivar={handleArquivar}
          />
        )}
        {activeTab === 'leads' && (
          <LeadsTab
            unidadeId={unidadeId} ano={ano} mes={mes}
            onLeadClick={abrirDrawer}
            onNovoLead={() => setModalNovoLeadAberto(true)}
            onAgendar={handleAgendar}
            onMoverEtapa={handleMoverEtapa}
            onArquivar={handleArquivar}
            canais={canais}
            cursos={cursos}
            refetch={refetch}
          />
        )}
        {activeTab === 'agenda' && (
          <AgendaTab unidadeId={unidadeId} ano={ano} mes={mes} onLeadClick={abrirDrawer} />
        )}
        {activeTab === 'metas' && (
          <MetasTab unidadeId={unidadeId} ano={ano} mes={mes} />
        )}
        {activeTab === 'mila' && (
          <MilaTab unidadeId={unidadeId} ano={ano} mes={mes} />
        )}
        {activeTab === 'relatorios' && (
          <RelatoriosTab unidadeId={unidadeId} ano={ano} mes={mes} />
        )}
      </div>

      {/* Modal Novo Lead */}
      <ModalNovoLead
        aberto={modalNovoLeadAberto}
        onClose={() => setModalNovoLeadAberto(false)}
        onSalvo={refetch}
        etapas={etapas}
        canais={canais}
        cursos={cursos}
      />

      {/* Modal Agendar */}
      <ModalAgendar
        aberto={modalAgendarAberto}
        onClose={() => setModalAgendarAberto(false)}
        onSalvo={refetch}
        lead={leadParaModal}
      />

      {/* Modal Mover Etapa */}
      <ModalMoverEtapa
        aberto={modalMoverEtapaAberto}
        onClose={() => setModalMoverEtapaAberto(false)}
        onSalvo={refetch}
        lead={leadParaModal}
        etapas={etapas}
      />

      {/* Modal Arquivar */}
      <ModalArquivar
        aberto={modalArquivarAberto}
        onClose={() => setModalArquivarAberto(false)}
        onSalvo={refetch}
        lead={leadParaModal}
      />

      {/* Modal Configurar Etapas */}
      <ModalConfigurarEtapas
        aberto={modalConfigurarEtapasAberto}
        onFechar={() => setModalConfigurarEtapasAberto(false)}
        etapas={etapas}
        onSalvar={refetch}
      />

      {/* Modal Matricular (inline, sem navegar) */}
      <ModalMatricular
        aberto={modalMatricularAberto}
        onClose={() => setModalMatricularAberto(false)}
        onSalvo={refetch}
        lead={leadParaModal}
      />

      {/* Drawer lateral do lead */}
      <LeadDrawer
        lead={leadSelecionado}
        etapas={etapas}
        open={drawerAberto}
        onClose={fecharDrawer}
        onAgendar={handleAgendar}
        onMoverEtapa={handleMoverEtapa}
        onArquivar={handleArquivar}
      />
    </div>
  );
}

// Placeholder temporário para abas ainda não implementadas
function PlaceholderTab({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">{titulo}</h2>
        <p className="text-slate-400 text-sm">{descricao}</p>
      </div>
    </div>
  );
}

export default PreAtendimentoPage;
