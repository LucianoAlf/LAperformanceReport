import { CheckCircle2, Clock, History, Send, Unlock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatarDataCaixa, formatarMoedaCaixa } from '@/lib/caixaFinanceiro';
import { useCaixaHistorico } from '@/hooks/useCaixaHistorico';
import type { CaixaDiario } from '@/types/caixa';

interface CaixaHistoricoProps {
  unidadeId?: string | null;
  dataCaixaAtual: string;
}

function badgeStatus(status: CaixaDiario['status']) {
  return status === 'fechado'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : 'border-amber-500/25 bg-amber-500/10 text-amber-300';
}

function whatsappBadge(caixa: CaixaDiario) {
  if (!caixa.ultimo_envio_whatsapp_em) return null;
  const ok = caixa.ultimo_envio_whatsapp_status === 'enviado';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium',
      ok
        ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'
        : 'border-rose-500/25 bg-rose-500/10 text-rose-300'
    )}>
      <Send className="h-2.5 w-2.5" />
      {ok ? 'Enviado' : 'Erro'}
    </span>
  );
}

function formatarHora(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export function CaixaHistoricoButton({ unidadeId, dataCaixaAtual }: CaixaHistoricoProps) {
  const [open, setOpen] = useState(false);
  const { historico, loading, error } = useCaixaHistorico({
    unidadeId,
    excluirData: dataCaixaAtual,
    limite: 30,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 border-slate-700 text-slate-300 hover:text-white">
          <History className="h-4 w-4" />
          Histórico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Histórico de caixas</DialogTitle>
          <DialogDescription>Últimos fechamentos desta unidade</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {loading && (
            <p className="py-8 text-center text-sm text-slate-500">Carregando...</p>
          )}
          {error && (
            <p className="py-4 text-sm text-rose-400">{error}</p>
          )}
          {!loading && !error && historico.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">Nenhum caixa anterior encontrado.</p>
          )}
          {!loading && !error && historico.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-800/70 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Saldo calculado</th>
                    <th className="px-4 py-3 text-right">Saldo conferido</th>
                    <th className="px-4 py-3">Abertura</th>
                    <th className="px-4 py-3">Fechamento</th>
                    <th className="px-4 py-3">WA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historico.map((caixa) => {
                    const horaAbertura = formatarHora(caixa.aberto_em);
                    const horaFechamento = formatarHora(caixa.fechado_em);
                    return (
                      <tr key={caixa.id} className="text-slate-300 hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                          {formatarDataCaixa(caixa.data_caixa)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                            badgeStatus(caixa.status)
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
                              {caixa.aberto_por && (
                                <span className="text-slate-500 truncate max-w-[80px]">· {caixa.aberto_por}</span>
                              )}
                            </div>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {horaFechamento ? (
                            <div className="flex items-center gap-1 text-slate-400 whitespace-nowrap">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span>{horaFechamento}</span>
                              {caixa.fechado_por && (
                                <span className="text-slate-500 truncate max-w-[80px]">· {caixa.fechado_por}</span>
                              )}
                            </div>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {whatsappBadge(caixa) ?? <span className="text-slate-500 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
