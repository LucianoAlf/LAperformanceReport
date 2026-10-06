import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import {
  Plus,
  MoreVertical,
  CircleCheck,
  Ban,
  Undo2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  marcarVendaPaga,
  mudarStatusVenda,
  renomearConvidado,
  FORMA_PAGAMENTO_LABEL,
  CANAL_LABEL,
  VENDA_STATUS_LABEL,
  CONCILIACAO_LABEL,
  type EventoComResumo,
  type FormaPagamento,
  type VendaIngresso,
  type VendaStatus,
  type ConciliacaoStatus,
} from '@/hooks/useEventos';
import { DialogNovaVenda } from './DialogNovaVenda';
import { moeda } from './BilheteriaTab';

type Dados = ReturnType<typeof import('@/hooks/useEventos').useBilheteria>;

const STATUS_BADGE: Record<VendaStatus, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  pendente: 'warning',
  pago: 'success',
  cancelado: 'secondary',
  reembolsado: 'error',
};

const CONCILIACAO_BADGE: Record<ConciliacaoStatus, 'default' | 'success' | 'warning' | 'error' | 'secondary'> = {
  pendente: 'secondary',
  conciliado: 'success',
  divergente: 'error',
  estornado: 'error',
};

export function BilheteriaVendas({ evento, dados }: { evento: EventoComResumo; dados: Dados }) {
  const { vendas, blocos, recarregar } = dados;
  const [novaAberta, setNovaAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroBloco, setFiltroBloco] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [pagando, setPagando] = useState<VendaIngresso | null>(null);
  const [baixando, setBaixando] = useState<{ venda: VendaIngresso; status: 'cancelado' | 'reembolsado' } | null>(null);
  const [expandida, setExpandida] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () =>
      vendas.filter(
        (v) =>
          (filtroBloco === 'todos' || v.bloco_id === Number(filtroBloco)) &&
          (filtroStatus === 'todos' || v.status === filtroStatus) &&
          (termo === '' || v.comprador_nome.toLowerCase().includes(termo)),
      ),
    [vendas, filtroBloco, filtroStatus, termo],
  );

  const baixar = async () => {
    if (!baixando) return;
    setOcupado(true);
    const { error } = await mudarStatusVenda(baixando.venda.id, baixando.status);
    setOcupado(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      baixando.status === 'cancelado' ? 'Venda cancelada.' : 'Venda marcada como reembolsada — vai para a fila de estornos da Sol.',
    );
    setBaixando(null);
    await recarregar();
  };

  const acoesDaVenda = (v: VendaIngresso, classeBotao: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(classeBotao, 'text-slate-500 hover:bg-slate-700/50 hover:text-slate-300')}
          aria-label={`Ações da venda de ${v.comprador_nome}`}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {v.status === 'pendente' && (
          <>
            <DropdownMenuItem onClick={() => setPagando(v)}>
              <CircleCheck className="mr-2 h-4 w-4 text-emerald-400" />
              Marcar pago
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBaixando({ venda: v, status: 'cancelado' })}>
              <Ban className="mr-2 h-4 w-4 text-rose-400" />
              Cancelar venda
            </DropdownMenuItem>
          </>
        )}
        {v.status === 'pago' && (
          <DropdownMenuItem onClick={() => setBaixando({ venda: v, status: 'reembolsado' })}>
            <Undo2 className="mr-2 h-4 w-4 text-rose-400" />
            Reembolsar
          </DropdownMenuItem>
        )}
        {(v.status === 'cancelado' || v.status === 'reembolsado') && (
          <DropdownMenuItem disabled>Sem ações</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Convidados nominais, identificador e conciliação — o mesmo na linha da tabela e no cartão.
  const detalheDaVenda = (v: VendaIngresso) => (
    <div className="space-y-1 text-[12px] text-slate-400">
      <p className="font-medium text-slate-300">Convidados nominais</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {v.convidados.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5">
            <ConvidadoNome convidado={c} onSalvo={recarregar} />
            {c.checkin_em ? (
              <span className="text-emerald-400">
                entrou {format(parseISO(c.checkin_em), 'dd/MM HH:mm')}
              </span>
            ) : (
              <span className="text-slate-500">não entrou</span>
            )}
          </li>
        ))}
      </ul>
      {v.pagamento_identificador && (
        <p>
          Identificador: <span className="font-mono text-slate-300">{v.pagamento_identificador}</span>
        </p>
      )}
      {v.conciliacao_status === 'divergente' && v.conciliacao_obs && (
        <p className="text-rose-300">Divergência: {v.conciliacao_obs}</p>
      )}
      {v.conciliacao_ref && (
        <p>
          Lançamento no caixa: <span className="font-mono text-slate-300">{v.conciliacao_ref}</span>
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar comprador…"
          className="h-11 w-full text-[16px] sm:h-8 sm:w-56 sm:text-[13px]"
          aria-label="Buscar por comprador"
        />
        <Select value={filtroBloco} onValueChange={setFiltroBloco}>
          <SelectTrigger className="h-11 min-w-0 flex-1 text-[13px] sm:h-8 sm:w-40 sm:flex-none" aria-label="Filtrar por bloco">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os blocos</SelectItem>
            {blocos.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-11 min-w-0 flex-1 text-[13px] sm:h-8 sm:w-40 sm:flex-none" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {(Object.keys(VENDA_STATUS_LABEL) as VendaStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {VENDA_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-full sm:ml-auto sm:w-auto">
          <Button size="sm" className="h-11 w-full gap-1.5 sm:h-9 sm:w-auto" onClick={() => setNovaAberta(true)}>
            <Plus className="h-4 w-4" />
            Nova venda
          </Button>
        </div>
      </div>

      {/* Celular: uma venda por cartão. A tabela tem 10 colunas e, dentro de overflow-hidden,
          status, conciliação e o menu de ações ficavam cortados fora da tela. */}
      <ul className="space-y-2 sm:hidden">
        {visiveis.map((v) => {
          const aberta = expandida === v.id;
          return (
            <li
              key={v.id}
              className={cn(
                'rounded-xl border border-slate-700 bg-slate-800/40 p-3',
                v.conciliacao_status === 'divergente' && 'border-rose-500/40 bg-rose-500/5',
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-slate-100">{v.comprador_nome}</p>
                  {v.comprador_contato && <p className="text-[12px] text-slate-500">{v.comprador_contato}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-semibold tabular-nums text-white">
                    {moeda.format(Number(v.valor_final))}
                  </p>
                  {v.desconto_pct > 0 && (
                    <p className="text-[12px] text-emerald-400/80">−{Number(v.desconto_pct)}% pacote</p>
                  )}
                </div>
                {acoesDaVenda(v, '-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-lg')}
              </div>
              <p className="mt-1 text-[12px] text-slate-400">
                {v.quantidade} {v.quantidade === 1 ? 'ingresso' : 'ingressos'} · {v.bloco_nome ?? 'sem bloco'} ·{' '}
                {FORMA_PAGAMENTO_LABEL[v.forma_pagamento]} · {CANAL_LABEL[v.canal]}
                {v.pago_em && ` · pago ${format(parseISO(v.pago_em), 'dd/MM HH:mm')}`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant={STATUS_BADGE[v.status]}>{VENDA_STATUS_LABEL[v.status]}</Badge>
                <Badge variant={CONCILIACAO_BADGE[v.conciliacao_status]}>
                  {CONCILIACAO_LABEL[v.conciliacao_status]}
                </Badge>
                <button
                  type="button"
                  onClick={() => setExpandida(aberta ? null : v.id)}
                  className="ml-auto flex min-h-[44px] items-center gap-1 px-1 text-[12px] text-slate-400"
                >
                  {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  convidados
                </button>
              </div>
              {aberta && <div className="mt-1 border-t border-slate-700/60 pt-2">{detalheDaVenda(v)}</div>}
            </li>
          );
        })}
        {visiveis.length === 0 && (
          <li className="rounded-xl border border-slate-700 px-4 py-8 text-center text-[13px] text-slate-500">
            Nenhuma venda registrada. A primeira sai pelo botão “Nova venda”.
          </li>
        )}
      </ul>

      <section className="hidden overflow-hidden rounded-xl border border-slate-700 sm:block">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-700/60 bg-slate-800/60 text-left text-[12px] sm:text-[11px] uppercase tracking-wide text-slate-500">
              <th className="w-7 px-3 py-2" />
              <th className="px-3 py-2">Comprador</th>
              <th className="px-3 py-2">Bloco</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Forma · Canal</th>
              <th className="px-3 py-2">Pago em</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Conciliação</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {visiveis.map((v) => {
              const aberta = expandida === v.id;
              const divergente = v.conciliacao_status === 'divergente';
              return (
                <>
                  <tr
                    key={v.id}
                    className={`text-slate-300 ${divergente ? 'bg-rose-500/5' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setExpandida(aberta ? null : v.id)}
                        className="text-slate-500 hover:text-slate-300"
                        aria-label={aberta ? 'Recolher convidados' : 'Ver convidados'}
                      >
                        {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-200">
                      {v.comprador_nome}
                      {v.comprador_contato && (
                        <span className="block text-[12px] sm:text-[11px] font-normal text-slate-500">{v.comprador_contato}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{v.bloco_nome ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.quantidade}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {moeda.format(Number(v.valor_final))}
                      {v.desconto_pct > 0 && (
                        <span className="block text-[12px] sm:text-[11px] text-emerald-400/80">
                          −{Number(v.desconto_pct)}% pacote
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {FORMA_PAGAMENTO_LABEL[v.forma_pagamento]} · {CANAL_LABEL[v.canal]}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {v.pago_em ? format(parseISO(v.pago_em), 'dd/MM HH:mm') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_BADGE[v.status]}>{VENDA_STATUS_LABEL[v.status]}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={CONCILIACAO_BADGE[v.conciliacao_status]}>
                        {CONCILIACAO_LABEL[v.conciliacao_status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {acoesDaVenda(v, 'rounded-md p-1')}
                    </td>
                  </tr>
                  {aberta && (
                    <tr key={`${v.id}-exp`} className="bg-slate-800/30">
                      <td />
                      <td colSpan={9} className="px-3 py-2">
                        {detalheDaVenda(v)}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma venda registrada. A primeira sai pelo botão “Nova venda”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <DialogNovaVenda
        aberto={novaAberta}
        evento={evento}
        dados={dados}
        onFechar={() => setNovaAberta(false)}
        onSalvo={recarregar}
      />

      <DialogMarcarPago venda={pagando} onFechar={() => setPagando(null)} onSalvo={recarregar} />

      <ModalConfirmacao
        aberto={baixando !== null}
        onClose={() => setBaixando(null)}
        onConfirmar={baixar}
        carregando={ocupado}
        tipo={baixando?.status === 'reembolsado' ? 'danger' : 'warning'}
        titulo={baixando?.status === 'cancelado' ? 'Cancelar venda' : 'Reembolsar venda'}
        mensagem={
          baixando == null
            ? ''
            : baixando.status === 'cancelado'
              ? `Cancelar a venda de ${baixando.venda.comprador_nome} (${baixando.venda.quantidade} ingresso(s))? Os lugares voltam para o bloco na hora.`
              : baixando.venda.conciliacao_status === 'conciliado'
                ? `Esta venda já foi conciliada pela Sol. Ao reembolsar, ela entra na fila de estornos para a Sol lançar a devolução no caixa do Super Folha. Continuar?`
                : `Marcar como reembolsada a venda de ${baixando.venda.comprador_nome}? Os lugares voltam para o bloco na hora.`
        }
        textoConfirmar={baixando?.status === 'cancelado' ? 'Cancelar venda' : 'Reembolsar'}
      />
    </div>
  );
}

/** Dialog "Marcar pago" — a recepcionista confirma a forma e digita o identificador. */
function DialogMarcarPago({
  venda,
  onFechar,
  onSalvo,
}: {
  venda: VendaIngresso | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [identificador, setIdentificador] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const precisaId = forma !== 'dinheiro';
  const podeSalvar = forma !== null && (!precisaId || identificador.trim().length > 0);

  const confirmar = async () => {
    if (!venda) return;
    setOcupado(true);
    const { error } = await marcarVendaPaga(venda.id, forma, precisaId ? identificador.trim() : null);
    setOcupado(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Venda de ${venda.comprador_nome} marcada como paga.`);
    setIdentificador('');
    onFechar();
    onSalvo();
  };

  return (
    <Dialog open={venda !== null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como pago — {venda?.comprador_nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[13px] text-slate-400">
            {venda?.quantidade} ingresso(s) · {venda ? moeda.format(Number(venda.valor_final)) : ''}
          </p>
          <div>
            <Label htmlFor="pago-forma">Forma de pagamento</Label>
            <Select value={forma} onValueChange={(v) => setForma(v as FormaPagamento)}>
              <SelectTrigger id="pago-forma" className="mt-1">
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
          <div>
            <Label htmlFor="pago-id">
              {precisaId ? 'NSU / código de autorização ou ID do Pix' : 'Identificador (opcional no dinheiro)'}
            </Label>
            <Input
              id="pago-id"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              placeholder={precisaId ? 'Obrigatório — a Sol casa o pagamento por ele' : 'Opcional'}
              className="mt-1"
            />
            {precisaId && (
              <p className="mt-1 text-[12px] sm:text-[11.5px] text-slate-500">
                Sem o identificador a Sol não consegue casar a venda com o relatório da maquininha.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={!podeSalvar || ocupado}>
            {ocupado ? 'Gravando…' : 'Confirmar pagamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Nome do convidado com edicao inline — o placeholder se corrige ate o dia do recital. */
function ConvidadoNome({
  convidado,
  onSalvo,
}: {
  convidado: { id: number; nome: string };
  onSalvo: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(convidado.nome);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setNome(convidado.nome);
          setEditando(true);
        }}
        className="group flex items-center gap-1 text-slate-300 hover:text-slate-100"
        title="Corrigir o nome"
      >
        {convidado.nome}
        <Pencil className="h-3 w-3 text-slate-600 group-hover:text-slate-400" />
      </button>
    );
  }
  const salvar = async () => {
    const { error } = await renomearConvidado(convidado.id, nome);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditando(false);
    onSalvo();
  };
  return (
    <span className="flex items-center gap-1">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && salvar()}
        className="h-6 w-40 px-1.5 text-[12px]"
        aria-label="Nome do convidado"
        autoFocus
      />
      <button
        type="button"
        onClick={salvar}
        className="rounded p-0.5 text-emerald-400 hover:bg-slate-700/60"
        aria-label="Salvar nome"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export default BilheteriaVendas;
