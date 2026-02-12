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
}

export function PainelFarmer({ unidadeId, ano, mes }: PainelFarmerProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('dashboard');
  const [rotinaModalAberto, setRotinaModalAberto] = useState(false);
  
  // Função para abrir o modal de rotina diretamente do Dashboard
  const handleOpenRotinaModal = () => {
    setRotinaModalAberto(true);
  };

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
      <div className="flex gap-2">
        {subTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-t-xl rounded-b-none text-sm font-medium transition-all flex items-center gap-2 border border-b-0',
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
    </div>
  );
}

export default PainelFarmer;
