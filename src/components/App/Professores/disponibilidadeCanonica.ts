type IntervaloDisponibilidade = {
  inicio: string;
  fim: string;
};

type DisponibilidadeEntrada = Record<
  string,
  IntervaloDisponibilidade | null | undefined
>;

export const DIAS_DISPONIBILIDADE_CANONICOS = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

export function normalizarDisponibilidadeSemanal(
  disponibilidade: DisponibilidadeEntrada | null | undefined,
): Record<string, IntervaloDisponibilidade> {
  const normalizada: Record<string, IntervaloDisponibilidade> = {};

  for (const dia of DIAS_DISPONIBILIDADE_CANONICOS) {
    const intervalo = disponibilidade?.[dia];
    if (
      typeof intervalo?.inicio !== 'string'
      || intervalo.inicio.length === 0
      || typeof intervalo.fim !== 'string'
      || intervalo.fim.length === 0
    ) {
      continue;
    }

    normalizada[dia] = {
      inicio: intervalo.inicio,
      fim: intervalo.fim,
    };
  }

  return normalizada;
}

export function normalizarDisponibilidadesPorUnidade(
  disponibilidades: Record<string, DisponibilidadeEntrada> | null | undefined,
  unidadesIds: readonly string[],
): Record<string, Record<string, IntervaloDisponibilidade>> {
  return Object.fromEntries(
    unidadesIds.map((unidadeId) => [
      unidadeId,
      normalizarDisponibilidadeSemanal(disponibilidades?.[unidadeId]),
    ]),
  );
}
