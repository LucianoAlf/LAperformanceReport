// Paginação client-side das tabelas do módulo Tráfego Pago.
//
// Mora em arquivo próprio porque as DUAS abas usam (Meta em TrafegoPagoPage, Google em
// SecaoGoogleAds) e TrafegoPagoPage já importa SecaoGoogleAds — deixar aqui dentro faria
// um ciclo de imports entre os dois.

import { useMemo, useState } from 'react';

export function usePaginacaoTabela<T>(itens: T[], porPagina: number) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * porPagina;
    return itens.slice(inicio, inicio + porPagina);
  }, [itens, paginaSegura, porPagina]);
  return { pagina: paginaSegura, setPagina, totalPaginas, paginados };
}

export function PaginacaoTabela({ pagina, totalPaginas, setPagina, totalItens, porPagina, labelItem, corAtiva = 'bg-pink-600' }: {
  pagina: number;
  totalPaginas: number;
  setPagina: (updater: number | ((prev: number) => number)) => void;
  totalItens: number;
  porPagina: number;
  labelItem: string;
  // A aba do Google usa azul; a do Meta, rosa. Mesma paginação, cor da plataforma.
  corAtiva?: string;
}) {
  if (totalPaginas <= 1) return null;
  const inicio = totalItens === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, totalItens);
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
    let n = i + 1;
    if (totalPaginas > 5) {
      if (pagina > 3) n = pagina - 2 + i;
      if (n > totalPaginas) n = totalPaginas - 4 + i;
    }
    return n;
  });
  return (
    <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between flex-wrap gap-3">
      <p className="text-xs text-slate-400">
        Mostrando {inicio}-{fim} de {totalItens} {labelItem}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          disabled={pagina === 1}
          className="px-2.5 py-1 bg-slate-700/70 hover:bg-slate-700 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        {paginas.map(n => (
          <button
            key={n}
            onClick={() => setPagina(n)}
            className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
              pagina === n ? `${corAtiva} text-white` : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          disabled={pagina === totalPaginas}
          className="px-2.5 py-1 bg-slate-700/70 hover:bg-slate-700 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
