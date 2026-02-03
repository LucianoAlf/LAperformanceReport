'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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
import type { LojaCarteira, LojaCarteiraMovimentacao } from '@/types/lojinha';

interface ModalHistoricoCarteiraProps {
  open: boolean;
  onClose: () => void;
  carteira: LojaCarteira | null;
}

export function ModalHistoricoCarteira({ open, onClose, carteira }: ModalHistoricoCarteiraProps) {
  const [loading, setLoading] = useState(true);
  const [movimentacoes, setMovimentacoes] = useState<LojaCarteiraMovimentacao[]>([]);

  useEffect(() => {
    if (open && carteira) {
      loadMovimentacoes();
    }
  }, [open, carteira]);

  async function loadMovimentacoes() {
    if (!carteira) return;
    
    setLoading(true);
    try {
      const { data } = await supabase
        .from('loja_carteira_movimentacoes')
        .select('*')
        .eq('carteira_id', carteira.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setMovimentacoes(data || []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  }

  if (!carteira) return null;

  const nome = carteira.tipo_titular === 'farmer'
    ? carteira.colaboradores?.apelido || carteira.colaboradores?.nome || ''
    : carteira.professores?.nome || '';

  const tipo = carteira.tipo_titular === 'farmer' ? 'Farmer' : 'Professor';
  const unidade = carteira.unidades?.nome || '';

  function getTipoBadge(tipo: string) {
    switch (tipo) {
      case 'comissao_venda':
        return { label: 'Comissão venda', className: 'bg-emerald-500/20 text-emerald-400' };
      case 'comissao_indicacao':
        return { label: 'Comissão indicação', className: 'bg-purple-500/20 text-purple-400' };
      case 'moeda_la':
        return { label: '🪙 Moeda LA', className: 'bg-amber-500/20 text-amber-400' };
      case 'saque':
        return { label: 'Saque', className: 'bg-sky-500/20 text-sky-400' };
      case 'compra_loja':
        return { label: 'Compra loja', className: 'bg-amber-500/20 text-amber-400' };
      case 'estorno_comissao':
        return { label: 'Estorno', className: 'bg-rose-500/20 text-rose-400' };
      default:
        return { label: 'Ajuste', className: 'bg-slate-500/20 text-slate-400' };
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📋 Histórico da Carteira
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header com info do titular */}
          <div className="flex items-center gap-3 p-4 border-b border-slate-700">
            <div 
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg"
              style={{ background: 'linear-gradient(135deg, #ec4899, #f97316)' }}
            >
              {nome.charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="font-semibold text-white">{nome}</h4>
              <p className="text-xs text-slate-400">{unidade} • {tipo}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xl font-bold text-emerald-400 font-mono">
                R$ {carteira.saldo.toFixed(2).replace('.', ',')}
              </p>
              <p className="text-xs text-slate-400">Saldo atual</p>
            </div>
          </div>

          {/* Tabela de Movimentações */}
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Data</th>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Tipo</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">Valor</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">
                      Carregando...
                    </td>
                  </tr>
                ) : movimentacoes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">
                      Nenhuma movimentação encontrada
                    </td>
                  </tr>
                ) : (
                  movimentacoes.map((mov) => {
                    const badge = getTipoBadge(mov.tipo);
                    return (
                      <tr key={mov.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="p-3 font-mono text-xs text-slate-300">
                          {new Date(mov.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="p-3">
                          <Badge className={badge.className}>
                            {badge.label}
                          </Badge>
                        </td>
                        <td className={cn(
                          'p-3 font-mono text-sm text-right',
                          mov.valor > 0 ? 'text-emerald-400' : 'text-rose-400'
                        )}>
                          {mov.valor > 0 ? '+' : ''} R$ {Math.abs(mov.valor).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="p-3 font-mono text-sm text-right text-slate-300">
                          R$ {mov.saldo_apos.toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
