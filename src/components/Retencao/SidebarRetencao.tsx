import React from 'react';
import { 
  Home, 
  BarChart3, 
  TrendingDown, 
  PieChart,
  Users, 
  Calendar,
  GitCompare,
  AlertTriangle,
  Target
} from 'lucide-react';
import { PageSwitcher } from '../Comercial/PageSwitcher';
import { SecaoRetencao } from '../../types/retencao';

interface MenuItem {
  id: SecaoRetencao;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const menuItems: MenuItem[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'visao-geral', label: 'Visão Geral', icon: BarChart3 },
  { id: 'tendencias', label: 'Tendências', icon: TrendingDown },
  { id: 'motivos', label: 'Motivos de Evasão', icon: PieChart },
  { id: 'professores', label: 'Por Professor', icon: Users },
  { id: 'sazonalidade', label: 'Sazonalidade', icon: Calendar },
  { id: 'comparativo', label: 'Comparativo', icon: GitCompare },
  { id: 'alertas', label: 'Alertas', icon: AlertTriangle },
  { id: 'acoes', label: 'Ações 2026', icon: Target },
];

interface SidebarRetencaoProps {
  activeSection: SecaoRetencao;
  onSectionChange: (section: SecaoRetencao) => void;
  onPageChange: (page: 'gestao' | 'comercial' | 'retencao') => void;
}

export function SidebarRetencao({ activeSection, onSectionChange, onPageChange }: SidebarRetencaoProps) {
  return (
    <aside className="w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Retenção</h1>
            <p className="text-xs text-gray-400">Análise de Evasão</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-rose-500/20 to-red-500/20 text-rose-400 border border-rose-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-rose-400' : ''}`} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Page Switcher */}
      <div className="border-t border-slate-800 p-4">
        <PageSwitcher currentPage="retencao" onPageChange={onPageChange} />
      </div>
    </aside>
  );
}
