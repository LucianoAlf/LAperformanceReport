import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatarInputMoedaCaixa,
  formatarNumeroComoInputMoedaCaixa,
  parseMoedaCaixa,
} from '@/lib/caixaFinanceiro';
import {
  CATEGORIAS_CAIXA_PADRAO,
  filtrarCategoriasCaixaPorAmbiente,
  type CaixaCategoria as CaixaCategoriaRecord,
  type CaixaCategoriaAmbiente,
} from '@/lib/caixaCategorias';
import { cn } from '@/lib/utils';
import type {
  CaixaAmbiente,
  CaixaCartaoModalidade,
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
  categorias?: CaixaCategoriaRecord[];
  onCreateCategoria?: (nome: string, ambiente: CaixaCategoriaAmbiente) => Promise<CaixaCategoriaRecord>;
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

export function CaixaMovimentacaoForm({
  disabled = false,
  saving = false,
  title = 'Movimentacao manual',
  description = 'Entradas, saidas e vendas do dia.',
  submitLabel = 'Adicionar movimentacao',
  initialValues,
  categorias = CATEGORIAS_CAIXA_PADRAO,
  onCreateCategoria,
  onCancel,
  onSubmit,
}: CaixaMovimentacaoFormProps) {
  const ambienteInicial = initialValues?.ambiente === 'cofre' && initialValues?.forma_pagamento !== 'dinheiro'
    ? 'venda'
    : initialValues?.ambiente || 'cofre';
  const [ambiente, setAmbiente] = useState<CaixaAmbiente>(ambienteInicial);
  const [tipo, setTipo] = useState<CaixaTipoMovimento>(initialValues?.tipo || 'entrada');
  const [formaPagamento, setFormaPagamento] = useState<CaixaFormaPagamento>(initialValues?.forma_pagamento || 'dinheiro');
  const [categoria, setCategoria] = useState<CaixaCategoria>(initialValues?.categoria || 'lojinha');
  const [cartaoModalidade, setCartaoModalidade] = useState<CaixaCartaoModalidade>(initialValues?.cartao_modalidade || 'credito');
  const [cartaoParcelas, setCartaoParcelas] = useState(String(initialValues?.cartao_parcelas || 1));
  const [linkPagamento, setLinkPagamento] = useState(initialValues?.link_pagamento || '');
  const [descricao, setDescricao] = useState(initialValues?.descricao || '');
  const [valor, setValor] = useState(formatarNumeroComoInputMoedaCaixa(initialValues?.valor));
  const [responsavel, setResponsavel] = useState(initialValues?.responsavel || '');
  const [erro, setErro] = useState<{ campo: 'valor' | 'descricao' | 'parcelas' | null; msg: string } | null>(null);
  const [novaCategoriaOpen, setNovaCategoriaOpen] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [erroCategoria, setErroCategoria] = useState<string | null>(null);

  const categoriasDisponiveis = useMemo(
    () => filtrarCategoriasCaixaPorAmbiente(categorias, ambiente),
    [ambiente, categorias],
  );

  useEffect(() => {
    if (ambiente === 'venda') {
      setTipo('entrada');
    }
    if (ambiente === 'cofre') {
      setFormaPagamento('dinheiro');
    }
  }, [ambiente]);

  useEffect(() => {
    if (!categoriasDisponiveis.length) return;
    const categoriaAtualExiste = categoriasDisponiveis.some((item) => item.slug === categoria);
    if (!categoriaAtualExiste) {
      setCategoria(categoriasDisponiveis[0].slug);
    }
  }, [categoria, categoriasDisponiveis]);

  useEffect(() => {
    setAmbiente(
      initialValues?.ambiente === 'cofre' && initialValues?.forma_pagamento !== 'dinheiro'
        ? 'venda'
        : initialValues?.ambiente || 'cofre',
    );
    setTipo(initialValues?.tipo || 'entrada');
    setFormaPagamento(initialValues?.forma_pagamento || 'dinheiro');
    setCategoria(initialValues?.categoria || 'lojinha');
    setCartaoModalidade(initialValues?.cartao_modalidade || 'credito');
    setCartaoParcelas(String(initialValues?.cartao_parcelas || 1));
    setLinkPagamento(initialValues?.link_pagamento || '');
    setDescricao(initialValues?.descricao || '');
    setValor(formatarNumeroComoInputMoedaCaixa(initialValues?.valor));
    setResponsavel(initialValues?.responsavel || '');
    setErro(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  async function handleCriarCategoria() {
    if (!onCreateCategoria) return;
    setErroCategoria(null);
    setCriandoCategoria(true);

    try {
      const categoriaCriada = await onCreateCategoria(novaCategoriaNome, 'ambos');
      setCategoria(categoriaCriada.slug);
      setNovaCategoriaNome('');
      setNovaCategoriaOpen(false);
    } catch (err: any) {
      setErroCategoria(err?.message || 'Falha ao criar categoria.');
    } finally {
      setCriandoCategoria(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);

    const valorNumerico = parseMoedaCaixa(valor);
    if (valorNumerico <= 0) {
      setErro({ campo: 'valor', msg: 'Informe um valor maior que zero.' });
      return;
    }
    if (descricao.trim().length < 3) {
      setErro({ campo: 'descricao', msg: 'Descreva o motivo da movimentacao.' });
      return;
    }
    if (ambiente === 'cofre' && formaPagamento !== 'dinheiro') {
      setErro({ campo: null, msg: 'Caixa-cofre fisico deve usar forma dinheiro.' });
      return;
    }

    const ehCartao = formaPagamento === 'cartao';
    const parcelasNum = Number(cartaoParcelas) || 1;
    if (ehCartao && cartaoModalidade === 'credito' && parcelasNum < 1) {
      setErro({ campo: 'parcelas', msg: 'Informe um numero de parcelas valido.' });
      return;
    }

    await onSubmit({
      ambiente,
      tipo,
      forma_pagamento: formaPagamento,
      categoria,
      descricao: descricao.trim(),
      valor: valorNumerico,
      cartao_modalidade: ehCartao ? cartaoModalidade : null,
      cartao_parcelas: ehCartao && cartaoModalidade === 'credito' ? parcelasNum : null,
      link_pagamento: ehCartao ? (linkPagamento.trim() || null) : null,
      responsavel: responsavel.trim() || undefined,
    });

    if (!initialValues) {
      setDescricao('');
      setValor(formatarNumeroComoInputMoedaCaixa(0));
      setResponsavel('');
      setCartaoModalidade('credito');
      setCartaoParcelas('1');
      setLinkPagamento('');
    }
    setErro(null);
  }

  return (
    <>
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
            disabled={disabled || ambiente === 'cofre'}
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
            onChange={(e) => { setValor(formatarInputMoedaCaixa(e.target.value)); if (erro?.campo === 'valor') setErro(null); }}
            placeholder="R$ 0,00"
            className={cn('rounded-lg bg-slate-950/70 font-semibold', erro?.campo === 'valor' && 'border-rose-500 ring-1 ring-rose-500/50')}
          />
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          Categoria
          <Select
            value={categoria}
            disabled={disabled}
            onValueChange={(value) => {
              if (value === '__nova_categoria__') {
                setNovaCategoriaOpen(true);
                return;
              }
              setCategoria(value as CaixaCategoria);
            }}
          >
            <SelectTrigger className="h-10 rounded-lg bg-slate-950/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoriasDisponiveis.map((item) => (
                <SelectItem key={item.slug} value={item.slug}>{item.nome}</SelectItem>
              ))}
              {onCreateCategoria && (
                <>
                  <SelectSeparator />
                  <SelectItem value="__nova_categoria__" className="text-emerald-300">
                    + Nova categoria
                  </SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </label>
      </div>

      {formaPagamento === 'cartao' && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-slate-400">
              Modalidade
              <Select
                value={cartaoModalidade}
                disabled={disabled}
                onValueChange={(value) => setCartaoModalidade(value as CaixaCartaoModalidade)}
              >
                <SelectTrigger className="h-10 rounded-lg bg-slate-950/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debito">Debito</SelectItem>
                  <SelectItem value="credito">Credito</SelectItem>
                </SelectContent>
              </Select>
            </label>

            {cartaoModalidade === 'credito' && (
              <label className="space-y-1 text-xs text-slate-400">
                Parcelas
                <Input
                  value={cartaoParcelas}
                  disabled={disabled}
                  inputMode="numeric"
                  onChange={(e) => { setCartaoParcelas(e.target.value.replace(/\D/g, '')); if (erro?.campo === 'parcelas') setErro(null); }}
                  placeholder="1"
                  className={cn('rounded-lg bg-slate-950/70', erro?.campo === 'parcelas' && 'border-rose-500 ring-1 ring-rose-500/50')}
                />
              </label>
            )}
          </div>

          <label className="block space-y-1 text-xs text-slate-400">
            Link de pagamento
            <Input
              value={linkPagamento}
              disabled={disabled}
              onChange={(e) => setLinkPagamento(e.target.value)}
              placeholder="https://..."
              className="rounded-lg bg-slate-950/70"
            />
          </label>
        </div>
      )}

      <label className="mt-3 block space-y-1 text-xs text-slate-400">
        Descricao / motivo
        <Input
          value={descricao}
          disabled={disabled}
          onChange={(e) => { setDescricao(e.target.value); if (erro?.campo === 'descricao') setErro(null); }}
          placeholder="Ex: venda lojinha - camiseta"
          className={cn('rounded-lg bg-slate-950/70', erro?.campo === 'descricao' && 'border-rose-500 ring-1 ring-rose-500/50')}
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
          {erro.msg}
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

    <Dialog open={novaCategoriaOpen} onOpenChange={setNovaCategoriaOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova categoria do caixa</DialogTitle>
          <DialogDescription>
            A categoria fica salva para os proximos lancamentos. Use nomes curtos, como Passaporte ou Uniforme.
          </DialogDescription>
        </DialogHeader>

        <label className="block space-y-1 text-xs text-slate-400">
          Nome da categoria
          <Input
            value={novaCategoriaNome}
            disabled={criandoCategoria}
            autoFocus
            onChange={(event) => setNovaCategoriaNome(event.target.value)}
            placeholder="Ex: Passaporte"
            className="rounded-lg bg-slate-950/70"
          />
        </label>

        {erroCategoria && (
          <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {erroCategoria}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={criandoCategoria}
            onClick={() => setNovaCategoriaOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={criandoCategoria || novaCategoriaNome.trim().length < 2}
            onClick={() => void handleCriarCategoria()}
          >
            <Plus className="h-4 w-4" />
            Criar categoria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
