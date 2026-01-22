import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface TabelaRenovacoesProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
}

export function TabelaRenovacoes({ data, onEdit, onDelete }: TabelaRenovacoesProps) {
  // Calcular reajuste médio
  const reajusteMedio = data.length > 0
    ? data.reduce((acc, item) => {
        if (item.valor_parcela_anterior && item.valor_parcela_novo) {
          return acc + ((item.valor_parcela_novo - item.valor_parcela_anterior) / item.valor_parcela_anterior) * 100;
        }
        return acc;
      }, 0) / data.length
    : 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr className="text-xs text-slate-400 uppercase tracking-wider">
            <th className="py-3 px-4 text-left">#</th>
            <th className="py-3 px-4 text-left">Data</th>
            <th className="py-3 px-4 text-left">Aluno</th>
            <th className="py-3 px-4 text-right">Anterior</th>
            <th className="py-3 px-4 text-right">Novo</th>
            <th className="py-3 px-4 text-center">Reajuste</th>
            <th className="py-3 px-4 text-left">Forma</th>
            <th className="py-3 px-4 text-left">Agente</th>
            <th className="py-3 px-4 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-slate-500">
                Nenhuma renovação registrada neste período
              </td>
            </tr>
          ) : (
            data.map((item, index) => {
              const reajuste = item.valor_parcela_anterior && item.valor_parcela_novo
                ? ((item.valor_parcela_novo - item.valor_parcela_anterior) / item.valor_parcela_anterior) * 100
                : 0;
              return (
                <tr key={item.id} className="border-t border-slate-700/30 hover:bg-slate-800/30">
                  <td className="py-3 px-4 text-slate-500">{index + 1}</td>
                  <td className="py-3 px-4 text-slate-300">
                    {new Date(item.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 text-white font-medium">{item.aluno_nome}</td>
                  <td className="py-3 px-4 text-right text-slate-400">
                    R$ {(item.valor_parcela_anterior || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-400 font-medium">
                    R$ {(item.valor_parcela_novo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      reajuste > 0 ? 'bg-emerald-500/20 text-emerald-400' : 
                      reajuste < 0 ? 'bg-rose-500/20 text-rose-400' : 
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {reajuste > 0 ? '+' : ''}{reajuste.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{item.forma_pagamento_nome || '-'}</td>
                  <td className="py-3 px-4 text-slate-300">{item.agente_comercial || '-'}</td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(item)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(item.id)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {data.length > 0 && (
          <tfoot className="bg-slate-800/50">
            <tr className="border-t border-slate-600">
              <td colSpan={5} className="py-3 px-4 text-right text-slate-400 font-medium">
                Totais: {data.length} renovações
              </td>
              <td className="py-3 px-4 text-center text-emerald-400 font-bold">
                +{reajusteMedio.toFixed(1)}%
              </td>
              <td colSpan={3} className="py-3 px-4 text-slate-400">Reajuste médio</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
