import { BarChart3, TrendingUp } from 'lucide-react';

interface PageSwitcherProps {
  currentPage: 'gestao' | 'comercial';
  onPageChange: (page: 'gestao' | 'comercial') => void;
}

export function PageSwitcher({ currentPage, onPageChange }: PageSwitcherProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-1 flex gap-1">
      <button
        onClick={() => onPageChange('gestao')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${
          currentPage === 'gestao'
            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
            : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
        }`}
      >
        <BarChart3 className="w-4 h-4" />
        <span className="text-sm font-medium">Gestão</span>
      </button>
      
      <button
        onClick={() => onPageChange('comercial')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${
          currentPage === 'comercial'
            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25'
            : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
        }`}
      >
        <TrendingUp className="w-4 h-4" />
        <span className="text-sm font-medium">Comercial</span>
      </button>
    </div>
  );
}

export default PageSwitcher;
