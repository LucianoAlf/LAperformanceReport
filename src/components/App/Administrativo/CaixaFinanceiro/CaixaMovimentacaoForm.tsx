import { FormEvent, useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatarInputMoedaCaixa,
  formatarNumeroComoInputMoedaCaixa,
  parseMoedaCaixa,
} from '@/lib/caixaFinanceiro';
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
  title?: string;
  description?: string;
  submitLabel?: string;
  initialValues?: Partial<NovaCaixaMovimentacaoInput>;
  onCancel?: () => void;
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

export function CaixaMovimentacaoForm({
  disabled = false,
  saving = false,
  title = 'Movimentacao manual',
  description = 'Entradas, saidas e vendas do dia.',
  submitLabel = 'Adicionar movimentacao',
  initialValues,
  onCancel,
  onSubmit,
}: CaixaMovimentacaoFormProps) {
  const [ambiente, setAmbiente] = useState<CaixaAmbiente>(initialValues?.ambiente || 'cofre');
  const [tipo, setTipo] = useState<CaixaTipoMovimento>(initialValues?.tipo || 'entrada');
  const [formaPagamento, setFormaPagamento] = useState<CaixaFormaPagamento>(initialValues?.forma_pagamento || 'dinheiro');
  const [categoria, setCategoria] = useState<CaixaCategoria>(initialValues?.categoria || 'lojinha');
  const [descricao, setDescricao] = useState(initialValues?.descricao || '');
  const [valor, setValor] = useState(formatarNumeroComoInputMoedaCaixa(initialValues?.valor));
  const [responsavel, setResponsavel] = useState(initialValues?.responsavel || '');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (ambiente === 'venda') {
      setTipo('entrada');
    }
  }, [ambiente]);

  useEffect(() => {
    setAmbiente(initialValues?.ambiente || 'cofre');
    setTipo(initialValues?.tipo || 'entrada');
    setFormaPagamento(initialValues?.forma_pagamento || 'dinheiro');
    setCategoria(initialValues?.categoria || 'lojinha');
    setDescricao(initialValues?.descricao || '');
    setValor(formatarNumeroComoInputMoedaCaixa(initialValues?.valor));
    setResponsavel(initialValues?.responsavel || '');
    setErro(null);
  }, [initialValues]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);

    const valorNumerico = parseMoedaCaixa(valor);
    if (valorNumerico <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    if (descricao.trim().length < 3) {
      setErro('Descreva o motivo da movimentacao.');
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

    if (!initialValues) {
      setDescricao('');
      setValor(formatarNumeroComoInputMoedaCaixa(0));
      setResponsavel('');
    }
    setErro(null);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <Plus className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-400">{description}</p>
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
          <Select
            value={tipo}
            disabled={disabled || ambiente === 'venda'}
            onValueChange={(value) => setTipo(value as CaixaTipoMovimento)}
          >
            <SelectTrigger className="h-10 rounded-lg bg-slate-950/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saida</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          Forma
          <Select
            value={formaPagamento}
            disabled={disabled}
            onValueChange={(value) => setFormaPagamento(value as CaixaFormaPagamento)}
          >
            <SelectTrigger className="h-10 rounded-lg bg-slate-950/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {formas.map((forma) => (
                <SelectItem key={forma.value} value={forma.value}>{forma.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-slate-400">
          Valor
          <Input
            value={valor}
            disabled={disabled}
            inputMode="numeric"
            onChange={(e) => setValor(formatarInputMoedaCaixa(e.target.value))}
            placeholder="R$ 0,00"
            className="rounded-lg bg-slate-950/70 font-semibold"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          Categoria
          <Select
            value={categoria}
            disabled={disabled}
            onValueChange={(value) => setCategoria(value as CaixaCategoria)}
          >
            <SelectTrigger className="h-10 rounded-lg bg-slate-950/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <label className="mt-3 block space-y-1 text-xs text-slate-400">
        Descricao / motivo
        <Input
          value={descricao}
          disabled={disabled}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex: venda lojinha - camiseta"
          className="rounded-lg bg-slate-950/70"
        />
      </label>

      <label className="mt-3 block space-y-1 text-xs text-slate-400">
        Responsavel
        <Input
          value={responsavel}
          disabled={disabled}
          onChange={(e) => setResponsavel(e.target.value)}
          placeholder="Nome"
          className="rounded-lg bg-slate-950/70"
        />
      </label>

      {erro && (
        <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {erro}
        </p>
      )}

      <div className={cn('mt-4 flex gap-2', onCancel ? 'justify-end' : 'block')}>
        {onCancel && (
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={disabled || saving} className={cn(onCancel ? '' : 'w-full')}>
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
