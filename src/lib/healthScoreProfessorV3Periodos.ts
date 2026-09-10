export type HealthScoreV3Periodicidade = 'mensal' | 'ciclo';

export interface HealthScoreV3Period {
  periodicidade: HealthScoreV3Periodicidade;
  inicio: string;
  fim: string;
  codigo: string;
  label: string;
}

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getHealthScoreV3Period(
  year: number,
  month: number,
  periodicidade: HealthScoreV3Periodicidade,
): HealthScoreV3Period {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError('Ano invalido para o Health Score V3.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Mes invalido para o Health Score V3.');
  }

  if (periodicidade === 'mensal') {
    return {
      periodicidade,
      inicio: isoDate(year, month, 1),
      fim: isoDate(year, month, lastDayOfMonth(year, month)),
      codigo: `${year}-${String(month).padStart(2, '0')}`,
      label: `${MONTH_LABELS[month - 1]}/${year}`,
    };
  }

  if (month >= 6 && month <= 8) {
    return {
      periodicidade,
      inicio: isoDate(year, 6, 1),
      fim: isoDate(year, 8, 31),
      codigo: `${year}-JUN-AGO`,
      label: `Jun-Ago/${year}`,
    };
  }

  if (month >= 9 && month <= 11) {
    return {
      periodicidade,
      inicio: isoDate(year, 9, 1),
      fim: isoDate(year, 11, 30),
      codigo: `${year}-SET-NOV`,
      label: `Set-Nov/${year}`,
    };
  }

  if (month === 12) {
    return {
      periodicidade,
      inicio: isoDate(year, 12, 1),
      fim: isoDate(year + 1, 2, lastDayOfMonth(year + 1, 2)),
      codigo: `${year}-DEZ-${year + 1}-FEV`,
      label: `Dez/${year}-Fev/${year + 1}`,
    };
  }

  if (month <= 2) {
    return {
      periodicidade,
      inicio: isoDate(year - 1, 12, 1),
      fim: isoDate(year, 2, lastDayOfMonth(year, 2)),
      codigo: `${year - 1}-DEZ-${year}-FEV`,
      label: `Dez/${year - 1}-Fev/${year}`,
    };
  }

  return {
    periodicidade,
    inicio: isoDate(year, 3, 1),
    fim: isoDate(year, 5, 31),
    codigo: `${year}-MAR-MAI`,
    label: `Mar-Mai/${year}`,
  };
}

export function getHealthScoreV3PeriodFromCompetencia(
  competencia: string,
  periodicidade: HealthScoreV3Periodicidade,
): HealthScoreV3Period {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(competencia);
  if (!match) throw new RangeError('Competencia invalida para o Health Score V3.');
  return getHealthScoreV3Period(Number(match[1]), Number(match[2]), periodicidade);
}

function getSaoPauloYearMonth(reference: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(reference);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new RangeError('Data de referencia invalida para o Health Score V3.');
  }
  return { year, month };
}

/**
 * O seletor de ciclo guarda o primeiro mes como chave estavel do periodo.
 * Durante o ciclo corrente, porem, a fotografia consultada precisa avancar
 * junto com o calendario para acumular somente os meses ja transcorridos.
 */
export function getHealthScoreV3QueryCompetence(
  year: number,
  month: number,
  periodicidade: HealthScoreV3Periodicidade,
  reference: Date = new Date(),
): string {
  const selected = getHealthScoreV3Period(year, month, periodicidade);
  if (periodicidade === 'mensal') return selected.inicio.slice(0, 7);

  const current = getSaoPauloYearMonth(reference);
  const currentCompetence = isoDate(current.year, current.month, 1);
  if (currentCompetence >= selected.inicio && currentCompetence <= selected.fim) {
    return currentCompetence.slice(0, 7);
  }

  return isoDate(year, month, 1).slice(0, 7);
}
