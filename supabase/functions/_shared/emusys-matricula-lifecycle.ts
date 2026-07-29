export type EmusysMatriculaRawStatus =
  | 'ativa'
  | 'trancada'
  | 'inativa'
  | 'finalizada'
  | 'desconhecido';

export type EmusysMatriculaRawReason = 'interrompida' | 'concluida' | null;

export interface EmusysMatriculaLock {
  id: number | null;
  motivo: string | null;
  dataInicial: string | null;
  dataFinal: string | null;
}

export interface EmusysMatriculaLifecycleInput {
  status?: unknown;
  motivo_inativa?: unknown;
  trancamento_ativo?: {
    id?: unknown;
    motivo?: unknown;
    data_inicial?: unknown;
    data_final?: unknown;
  } | null;
}

export interface EmusysMatriculaLifecycleResolution {
  rawStatus: EmusysMatriculaRawStatus;
  rawReason: EmusysMatriculaRawReason;
  localStatus: 'ativo' | 'trancado' | 'evadido' | 'inativo' | null;
  journeyStatus: 'ativa' | 'trancada' | 'finalizada' | 'desconhecido';
  movementKind: 'evasao' | 'nao_renovacao' | 'trancamento' | null;
  automaticTransition: boolean;
  auditReason: string | null;
  lock?: EmusysMatriculaLock;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rawStatus(value: unknown): EmusysMatriculaRawStatus {
  const normalized = normalizeText(value);
  if (normalized === 'ativa') return 'ativa';
  if (normalized === 'trancada') return 'trancada';
  if (normalized === 'inativa') return 'inativa';
  if (normalized === 'finalizada') return 'finalizada';
  return 'desconhecido';
}

function rawReason(value: unknown): EmusysMatriculaRawReason {
  const normalized = normalizeText(value);
  if (normalized === 'interrompida') return 'interrompida';
  if (normalized === 'concluida') return 'concluida';
  return null;
}

function lockFrom(input: EmusysMatriculaLifecycleInput): EmusysMatriculaLock {
  return {
    id: numberOrNull(input.trancamento_ativo?.id),
    motivo: textOrNull(input.trancamento_ativo?.motivo),
    dataInicial: textOrNull(input.trancamento_ativo?.data_inicial),
    dataFinal: textOrNull(input.trancamento_ativo?.data_final),
  };
}

export function resolveEmusysMatriculaLifecycle(
  input: EmusysMatriculaLifecycleInput,
): EmusysMatriculaLifecycleResolution {
  const status = rawStatus(input.status);
  const reason = rawReason(input.motivo_inativa);

  if (status === 'ativa') {
    return {
      rawStatus: status,
      rawReason: null,
      localStatus: 'ativo',
      journeyStatus: 'ativa',
      movementKind: null,
      automaticTransition: true,
      auditReason: null,
    };
  }

  if (status === 'trancada') {
    return {
      rawStatus: status,
      rawReason: null,
      localStatus: 'trancado',
      journeyStatus: 'trancada',
      movementKind: 'trancamento',
      automaticTransition: true,
      auditReason: null,
      lock: lockFrom(input),
    };
  }

  if (status === 'inativa' && reason === 'interrompida') {
    return {
      rawStatus: status,
      rawReason: reason,
      localStatus: 'evadido',
      journeyStatus: 'finalizada',
      movementKind: 'evasao',
      automaticTransition: true,
      auditReason: null,
    };
  }

  if (status === 'inativa' && reason === 'concluida') {
    return {
      rawStatus: status,
      rawReason: reason,
      localStatus: 'inativo',
      journeyStatus: 'finalizada',
      movementKind: 'nao_renovacao',
      automaticTransition: true,
      auditReason: null,
    };
  }

  if (status === 'inativa') {
    return {
      rawStatus: status,
      rawReason: null,
      localStatus: null,
      journeyStatus: 'desconhecido',
      movementKind: null,
      automaticTransition: false,
      auditReason: 'inativa_sem_motivo',
    };
  }

  if (status === 'finalizada') {
    return {
      rawStatus: status,
      rawReason: reason,
      localStatus: null,
      journeyStatus: 'desconhecido',
      movementKind: null,
      automaticTransition: false,
      auditReason: 'finalizada_legada_ambigua',
    };
  }

  return {
    rawStatus: 'desconhecido',
    rawReason: null,
    localStatus: null,
    journeyStatus: 'desconhecido',
    movementKind: null,
    automaticTransition: false,
    auditReason: 'status_emusys_desconhecido',
  };
}

export function buildEmusysMatriculaIdentity(
  unidadeId: unknown,
  emusysMatriculaId: unknown,
): string | null {
  const unidade = textOrNull(unidadeId);
  const matricula = numberOrNull(emusysMatriculaId);
  return unidade && matricula != null ? `${unidade}:${matricula}` : null;
}
