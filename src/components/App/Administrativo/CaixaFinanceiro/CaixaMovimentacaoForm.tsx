import { FormEvent, useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  CaixaAmbiente,
  CaixaCategoria,
  CaixaFormaPagamento,
  CaixaTipoMovimento,
  NovaCaixaMovimentacaoInput,
} from '@/types/caixa';

interface CaixaMovimentacaoFormProps {
  disabled?: boolean;
  saving?: boolean;
  onSubmit: (input: NovaCaixaMovimentacaoInput) => Promise<void>;
}

const formas: { value: CaixaFormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'cartao', label: 'Cartao' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'outro', label: 'Outro' },
];

const categorias: { value: CaixaCategoria; label: string }[] = [
  { value: 'lojinha', label: 'Lojinha' },
  { value: 'seguranca', label: 'Seguranca' },
  { value: 'troco', label: 'Troco' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'despesa', label: 'Despesa' },
  { value: 'outro', label: 'Outro' },
];

function parseMoney(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CaixaMovimentacaoForm({ disabled = false, saving = false, onSubmit }: CaixaMovimentacaoFormProps) {
  const [ambiente, setAmbiente] = useState<CaixaAmbiente>('cofre');
  const [tipo, setTipo] = useState<CaixaTipoMovimento>('entrada');
  const [formaPagamento, setFormaPagamento] = useState<CaixaFormaPagamento>('dinheiro');
  const [categoria, setCategoria] = useState<CaixaCategoria>('lojinha');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (ambiente === 'venda') {
      setTipo('entrada');
    }
    if (ambiente === 'cofre') {
      setFormaPagamento('dinheiro');
    }
  }, [ambiente]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);

    const valorNumerico = parseMoney(valor);
    if (valorNumerico <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    if (descricao.trim().length < 3) {
      setErro('Descreva o motivo da movimentacao.');
      return;
    }
    if (ambiente === 'cofre' && formaPagamento !== 'dinheiro') {
      setErro('Caixa-cofre fisico deve usar forma dinheiro.');
      return;
    }

    await onSubmit({
      ambiente,
      tipo,
      forma_pagamento: formaPagamento,
      categoria,
      descricao: descricao.trim(),
      valor: valorNumerico,
      responsavel: responsavel.trim() || undefined,
    });

    setDescricao('');
    setValor('');
    setResponsavel('');
    setErro(null);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <Plus className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-white">Movimentacao manual</h3>
          <p className="text-xs text-slate-400">Entradas, saidas e vendas do dia.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950/40 p-1">
        {(['cofre', 'venda'] as CaixaAmbiente[]).map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => setAmbiente(option)}
            className={cn(
              'rounded-md px-3 py-2 text-xs font-medium transition-colors',
              ambiente === option ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            {option === 'cofre' ? 'Caixa-cofre' : 'Venda'}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-slate-400">
          Tipo
          <select
            value={tipo}
            disabled={disabled || ambiente === 'venda'}
            onChange={(e) => setTipo(e.target.value as CaixaTipoMovimento)}
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saida</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          Forma
          <select
            value={formaPagamento}
            disabled={disabled || ambiente === 'cofre'}
            onChange={(e) => setFormaPagamento(e.target.value as CaixaFormaPagamento)}
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
          >
            {formas.map((forma) => (
              <option key={forma.value} value={forma.value}>{forma.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-slate-400">
          Valor
          <input
            value={valor}
            disabled={disabled}
            onChange={(e) => setValor(e.target.value)}
            placeholder="R$ 0,00"
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          Categoria
          <select
            value={categoria}
            disabled={disabled}
            onChange={(e) => setCategoria(e.target.value as CaixaCategoria)}
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
          >
            {categorias.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block space-y-1 text-xs text-slate-400">
        Descricao / motivo
        <input
          value={descricao}
          disabled={disabled}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex: venda lojinha - camiseta"
          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
        />
      </label>

      <label className="mt-3 block space-y-1 text-xs text-slate-400">
        Responsavel
        <input
          value={responsavel}
          disabled={disabled}
          onChange={(e) => setResponsavel(e.target.value)}
          placeholder="Nome"
          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
        />
      </label>

      {erro && (
        <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {erro}
        </p>
      )}

      <Button type="submit" disabled={disabled || saving} className="mt-4 w-full">
        <Save className="h-4 w-4" />
        Adicionar movimentacao
      </Button>
    </form>
  );
}
