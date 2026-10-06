import { CheckCircle2, ChevronRight, Send, Unlock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatarMoedaCaixa } from '@/lib/caixaFinanceiro';
import { rotuloDiaCaixa } from '@/lib/caixaMobile';
import { useCaixaHistorico } from '@/hooks/useCaixaHistorico';

/**
 * Histórico de caixas no celular (LAPE-32, 06/10/2026).
 *
 * O painel do computador é uma tabela de 700px com 8 colunas e um "Abrir dia"
 * de 26px por linha; dentro da folha, medido a 390px, ela passava de 7.700px de
 * altura. Aqui o histórico responde à pergunta do balcão — "como ficou aquele
 * dia?" — e tocar na linha abre o dia, que é o que o "Abrir dia" fazia.
 *
 * Mesma fonte do computador (`useCaixaHistorico`, mesmos parâmetros). Os
 * lançamentos de cada dia aparecem ao abrir o dia, em vez de expandir aqui.
 */

interface Props {
  unidadeId?: string | null;
  dataCaixaAtual: string;
  onSelecionarData: (dataCaixa: string) => void;
}

export function HistoricoCaixaMobile({ unidadeId, dataCaixaAtual, onSelecionarData }: Props) {
  const { historico, loading, error } = useCaixaHistorico({ unidadeId, excluirData: dataCaixaAtual, limite: 30 });

  if (loading) return <p className="px-1 py-6 text-center text-sm text-slate-500">Carregando...</p>;
  if (error) return <p className="px-1 py-4 text-sm text-rose-400">{error}</p>;
  if (historico.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-slate-500">Nenhum caixa anterior encontrado.</p>;
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-slate-800">
      {historico.map((c) => {
        const fechado = c.status === 'fechado';
        const conferido = c.saldo_final_conferido != null;
        return (
          <li key={c.id} className="border-b border-slate-800 last:border-b-0">
            <button
              type="button"
              onClick={() => onSelecionarData(c.data_caixa)}
              className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-800/60"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-slate-100">{rotuloDiaCaixa(c.data_caixa)}</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                      fechado ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300',
                    )}
                  >
                    {fechado ? <CheckCircle2 className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    {fechado ? 'Fechado' : 'Aberto'}
                  </span>
                  {c.ultimo_envio_whatsapp_em && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px]',
                        c.ultimo_envio_whatsapp_status === 'enviado' ? 'text-cyan-300' : 'text-rose-300',
                      )}
                    >
                      <Send className="h-3 w-3" />
                      {c.ultimo_envio_whatsapp_status === 'enviado' ? 'Enviado' : 'Erro no envio'}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {c.fechado_por ? `fechado por ${c.fechado_por}` : c.aberto_por ? `aberto por ${c.aberto_por}` : ' '}
                </span>
              </span>
              <span className="flex-none text-right">
                <span className="block text-sm font-semibold tabular-nums text-white">
                  {formatarMoedaCaixa(Number(conferido ? c.saldo_final_conferido : c.saldo_final_calculado))}
                </span>
                <span className="block text-[11px] text-slate-500">{conferido ? 'conferido' : 'previsto'}</span>
              </span>
              <ChevronRight className="h-4 w-4 flex-none text-slate-500" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default HistoricoCaixaMobile;
