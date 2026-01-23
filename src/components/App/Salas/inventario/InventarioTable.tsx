import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Edit2, Trash2, Eye, MoreVertical, ExternalLink, Image as ImageIcon
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ItemInventario, Sala } from './types';
import { getCategoriaConfig, getStatusConfig, getCondicaoConfig } from './types';

interface InventarioTableProps {
  itens: ItemInventario[];
  salas: Sala[];
  onEditarItem: (item: ItemInventario) => void;
  onVerSala: (salaId: number) => void;
  onRecarregar: () => void;
}

export function InventarioTable({ 
  itens, 
  salas, 
  onEditarItem, 
  onVerSala,
  onRecarregar 
}: InventarioTableProps) {
  const [alertDialogAberto, setAlertDialogAberto] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<ItemInventario | null>(null);

  async function handleExcluirItem() {
    if (!itemParaExcluir) return;

    try {
      const { error } = await supabase
        .from('inventario')
        .update({ ativo: false })
        .eq('id', itemParaExcluir.id);

      if (error) {
        console.error('Erro ao excluir item:', error);
        alert('Erro ao excluir item: ' + error.message);
        return;
      }

      setAlertDialogAberto(false);
      setItemParaExcluir(null);
      onRecarregar();
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao excluir item. Tente novamente.');
    }
  }

  function formatarValor(valor: number | null): string {
    if (!valor) return '-';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  return (
    <>
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Item
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Patrimônio
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Sala
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Categoria
                </th>
                <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Valor
                </th>
                <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Qtd
                </th>
                <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Status
                </th>
                <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Condição
                </th>
                <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {itens.map((item) => {
                const categoriaConfig = getCategoriaConfig(item.categoria);
                const statusConfig = getStatusConfig(item.status);
                const condicaoConfig = getCondicaoConfig(item.condicao);

                return (
                  <tr 
                    key={item.id} 
                    className="hover:bg-slate-700/30 transition"
                  >
                    {/* Item */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.foto_url ? (
                          <img 
                            src={item.foto_url} 
                            alt={item.nome}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
                            <span className="text-lg">{categoriaConfig.emoji}</span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white">{item.nome}</p>
                          <p className="text-xs text-slate-400">
                            {item.marca} {item.modelo && `- ${item.modelo}`}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Patrimônio */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-300 font-mono">
                        {item.codigo_patrimonio || '-'}
                      </span>
                    </td>

                    {/* Sala */}
                    <td className="px-4 py-3">
                      {item.sala_id ? (
                        <button
                          onClick={() => onVerSala(item.sala_id!)}
                          className="text-sm text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1"
                        >
                          {item.sala_nome}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">Sem sala</span>
                      )}
                    </td>

                    {/* Categoria */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-300">
                        {categoriaConfig.emoji} {categoriaConfig.label}
                      </span>
                    </td>

                    {/* Valor */}
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-white font-medium">
                        {formatarValor(item.valor_compra)}
                      </span>
                    </td>

                    {/* Quantidade */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-white">{item.quantidade}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${statusConfig.cor}`}>
                        {statusConfig.label}
                      </span>
                    </td>

                    {/* Condição */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${condicaoConfig.cor}`}>
                        {condicaoConfig.label}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onEditarItem(item)}
                          className="p-2 hover:bg-slate-700 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4 text-slate-400 hover:text-white" />
                        </button>
                        <button
                          onClick={() => {
                            setItemParaExcluir(item);
                            setAlertDialogAberto(true);
                          }}
                          className="p-2 hover:bg-red-900/30 rounded-lg transition"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer com total */}
        <div className="border-t border-slate-700 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {itens.length} item{itens.length !== 1 ? 's' : ''} no inventário
          </span>
          <span className="text-sm font-medium text-white">
            Valor Total: {itens.reduce((acc, item) => acc + (item.valor_compra || 0) * item.quantidade, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
      </div>

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={alertDialogAberto} onOpenChange={setAlertDialogAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Item do Inventário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-white">"{itemParaExcluir?.nome}"</strong>?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemParaExcluir(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirItem}>
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
