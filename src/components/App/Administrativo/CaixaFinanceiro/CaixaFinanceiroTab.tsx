import { FormEvent, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, History, Lock, Pencil, RotateCcw, Unlock, Wallet } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useCaixaCategorias } from '@/hooks/useCaixaCategorias';
import { useCaixaDiario } from '@/hooks/useCaixaDiario';
import {
  dateParaIsoCaixa,
  formatarDataCaixa,
  formatarInputMoedaCaixa,
  formatarMoedaCaixa,
  formatarNumeroComoInputMoedaCaixa,
  hojeISOBrt,
  isoParaDateCaixa,
  parseMoedaCaixa,
  primeiroDiaMesISO,
  somarDiasIsoCaixa,
} from '@/lib/caixaFinanceiro';
import { CaixaHistoricoPanel } from './CaixaHistorico';
import { CaixaMovimentacaoForm } from './CaixaMovimentacaoForm';
import { CaixaMovimentacoesTable } from './CaixaMovimentacoesTable';
import { CaixaResumoCards } from './CaixaResumoCards';
import { CaixaWhatsAppPreview } from './CaixaWhatsAppPreview';

interface CaixaFinanceiroTabProps {
  unidadeId?: string | null;
  unidadeNome: string;
  unidadeCodigo: string;
}

