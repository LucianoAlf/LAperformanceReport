'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { LojaCarteira } from '@/types/lojinha';

interface ModalSaqueProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  carteira: LojaCarteira | null;
}

export function ModalSaque({ open, onClose, onSuccess, carteira }: ModalSaqueProps) {
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState('');
  const [formaRecebimento, setFormaRecebimento] = useState('folha');
  const [observacoes, setObservacoes] = useState('');

  // Inicializar valor com saldo total - useEffect ANTES de qualquer return condicional
  React.useEffect(() => {
    if (open && carteira) {
      setValor(carteira.saldo.toFixed(2).replace('.', ','));
    }
  }, [open, carteira]);

  if (!carteira) return null;

  const nome = carteira.tipo_titular === 'farmer'
    ? carteira.colaboradores?.apelido || carteira.colaboradores?.nome || ''
    : carteira.professores?.nome || '';

  const tipo = carteira.tipo_titular === 'farmer' ? 'Farmer' : 'Professor';
  const unidade = carteira.unidades?.nome || '';

  async function handleSubmit() {
    const valorNum = parseFloat(valor.replace(',', '.'));
    
    if (!valorNum || valorNum <= 0) {
      alert('Informe um valor válido');
      return;
    }

    if (valorNum > carteira.saldo) {
      alert('Valor maior que o saldo disponível');
      return;
    }

    setLoading(true);
    try {
      const novoSaldo = carteira.saldo - valorNum;

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
          tipo: 'saque',
          valor: -valorNum,
          saldo_apos: novoSaldo,
          referencia_tipo: formaRecebimento,
          descricao: observacoes || `Saque via ${formaRecebimento}`,
        });

      onSuccess();
    } catch (error) {
      console.error('Erro ao registrar saque:', error);
      alert('Erro ao registrar saque');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            💸 Registrar Saque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info do Titular */}
          <div className="text-center py-4">
            <div 
              className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #ec4899, #f97316)' }}
            >
              {nome.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-lg font-semibold text-white">{nome}</h3>
            <p className="text-sm text-slate-400">{unidade} • {tipo}</p>
            <p className="text-3xl font-bold text-emerald-400 font-mono mt-3">
              R$ {carteira.saldo.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-xs text-slate-400">Saldo disponível</p>
          </div>

          {/* Valor */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Valor do Saque (R$) *
            </label>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="mt-1 text-center text-lg font-mono"
            />
          </div>

          {/* Forma de Recebimento */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Forma de Recebimento *
            </label>
            <Select value={formaRecebimento} onValueChange={setFormaRecebimento}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="folha">📋 Desconto em folha (próximo pagamento)</SelectItem>
                <SelectItem value="pix">💰 Pix</SelectItem>
                <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              Observações
            </label>
            <Input
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex: Referente a Jan/2026"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Registrando...' : '💸 Confirmar Saque'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
