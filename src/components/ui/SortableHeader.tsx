import { ArrowUp, ArrowDown } from 'lucide-react';

export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * Cabeçalho de tabela clicável com indicador de direção.
 *
 * Extraído de TabelaAlunos em 2026-07-28 para ser reusado na aba Contratos
 * (Administrativo) -- era o único componente de ordenação do projeto e estava
 * privado dentro daquele arquivo.
 */
export function SortableHeader({ label, sortKey, sortConfig, onSort, className = '', px = 'px-4' }: {
  label: string;
  sortKey: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  className?: string;
  px?: string;
}) {
  const active = sortConfig?.key === sortKey;
  return (
    <th
      className={`${px} py-3 font-medium cursor-pointer select-none hover:text-white transition-colors ${className} ${active ? 'text-amber-400' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortConfig!.direction === 'asc'
          ? <ArrowUp className="w-3 h-3" />
          : <ArrowDown className="w-3 h-3" />
        )}
      </span>
    </th>
  );
}

/**
 * Alterna a ordenação: 1º clique = asc, clique de novo na mesma coluna = desc.
 */
export function alternarOrdenacao(atual: SortConfig, key: string): SortConfig {
  if (atual?.key === key && atual.direction === 'asc') return { key, direction: 'desc' };
  return { key, direction: 'asc' };
}

/**
 * Comparador genérico. Nulos vão sempre para o fim, independente da direção --
 * "sem dado" no topo da lista atrapalha mais do que ajuda.
 */
export function compararParaOrdenacao(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  direction: 'asc' | 'desc',
): number {
  const aVazio = a == null || a === '';
  const bVazio = b == null || b === '';
  if (aVazio && bVazio) return 0;
  if (aVazio) return 1;
  if (bVazio) return -1;

  const sinal = direction === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sinal;
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true }) * sinal;
}
