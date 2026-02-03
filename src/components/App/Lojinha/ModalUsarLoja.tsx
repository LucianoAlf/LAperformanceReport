'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { LojaCarteira } from '@/types/lojinha';

interface ModalUsarLojaProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  carteira: LojaCarteira | null;
}

export function ModalUsarLoja({ open, onClose, onSuccess, carteira }: ModalUsarLojaProps) {
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');

  // Reset form quando modal abre
  React.useEffect(() => {
    if (open) {
      setValor('');
      setDescricao('');
    }
  }, [open]);

  if (!carteira) return null;

  const nome = carteira.tipo_titular === 'farmer'
    ? carteira.colaboradores?.apelido || carteira.colaboradores?.nome || ''
    : carteira.professores?.nome || '';

  const tipo = carteira.tipo_titular === 'farmer' ? 'Farmer' : 'Professor';
  const unidade = carteira.unidades?.nome || '';

  const valorNum = parseFloat(valor.replace(',', '.')) || 0;
  const novoSaldo = carteira.saldo - valorNum;

  async function handleSubmit() {
    if (!valorNum || valorNum <= 0) {
      alert('Informe um valor válido');
      return;
    }

    if (valorNum > carteira.saldo) {
      alert('Valor maior que o saldo disponível');
      return;
    }

    if (!descricao) {
      alert('Informe a descrição da compra');
      return;
    }

    setLoading(true);
    try {
      // Atualizar saldo
      await supabase
        .from('loja_carteira')
        .update({ saldo: novoSaldo })
        .eq('id', carteira.id);

      // Registrar movimentação
      await supabase
        .from('loja_carteira_movimentacoes')
        .insert({
          carteira_id: carteira.id,
          tipo: 'compra_loja',
          valor: -valorNum,
          saldo_apos: novoSaldo,
          referencia_tipo: 'compra',
          descricao: descricao,
        });

      onSuccess();
    } catch (error) {
      console.error('Erro ao registrar compra:', error);
      alert('Erro ao registrar compra');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            💳 Usar Saldo na Loja
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info do Titular */}
          <div className="text-center py-4">
            <div 
              className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-xl font-bold"
              style={{ 
                background: carteira.tipo_titular === 'professor' 
                  ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' 
                  : 'linear-gradient(135deg, #ec4899, #f97316)',
                color: carteira.tipo_titular === 'professor' ? '#0b0f19' : '#fff'
              }}
            >
              {nome.split(' ').pop()?.charAt(0).toUpperCase() || nome.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-lg font-semibold text-white">{nome}</h3>
            <p className="text-sm text-slate-400">{unidade} • {tipo}</p>
            <p className="text-3xl font-bold text-emerald-400 font-mono mt-3">
              R$ {carteira.saldo.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-xs text-slate-400">
              Saldo disponível {carteira.moedas_la > 0 && <span className="inline-flex items-center gap-1">(inclui <img src="/lalita.svg" alt="Lalita" className="w-3 h-3" /> {carteira.moedas_la} Lalitas)</span>}
            </p>
          </div>

          {/* Valor */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Valor a Utilizar (R$) *
            </label>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="mt-1 text-center text-lg font-mono"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Descrição da Compra *
            </label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: 1x Baqueta 5A"
              className="mt-1"
            />
          </div>

          {/* Resumo */}
          {valorNum > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Saldo atual</span>
                <span className="font-mono">R$ {carteira.saldo.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Valor da compra</span>
                <span className="font-mono text-rose-400">- R$ {valorNum.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-700">
                <span>Novo saldo</span>
                <span className="font-mono text-emerald-400">R$ {novoSaldo.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Registrando...' : '💳 Confirmar Uso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
