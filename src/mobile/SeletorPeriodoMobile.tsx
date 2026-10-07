import { useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';

import { PainelPeriodo, type PainelPeriodoProps } from '@/components/ui/PainelPeriodo';
import { FolhaMobile } from './FolhaMobile';

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

      <FolhaMobile
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo="Período"
        rotuloFechar="Fechar seletor de período"
        acessorioTitulo={
          <span className="truncate text-[11px] font-medium text-violet-300">{props.range.label}</span>
        }
      >
        {/* Escolher o VALOR fecha a folha: a decisao terminou ali, e um
            botao "Pronto" depois disso so acrescentaria um toque. Trocar de
            ESCOPO nao fecha — o proximo toque ainda esta por vir na grade. */}
        <PainelPeriodo {...props} layout="empilhado" onEscolheuValor={() => setAberto(false)} />
      </FolhaMobile>
    </>
  );
}

export default SeletorPeriodoMobile;
