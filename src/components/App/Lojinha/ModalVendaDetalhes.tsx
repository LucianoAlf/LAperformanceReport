'use client';

import React from 'react';
import { MessageCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { LojaVenda } from '@/types/lojinha';

interface ModalVendaDetalhesProps {
  open: boolean;
  onClose: () => void;
  venda: LojaVenda | null;
  onEstornar: () => void;
}

export function ModalVendaDetalhes({ open, onClose, venda, onEstornar }: ModalVendaDetalhesProps) {
  if (!venda) return null;

  const dataFormatada = new Date(venda.data_venda).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  function handleReenviarComprovante() {
    alert('📱 Comprovante reenviado!');
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🧾 Detalhes da Venda #{venda.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase">Data</p>
              <p className="font-semibold text-white">{dataFormatada}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Vendedor</p>
              <p className="font-semibold text-white">
                {venda.vendedor?.apelido || venda.vendedor?.nome || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Cliente</p>
              <p className="font-semibold text-white">
                {venda.cliente_nome || venda.alunos?.nome || 'Avulso'}
              </p>
              <p className="text-xs text-slate-400 capitalize">
                {venda.tipo_cliente} — {venda.unidades?.nome || ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Pagamento</p>
              <p className={cn(
                'font-semibold',
                venda.forma_pagamento === 'pix' ? 'text-emerald-400' : 'text-white'
              )}>
                {venda.forma_pagamento === 'pix' ? 'Pix' :
                 venda.forma_pagamento === 'credito' ? `Cartão Crédito (${venda.parcelas}x)` :
                 venda.forma_pagamento === 'debito' ? 'Cartão Débito' :
                 venda.forma_pagamento === 'folha' ? 'Desconto em Folha' :
                 venda.forma_pagamento === 'dinheiro' ? 'Dinheiro' : 'Saldo Carteira'}
              </p>
            </div>
          </div>

          {/* Itens */}
          <div className="bg-slate-800/50 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Itens</p>
            <div className="space-y-2">
              {venda.loja_vendas_itens?.map((item, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-0">
                  <span className="text-sm text-white">
                    {item.quantidade}x {item.produto_nome}
                    {item.variacao_nome && <span className="text-slate-400"> ({item.variacao_nome})</span>}
                  </span>
                  <span className="font-mono text-sm text-white">
                    R$ {item.subtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totais */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="font-mono">R$ {venda.subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Desconto</span>
              <span className="font-mono">R$ {venda.desconto.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
              <span>Total</span>
              <span className={cn(
                'font-mono',
                venda.status === 'estornada' ? 'text-slate-400 line-through' : 'text-emerald-400'
              )}>
                R$ {venda.total.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>

          {/* Status do Comprovante */}
          {venda.comprovante_enviado && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-sm text-emerald-400">
              ✓ Comprovante enviado via WhatsApp em {new Date(venda.comprovante_enviado_em || venda.data_venda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {/* Status Estornada */}
          {venda.status === 'estornada' && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400">
              ⚠️ Venda estornada em {new Date(venda.estornada_em || '').toLocaleDateString('pt-BR')}
              {venda.motivo_estorno && <p className="mt-1 text-slate-400">Motivo: {venda.motivo_estorno}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReenviarComprovante}
            className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
          >
            <MessageCircle className="w-4 h-4 mr-1" />
            Reenviar Comprovante
          </Button>
          {venda.status === 'concluida' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onEstornar}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Estornar Venda
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
