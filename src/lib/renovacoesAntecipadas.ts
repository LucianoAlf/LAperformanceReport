export type RenovacaoStatusOperacional =
  | 'pendente_validacao'
  | 'confirmada'
  | 'antecipada_pendente'
  | 'antecipada_confirmada';

interface ClassificarRenovacaoParams {
  dataMovimento: string | null | undefined;
  dataPrimeiraAulaNovoCiclo?: string | null;
  confirmada?: boolean;
}

export interface ClassificacaoRenovacaoCompetencia {
  competenciaReferencia: string;
  antecipada: boolean;
  statusPendente: RenovacaoStatusOperacional;
  statusConfirmada: RenovacaoStatusOperacional;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function inicioMesISO(value: string | null | undefined): string {
  const date = parseDateOnly(value) || parseDateOnly(new Date().toISOString())!;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthKey(value: string | null | undefined): string {
  return inicioMesISO(value).slice(0, 7);
}

export function classificarRenovacaoPorCompetencia({
  dataMovimento,
  dataPrimeiraAulaNovoCiclo,
}: ClassificarRenovacaoParams): ClassificacaoRenovacaoCompetencia {
  const competenciaReferencia = inicioMesISO(dataPrimeiraAulaNovoCiclo || dataMovimento);
  const antecipada = Boolean(
    dataPrimeiraAulaNovoCiclo
      && monthKey(dataPrimeiraAulaNovoCiclo) > monthKey(dataMovimento)
  );

  return {
    competenciaReferencia,
    antecipada,
    statusPendente: antecipada ? 'antecipada_pendente' : 'pendente_validacao',
    statusConfirmada: antecipada ? 'antecipada_confirmada' : 'confirmada',
  };
}

export function competenciaReferenciaMovimento(row: {
  data?: string | null;
  competencia_referencia?: string | null;
}): string {
  return inicioMesISO(row.competencia_referencia || row.data);
}

export function isCompetenciaNoPeriodo(
  row: { data?: string | null; competencia_referencia?: string | null },
  inicio: string,
  fim: string
): boolean {
  const competencia = competenciaReferenciaMovimento(row);
  return competencia >= inicio && competencia <= fim;
}

export function isRenovacaoAntecipada(row: {
  data?: string | null;
  competencia_referencia?: string | null;
  renovacao_antecipada?: boolean | null;
}): boolean {
  if (row.renovacao_antecipada) return true;
  return competenciaReferenciaMovimento(row) > inicioMesISO(row.data);
}
