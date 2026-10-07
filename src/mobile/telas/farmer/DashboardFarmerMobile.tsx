import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FolhaMobile } from '@/mobile/FolhaMobile';
import { montarLinhasResumo, type ChaveLinha, type EntradaResumo, type TomLinha } from '@/lib/farmerResumo';

/**
 * O Dashboard da Farmer no celular (LAPE-32).
 *
 * Os 4 números numa faixa e uma linha por bloco. Tocar numa linha abre, numa
 * folha, o MESMO bloco que o computador desenha — ele chega pronto por prop,
 * montado na `DashboardTab` com os mesmos hooks e os mesmos handlers.
 *
 * ⚠️ Esta tela **não busca nada e não escreve nada**: não é uma segunda versão
 * dos alertas, é outra moldura para os mesmos.
 */

interface Props {
  numeros: {
    checklistsAtivos: number;
    checklistsConcluidos: number;
    tarefasPendentes: number;
    taxaSucessoContatos: number;
  };
  entrada: EntradaResumo;
  /** Os blocos do computador. `criticos` e `feedback` navegam, não abrem folha. */
  blocos: Partial<Record<Exclude<ChaveLinha, 'criticos' | 'feedback'>, ReactNode>>;
  onAbrirCriticos: () => void;
  onAbrirFeedback: () => void;
}

const FAIXA_TOM: Record<TomLinha, string> = {
  critico: 'bg-rose-500',
  atencao: 'bg-amber-500',
  neutro: 'bg-transparent',
};

const TITULO_FOLHA: Record<Exclude<ChaveLinha, 'criticos' | 'feedback'>, string> = {
  checklists: 'Checklists com prazo',
  alertas: 'Alertas do dia',
  tarefas: 'Tarefas urgentes',
  rotinas: 'Rotinas de hoje',
  equipe: 'Equipe Farmer',
};

export function DashboardFarmerMobile({ numeros, entrada, blocos, onAbrirCriticos, onAbrirFeedback }: Props) {
  const [aberta, setAberta] = useState<keyof typeof TITULO_FOLHA | null>(null);
  // A folha desce animada depois de fechar: o conteúdo fica até ela sumir.
  const [ultima, setUltima] = useState<keyof typeof TITULO_FOLHA>('alertas');
  const linhas = montarLinhasResumo(entrada);

  const tocar = (chave: ChaveLinha) => {
    if (chave === 'criticos') return onAbrirCriticos();
    if (chave === 'feedback') return onAbrirFeedback();
    setUltima(chave);
    setAberta(chave);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        <Numero valor={numeros.checklistsAtivos} rotulo="checklists ativos" cor="text-violet-400" />
        <Numero valor={numeros.checklistsConcluidos} rotulo="concluídos no mês" cor="text-emerald-400" />
        <Numero valor={numeros.tarefasPendentes} rotulo="tarefas rápidas" cor="text-amber-400" />
        <Numero valor={`${numeros.taxaSucessoContatos}%`} rotulo="sucesso contatos" cor="text-cyan-400" />
      </div>

      <ul className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        {linhas.map((l) => {
          const corpo = (
            <>
              <span className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r', FAIXA_TOM[l.tom])} aria-hidden="true" />
              <span className="w-6 flex-none text-center" aria-hidden="true">{l.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{l.rotulo}</span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  l.tom === 'critico' ? 'text-rose-400' : l.tom === 'atencao' ? 'text-amber-400' : 'text-slate-400',
                )}
              >
                {l.valor}
              </span>
              <ChevronRight className={cn('h-4 w-4 flex-none', l.abre ? 'text-slate-500' : 'invisible')} aria-hidden="true" />
            </>
          );
          return (
            <li key={l.chave} className="border-b border-slate-800 last:border-b-0">
              {l.abre ? (
                <button
                  type="button"
                  onClick={() => tocar(l.chave)}
                  className="relative flex min-h-[52px] w-full items-center gap-2 px-3 text-left active:bg-slate-800/60"
                >
                  {corpo}
                </button>
              ) : (
                <div className="relative flex min-h-[52px] items-center gap-2 px-3">{corpo}</div>
              )}
            </li>
          );
        })}
      </ul>

      <FolhaMobile aberto={aberta !== null} onFechar={() => setAberta(null)} titulo={TITULO_FOLHA[ultima]}>
        {blocos[ultima]}
      </FolhaMobile>
    </div>
  );
}

function Numero({ valor, rotulo, cor }: { valor: ReactNode; rotulo: string; cor: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-1 py-2 text-center">
      <div className={cn('text-lg font-bold tabular-nums', cor)}>{valor}</div>
      <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{rotulo}</div>
    </div>
  );
}

export default DashboardFarmerMobile;
