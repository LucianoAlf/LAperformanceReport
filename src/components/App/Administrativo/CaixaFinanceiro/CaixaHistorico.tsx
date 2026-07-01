import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock, Send, Unlock } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatarDataCaixa, formatarMoedaCaixa } from '@/lib/caixaFinanceiro';
import { obterNomeCategoriaCaixa } from '@/lib/caixaCategorias';
import { useCaixaHistorico } from '@/hooks/useCaixaHistorico';
import { useCaixaMovimentosPorId } from '@/hooks/useCaixaMovimentosPorId';
import type { CaixaDiario } from '@/types/caixa';

interface CaixaHistoricoPainelProps {
  unidadeId?: string | null;
  dataCaixaAtual: string;
  onSelecionarData?: (dataCaixa: string) => void;
}

function formatarHora(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function MovimentosExpandidos({ caixaDiarioId }: { caixaDiarioId: string }) {
  const { movimentos, loading, error } = useCaixaMovimentosPorId(caixaDiarioId);

  if (loading) {
    return <p className="px-6 py-3 text-xs text-slate-500">Carregando movimentos...</p>;
  }
  if (error) {
    return <p className="px-6 py-3 text-xs text-rose-400">{error}</p>;
  }
  if (movimentos.length === 0) {
    return <p className="px-6 py-3 text-xs text-slate-500">Nenhuma movimentação registrada.</p>;
  }

  return (
    <div className="border-t border-slate-800/60 bg-slate-950/40">
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-6 py-2">Tipo</th>
            <th className="px-6 py-2">Ambiente</th>
            <th className="px-6 py-2">Descrição</th>
            <th className="px-6 py-2">Forma</th>
            <th className="px-6 py-2">Categoria</th>
            <th className="px-6 py-2 text-right">Valor</th>
            <th className="px-6 py-2">Responsável</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {movimentos.map((mov) => {
            const pixNoCofre = mov.forma_pagamento !== 'dinheiro' && mov.ambiente === 'cofre';
            return (
              <tr key={mov.id} className={cn('text-slate-400', pixNoCofre && 'bg-amber-500/5')}>
                <td className="px-6 py-2">
                  <span className={cn(
                    'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium',
                    mov.tipo === 'entrada'
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                  )}>
                    {mov.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                  </span>
                </td>
                <td className="px-6 py-2 capitalize">{mov.ambiente}</td>
                <td className="px-6 py-2 text-slate-300">{mov.descricao}</td>
                <td className="px-6 py-2">
                  <span className="flex items-center gap-1 capitalize">
                    {mov.forma_pagamento}
                    {pixNoCofre && (
                      <AlertTriangle className="h-3 w-3 text-amber-400" title="Forma de pagamento incomum no cofre" />
                    )}
                  </span>
                </td>
                <td className="px-6 py-2">{obterNomeCategoriaCaixa(mov.categoria, [])}</td>
                <td className="px-6 py-2 text-right font-semibold text-white">{formatarMoedaCaixa(Number(mov.valor))}</td>
                <td className="px-6 py-2">{mov.responsavel || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CaixaHistoricoLinha({
  caixa,
  onSelecionarData,
}: {
  caixa: CaixaDiario;
  onSelecionarData?: (dataCaixa: string) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const horaAbertura = formatarHora(caixa.aberto_em);
  const horaFechamento = formatarHora(caixa.fechado_em);

  return (
    <>
      <tr
        className="cursor-pointer text-slate-300 hover:bg-slate-800/40"
        onClick={() => setExpandido((v) => !v)}
      >
        <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
          {formatarDataCaixa(caixa.data_caixa)}
        </td>
        <td className="px-4 py-3">
          <span className={cn(
            'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            caixa.status === 'fechado'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
          )}>
            {caixa.status === 'fechado'
              ? <><CheckCircle2 className="h-3 w-3" />Fechado</>
              : <><Unlock className="h-3 w-3" />Aberto</>
            }
          </span>
        </td>
        <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">
          {formatarMoedaCaixa(Number(caixa.saldo_final_calculado))}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {caixa.saldo_final_conferido != null
            ? <span className="font-semibold text-white">{formatarMoedaCaixa(Number(caixa.saldo_final_conferido))}</span>
            : <span className="text-slate-500">—</span>
          }
        </td>
        <td className="px-4 py-3">
          {horaAbertura ? (
            <div className="flex items-center gap-1 text-slate-400 whitespace-nowrap">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{horaAbertura}</span>
              {caixa.aberto_por && <span className="text-slate-500 truncate max-w-[80px]">· {caixa.aberto_por}</span>}
            </div>
          ) : <span className="text-slate-500">—</span>}
        </td>
        <td className="px-4 py-3">
          {horaFechamento ? (
            <div className="flex items-center gap-1 text-slate-400 whitespace-nowrap">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{horaFechamento}</span>
              {caixa.fechado_por && <span className="text-slate-500 truncate max-w-[80px]">· {caixa.fechado_por}</span>}
            </div>
          ) : <span className="text-slate-500">—</span>}
        </td>
        <td className="px-4 py-3">
          {caixa.ultimo_envio_whatsapp_em ? (
            <span className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium',
              caixa.ultimo_envio_whatsapp_status === 'enviado'
                ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'
                : 'border-rose-500/25 bg-rose-500/10 text-rose-300'
            )}>
              <Send className="h-2.5 w-2.5" />
              {caixa.ultimo_envio_whatsapp_status === 'enviado' ? 'Enviado' : 'Erro'}
            </span>
          ) : <span className="text-slate-500 text-xs">—</span>}
        </td>
        <td className="px-4 py-3 text-slate-400">
          <div className="flex items-center justify-end gap-2">
            {onSelecionarData && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-200"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelecionarData(caixa.data_caixa);
                }}
              >
                <CalendarDays className="h-3 w-3" />
                Abrir dia
              </button>
            )}
            {expandido
              ? <ChevronUp className="h-4 w-4" />
              : <ChevronDown className="h-4 w-4" />
            }
          </div>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={8} className="p-0">
            <MovimentosExpandidos caixaDiarioId={caixa.id} />
          </td>
        </tr>
      )}
    </>
  );
}

export function CaixaHistoricoPanel({ unidadeId, dataCaixaAtual, onSelecionarData }: CaixaHistoricoPainelProps) {
  const { historico, loading, error } = useCaixaHistorico({
    unidadeId,
    excluirData: dataCaixaAtual,
    limite: 30,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
      <div className="border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Histórico de caixas</h3>
        <p className="text-xs text-slate-400">Clique em uma linha para ver os lançamentos ou use Abrir dia para reenviar/corrigir.</p>
      </div>

      {loading && (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Carregando...</p>
      )}
      {error && (
        <p className="px-4 py-4 text-sm text-rose-400">{error}</p>
      )}
      {!loading && !error && historico.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhum caixa anterior encontrado.</p>
      )}
      {!loading && !error && historico.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-800/70 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Saldo calculado</th>
                <th className="px-4 py-3 text-right">Saldo conferido</th>
                <th className="px-4 py-3">Abertura</th>
                <th className="px-4 py-3">Fechamento</th>
                <th className="px-4 py-3">WA</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {historico.map((caixa) => (
                <CaixaHistoricoLinha
                  key={caixa.id}
                  caixa={caixa}
                  onSelecionarData={onSelecionarData}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
