import React from 'react';
import { 
  Home, 
  BarChart3, 
  Target, 
  Users, 
  Music, 
  Smartphone,
  Trophy,
  Calendar,
  DollarSign,
  AlertTriangle,
  Flag
} from 'lucide-react';
import { SecaoComercial } from '../../types/comercial';
import PageSwitcher from './PageSwitcher';

interface MenuItem {
  id: SecaoComercial;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const menuItems: MenuItem[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'visao-geral', label: 'Visão Geral', icon: BarChart3 },
  { id: 'funil', label: 'Funil de Conversão', icon: Target },
  { id: 'professores', label: 'Professores', icon: Users },
  { id: 'cursos', label: 'Cursos', icon: Music },
  { id: 'origem', label: 'Origem dos Leads', icon: Smartphone },
  { id: 'ranking', label: 'Ranking Unidades', icon: Trophy },
  { id: 'sazonalidade', label: 'Sazonalidade', icon: Calendar },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { id: 'alertas', label: 'Alertas e Insights', icon: AlertTriangle },
  { id: 'metas', label: 'Metas 2026', icon: Flag },
];

interface SidebarComercialProps {
  activeSection: SecaoComercial;
  onSectionChange: (section: SecaoComercial) => void;
  onPageChange: (page: 'gestao' | 'comercial') => void;
}

export function SidebarComercial({ activeSection, onSectionChange, onPageChange }: SidebarComercialProps) {
  return (
    <aside className="w-64 min-h-screen bg-slate-900/95 backdrop-blur-sm border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <img 
            src="/logo-la-music-school.png" 
            alt="LA Music School" 
            className="h-8 w-auto"
          />
          <img 
            src="/logo-la-music-kids.png" 
            alt="LA Music Kids" 
            className="h-8 w-auto"
          />
        </div>
        <div className="mt-3">
          <span className="text-xs text-emerald-400 font-medium bg-emerald-500/10 px-2 py-1 rounded-full inline-flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Indicadores de Matrículas
          </span>
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
                  ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : ''}`} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Page Switcher */}
      <div className="p-4 border-t border-slate-800">
        <PageSwitcher currentPage="comercial" onPageChange={onPageChange} />
      </div>
    </aside>
  );
}

export default SidebarComercial;
