import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarMoedaCaixa } from '@/lib/caixaFinanceiro';
import type { CaixaMovimentacao } from '@/types/caixa';

interface CaixaMovimentacoesTableProps {
  movimentos: CaixaMovimentacao[];
  disabled?: boolean;
  onDelete: (id: string) => Promise<void>;
}

function badgeClass(tipo: CaixaMovimentacao['tipo']) {
  return tipo === 'entrada'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/25 bg-rose-500/10 text-rose-300';
}

export function CaixaMovimentacoesTable({ movimentos, disabled = false, onDelete }: CaixaMovimentacoesTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Movimentacoes do dia</h3>
          <p className="text-xs text-slate-400">{movimentos.length} lancamento(s)</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-800/70 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Ambiente</th>
              <th className="px-4 py-3">Descricao</th>
              <th className="px-4 py-3">Forma</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Responsavel</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {movimentos.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma movimentacao registrada para este caixa.
                </td>
              </tr>
            ) : (
              movimentos.map((mov) => (
                <tr key={mov.id} className="text-slate-300 hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', badgeClass(mov.tipo))}>
                      {mov.tipo === 'entrada' ? 'Entrada' : 'Saida'}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-400">{mov.ambiente}</td>
                  <td className="px-4 py-3 font-medium text-white">{mov.descricao}</td>
                  <td className="px-4 py-3 capitalize text-slate-400">{mov.forma_pagamento}</td>
                  <td className="px-4 py-3 capitalize text-slate-400">{mov.categoria}</td>
                  <td className="px-4 py-3 text-right font-semibold text-white">{formatarMoedaCaixa(Number(mov.valor))}</td>
                  <td className="px-4 py-3 text-slate-400">{mov.responsavel || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => void onDelete(mov.id)}
                      aria-label="Excluir movimentacao"
                      className="h-8 w-8 text-slate-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
