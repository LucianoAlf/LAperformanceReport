import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Coluna {
  key: string;
  label: string;
  render?: (valor: any, row: any) => React.ReactNode;
}

interface ModalDetalheKPIProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  descricao?: string;
  dados: any[];
  colunas: Coluna[];
  carregando?: boolean;
}

const ITENS_POR_PAGINA = 50;

export function ModalDetalheKPI({ open, onClose, titulo, descricao, dados, colunas, carregando }: ModalDetalheKPIProps) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return dados;
    const termo = busca.toLowerCase();
    return dados.filter(d =>
      colunas.some(col => {
        const val = d[col.key];
        return val && String(val).toLowerCase().includes(termo);
      })
    );
  }, [dados, busca, colunas]);

  const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);
  const paginados = filtrados.slice(pagina * ITENS_POR_PAGINA, (pagina + 1) * ITENS_POR_PAGINA);

  const handleBusca = (valor: string) => {
    setBusca(valor);
    setPagina(0);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        {/* Busca + contador */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={busca}
              onChange={e => handleBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
            />
          </div>
          <span className="text-sm text-slate-400 whitespace-nowrap">
            {filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto">
          {carregando ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Carregando...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Nenhum registro encontrado
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  {colunas.map(col => (
                    <th key={col.key} className="text-left px-3 py-2 text-slate-400 font-medium border-b border-slate-700">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginados.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                    {colunas.map(col => (
                      <td key={col.key} className="px-3 py-2 text-white">
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-700">
            <span className="text-xs text-slate-400">
              Página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1}
                className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
