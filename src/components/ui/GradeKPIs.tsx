import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { useShellMobile } from '@/hooks/useShellMobile';

/**
 * A faixa de KPIs do topo de uma página.
 *
 * No desktop é a grade de sempre. No celular vira uma **faixa deslizante**, e
 * a razão é medida: na tela de Alunos são 7 cartões que, em 2 colunas de
 * 375px, ocupam **551px** — quatro linhas. Somados aos 248px de cabeçalho e
 * filtros, as abas só apareciam depois de rolar ~860px, numa tela de 812px.
 * Ou seja: para chegar à lista de alunos era preciso passar por uma tela
 * inteira de indicadores.
 *
 * ⚠️ **Rolagem lateral aqui não é a degradação da §8 do spec.** Aquela é a
 * página inteira escapando da viewport, sem aviso e sem affordance. Esta é um
 * componente com limite declarado (`snap`, cartão do lado cortado na borda),
 * e existe justamente para a PÁGINA não precisar rolar. A alternativa era
 * esconder o `subvalue` dos cartões — que carrega dado real ("66 2º curso |
 * 107 banda | 0 coral") —, e informação escondida é pior que informação que
 * exige um gesto.
 *
 * O cartão seguinte fica parcialmente visível de propósito: é o que diz que
 * existe mais coisa ali. Faixa que termina exatamente na borda parece
 * completa.
 */

interface GradeKPIsProps {
  children: ReactNode;
  /** Classes da grade no desktop (cada tela tem o seu número de colunas). */
  className?: string;
  'data-tour'?: string;
}

export function GradeKPIs({ children, className, 'data-tour': dataTour }: GradeKPIsProps) {
  const ehCelular = useShellMobile() === 'mobile';

  if (ehCelular) {
    return (
      <section
        data-tour={dataTour}
        aria-label="Indicadores"
        className={cn(
          'flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1',
          // `[&>*]:` alcança os cartões sem que cada tela precise saber disso.
          // 63% deixa o vizinho aparecendo ~1/3 — a affordance da faixa.
          '[&>*]:w-[63%] [&>*]:flex-none [&>*]:snap-start',
        )}
      >
        {children}
      </section>
    );
  }

  return (
    <section data-tour={dataTour} className={className}>
      {children}
    </section>
  );
}

export default GradeKPIs;
