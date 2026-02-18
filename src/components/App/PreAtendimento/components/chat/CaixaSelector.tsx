import { ChevronDown, Smartphone } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { WhatsAppCaixa } from '../../types';

interface CaixaSelectorProps {
  caixas: WhatsAppCaixa[];
  caixaSelecionada: WhatsAppCaixa | null;
  onSelecionar: (caixa: WhatsAppCaixa | null) => void;
  loading?: boolean;
}

export function CaixaSelector({ caixas, caixaSelecionada, onSelecionar, loading }: CaixaSelectorProps) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500">
        <Smartphone className="w-3.5 h-3.5 animate-pulse" />
        <span>Carregando caixas...</span>
      </div>
    );
  }

  if (caixas.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500">
        <Smartphone className="w-3.5 h-3.5" />
        <span>Nenhuma caixa configurada</span>
      </div>
    );
  }

  // Se só tem uma caixa, mostrar sem dropdown
  if (caixas.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-emerald-400">
        <Smartphone className="w-3.5 h-3.5" />
        <span className="font-medium">{caixas[0].nome}</span>
        {caixas[0].numero && (
          <span className="text-emerald-600">• {caixas[0].numero}</span>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
          bg-slate-800/60 border border-slate-700/50 hover:border-violet-500/50 hover:bg-slate-800
          text-slate-300 hover:text-white"
      >
        <Smartphone className="w-3.5 h-3.5 text-violet-400" />
        <span>{caixaSelecionada?.nome || 'Selecionar caixa'}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {caixas.map(caixa => (
            <button
              key={caixa.id}
              onClick={() => {
                onSelecionar(caixa);
                setAberto(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors
                ${caixaSelecionada?.id === caixa.id
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
            >
              <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-medium">{caixa.nome}</span>
                {caixa.numero && (
                  <span className="text-[10px] text-slate-500">{caixa.numero}</span>
                )}
              </div>
              {caixaSelecionada?.id === caixa.id && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
