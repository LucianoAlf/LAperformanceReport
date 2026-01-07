import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';

interface PageSwitcherProps {
  currentPage: 'gestao' | 'comercial' | 'retencao';
  onPageChange: (page: 'gestao' | 'comercial' | 'retencao') => void;
}

export function PageSwitcher({ currentPage, onPageChange }: PageSwitcherProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-1 flex flex-col gap-1">
      <button
        onClick={() => onPageChange('gestao')}
        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
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
        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
          currentPage === 'comercial'
            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25'
            : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
        }`}
      >
        <TrendingUp className="w-4 h-4" />
        <span className="text-sm font-medium">Comercial</span>
      </button>

      <button
        onClick={() => onPageChange('retencao')}
        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
          currentPage === 'retencao'
            ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/25'
            : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
        }`}
      >
        <TrendingDown className="w-4 h-4" />
        <span className="text-sm font-medium">Retenção</span>
      </button>
    </div>
  );
}

export default PageSwitcher;
