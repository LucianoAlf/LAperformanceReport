import { formatCurrency } from '@/lib/utils';
import type { ResumoUnidade } from '@/hooks/useDashboardDados';

/**
 * A tabela "Resumo por Unidade" tem 5 colunas — em 390px ela so existiria
 * rolando para o lado. Cada unidade vira um cartao com os mesmos 4 numeros.
 */
export function CartaoUnidade({ dados }: { dados: ResumoUnidade }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-3">
      <p className="mb-2 font-medium text-white">{dados.unidade}</p>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Ativos</dt>
          <dd className="tabular-nums text-slate-200">{dados.alunos_ativos}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Pagantes</dt>
          <dd className="tabular-nums text-slate-200">{dados.alunos_pagantes}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Ticket médio</dt>
          <dd className="tabular-nums text-slate-200">{formatCurrency(dados.ticket_medio)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Faturamento previsto</dt>
          <dd className="tabular-nums font-medium text-emerald-400">{formatCurrency(dados.faturamento_previsto)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default CartaoUnidade;
