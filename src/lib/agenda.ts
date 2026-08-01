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

/** Distancia em px do inicio do trilho (08:00) ate o horario dado. */
export function posicaoPx(hhmm: string): number {
  const minutos = minutosDeHHMM(hhmm);
  return ((minutos - AGENDA_HORA_INICIO * 60) / 60) * AGENDA_LARGURA_HORA_PX;
}

export function larguraPx(duracaoMinutos: number): number {
  return (duracaoMinutos / 60) * AGENDA_LARGURA_HORA_PX;
}

/** Minutos desde a meia-noite no relogio local. O app roda em BRT. */
export function minutosAgora(agora: Date): number {
  return agora.getHours() * 60 + agora.getMinutes();
}

export function dentroDoExpediente(minutos: number): boolean {
  return minutos >= AGENDA_HORA_INICIO * 60 && minutos <= AGENDA_HORA_FIM * 60;
}

/** Aulas vivas neste minuto e quantas salas elas ocupam. Cancelada nao conta. */
export function contarEmAulaAgora(
  aulas: Array<{
    hora_inicio: string;
    duracao_minutos: number;
    cancelada: boolean;
    sala_nome: string | null;
  }>,
  minutos: number,
): { aulas: number; salas: number } {
  const salas = new Set<string>();
  let total = 0;

  for (const aula of aulas) {
    if (aula.cancelada) continue;
    const inicio = minutosDeHHMM(aula.hora_inicio);
    if (minutos < inicio || minutos >= inicio + aula.duracao_minutos) continue;
    total++;
    if (aula.sala_nome) salas.add(aula.sala_nome);
  }

  return { aulas: total, salas: salas.size };
}

export function formatarFrescor(ultimaSync: string | null, agora: Date): string {
  if (!ultimaSync) return 'sem dado de sincronizacao';

  const minutos = Math.floor((agora.getTime() - new Date(ultimaSync).getTime()) / 60000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `ha ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `ha ${horas} h`;
  return `ha ${Math.floor(horas / 24)} d`;
}

// Janela em que aulas foram apagadas por um evento pontual (ver spec).
// Nao ha backfill: a tela avisa em vez de mostrar um dia vazio como verdade.
export const DIA_INCOMPLETO_INICIO = '2026-07-19';
export const DIA_INCOMPLETO_FIM = '2026-08-01';

export function diaIncompleto(data: string): boolean {
  return data >= DIA_INCOMPLETO_INICIO && data <= DIA_INCOMPLETO_FIM;
}
