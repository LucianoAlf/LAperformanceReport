// Resumo compacto de conflitos (contador)

import { AlertTriangle, XCircle, CheckCircle, AlertCircle } from 'lucide-react';
import type { Conflito } from '@/lib/horarios';

interface ResumoConflitosProps {
  conflitos: Conflito[];
  onClick?: () => void;
  compacto?: boolean;
}

export function ResumoConflitos({ conflitos, onClick, compacto = false }: ResumoConflitosProps) {
  const erros = conflitos.filter(c => c.severidade === 'erro').length;
  const avisos = conflitos.filter(c => c.severidade === 'aviso').length;
  const total = conflitos.length;

  if (total === 0) {
    if (compacto) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
          <CheckCircle className="w-3 h-3" />
          OK
        </span>
      );
    }

    return (
      <div 
        className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg cursor-pointer hover:bg-emerald-500/20 transition-colors"
        onClick={onClick}
      >
        <CheckCircle className="w-4 h-4 text-emerald-400" />
        <span className="text-sm text-emerald-400">Sem conflitos</span>
      </div>
    );
  }

  // Determinar cor principal baseado na severidade mais alta
  const temErros = erros > 0;
  const corPrincipal = temErros ? 'red' : 'amber';

  if (compacto) {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors
          ${temErros 
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
            : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
          }`}
      >
        {temErros ? (
          <XCircle className="w-3 h-3" />
        ) : (
          <AlertTriangle className="w-3 h-3" />
        )}
        {total}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2 rounded-lg border transition-all hover:brightness-110
        ${temErros 
          ? 'bg-red-500/10 border-red-500/30' 
          : 'bg-amber-500/10 border-amber-500/30'
        }`}
    >
      <AlertCircle className={`w-5 h-5 ${temErros ? 'text-red-400' : 'text-amber-400'}`} />
      
      <div className="flex items-center gap-2">
        {erros > 0 && (
          <span className="flex items-center gap-1 text-sm text-red-400">
            <XCircle className="w-3.5 h-3.5" />
            {erros} erro{erros > 1 ? 's' : ''}
          </span>
        )}
        
        {erros > 0 && avisos > 0 && (
          <span className="text-slate-500">•</span>
        )}
        
        {avisos > 0 && (
          <span className="flex items-center gap-1 text-sm text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            {avisos} aviso{avisos > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}
