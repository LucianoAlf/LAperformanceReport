import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, ChevronLeft, ChevronRight, TrendingUp, Hash, BarChart3, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Coluna {
  key: string;
  label: string;
  render?: (valor: any, row: any) => React.ReactNode;
  sortable?: boolean;
}

interface ResumoItem {
  label: string;
  valor: string | number;
  icone?: React.ReactNode;
  cor?: string; // tailwind text color
  destaque?: boolean;
  filtroKey?: string;
  filtroValor?: string;
}

interface DistribuicaoItem {
  label: string;
  valor: number;
  cor: string; // tailwind bg color
}

interface ModalDetalheKPIProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  descricao?: string;
  dados: any[];
  colunas: Coluna[];
  carregando?: boolean;
  resumo?: ResumoItem[];
  distribuicao?: {
    titulo: string;
    dados: DistribuicaoItem[];
  };
}

const ITENS_POR_PAGINA = 50;

// Cores fixas para unidades
const CORES_UNIDADE: Record<string, { bg: string; text: string; dot: string }> = {
  'Recreio': { bg: 'bg-violet-500/15', text: 'text-violet-300', dot: 'bg-violet-400' },
  'Barra': { bg: 'bg-amber-500/15', text: 'text-amber-300', dot: 'bg-amber-400' },
  'Campo Grande': { bg: 'bg-emerald-500/15', text: 'text-emerald-300', dot: 'bg-emerald-400' },
};

