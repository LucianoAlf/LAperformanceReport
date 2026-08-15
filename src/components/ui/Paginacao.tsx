import React from 'react';

/**
 * Paginação de tabela, client-side.
 *
 * Extraída do padrão que já existia inline em `TabelaAlunos` (e repetido em
 * `ConciliacaoMatriculas` e `TabSucessoAluno`): mesma janela de 5 números, mesmo
 * texto "Mostrando X-Y de Z". Aqui vira componente para as duas tabelas da aba
 * Contratos não duplicarem a quarta cópia.
 *
 * Fica com o slice fora, no chamador: quem pagina precisa da lista completa em mãos
 * para contar, ordenar e filtrar antes de cortar.
 */

export const ITENS_POR_PAGINA_PADRAO = 30;

type Props = {
  paginaAtual: number;
  totalItens: number;
  onMudarPagina: (pagina: number) => void;
  itensPorPagina?: number;
  /** Plural do que está sendo contado, para o texto ficar legível ("contratos", "alunos"). */
  rotuloItens?: string;
};

export function Paginacao({
  paginaAtual,
  totalItens,
  onMudarPagina,
  itensPorPagina = ITENS_POR_PAGINA_PADRAO,
  rotuloItens = 'registros',
}: Props) {
  const totalPaginas = Math.ceil(totalItens / itensPorPagina);

  // Uma página só não é paginação — é ruído ocupando altura.
  if (totalPaginas <= 1) return null;

  const primeiro = (paginaAtual - 1) * itensPorPagina + 1;
  const ultimo = Math.min(paginaAtual * itensPorPagina, totalItens);

  // Janela deslizante de até 5 números, mantendo a página atual no meio quando dá.
  const numeros = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
    let pagina = i + 1;
    if (totalPaginas > 5) {
      if (paginaAtual > 3) pagina = paginaAtual - 2 + i;
      if (pagina > totalPaginas) pagina = totalPaginas - 4 + i;
    }
    return pagina;
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/50 px-4 py-3">
      <p className="text-sm text-slate-400">
        Mostrando {primeiro}-{ultimo} de {totalItens} {rotuloItens}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onMudarPagina(Math.max(1, paginaAtual - 1))}
          disabled={paginaAtual === 1}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm transition hover:bg-slate-600 disabled:opacity-50"
        >
          Anterior
        </button>
        {numeros.map((pagina) => (
          <button
            key={pagina}
            onClick={() => onMudarPagina(pagina)}
            className={`rounded px-3 py-1.5 text-sm transition ${
              paginaAtual === pagina ? 'bg-cyan-600 text-white' : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            {pagina}
          </button>
        ))}
        <button
          onClick={() => onMudarPagina(Math.min(totalPaginas, paginaAtual + 1))}
          disabled={paginaAtual === totalPaginas}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm transition hover:bg-slate-600 disabled:opacity-50"
        >
          Próximo
        </button>
      </div>
    </div>
  );
}

export default Paginacao;
