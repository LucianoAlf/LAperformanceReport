// Geometria da timeline da Agenda. Sem React, sem Supabase: tudo testavel isoladamente.

export const AGENDA_HORA_INICIO = 8;
export const AGENDA_HORA_FIM = 22;
export const AGENDA_LARGURA_HORA_PX = 88;
export const AGENDA_ALTURA_FAIXA_PX = 34;
export const AGENDA_GAP_FAIXA_PX = 3;

export type ItemPosicionavel = {
  hora_inicio: string;
  duracao_minutos: number;
};

/** 'HH:MM' -> minutos desde a meia-noite. A RPC ja entrega em BRT. */
export function minutosDeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Distribui aulas em faixas horizontais para que aulas sobrepostas nao se
 * cubram. Uma faixa e reaproveitada assim que a aula anterior dela termina.
 * A ordenacao interna torna o resultado independente da ordem de entrada.
 */
export function alocarFaixas<T extends ItemPosicionavel>(
  itens: T[],
): Array<T & { faixa: number }> {
  const ordenados = itens
    .map((item, indice) => ({ item, indice }))
    .sort((a, b) => {
      const ia = minutosDeHHMM(a.item.hora_inicio);
      const ib = minutosDeHHMM(b.item.hora_inicio);
      if (ia !== ib) return ia - ib;
      if (a.item.duracao_minutos !== b.item.duracao_minutos) {
        return a.item.duracao_minutos - b.item.duracao_minutos;
      }
      return a.indice - b.indice;
    });

  const fimDaFaixa: number[] = [];
  const faixaPorIndice = new Map<number, number>();

  for (const { item, indice } of ordenados) {
    const inicio = minutosDeHHMM(item.hora_inicio);
    const fim = inicio + item.duracao_minutos;
    let faixa = 0;
    while (fimDaFaixa[faixa] !== undefined && fimDaFaixa[faixa] > inicio) {
      faixa++;
    }
    fimDaFaixa[faixa] = fim;
    faixaPorIndice.set(indice, faixa);
  }

  return itens.map((item, indice) => ({
    ...item,
    faixa: faixaPorIndice.get(indice) ?? 0,
  }));
}

export function contarFaixas(itens: Array<{ faixa: number }>): number {
  if (itens.length === 0) return 0;
  return Math.max(...itens.map((i) => i.faixa)) + 1;
}
