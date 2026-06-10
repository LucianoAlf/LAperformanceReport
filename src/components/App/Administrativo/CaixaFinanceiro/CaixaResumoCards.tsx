import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Receipt, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatarMoedaCaixa } from '@/lib/caixaFinanceiro';
import type { CaixaResumo } from '@/types/caixa';

interface CaixaResumoCardsProps {
  resumo: CaixaResumo;
}

const cards = [
  {
    key: 'saldoInicialCofre',
    label: 'Saldo inicial cofre',
    icon: Wallet,
    tone: 'slate',
  },
  {
    key: 'entradasDinheiroCofre',
    label: 'Entradas dinheiro',
    icon: ArrowDownCircle,
    tone: 'emerald',
  },
  {
    key: 'saidasDinheiroCofre',
    label: 'Saidas dinheiro',
    icon: ArrowUpCircle,
    tone: 'rose',
  },
  {
    key: 'saldoFinalCalculado',
    label: 'Saldo final previsto',
    icon: CheckCircle2,
    tone: 'cyan',
  },
  {
    key: 'vendasTotal',
    label: 'Vendas do dia',
    icon: Receipt,
    tone: 'violet',
  },
] as const;

const toneClasses = {
  slate: 'border-slate-700/70 bg-slate-900/70 text-slate-200',
  emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  rose: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
  cyan: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
  violet: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
};

export function CaixaResumoCards({ resumo }: CaixaResumoCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = resumo[card.key];

        return (
          <div key={card.key} className={cn('rounded-xl border p-4', toneClasses[card.tone])}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-400">{card.label}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/40">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{formatarMoedaCaixa(value)}</p>
          </div>
        );
      })}
    </div>
  );
}
