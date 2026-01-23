import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, FileText, Edit2, Trash2, DollarSign, Package, Wrench
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
import { gerarPdfInventarioSala } from './GerarPdfInventario';

interface InventarioPorSalaProps {
  sala: Sala;
  itens: ItemInventario[];
  onVoltar: () => void;
  onEditarItem: (item: ItemInventario) => void;
  onRecarregar: () => void;
}

export function InventarioPorSala({ 
  sala, 
  itens, 
  onVoltar, 
  onEditarItem,
  onRecarregar 
}: InventarioPorSalaProps) {
  const [alertDialogAberto, setAlertDialogAberto] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<ItemInventario | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Calcular valor total
  const valorTotal = itens.reduce((acc, item) => 
    acc + (item.valor_compra || 0) * item.quantidade, 0
  );

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

  async function handleGerarPdf() {
    setGerandoPdf(true);
    try {
      await gerarPdfInventarioSala(sala, itens);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setGerandoPdf(false);
    }
  }

  function formatarValor(valor: number | null): string {
    if (!valor) return '-';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onVoltar}
            className="p-2 hover:bg-slate-800 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">
              🚪 Sala: {sala.nome}
            </h2>
            <p className="text-sm text-slate-400">{sala.unidade_nome}</p>
          </div>
        </div>

        <button
          onClick={handleGerarPdf}
          disabled={gerandoPdf || itens.length === 0}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          {gerandoPdf ? 'Gerando...' : 'Gerar PDF'}
        </button>
      </div>

      {/* KPIs da Sala */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Itens</p>
              <p className="text-xl font-bold text-white">{itens.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Valor Total</p>
              <p className="text-xl font-bold text-white">{formatarValor(valorTotal)}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Wrench className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Em Manutenção</p>
              <p className="text-xl font-bold text-white">
                {itens.filter(i => i.status === 'em_manutencao').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Equipamentos */}
      {itens.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 border border-slate-700 rounded-xl">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Nenhum equipamento cadastrado nesta sala.</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  ✓
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Item
                </th>
                <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Qtd
                </th>
                <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Valor Un.
                </th>
                <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Condição
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Observações
                </th>
                <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {itens.map((item) => {
                const categoriaConfig = getCategoriaConfig(item.categoria);
                const condicaoConfig = getCondicaoConfig(item.condicao);

                return (
                  <tr key={item.id} className="hover:bg-slate-700/30 transition">
                    <td className="px-4 py-3">
                      <div className="w-5 h-5 rounded border-2 border-emerald-500 bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{categoriaConfig.emoji}</span>
                        <div>
                          <p className="font-medium text-white">{item.nome}</p>
                          <p className="text-xs text-slate-400">
                            {item.marca} {item.modelo && `- ${item.modelo}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-white font-medium">{item.quantidade}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white">{formatarValor(item.valor_compra)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${condicaoConfig.cor}`}>
                        {condicaoConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-400 truncate max-w-[200px] block">
                        {item.observacoes || '-'}
                      </span>
                    </td>
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
      )}

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
    </div>
  );
}
