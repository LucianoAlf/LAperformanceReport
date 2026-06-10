import { FormEvent, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Lock, Unlock, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCaixaDiario } from '@/hooks/useCaixaDiario';
import { formatarDataCaixa, formatarMoedaCaixa } from '@/lib/caixaFinanceiro';
import { CaixaMovimentacaoForm } from './CaixaMovimentacaoForm';
import { CaixaMovimentacoesTable } from './CaixaMovimentacoesTable';
import { CaixaResumoCards } from './CaixaResumoCards';
import { CaixaWhatsAppPreview } from './CaixaWhatsAppPreview';

interface CaixaFinanceiroTabProps {
  unidadeId?: string | null;
  unidadeNome: string;
  unidadeCodigo: string;
  dataCaixa: string;
  isCompetenciaAtual?: boolean;
}

function parseMoney(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CaixaFinanceiroTab({
  unidadeId,
  unidadeNome,
  unidadeCodigo,
  dataCaixa,
  isCompetenciaAtual = true,
}: CaixaFinanceiroTabProps) {
  const { usuario } = useAuth();
  const [saldoInicial, setSaldoInicial] = useState('');
  const [abertoPor, setAbertoPor] = useState(usuario?.nome || '');
  const [fechadoPor, setFechadoPor] = useState(usuario?.nome || '');
  const [saldoConferido, setSaldoConferido] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const {
    caixa,
    movimentos,
    resumo,
    loading,
    saving,
    error,
    abrirCaixa,
    adicionarMovimento,
    excluirMovimento,
    fecharCaixa,
  } = useCaixaDiario({ unidadeId, dataCaixa });

  const unidadeValida = Boolean(unidadeId && unidadeId !== 'todos');
  const caixaFechado = caixa?.status === 'fechado';
  const dataLabel = useMemo(() => formatarDataCaixa(dataCaixa), [dataCaixa]);

  function setMensagem(text: string, type: 'success' | 'error' | 'info' = 'info') {
    setStatusMessage({ text, type });
  }

  async function handleAbrir(event: FormEvent) {
    event.preventDefault();
    try {
      const saldo = parseMoney(saldoInicial);
      await abrirCaixa(saldo, abertoPor.trim() || usuario?.nome || usuario?.email || 'Operacional');
      setMensagem('Caixa diario aberto.', 'success');
    } catch (err: any) {
      setMensagem(err?.message || 'Falha ao abrir caixa.', 'error');
    }
  }

  async function handleFechar(event: FormEvent) {
    event.preventDefault();
    try {
      await fecharCaixa(parseMoney(saldoConferido), fechadoPor.trim(), observacoes);
      setMensagem('Caixa fechado com conferencia registrada.', 'success');
    } catch (err: any) {
      setMensagem(err?.message || 'Falha ao fechar caixa.', 'error');
    }
  }

  if (!unidadeValida) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
        Selecione uma unidade especifica para usar o Caixa. O consolidado nao recebe fechamento financeiro diario.
      </div>
    );
  }

  if (!isCompetenciaAtual) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
        Caixa diario usa a data operacional do dia. Selecione o mes atual para lancar fechamento.
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
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            {dataLabel}
          </span>
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

      {(error || statusMessage) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          error || statusMessage?.type === 'error'
            ? 'border-rose-500/25 bg-rose-500/10 text-rose-200'
            : statusMessage?.type === 'success'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
              : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
        }`}>
          {error || statusMessage?.text}
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
              <input
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                placeholder="R$ 0,00"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-400 md:col-span-2">
              Aberto por
              <input
                value={abertoPor}
                onChange={(e) => setAbertoPor(e.target.value)}
                placeholder="Nome"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          <Button type="submit" disabled={saving} className="mt-4">
            Abrir caixa
          </Button>
        </form>
      ) : (
        <>
          <CaixaResumoCards resumo={resumo} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <CaixaMovimentacoesTable movimentos={movimentos} disabled={saving || caixaFechado} onDelete={excluirMovimento} />
            <CaixaMovimentacaoForm
              disabled={saving || caixaFechado}
              saving={saving}
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

            <form onSubmit={handleFechar} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-300" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Conferencia final</h3>
                  <p className="text-xs text-slate-400">Saldo previsto: {formatarMoedaCaixa(resumo.saldoFinalCalculado)}</p>
                </div>
              </div>

              <label className="block space-y-1 text-xs text-slate-400">
                Saldo final conferido
                <input
                  value={caixa.saldo_final_conferido ?? saldoConferido}
                  disabled={caixaFechado}
                  onChange={(e) => setSaldoConferido(e.target.value)}
                  placeholder="R$ 0,00"
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>

              <label className="mt-3 block space-y-1 text-xs text-slate-400">
                Conferido por
                <input
                  value={caixa.fechado_por ?? fechadoPor}
                  disabled={caixaFechado}
                  onChange={(e) => setFechadoPor(e.target.value)}
                  placeholder="Nome"
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>

              <label className="mt-3 block space-y-1 text-xs text-slate-400">
                Observacoes
                <textarea
                  value={caixa.observacoes ?? observacoes}
                  disabled={caixaFechado}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>

              <Button type="submit" disabled={saving || caixaFechado} className="mt-4 w-full">
                <Lock className="h-4 w-4" />
                Fechar caixa
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
