'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { LojaVenda, MOTIVOS_ESTORNO } from '@/types/lojinha';

interface ModalEstornoProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  venda: LojaVenda | null;
}

const MOTIVOS = [
  'Desistência do cliente',
  'Produto com defeito',
  'Erro no registro',
  'Troca de produto',
  'Outro',
];

export function ModalEstorno({ open, onClose, onSuccess, venda }: ModalEstornoProps) {
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');

  if (!venda) return null;

  // Calcular comissões que serão estornadas
  const comissaoVendedor = venda.total * 0.05; // 5% padrão

  async function handleEstornar() {
    if (!motivo) {
      alert('Selecione o motivo do estorno');
      return;
    }

    setLoading(true);
    try {
      // Atualizar status da venda
      await supabase
        .from('loja_vendas')
        .update({
          status: 'estornada',
          estornada_em: new Date().toISOString(),
          motivo_estorno: motivo + (observacoes ? ` - ${observacoes}` : ''),
        })
        .eq('id', venda.id);

      // Reverter estoque
      for (const item of venda.loja_vendas_itens || []) {
        const { data: estoque } = await supabase
          .from('loja_estoque')
          .select('id, quantidade')
          .eq('produto_id', item.produto_id)
          .is('variacao_id', item.variacao_id)
          .eq('unidade_id', venda.unidade_id)
          .single();

        if (estoque) {
          const novoSaldo = estoque.quantidade + item.quantidade;
          await supabase
            .from('loja_estoque')
            .update({ quantidade: novoSaldo })
            .eq('id', estoque.id);

          // Registrar movimentação
          await supabase
            .from('loja_movimentacoes_estoque')
            .insert({
              produto_id: item.produto_id,
              variacao_id: item.variacao_id,
              unidade_id: venda.unidade_id,
              tipo: 'estorno',
              quantidade: item.quantidade,
              saldo_apos: novoSaldo,
              referencia_id: venda.id,
              observacoes: `Estorno da venda #${venda.id}`,
            });
        }
      }

      // TODO: Estornar comissões da carteira

      onSuccess();
    } catch (error) {
      console.error('Erro ao estornar venda:', error);
      alert('Erro ao estornar venda');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-400">
            🔄 Estornar Venda #{venda.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Aviso */}
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-400">Atenção!</p>
                <p className="text-sm text-slate-300 mt-1">Esta ação irá:</p>
                <ul className="text-sm text-white mt-2 space-y-1 list-disc list-inside">
                  <li>Reverter o estoque dos produtos</li>
                  <li>Estornar a comissão do vendedor (R$ {comissaoVendedor.toFixed(2).replace('.', ',')})</li>
                  <li>Estornar a comissão do professor indicador (se houver)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Motivo do Estorno *
            </label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Observações
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Detalhes adicionais..."
              className="mt-1 w-full h-20 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleEstornar} 
            disabled={loading}
          >
            {loading ? 'Estornando...' : '🔄 Confirmar Estorno'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
