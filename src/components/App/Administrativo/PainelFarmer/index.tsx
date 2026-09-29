'use client';

import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CheckSquare, 
  ClipboardList, 
  MessageSquare, 
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardTab } from './DashboardTab';
import { RotinasTab } from './RotinasTab';
import { ChecklistsTab } from './ChecklistsTab';
import { HistoricoTab } from './HistoricoTab';
import { RecadosTab } from './RecadosTab';
import { SeletorSecaoMobile } from '@/mobile/SeletorSecaoMobile';

import type { UnidadeId } from '@/components/ui/UnidadeFilter';

type SubTabId = 'dashboard' | 'rotinas' | 'checklists' | 'recados' | 'historico';

const subTabs: { id: SubTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'rotinas', label: 'Minhas Rotinas', icon: CheckSquare },
  { id: 'checklists', label: 'Checklists', icon: ClipboardList },
  { id: 'recados', label: 'Recados', icon: MessageSquare },
  { id: 'historico', label: 'Histórico', icon: BarChart3 },
];

interface PainelFarmerProps {
  unidadeId: string;
  ano: number;
  mes: number;
  /**
   * Só no celular (LAPE-32): desenha a linha de abas do Administrativo com o
   * botão da Farmer ao lado. Vem do pai porque a lista e a troca são dele;
   * a sub-aba continua sendo estado daqui, e zera ao sair da Farmer como
   * sempre zerou.
   */
  abasPaiNoCelular?: (acessorio: React.ReactNode) => React.ReactNode;
}

export function PainelFarmer({ unidadeId, ano, mes, abasPaiNoCelular }: PainelFarmerProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('dashboard');
  const [rotinaModalAberto, setRotinaModalAberto] = useState(false);

  // Função para abrir o modal de rotina diretamente do Dashboard
  const handleOpenRotinaModal = () => {
    setRotinaModalAberto(true);
  };

  if (abasPaiNoCelular) {
    const atual = subTabs.find(t => t.id === activeSubTab);
    // A MESMA `subTabs` e o MESMO `setActiveSubTab` da fileira do computador.
    const seletorFarmer = (
      <SeletorSecaoMobile ehCelular compacto alvoCheio titulo="Painel Farmer" rotuloAtual={atual?.label ?? 'Dashboard'}>
        <div role="tablist" aria-label="Painel Farmer" className="flex flex-col gap-1">
          {subTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeSubTab === tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={cn(
                  'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold',
                  activeSubTab === tab.id ? 'bg-slate-800 text-violet-400' : 'text-slate-300',
                )}
              >
                <Icon className="h-4 w-4 flex-none" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </SeletorSecaoMobile>
    );
    return (
      <div className="space-y-4">
        {abasPaiNoCelular(seletorFarmer)}
        {conteudo()}
      </div>
    );
  }

  function conteudo() {
    return (
      <div>
        {activeSubTab === 'dashboard' && (
          <DashboardTab
            unidadeId={unidadeId}
            onOpenRotinaModal={handleOpenRotinaModal}
          />
        )}
        {activeSubTab === 'rotinas' && (
          <RotinasTab unidadeId={unidadeId} />
        )}
        {/* Modal de rotina que pode ser aberto do Dashboard */}
        {activeSubTab === 'dashboard' && rotinaModalAberto && (
          <RotinasTab
            unidadeId={unidadeId}
            modalAberto={rotinaModalAberto}
            onModalClose={() => setRotinaModalAberto(false)}
          />
        )}
        {activeSubTab === 'checklists' && (
          <ChecklistsTab unidadeId={unidadeId} />
        )}
        {activeSubTab === 'recados' && (
          <RecadosTab unidadeId={unidadeId} />
        )}
        {activeSubTab === 'historico' && (
          <HistoricoTab unidadeId={unidadeId} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header do Painel */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Painel Farmer</h2>
            <p className="text-sm text-slate-400">Gerencie suas rotinas, checklists e tarefas diárias</p>
          </div>
        </div>
      </div>

      {/* Sub-tabs - estilo arredondado em cima, reto embaixo */}
      {/* ⚠️ Rola no celular: medido 632px de trilho em 356px de tela, sem
          nenhuma pista de que havia aba escondida. Mesmo padrao do
          `PageTabs` mobile — o desvanecimento substitui a barra de rolagem
          que `scrollbar-hide` esconde. */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)] lg:mask-none">
        {subTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                'shrink-0 whitespace-nowrap px-4 py-2 rounded-t-xl rounded-b-none text-sm font-medium transition-all flex items-center gap-2 border border-b-0 max-lg:min-h-[44px]',
                activeSubTab === tab.id
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white border-violet-600'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 border-slate-700/50'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Sub-tab */}
      {conteudo()}
    </div>
  );
}

export default PainelFarmer;
