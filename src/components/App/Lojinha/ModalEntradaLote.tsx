'use client';

import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface ProdutoEstoque {
  produto_id: number;
  variacao_id: number | null;
  nome: string;
  variacao_nome: string | null;
  estoque_atual: number;
  entrada: string;
}

interface ModalEntradaLoteProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  unidadeId: string;
}

const UNIDADES = [
  { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra', codigo: 'barra' },
  { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande', codigo: 'cg' },
  { id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Recreio', codigo: 'recreio' },
];

export function ModalEntradaLote({ open, onClose, onSuccess, unidadeId }: ModalEntradaLoteProps) {
  const [loading, setLoading] = useState(false);
  const [unidadeSelecionada, setUnidadeSelecionada] = useState(
    unidadeId !== 'todos' ? unidadeId : UNIDADES[0].id
  );
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);

  useEffect(() => {
    if (open) {
      loadProdutos();
    }
  }, [open, unidadeSelecionada]);

  async function loadProdutos() {
    setLoading(true);
    try {
      // Buscar produtos com variações
      const { data: prods } = await supabase
        .from('loja_produtos')
        .select(`
          id,
          nome,
          loja_variacoes(id, nome)
        `)
        .eq('ativo', true)
        .order('nome');

      if (!prods) return;

      // Montar lista de produtos/variações com estoque
      const lista: ProdutoEstoque[] = [];

      for (const p of prods) {
        if (p.loja_variacoes && p.loja_variacoes.length > 0) {
          // Produto com variações
          for (const v of p.loja_variacoes) {
            const { data: estoque } = await supabase
              .from('loja_estoque')
              .select('quantidade')
              .eq('produto_id', p.id)
              .eq('variacao_id', v.id)
              .eq('unidade_id', unidadeSelecionada)
              .single();

            lista.push({
              produto_id: p.id,
              variacao_id: v.id,
              nome: p.nome,
              variacao_nome: v.nome,
              estoque_atual: estoque?.quantidade || 0,
              entrada: '',
            });
          }
        } else {
          // Produto sem variação
          const { data: estoque } = await supabase
            .from('loja_estoque')
            .select('quantidade')
            .eq('produto_id', p.id)
            .is('variacao_id', null)
            .eq('unidade_id', unidadeSelecionada)
            .single();

          lista.push({
            produto_id: p.id,
            variacao_id: null,
            nome: p.nome,
            variacao_nome: null,
            estoque_atual: estoque?.quantidade || 0,
            entrada: '',
          });
        }
      }

      setProdutos(lista);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setLoading(false);
    }
  }

  function updateEntrada(index: number, value: string) {
    const updated = [...produtos];
    updated[index].entrada = value;
    setProdutos(updated);
  }

  async function handleSubmit() {
    const produtosComEntrada = produtos.filter(p => p.entrada && parseInt(p.entrada) > 0);
    
    if (produtosComEntrada.length === 0) {
      alert('Informe a quantidade de entrada para pelo menos um produto');
      return;
    }

    setLoading(true);
    try {
      for (const p of produtosComEntrada) {
        const quantidade = parseInt(p.entrada);
        const novoSaldo = p.estoque_atual + quantidade;

        // Verificar se já existe registro de estoque
        const { data: estoqueExistente } = await supabase
          .from('loja_estoque')
          .select('id, quantidade')
          .eq('produto_id', p.produto_id)
          .eq('unidade_id', unidadeSelecionada)
          .is('variacao_id', p.variacao_id)
          .single();

        if (estoqueExistente) {
          // Atualizar
          await supabase
            .from('loja_estoque')
            .update({ quantidade: novoSaldo })
            .eq('id', estoqueExistente.id);
        } else {
          // Inserir
          await supabase
            .from('loja_estoque')
            .insert({
              produto_id: p.produto_id,
              variacao_id: p.variacao_id,
              unidade_id: unidadeSelecionada,
              quantidade: novoSaldo,
            });
        }

        // Registrar movimentação
        await supabase
          .from('loja_movimentacoes_estoque')
          .insert({
            produto_id: p.produto_id,
            variacao_id: p.variacao_id,
            unidade_id: unidadeSelecionada,
            tipo: 'entrada',
            quantidade: quantidade,
            saldo_apos: novoSaldo,
            observacoes: 'Entrada em lote',
          });
      }

      onSuccess();
    } catch (error) {
      console.error('Erro ao registrar entrada:', error);
      alert('Erro ao registrar entrada');
    } finally {
      setLoading(false);
    }
  }

  const unidadeNome = UNIDADES.find(u => u.id === unidadeSelecionada)?.nome || '';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📥 Entrada de Estoque em Lote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seletor de Unidade */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Unidade
            </label>
            <Select
              value={unidadeSelecionada}
              onValueChange={setUnidadeSelecionada}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    📍 {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabela de Produtos */}
          <div className="border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">
                    Produto / Variação
                  </th>
                  <th className="text-center p-3 text-xs font-semibold text-slate-400">
                    Estoque Atual
                  </th>
                  <th className="text-center p-3 text-xs font-semibold text-slate-400">
                    Entrada
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400">
                      Carregando...
                    </td>
                  </tr>
                ) : produtos.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400">
                      Nenhum produto cadastrado
                    </td>
                  </tr>
                ) : (
                  produtos.map((p, i) => (
                    <tr key={`${p.produto_id}-${p.variacao_id}`} className="border-t border-slate-700/50">
                      <td className="p-3 text-sm text-white">
                        {p.nome}
                        {p.variacao_nome && (
                          <span className="text-slate-400"> — {p.variacao_nome}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={cn(
                          'font-mono text-sm',
                          p.estoque_atual === 0 ? 'text-rose-400' :
                          p.estoque_atual < 5 ? 'text-amber-400' : 'text-slate-300'
                        )}>
                          {p.estoque_atual}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <Input
                          type="number"
                          value={p.entrada}
                          onChange={(e) => updateEntrada(i, e.target.value)}
                          placeholder="0"
                          className="w-16 h-8 text-center text-sm mx-auto"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Registrando...' : '📥 Registrar Entrada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
