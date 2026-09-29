import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CircleAlert } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  venderIngresso,
  FORMA_PAGAMENTO_LABEL,
  CANAL_LABEL,
  type CanalVenda,
  type EventoComResumo,
  type FormaPagamento,
} from '@/hooks/useEventos';
import { nomeConvidadoPlaceholder, simularOrcamentoVenda } from '@/lib/eventos';
import { moeda } from './BilheteriaTab';

type Dados = ReturnType<typeof import('@/hooks/useEventos').useBilheteria>;

interface Props {
  aberto: boolean;
  evento: EventoComResumo;
  dados: Dados;
  onFechar: () => void;
  onSalvo: () => void;
}

export function DialogNovaVenda({ aberto, evento, dados, onFechar, onSalvo }: Props) {
  const { blocos, lotacao, preco, pacotes, participantes } = dados;

  const [blocoId, setBlocoId] = useState('');
  const [comprador, setComprador] = useState('');
  const [contato, setContato] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [nomes, setNomes] = useState<string[]>(['']);
  const [canal, setCanal] = useState<CanalVenda>('balcao');
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [pagoAgora, setPagoAgora] = useState(false);
  const [identificador, setIdentificador] = useState('');
  const [participacaoId, setParticipacaoId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // ao abrir: form limpo com defaults seguros pra fila andar rapido
  useEffect(() => {
    if (!aberto) return;
    setBlocoId('');
    setComprador('');
    setContato('');
    setQuantidade(1);
    setNomes(['']);
    setCanal('balcao');
    setForma('pix');
    setPagoAgora(false);
    setIdentificador('');
    setParticipacaoId('');
    setObservacao('');
  }, [aberto]);

  // quantidade dita o numero de nomes de convidado (placeholder ok — edita ate o dia)
  useEffect(() => {
    setNomes((atual) => {
      const q = Math.max(1, quantidade);
      if (atual.length === q) return atual;
      return Array.from({ length: q }, (_, i) => atual[i] ?? '');
    });
  }, [quantidade]);

  const livresDoBloco = useMemo(() => {
    if (!blocoId) return null;
    return lotacao.find((l) => l.bloco_id === Number(blocoId))?.livres ?? null;
  }, [blocoId, lotacao]);

  // decisao do Alf: todos pagam o preco COBRADO (preco_meia); o unitario e referencia.
  // mesma conta da RPC (testada em tests/eventosBilheteria) — previsao da tela.
  const precoUnit = preco?.preco_meia ?? preco?.preco_unitario ?? null;
  const orcamento = useMemo(
    () => simularOrcamentoVenda(precoUnit, quantidade, pacotes),
    [precoUnit, quantidade, pacotes],
  );
  const pacoteAuto = orcamento.pacote;
  const descontoPct = orcamento.descontoPct;
  const bruto = precoUnit == null ? null : orcamento.valorBase;
  const final = precoUnit == null ? null : orcamento.valorFinal;

  // porta nao pode nascer pendente — o check-in nao barra quem acabou de pagar
  const pagoEfetivo = canal === 'porta' ? true : pagoAgora;
  const precisaId = forma !== 'dinheiro';
  const semPreco = precoUnit == null;
  const lotado = livresDoBloco != null && livresDoBloco < quantidade;
  const podeSalvar =
    blocoId !== '' &&
    comprador.trim().length > 0 &&
    quantidade >= 1 &&
    !semPreco &&
    !lotado &&
    (!pagoEfetivo || !precisaId || identificador.trim().length > 0);

  const confirmar = async () => {
    if (!podeSalvar) return;
    setOcupado(true);
    const { vendaId, error } = await venderIngresso({
      evento_id: evento.id,
      bloco_id: Number(blocoId),
      comprador_nome: comprador.trim(),
      comprador_contato: contato.trim() || null,
      quantidade,
      forma_pagamento: forma,
      canal,
      convidados: nomes.map((nome) => ({ nome: nome.trim() })),
      pacote_id: pacoteAuto?.id ?? null,
      pago_agora: pagoEfetivo,
      pagamento_identificador: pagoEfetivo && precisaId ? identificador.trim() : null,
      participacao_id: participacaoId === '' ? null : Number(participacaoId),
      observacao: observacao.trim() || null,
    });
    setOcupado(false);
    if (error) {
      // a RPC devolve a frase pronta ("Bloco lotado: 0 livres, 1 pedidos")
      toast.error(error.message);
      await recarregarSeguro();
      return;
    }
    toast.success(
      pagoEfetivo
        ? `Venda #${vendaId} registrada e paga — ${final != null ? moeda.format(final) : ''}.`
        : `Venda #${vendaId} registrada — ${final != null ? moeda.format(final) : ''} a receber.`,
    );
    onFechar();
    onSalvo();
  };

  // se a RPC recusou por lotacao, reler antes de a pessoa tentar de novo
  const recarregarSeguro = async () => {
    try {
      await dados.recarregar();
    } catch {
      /* silencioso — a proxima tentativa valida de novo no banco */
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova venda — {evento.titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="venda-bloco">Bloco</Label>
              <Select value={blocoId} onValueChange={setBlocoId}>
                <SelectTrigger id="venda-bloco" className="mt-1">
                  <SelectValue placeholder="Escolha…" />
                </SelectTrigger>
                <SelectContent>
                  {blocos.map((b) => {
                    const lot = lotacao.find((l) => l.bloco_id === b.id);
                    const lotadoBloco = lot?.livres != null && lot.livres <= 0;
                    return (
                      <SelectItem key={b.id} value={String(b.id)} disabled={lotadoBloco}>
                        {b.nome}
                        {b.capacidade != null
                          ? ` — ${lot?.livres ?? b.capacidade} livres`
                          : ' — sem teto'}
                        {lotadoBloco ? ' (lotado)' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {lotado && (
                <p className="mt-1 flex items-center gap-1 text-[11.5px] text-rose-300">
                  <CircleAlert className="h-3.5 w-3.5" />
                  Só restam {livresDoBloco} lugar(es) neste bloco.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="venda-qtd">Quantidade</Label>
              <Input
                id="venda-qtd"
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="venda-comprador">Comprador</Label>
              <Input
                id="venda-comprador"
                value={comprador}
                onChange={(e) => setComprador(e.target.value)}
                placeholder="Nome de quem está pagando"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="venda-contato">Contato</Label>
              <Input
                id="venda-contato"
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder="Celular ou e-mail"
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Só pra achar a venda depois — não sai em planilha de professor.
              </p>
            </div>
          </div>

          <div>
            <Label>Convidados (nominais)</Label>
            <div className="mt-1 grid max-h-36 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {nomes.map((nome, i) => (
                <Input
                  key={i}
                  value={nome}
                  onChange={(e) =>
                    setNomes((atual) => atual.map((n, j) => (j === i ? e.target.value : n)))
                  }
                  placeholder={comprador.trim() ? nomeConvidadoPlaceholder(comprador, i + 1) : `Convidado ${i + 1}`}
                  aria-label={`Nome do convidado ${i + 1}`}
                />
              ))}
            </div>
            <p className="mt-1 text-[11.5px] text-slate-500">
              Em branco vira “Convidado N de {comprador.trim() || '…'}” — a equipe pode corrigir
              o nome até o dia.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="venda-canal">Canal</Label>
              <Select value={canal} onValueChange={(v) => setCanal(v as CanalVenda)}>
                <SelectTrigger id="venda-canal" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CANAL_LABEL) as CanalVenda[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CANAL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="venda-forma">Forma de pagamento</Label>
              <Select value={forma} onValueChange={(v) => setForma(v as FormaPagamento)}>
                <SelectTrigger id="venda-forma" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FORMA_PAGAMENTO_LABEL) as FormaPagamento[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FORMA_PAGAMENTO_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="venda-aluno">Aluno vinculado (opcional)</Label>
            <Select value={participacaoId} onValueChange={setParticipacaoId}>
              <SelectTrigger id="venda-aluno" className="mt-1">
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum</SelectItem>
                {participantes.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11.5px] text-slate-500">
              Se a família avisar “sou do fulano”, os convidados aparecem ligados ao aluno.
            </p>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="venda-pago" className="cursor-pointer">
                Já pago agora
              </Label>
              <Switch
                id="venda-pago"
                checked={pagoEfetivo}
                onCheckedChange={setPagoAgora}
                disabled={canal === 'porta'}
              />
            </div>
            <p className="mt-1 text-[11.5px] text-slate-500">
              {canal === 'porta'
                ? 'Venda de porta nasce paga — o check-in não pode barrar quem acabou de pagar.'
                : 'No balcão/on-line pode ficar pendente e a Sol cobra depois.'}
            </p>
            {pagoEfetivo && (
              <div className="mt-2">
                <Label htmlFor="venda-id">
                  {precisaId ? 'NSU / autorização ou ID do Pix' : 'Identificador (opcional)'}
                </Label>
                <Input
                  id="venda-id"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder={precisaId ? 'Obrigatório' : 'Opcional'}
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="venda-obs">Observação (opcional)</Label>
            <Input
              id="venda-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: família da aluna, professor pediu, etc."
              className="mt-1"
            />
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-[13px]">
            {semPreco ? (
              <p className="text-amber-300">
                Cadastre o preço do ingresso na aba Configuração antes de vender.
              </p>
            ) : (
              <>
                <div className="flex justify-between text-slate-400">
                  <span>
                    {quantidade} × {moeda.format(precoUnit)}
                    {preco?.preco_meia != null && (
                      <span className="text-slate-500"> (meia — inteira {moeda.format(Number(preco.preco_unitario))})</span>
                    )}
                  </span>
                  <span className="tabular-nums">{bruto != null ? moeda.format(bruto) : ''}</span>
                </div>
                {pacoteAuto && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Pacote {pacoteAuto.quantidade_minima}+ — {Number(pacoteAuto.desconto_pct)}% off</span>
                    <span>−{moeda.format((bruto ?? 0) - (final ?? 0))}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-slate-700 pt-1 font-semibold text-slate-100">
                  <span>Total</span>
                  <span className="tabular-nums">{final != null ? moeda.format(final) : '—'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={!podeSalvar || ocupado}>
            {ocupado ? 'Registrando…' : pagoEfetivo ? 'Registrar pago' : 'Registrar venda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DialogNovaVenda;