export function CaixaFinanceiroTab({
  unidadeId,
  unidadeNome,
  unidadeCodigo,
}: CaixaFinanceiroTabProps) {
  const { usuario } = useAuth();
  // Data operacional do caixa: estado proprio, sempre dentro do mes corrente (BRT).
  // Desacoplado do filtro de competencia do Administrativo.
  const [dataCaixa, setDataCaixa] = useState(() => hojeISOBrt());
  const hojeIso = hojeISOBrt();
  const minDataIso = primeiroDiaMesISO(hojeIso);
  const podeVoltar = dataCaixa > minDataIso;
  const podeAvancar = dataCaixa < hojeIso;
  const [saldoInicial, setSaldoInicial] = useState('');
  const [abertoPor, setAbertoPor] = useState(usuario?.nome || '');
  const [fechadoPor, setFechadoPor] = useState(usuario?.nome || '');
  const [reabertoPor, setReabertoPor] = useState(usuario?.nome || '');
  const [motivoReabertura, setMotivoReabertura] = useState('');
  const [reabrirDialogOpen, setReabrirDialogOpen] = useState(false);
  const [editandoSaldoInicial, setEditandoSaldoInicial] = useState(false);
  const [saldoInicialEdit, setSaldoInicialEdit] = useState('');
  const [saldoConferido, setSaldoConferido] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const {
    categorias,
    error: categoriasError,
    criarCategoria,
  } = useCaixaCategorias();

  const {
    caixa,
    movimentos,
    resumo,
    loading,
    saving,
    error,
    abrirCaixa,
    adicionarMovimento,
    atualizarMovimento,
    excluirMovimento,
    fecharCaixa,
    reabrirCaixa,
    atualizarSaldoInicial,
  } = useCaixaDiario({ unidadeId, dataCaixa });

  const [historicoAberto, setHistoricoAberto] = useState(false);
  const unidadeValida = Boolean(unidadeId && unidadeId !== 'todos');
  const caixaFechado = caixa?.status === 'fechado';
  const dataLabel = useMemo(() => formatarDataCaixa(dataCaixa), [dataCaixa]);
  const saldoConferidoValue = caixa?.saldo_final_conferido != null
    ? formatarNumeroComoInputMoedaCaixa(Number(caixa.saldo_final_conferido))
    : saldoConferido;

  function setMensagem(text: string, type: 'success' | 'error' | 'info' = 'info') {
    setStatusMessage({ text, type });
  }

  async function handleAbrir(event: FormEvent) {
    event.preventDefault();
    try {
      const saldo = parseMoedaCaixa(saldoInicial);
      await abrirCaixa(saldo, abertoPor.trim() || usuario?.nome || usuario?.email || 'Operacional');
      setMensagem('Caixa diario aberto.', 'success');
    } catch (err: any) {
      setMensagem(err?.message || 'Falha ao abrir caixa.', 'error');
    }
  }

  function abrirEditSaldoInicial() {
    if (!caixa) return;
    setSaldoInicialEdit(formatarNumeroComoInputMoedaCaixa(Number(caixa.saldo_inicial_cofre)));
    setEditandoSaldoInicial(true);
  }

  async function handleSalvarSaldoInicial() {
    try {
      await atualizarSaldoInicial(parseMoedaCaixa(saldoInicialEdit));
      setEditandoSaldoInicial(false);
      setMensagem('Saldo inicial atualizado.', 'success');
    } catch (err: any) {
      setMensagem(err?.message || 'Falha ao atualizar saldo inicial.', 'error');
    }
  }

  async function fecharCaixaConfirmado() {
    try {
      if (!saldoConferido.trim()) {
        setMensagem('Informe o saldo final conferido antes de fechar o caixa.', 'error');
        return;
      }

      await fecharCaixa(parseMoedaCaixa(saldoConferido), fechadoPor.trim(), observacoes);
      setMensagem('Caixa fechado com conferencia registrada.', 'success');
    } catch (err: any) {
      setMensagem(err?.message || 'Falha ao fechar caixa.', 'error');
    }
  }

  async function reabrirCaixaConfirmado() {
    try {
      await reabrirCaixa(motivoReabertura, reabertoPor.trim() || usuario?.nome || usuario?.email || 'Operacional');
      setSaldoConferido('');
      setReabrirDialogOpen(false);
      setMotivoReabertura('');
      setMensagem('Caixa reaberto com log de auditoria. Revise os lancamentos e faca novo fechamento.', 'success');
    } catch (err: any) {
      setMensagem(err?.message || 'Falha ao reabrir caixa.', 'error');
    }
  }

  if (!unidadeValida) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
        Selecione uma unidade especifica para usar o Caixa. O consolidado nao recebe fechamento financeiro diario.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-white">Fechamento de caixa</h2>
            <p className="text-sm text-slate-400">{unidadeNome} · {dataLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-slate-700 text-slate-300 hover:text-white"
            onClick={() => setHistoricoAberto((v) => !v)}
          >
            <History className="h-4 w-4" />
            Histórico
          </Button>
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 border-slate-700 text-slate-300 hover:text-white"
              disabled={!podeVoltar}
              title="Dia anterior"
              onClick={() => setDataCaixa((d) => somarDiasIsoCaixa(d, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <DatePicker
              date={isoParaDateCaixa(dataCaixa)}
              onDateChange={(novaData) => {
                if (novaData) setDataCaixa(dateParaIsoCaixa(novaData));
              }}
              minDate={isoParaDateCaixa(minDataIso)}
              maxDate={isoParaDateCaixa(hojeIso)}
              className="h-9 w-[150px] border-slate-700 bg-slate-950/50"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 border-slate-700 text-slate-300 hover:text-white"
              disabled={!podeAvancar}
              title="Proximo dia"
              onClick={() => setDataCaixa((d) => somarDiasIsoCaixa(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
            caixaFechado
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
          }`}>
            {caixaFechado ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            {caixaFechado ? 'Fechado' : 'Aberto'}
          </span>
        </div>
      </div>

      {historicoAberto && (
        <CaixaHistoricoPanel unidadeId={unidadeId} dataCaixaAtual={dataCaixa} />
      )}

      {caixaFechado && (
        <div className="animate-in fade-in-0 zoom-in-95 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.10),0_18px_60px_rgba(16,185,129,0.08)]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold text-white">Caixa fechado e conferencia registrada.</p>
              <p className="mt-1 text-xs text-emerald-100/80">
                Edicoes estao bloqueadas. Para corrigir um erro, reabra com motivo; o sistema grava snapshot e log de auditoria antes de liberar ajustes.
              </p>
            </div>
          </div>
          <AlertDialog open={reabrirDialogOpen} onOpenChange={setReabrirDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-amber-400/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Reabrir caixa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-amber-500/20 bg-slate-950">
              <AlertDialogHeader>
                <AlertDialogTitle>Reabrir caixa de {unidadeNome}?</AlertDialogTitle>
                <AlertDialogDescription>
                  A reabertura libera edicao dos lancamentos, mas fica registrada com motivo, operador e snapshot do fechamento anterior.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Data do caixa</p>
                    <p className="font-semibold text-white">{dataLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Saldo conferido</p>
                    <p className="font-semibold text-emerald-300">
                      {caixa?.saldo_final_conferido != null ? formatarMoedaCaixa(Number(caixa.saldo_final_conferido)) : '-'}
                    </p>
                  </div>
                </div>

                <label className="block space-y-1 text-xs text-slate-400">
                  Reaberto por
                  <Input
                    value={reabertoPor}
                    onChange={(event) => setReabertoPor(event.target.value)}
                    placeholder="Nome"
                    className="rounded-lg bg-slate-950/70"
                  />
                </label>

                <label className="block space-y-1 text-xs text-slate-400">
                  Motivo da reabertura
                  <Textarea
                    value={motivoReabertura}
                    onChange={(event) => setMotivoReabertura(event.target.value)}
                    rows={3}
                    placeholder="Ex.: corrigir lancamento de venda informado com valor errado."
                    className="rounded-lg bg-slate-950/70"
                  />
                </label>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <Button
                  type="button"
                  disabled={saving || motivoReabertura.trim().length < 8 || !reabertoPor.trim()}
                  className="bg-amber-600 hover:bg-amber-500 focus:ring-amber-500"
                  onClick={() => void reabrirCaixaConfirmado()}
                >
                  <RotateCcw className="h-4 w-4" />
                  Confirmar reabertura
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {(error || categoriasError || statusMessage) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          error || categoriasError || statusMessage?.type === 'error'
            ? 'border-rose-500/25 bg-rose-500/10 text-rose-200'
            : statusMessage?.type === 'success'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
              : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
        }`}>
          {error || categoriasError || statusMessage?.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
          Carregando caixa diario...
        </div>
      ) : !caixa ? (
        <form onSubmit={handleAbrir} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            <div>
              <h3 className="text-base font-semibold text-white">Abrir caixa do dia</h3>
              <p className="text-sm text-slate-400">Informe o saldo inicial do cofre fisico para {unidadeNome}.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs text-slate-400">
              Saldo inicial cofre
              <Input
                value={saldoInicial}
                inputMode="numeric"
                onChange={(e) => setSaldoInicial(formatarInputMoedaCaixa(e.target.value))}
                placeholder="R$ 0,00"
                className="rounded-lg bg-slate-950/70 font-semibold"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-400 md:col-span-2">
              Aberto por
              <Input
                value={abertoPor}
                onChange={(e) => setAbertoPor(e.target.value)}
                placeholder="Nome"
                className="rounded-lg bg-slate-950/70"
              />
            </label>
          </div>
          <Button type="submit" disabled={saving} className="mt-4">
            Abrir caixa
          </Button>
        </form>
      ) : (
        <>
          <CaixaResumoCards
            resumo={resumo}
            onEditSaldoInicial={!caixaFechado ? abrirEditSaldoInicial : undefined}
          />

          {editandoSaldoInicial && (
            <div className="animate-in fade-in-0 zoom-in-95 flex flex-wrap items-end gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                <Pencil className="h-4 w-4" />
              </span>
              <label className="flex-1 space-y-1 text-xs text-slate-400" style={{ minWidth: 160 }}>
                Corrigir saldo inicial cofre
                <Input
                  autoFocus
                  value={saldoInicialEdit}
                  inputMode="numeric"
                  onChange={(e) => setSaldoInicialEdit(formatarInputMoedaCaixa(e.target.value))}
                  placeholder="R$ 0,00"
                  className="rounded-lg bg-slate-950/70 font-semibold"
                />
              </label>
              <div className="flex gap-2">
                <Button type="button" disabled={saving} onClick={() => void handleSalvarSaldoInicial()}>
                  Salvar
                </Button>
                <Button type="button" variant="outline" className="border-slate-700" onClick={() => setEditandoSaldoInicial(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <CaixaMovimentacoesTable
              movimentos={movimentos}
              categorias={categorias}
              disabled={saving || caixaFechado}
              onCreateCategoria={async (nome) => criarCategoria(nome, 'ambos', usuario?.nome || usuario?.email || null)}
              onDelete={async (id) => {
                try {
                  await excluirMovimento(id);
                  setMensagem('Movimentacao excluida.', 'success');
                } catch (err: any) {
                  setMensagem(err?.message || 'Falha ao excluir movimentacao.', 'error');
                }
              }}
              onUpdate={async (id, input) => {
                try {
                  await atualizarMovimento(id, { ...input, criado_por: usuario?.nome || usuario?.email || undefined });
                  setMensagem('Movimentacao atualizada.', 'success');
                } catch (err: any) {
                  setMensagem(err?.message || 'Falha ao atualizar movimentacao.', 'error');
                  throw err;
                }
              }}
            />
            <CaixaMovimentacaoForm
              disabled={saving || caixaFechado}
              saving={saving}
              categorias={categorias}
              onCreateCategoria={(nome, ambiente) => criarCategoria(nome, ambiente, usuario?.nome || usuario?.email || null)}
              onSubmit={async (input) => {
                try {
                  await adicionarMovimento({ ...input, criado_por: usuario?.nome || usuario?.email || undefined });
                  setMensagem('Movimentacao adicionada.', 'success');
                } catch (err: any) {
                  setMensagem(err?.message || 'Falha ao adicionar movimentacao.', 'error');
                }
              }}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <CaixaWhatsAppPreview
              caixa={caixa}
              movimentos={movimentos}
              unidadeNome={unidadeNome}
              unidadeCodigo={unidadeCodigo}
              conferidoPor={fechadoPor || caixa.fechado_por || usuario?.nome || ''}
              disabled={saving}
              onStatus={setMensagem}
            />

            <form onSubmit={(event) => event.preventDefault()} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-300" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Conferencia final</h3>
                  <p className="text-xs text-slate-400">Saldo previsto: {formatarMoedaCaixa(resumo.saldoFinalCalculado)}</p>
                </div>
              </div>

              <label className="block space-y-1 text-xs text-slate-400">
                Saldo final conferido
                <Input
                  value={saldoConferidoValue}
                  disabled={caixaFechado}
                  inputMode="numeric"
                  onChange={(e) => setSaldoConferido(formatarInputMoedaCaixa(e.target.value))}
                  placeholder="R$ 0,00"
                  className="rounded-lg bg-slate-950/70 font-semibold"
                />
              </label>

              <label className="mt-3 block space-y-1 text-xs text-slate-400">
                Conferido por
                <Input
                  value={caixa.fechado_por ?? fechadoPor}
                  disabled={caixaFechado}
                  onChange={(e) => setFechadoPor(e.target.value)}
                  placeholder="Nome"
                  className="rounded-lg bg-slate-950/70"
                />
              </label>

              <label className="mt-3 block space-y-1 text-xs text-slate-400">
                Observacoes
                <Textarea
                  value={caixa.observacoes ?? observacoes}
                  disabled={caixaFechado}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="rounded-lg bg-slate-950/70"
                />
              </label>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={saving || caixaFechado} className="mt-4 w-full">
                    <Lock className="h-4 w-4" />
                    Fechar caixa
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-emerald-500/20 bg-slate-950">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Fechar caixa de {unidadeNome}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Depois do fechamento, os lancamentos ficam bloqueados para edicao ate existir reabertura auditada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Saldo previsto</p>
                        <p className="font-semibold text-white">{formatarMoedaCaixa(resumo.saldoFinalCalculado)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Saldo conferido</p>
                        <p className="font-semibold text-emerald-300">{saldoConferidoValue || 'Nao informado'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Conferido por</p>
                        <p className="font-semibold text-white">{fechadoPor || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Data</p>
                        <p className="font-semibold text-white">{dataLabel}</p>
                      </div>
                    </div>
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500"
                      onClick={() => void fecharCaixaConfirmado()}
                    >
                      Confirmar fechamento
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
