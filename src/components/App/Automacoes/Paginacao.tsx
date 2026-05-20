// src/components/App/Automacoes/Paginacao.tsx
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

type Props = {
  pagina: number;
  totalPaginas: number;
  totalItens: number;
  porPagina: number;
  onMudarPagina: (p: number) => void;
  onMudarPorPagina: (n: number) => void;
};

const OPCOES_POR_PAGINA = [10, 25, 50, 100];

export function Paginacao({ pagina, totalPaginas, totalItens, porPagina, onMudarPagina, onMudarPorPagina }: Props) {
  if (totalItens === 0) return null;

  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, totalItens);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-3 border-t border-slate-800 mt-4">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>
          {inicio}–{fim} de {totalItens}
        </span>
        <span className="text-gray-600">·</span>
        <select
          value={porPagina}
          onChange={e => onMudarPorPagina(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-gray-300 text-xs cursor-pointer hover:bg-slate-700"
        >
          {OPCOES_POR_PAGINA.map(n => (
            <option key={n} value={n}>{n} por página</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onMudarPagina(1)}
          disabled={pagina <= 1}
          className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Primeira página"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMudarPagina(pagina - 1)}
          disabled={pagina <= 1}
          className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-300 px-3">
          {pagina} / {totalPaginas}
        </span>
        <button
          onClick={() => onMudarPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
          className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMudarPagina(totalPaginas)}
          disabled={pagina >= totalPaginas}
          className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Última página"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
