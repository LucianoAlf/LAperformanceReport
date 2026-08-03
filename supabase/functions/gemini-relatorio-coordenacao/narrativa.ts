export interface SinalParaNarrativa {
  sinal: string;
}

const SINAIS_SOMENTE_AUDITORIA = new Set([
  "capacidade_estimada_conferir",
]);

export function filtrarSinaisParaNarrativa<T extends SinalParaNarrativa>(sinais: readonly T[]): T[] {
  return sinais.filter((sinal) => !SINAIS_SOMENTE_AUDITORIA.has(sinal.sinal));
}
