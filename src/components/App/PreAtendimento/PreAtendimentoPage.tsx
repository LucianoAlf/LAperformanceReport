import { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
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
import { cn } from '@/lib/utils';
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
import { useLeadsCRM } from './hooks/useLeadsCRM';
import type { CRMTabId, LeadCRM } from './types';

// Definição das 8 abas
const crmTabs = [
  { id: 'dashboard' as const, label: 'Dashboard', shortLabel: 'Dash', icon: LayoutDashboard },
  { id: 'pipeline' as const, label: 'Pipeline', shortLabel: 'Pipeline', icon: KanbanSquare },
  { id: 'conversas' as const, label: 'Conversas', shortLabel: 'Chat', icon: MessageSquare },
  { id: 'leads' as const, label: 'Leads', shortLabel: 'Leads', icon: ClipboardList },
  { id: 'agenda' as const, label: 'Agenda', shortLabel: 'Agenda', icon: CalendarDays },
  { id: 'metas' as const, label: 'Metas', shortLabel: 'Metas', icon: TrendingUp },
  { id: 'mila' as const, label: 'Painel Mila', shortLabel: 'Mila', icon: Bot },
  { id: 'relatorios' as const, label: 'Relatórios', shortLabel: 'Relat.', icon: FileText },
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
  const [activeTab, setActiveTab] = useState<CRMTabId>('dashboard');
  const [leadSelecionado, setLeadSelecionado] = useState<LeadCRM | null>(null);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [modalNovoLeadAberto, setModalNovoLeadAberto] = useState(false);
  const [modalAgendarAberto, setModalAgendarAberto] = useState(false);
  const [modalMoverEtapaAberto, setModalMoverEtapaAberto] = useState(false);
  const [modalArquivarAberto, setModalArquivarAberto] = useState(false);
  const [leadParaModal, setLeadParaModal] = useState<LeadCRM | null>(null);
  const [modalConfigurarEtapasAberto, setModalConfigurarEtapasAberto] = useState(false);

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

  const navigate = useNavigate();
  const handleMatricular = (lead: LeadCRM) => {
    const params = new URLSearchParams();
    if (lead.nome) params.set('nome', lead.nome);
    if (lead.telefone) params.set('telefone', lead.telefone);
    if (lead.email) params.set('email', lead.email);
    if (lead.unidade_id) params.set('unidade_id', lead.unidade_id);
    if (lead.curso_interesse_id) params.set('curso_id', String(lead.curso_interesse_id));
    if (lead.id) params.set('lead_id', String(lead.id));
    navigate(`/app/entrada/matricula?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Header da página */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/20">
              <Phone className="w-6 h-6 text-violet-400" />
            </div>
            Pré-Atendimento
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            CRM da Andreza — Gestão de leads, experimentais, visitas e follow-ups
          </p>
        </div>
      </div>

      {/* Sistema de Abas */}
      <div className="animate-in fade-in slide-in-from-top-4 duration-500">
        {/* Desktop Tabs */}
        <div className="hidden lg:block border-b border-slate-700">
          <div className="flex items-center gap-2 pb-1 overflow-x-auto scrollbar-hide px-1">
            {crmTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-slate-800 text-white border-b-2 border-violet-500"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="lg:hidden mb-6">
          <div className="relative flex bg-[#0f172a] p-1 rounded-xl border border-slate-800/50 shadow-inner overflow-x-auto scrollbar-hide">
            {crmTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative z-10 flex-shrink-0 px-3 py-3 font-bold uppercase tracking-wider transition-all duration-300 whitespace-nowrap text-[10px]",
                  activeTab === tab.id
                    ? "text-violet-400 bg-slate-800/80 rounded-lg border border-slate-700/30"
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
