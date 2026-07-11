export interface RenovacaoPendenteCanonica {
  id: number;
  tipo: string;
  renovacao_status?: string | null;
  emusys_matricula_id?: string | number | null;
}

const STATUS_RENOVACAO_PENDENTE = new Set([
  'pendente_validacao',
  'antecipada_pendente',
]);

function idNumerico(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deveConverterFinalizadaEmNaoRenovacao(
  statusEmusys: unknown,
  emusysMatriculaId: unknown,
  renovacao: RenovacaoPendenteCanonica | null | undefined,
): boolean {
  if (String(statusEmusys ?? '').trim().toLowerCase() !== 'finalizada') return false;
  if (!renovacao || renovacao.tipo !== 'renovacao') return false;
  if (!STATUS_RENOVACAO_PENDENTE.has(String(renovacao.renovacao_status ?? ''))) return false;

  const matriculaAtual = idNumerico(emusysMatriculaId);
  const matriculaPendente = idNumerico(renovacao.emusys_matricula_id);
  return matriculaAtual != null && matriculaAtual === matriculaPendente;
}