export function ModalDetalheKPI({
  open,
  onClose,
  titulo,
  descricao,
  dados,
  colunas,
  carregando,
  resumo,
  distribuicao,
}: ModalDetalheKPIProps) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filtroRapido, setFiltroRapido] = useState<{ key: string; valor: string } | null>(null);

  const filtrados = useMemo(() => {
    let resultado = dados;
    if (filtroRapido) {
      resultado = resultado.filter(d => String(d[filtroRapido.key]) === filtroRapido.valor);
    }
    if (!busca.trim()) return resultado;
    const termo = busca.toLowerCase();
    return resultado.filter(d =>
      colunas.some(col => {
        const val = d[col.key];
        return val && String(val).toLowerCase().includes(termo);
      })
    );
  }, [dados, busca, colunas, filtroRapido]);

  const handleFiltroRapido = (key: string, valor: string) => {
    setFiltroRapido(prev => prev?.key === key && prev?.valor === valor ? null : { key, valor });
    setPagina(0);
  };

  const ordenados = useMemo(() => {
    if (!sortKey) return filtrados;
    return [...filtrados].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtrados, sortKey, sortDir]);

  const totalPaginas = Math.ceil(ordenados.length / ITENS_POR_PAGINA);
  const paginados = ordenados.slice(pagina * ITENS_POR_PAGINA, (pagina + 1) * ITENS_POR_PAGINA);

  const handleBusca = (valor: string) => {
    setBusca(valor);
    setPagina(0);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPagina(0);
  };

  // Distribuição calculada
  const distMax = distribuicao ? Math.max(...distribuicao.dados.map(d => d.valor), 1) : 0;
  const distTotal = distribuicao ? distribuicao.dados.reduce((s, d) => s + d.valor, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950">
        {/* Header com accent line */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-500/70 to-transparent" />
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">{titulo}</DialogTitle>
            {descricao && <DialogDescription className="text-slate-400 text-[13px]">{descricao}</DialogDescription>}
          </DialogHeader>
        </div>

        {/* Resumo — mini stat cards */}
        {resumo && resumo.length > 0 && (
          <div className="px-6 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {resumo.map((item, i) => {
                const isAtivo = filtroRapido?.key === item.filtroKey && filtroRapido?.valor === item.filtroValor;
                const isCliclavel = !!item.filtroKey;
                return (
                <div
                  key={i}
                  onClick={isCliclavel ? () => handleFiltroRapido(item.filtroKey!, item.filtroValor!) : undefined}
                  className={cn(
                    'relative rounded-xl px-4 py-3 border transition-all',
                    isCliclavel && 'cursor-pointer',
                    isAtivo
                      ? 'bg-slate-700/60 border-sky-500/60 ring-1 ring-sky-500/40'
                      : item.destaque
                        ? 'bg-sky-500/10 border-sky-500/30'
                        : 'bg-slate-800/50 border-slate-700/40',
                    isCliclavel && !isAtivo && 'hover:border-slate-600/60 hover:bg-slate-800/70',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {item.icone && (
                      <span className={cn('opacity-60', item.cor || 'text-slate-400')}>
                        {item.icone}
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      {item.label}
                    </span>
                  </div>
                  <p className={cn(
                    'text-lg font-bold tabular-nums',
                    item.cor || 'text-white'
                  )}>
                    {item.valor}
                  </p>
                </div>
              );
              })}
            </div>
          </div>
        )}

        {/* Distribuição horizontal bar */}
        {distribuicao && distribuicao.dados.length > 0 && (
          <div className="px-6 pb-4">
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {distribuicao.titulo}
                </span>
              </div>
              <div className="space-y-2">
                {distribuicao.dados.map((item, i) => {
                  const pct = distTotal > 0 ? (item.valor / distTotal) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 w-24 truncate font-medium">{item.label}</span>
                      <div className="flex-1 h-6 bg-slate-700/30 rounded-md overflow-hidden relative">
                        <div
                          className={cn('h-full rounded-md transition-all duration-700 ease-out', item.cor)}
                          style={{ width: `${Math.max((item.valor / distMax) * 100, 2)}%` }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-200 tabular-nums">
                          {item.valor}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 w-10 text-right tabular-nums">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Busca + contador */}
        <div className="flex items-center gap-3 px-6 pb-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por nome, curso, unidade..."
              value={busca}
              onChange={e => handleBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:bg-slate-800 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2">
            <Hash size={13} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-300 tabular-nums">
              {filtrados.length}
            </span>
            <span className="text-xs text-slate-500">
              registro{filtrados.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto mx-6 mb-2 rounded-xl border border-slate-700/40 bg-slate-800/20">
          {carregando ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <div className="w-8 h-8 border-2 border-slate-600 border-t-sky-400 rounded-full animate-spin" />
              <span className="text-sm">Carregando dados...</span>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
              <Search size={32} className="opacity-30" />
              <span className="text-sm">Nenhum registro encontrado</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-800/90 backdrop-blur-sm">
                  <th className="text-center px-2 py-2.5 text-slate-500 font-medium text-xs w-10 border-b border-slate-700/50">
                    #
                  </th>
                  {colunas.map(col => (
                    <th
                      key={col.key}
                      onClick={() => col.sortable !== false && handleSort(col.key)}
                      className={cn(
                        'text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider border-b border-slate-700/50',
                        col.sortable !== false
                          ? 'cursor-pointer hover:text-sky-400 transition-colors select-none'
                          : '',
                        sortKey === col.key ? 'text-sky-400' : 'text-slate-400'
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {col.label}
                        {col.sortable !== false && (
                          sortKey === col.key ? (
                            sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                          ) : (
                            <ArrowUpDown size={11} className="opacity-30" />
                          )
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginados.map((row, i) => {
                  const globalIdx = pagina * ITENS_POR_PAGINA + i + 1;
                  return (
                    <tr
                      key={i}
                      className={cn(
                        'group border-b border-slate-700/20 transition-colors',
                        i % 2 === 0 ? 'bg-transparent' : 'bg-slate-800/15',
                        'hover:bg-sky-500/[0.06]'
                      )}
                      style={{ animationDelay: `${i * 15}ms` }}
                    >
                      <td className="text-center px-2 py-2.5 text-slate-600 text-xs tabular-nums font-mono">
                        {globalIdx}
                      </td>
                      {colunas.map(col => (
                        <td key={col.key} className="px-3 py-2.5 text-slate-200">
                          {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700/40 bg-slate-900/80">
          <span className="text-xs text-slate-500">
            {totalPaginas > 1
              ? `Página ${pagina + 1} de ${totalPaginas} · Exibindo ${paginados.length} de ${filtrados.length}`
              : `${filtrados.length} registro${filtrados.length !== 1 ? 's' : ''}`
            }
          </span>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="p-1.5 rounded-lg hover:bg-slate-700/60 disabled:opacity-20 disabled:cursor-not-allowed text-slate-400 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(totalPaginas, 5) }, (_, idx) => {
                let pageNum: number;
                if (totalPaginas <= 5) {
                  pageNum = idx;
                } else if (pagina < 3) {
                  pageNum = idx;
                } else if (pagina > totalPaginas - 4) {
                  pageNum = totalPaginas - 5 + idx;
                } else {
                  pageNum = pagina - 2 + idx;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPagina(pageNum)}
                    className={cn(
                      'w-7 h-7 rounded-md text-xs font-medium transition-colors',
                      pageNum === pagina
                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
                    )}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1}
                className="p-1.5 rounded-lg hover:bg-slate-700/60 disabled:opacity-20 disabled:cursor-not-allowed text-slate-400 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helpers de renderização para uso nas colunas
export function BadgeUnidade({ nome }: { nome: string }) {
  const cores = CORES_UNIDADE[nome] || { bg: 'bg-slate-500/15', text: 'text-slate-300', dot: 'bg-slate-400' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium', cores.bg, cores.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cores.dot)} />
      {nome}
    </span>
  );
}

export function BadgeTipo({ tipo, variante }: { tipo: string; variante?: 'evasao' | 'nao_renovacao' | 'default' }) {
  const estilos = {
    evasao: 'bg-red-500/15 text-red-300 border-red-500/20',
    nao_renovacao: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
    default: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
  };
  const estilo = variante ? estilos[variante] : estilos.default;
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border', estilo)}>
      {tipo}
    </span>
  );
}

export function ValorParcela({ valor }: { valor: string }) {
  if (valor === '—') return <span className="text-slate-600">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold tabular-nums text-sm">
      {valor}
    </span>
  );
}

export function TextoCurso({ nome }: { nome: string }) {
  if (nome === '—') return <span className="text-slate-600">—</span>;
  return (
    <span className="text-sky-300/90 font-medium text-[13px]">
      {nome}
    </span>
  );
}
