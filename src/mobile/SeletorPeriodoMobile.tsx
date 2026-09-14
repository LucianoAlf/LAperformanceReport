import { useEffect, useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';

import { PainelPeriodo, type PainelPeriodoProps } from '@/components/ui/PainelPeriodo';

type Props = Omit<PainelPeriodoProps, 'layout' | 'onEscolheuValor'>;

/**
 * O periodo no celular: uma pilula que DIZ o periodo vigente, e o painel
 * completo numa folha, so quando alguem vai trocar.
 *
 * **Por que nao o `CompetenciaFilter` aqui.** A primeira versao desta folha
 * embrulhava ele, e era o componente errado — o proprio `SeletorPeriodo` da
 * Agenda ja tinha registrado por que, em 03/08/2026: ele "empilha tres
 * metaforas na mesma faixa" e "escolher um mes exige dois cliques em dois
 * controles diferentes, porque os 12 meses so existem dentro de um `<select>`".
 * Num `<select>` dentro de uma folha isso fica pior: vira camada sobre camada,
 * com uma lista de 12 itens rolando dentro de um alvo de 40px. Aqui os meses
 * sao uma grade de 4 colunas e **um toque resolve**.
 *
 * Aberto o tempo todo, o filtro custava 194px do topo de uma tela de 812px —
 * 24% da altura num controle que se mexe poucas vezes por sessao, empurrando
 * para baixo os numeros que a pessoa abriu o app para ver. A pilula custa 36px
 * e ainda informa mais: "Set/2026" por extenso, em vez de deduzir o periodo de
 * qual chip esta aceso.
 *
 * ⚠️ O painel e' O MESMO da Agenda (`@/components/ui/PainelPeriodo`), so que
 * empilhado — nao ha segunda versao das listas de meses, trimestres e
 * semestres, nem do estado: dirige as mesmas funcoes de `useCompetenciaFiltro`.
 */
export function SeletorPeriodoMobile(props: Props) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className="inline-flex min-h-[36px] max-w-full items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 py-1.5 pl-3 pr-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <CalendarRange className="h-3.5 w-3.5 flex-none text-violet-400" aria-hidden="true" />
        <span className="truncate text-[13px] font-semibold text-slate-100">{props.range.label}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-none text-slate-500" aria-hidden="true" />
      </button>

      {aberto && (
        <>
          <button
            type="button"
            aria-label="Fechar seletor de período"
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-40 bg-slate-950/70"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Período"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-grotesk text-sm font-bold text-slate-50">Período</h2>
              <span className="truncate text-[11px] font-medium text-violet-300">{props.range.label}</span>
            </div>

            {/* Escolher o VALOR fecha a folha: a decisao terminou ali, e um
                botao "Pronto" depois disso so acrescentaria um toque. Trocar de
                ESCOPO nao fecha — o proximo toque ainda esta por vir na grade. */}
            <PainelPeriodo {...props} layout="empilhado" onEscolheuValor={() => setAberto(false)} />
          </div>
        </>
      )}
    </>
  );
}

export default SeletorPeriodoMobile;
