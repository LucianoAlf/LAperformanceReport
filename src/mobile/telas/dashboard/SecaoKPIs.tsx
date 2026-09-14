import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SecaoKPIsProps {
  titulo: string;
  icone: LucideIcon;
  corIcone: string;
  children: ReactNode;
}

/**
 * Cabecalho + grade de KPIs de uma secao do Dashboard mobile.
 *
 * Duas colunas: o KPICard em `size="sm"` fica com ~180px em tela de 390px,
 * que e onde o numero ainda se le de relance. Uma coluna so transformaria
 * os 13 indicadores em rolagem longa demais para "dar uma olhada".
 */
export function SecaoKPIs({ titulo, icone: Icone, corIcone, children }: SecaoKPIsProps) {
  return (
    <section>
      {/* A regua a direita do titulo fecha a linha e separa as secoes sem
          gastar altura: numa coluna de cartoes todos iguais, e o que diz onde
          um assunto termina e o proximo comeca. */}
      <div className="mb-2 flex items-center gap-2">
        <Icone className={`h-4 w-4 flex-none ${corIcone}`} />
        {/* Cor e peso sao os do desktop (text-slate-400, semibold, uppercase,
            tracking-wide) — o que muda e so o tamanho, e a regua abaixo. Trocar
            a cor aqui criaria um segundo vocabulario visual para o mesmo
            cabecalho, que e o que tests/mobileDashboardSecaoKpis.test.mjs
            protege. */}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3>
        <span className="h-px flex-1 bg-slate-800" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

export default SecaoKPIs;
