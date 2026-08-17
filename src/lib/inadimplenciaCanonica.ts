export type InadimplenciaCanonicaStatus =
  | 'loading'
  | 'ok'
  | 'partial'
  | 'stale'
  | 'incomplete'
  | 'error';

export type InadimplenciaCollectionScope =
  | 'confirmed_only'
  | 'confirmed_active_d2_3_competencias'
  | 'blocked';
export type InadimplenciaDelinquencyRule = 'd_plus_0' | 'd_plus_2';
export type InadimplenciaContactResolutionStatus = 'resolved' | 'missing' | 'ambiguous';

export const COBRANCA_AMIGAVEL_CARENCIA_DIAS = 2;

export type InadimplenciaBlockReason =
  | 'stale_competencia'
  | 'duplicate_confirmed_fatura'
  | 'invalid_invoice_identity';

export interface InadimplenciaCanonicaItem {
  canonical_fatura_id: string;
  unidade_id: string;
  unidade_codigo: string | null;
  competencia: string | null;
  emusys_fatura_id: string;
  emusys_matricula_id: string;
  emusys_contrato_id: string | null;
  aluno_id_canonico: number | null;
  contact_resolution_status: InadimplenciaContactResolutionStatus;
  descricao: string | null;
  status: string | null;
  data_vencimento: string;
  dias_atraso: number;
  valor_original: number;
  valor_atualizado: number;
  sync_completed_at: string | null;
}

export interface InadimplenciaCanonicaState {
  status: InadimplenciaCanonicaStatus;
  schemaVersion: number;
  delinquencyRule: InadimplenciaDelinquencyRule;
  collectionGraceDays: number;
  consumerMustApplyCollectionGrace: boolean;
  totalFaturas: number;
  totalMatriculas: number;
  totalOriginal: number;
  totalAtualizado: number;
  maiorAtraso: number;
  avaliadoEm: string | null;
  ultimoSyncMaisAntigo: string | null;
  freshUntil: string | null;
  competenciasStale: number;
  sourceMissingCount: number;
  sourceMissingOpenCount: number;
  sourceMissingOtherCount: number;
  duplicateFaturaCount: number;
  invalidIdentityInvoiceCount: number;
  validationIssueCount: number;
  contactResolutionPendingCount: number;
  collectionAllowed: boolean;
  collectionScope: InadimplenciaCollectionScope;
  blockReasons: InadimplenciaBlockReason[];
  items: InadimplenciaCanonicaItem[];
  erro: string | null;
}

export interface InadimplenciaPorMatricula {
  faturas: number;
  valorAtualizado: number;
  maiorAtraso: number;
  ultimoSync: string | null;
}

export interface AlunoInadimplenciaCanonicaSource {
  id: number;
  nome: string;
  unidade_id: string;
  whatsapp?: string | null;
  telefone?: string | null;
  professor?: { id?: number | null; nome?: string | null } | null;
  curso?: { nome?: string | null } | null;
}

export interface AlertaInadimplenciaCanonica {
  aluno_id: number;
  aluno_nome: string;
  whatsapp: string | null;
  unidade_id: string;
  emusys_matricula_id: string;
  emusys_matricula_ids: string[];
  valor_atualizado: number;
  total_faturas: number;
  professor_id: number | null;
  professor_nome: string | null;
  instrumento: string | null;
  dias_atraso: number;
  ultimo_sync: string | null;
}

export interface AlertasInadimplenciaCanonicaResult {
  alertas: AlertaInadimplenciaCanonica[];
  totalAtivos: number;
  semCadastroAtivo: number;
}

export interface MontarAlertasInadimplenciaCanonicaOptions {
  agora?: Date;
}

export const INADIMPLENCIA_CANONICA_LOADING: InadimplenciaCanonicaState = {
  status: 'loading',
  schemaVersion: 0,
  delinquencyRule: 'd_plus_0',
  collectionGraceDays: COBRANCA_AMIGAVEL_CARENCIA_DIAS,
  consumerMustApplyCollectionGrace: true,
  totalFaturas: 0,
  totalMatriculas: 0,
  totalOriginal: 0,
  totalAtualizado: 0,
  maiorAtraso: 0,
  avaliadoEm: null,
  ultimoSyncMaisAntigo: null,
  freshUntil: null,
  competenciasStale: 0,
  sourceMissingCount: 0,
  sourceMissingOpenCount: 0,
  sourceMissingOtherCount: 0,
  duplicateFaturaCount: 0,
  invalidIdentityInvoiceCount: 0,
  validationIssueCount: 0,
  contactResolutionPendingCount: 0,
  collectionAllowed: false,
  collectionScope: 'blocked',
  blockReasons: [],
  items: [],
  erro: null,
};

interface Totals {
  totalFaturas: number;
  totalMatriculas: number;
  totalOriginal: number;
  totalAtualizado: number;
  maiorAtraso: number;
}

interface Reconciliation {
  sourceMissingCount: number;
  sourceMissingOpenCount: number;
  sourceMissingOtherCount: number;
  duplicateFaturaCount: number;
  invalidIdentityInvoiceCount: number;
  validationIssueCount: number;
  contactResolutionPendingCount: number;
}

interface Freshness {
  competenciasStale: number;
  ultimoSyncMaisAntigo: string | null;
  freshUntil: string | null;
}

const INVALID_RESPONSE = 'Resposta invalida da leitura canonica de inadimplencia.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ABSOLUTE_ISO = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const BLOCK_REASON_ORDER: InadimplenciaBlockReason[] = [
  'stale_competencia',
  'duplicate_confirmed_fatura',
  'invalid_invoice_identity',
];
const ACTIVE_D2_COLLECTION_SCOPE = 'confirmed_active_d2_3_competencias';
const ACTIVE_D2_STUDENT_SCOPE = 'exact_invoice_enrollment + aluno_ativo_atual; trancado, evadido e arquivado fora da carteira D+2';

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const hasOwn = (value: Record<string, unknown>, key: string) => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const nonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value : null
);

const nullableText = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const nonNegativeNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const nonNegativeInteger = (value: unknown): value is number => (
  nonNegativeNumber(value) && Number.isInteger(value)
);

const positiveSafeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
);

const parseAbsoluteTimestamp = (value: unknown): string | null => (
  typeof value === 'string'
  && ABSOLUTE_ISO.test(value)
  && validDate(value.slice(0, 10))
  && Number.isFinite(Date.parse(value))
    ? value
    : null
);

const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

function centsOf(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const fixed = value.toFixed(2);
  if (Number(fixed) !== value) return null;
  const [whole, fractional] = fixed.split('.');
  const result = Number(`${whole}${fractional}`);
  return Number.isSafeInteger(result) ? result : null;
}

const validMoney = (value: unknown): value is number => (
  nonNegativeNumber(value) && centsOf(value) !== null
);

const safeAddCents = (left: number, right: number): number | null => {
  const total = left + right;
  return Number.isSafeInteger(total) ? total : null;
};

const errorState = (erro = INVALID_RESPONSE): InadimplenciaCanonicaState => ({
  ...INADIMPLENCIA_CANONICA_LOADING,
  status: 'error',
  erro,
});

function parseItem(
  value: unknown,
  requireContactResolution = true,
): InadimplenciaCanonicaItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const canonicalFaturaId = nonEmptyString(row.canonical_fatura_id);
  const unidadeId = nonEmptyString(row.unidade_id);
  const unidadeCodigo = nullableText(row.unidade_codigo);
  const competencia = row.competencia == null
    ? null
    : validDate(row.competencia) ? row.competencia : null;
  const faturaId = nonEmptyString(row.emusys_fatura_id);
  const matriculaId = nonEmptyString(row.emusys_matricula_id);
  const contratoId = nullableText(row.emusys_contrato_id);
  const descricao = nullableText(row.descricao);
  const statusFatura = nullableText(row.status);
  const sync = row.sync_completed_at === null ? null : parseAbsoluteTimestamp(row.sync_completed_at);
  const contactStatus = requireContactResolution
    ? row.contact_resolution_status
    : 'missing';
  const alunoIdCanonico = requireContactResolution
    ? row.aluno_id_canonico
    : null;

  if (
    !canonicalFaturaId || !UUID.test(canonicalFaturaId)
    || !unidadeId || !UUID.test(unidadeId)
    || !faturaId
    || !matriculaId
    || (row.competencia != null && !competencia)
    || (row.emusys_contrato_id != null && !contratoId)
    || (row.descricao != null && !descricao)
    || (row.status != null && !statusFatura)
    || !validDate(row.data_vencimento)
    || !nonNegativeInteger(row.dias_atraso)
    || !validMoney(row.valor_original)
    || !validMoney(row.valor_atualizado)
    || (row.sync_completed_at !== null && !sync)
    || (contactStatus !== 'resolved' && contactStatus !== 'missing' && contactStatus !== 'ambiguous')
    || (contactStatus === 'resolved' && !positiveSafeInteger(alunoIdCanonico))
    || (contactStatus !== 'resolved' && alunoIdCanonico !== null)
  ) return null;

  return {
    canonical_fatura_id: canonicalFaturaId,
    unidade_id: unidadeId,
    unidade_codigo: unidadeCodigo,
    competencia,
    emusys_fatura_id: faturaId,
    emusys_matricula_id: matriculaId,
    emusys_contrato_id: contratoId,
    aluno_id_canonico: contactStatus === 'resolved' ? alunoIdCanonico as number : null,
    contact_resolution_status: contactStatus,
    descricao,
    status: statusFatura,
    data_vencimento: row.data_vencimento,
    dias_atraso: row.dias_atraso,
    valor_original: row.valor_original,
    valor_atualizado: row.valor_atualizado,
    sync_completed_at: sync,
  };
}

function parseItems(
  value: unknown,
  requireContactResolution = true,
): InadimplenciaCanonicaItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map((item) => parseItem(item, requireContactResolution));
  return items.every((item): item is InadimplenciaCanonicaItem => item != null) ? items : null;
}

function parseTotals(value: unknown): Totals | null {
  const totals = asRecord(value);
  if (
    !totals
    || !nonNegativeInteger(totals.total_faturas)
    || !nonNegativeInteger(totals.total_matriculas)
    || !validMoney(totals.total_original)
    || !validMoney(totals.total_atualizado)
    || !nonNegativeInteger(totals.maior_atraso)
  ) return null;

  return {
    totalFaturas: totals.total_faturas,
    totalMatriculas: totals.total_matriculas,
    totalOriginal: totals.total_original,
    totalAtualizado: totals.total_atualizado,
    maiorAtraso: totals.maior_atraso,
  };
}

function parseReconciliation(value: unknown): Reconciliation | null {
  const reconciliation = asRecord(value);
  if (
    !reconciliation
    || !nonNegativeInteger(reconciliation.source_missing_count)
    || !nonNegativeInteger(reconciliation.source_missing_open_count)
    || !nonNegativeInteger(reconciliation.source_missing_other_count)
    || !nonNegativeInteger(reconciliation.duplicate_fatura_count)
    || !nonNegativeInteger(reconciliation.invalid_identity_invoice_count)
    || !nonNegativeInteger(reconciliation.validation_issue_count)
    || !nonNegativeInteger(reconciliation.contact_resolution_pending_count)
  ) return null;

  const result = {
    sourceMissingCount: reconciliation.source_missing_count,
    sourceMissingOpenCount: reconciliation.source_missing_open_count,
    sourceMissingOtherCount: reconciliation.source_missing_other_count,
    duplicateFaturaCount: reconciliation.duplicate_fatura_count,
    invalidIdentityInvoiceCount: reconciliation.invalid_identity_invoice_count,
    validationIssueCount: reconciliation.validation_issue_count,
    contactResolutionPendingCount: reconciliation.contact_resolution_pending_count,
  };
  return result.sourceMissingOpenCount + result.sourceMissingOtherCount === result.sourceMissingCount
    && (result.validationIssueCount === 0 || result.invalidIdentityInvoiceCount > 0)
    ? result
    : null;
}

function parseV2Reconciliation(value: unknown): Reconciliation | null {
  if (value === undefined) {
    return {
      sourceMissingCount: 0,
      sourceMissingOpenCount: 0,
      sourceMissingOtherCount: 0,
      duplicateFaturaCount: 0,
      invalidIdentityInvoiceCount: 0,
      validationIssueCount: 0,
      contactResolutionPendingCount: 0,
    };
  }
  const reconciliation = asRecord(value);
  if (
    !reconciliation
    || !nonNegativeInteger(reconciliation.source_missing_count)
    || !nonNegativeInteger(reconciliation.duplicate_fatura_count)
    || !nonNegativeInteger(reconciliation.invalid_identity_invoice_count)
    || !nonNegativeInteger(reconciliation.validation_issue_count)
  ) return null;

  if (hasOwn(reconciliation, 'source_missing_open_count') || hasOwn(reconciliation, 'source_missing_other_count')) {
    return parseReconciliation({
      ...reconciliation,
      contact_resolution_pending_count: reconciliation.contact_resolution_pending_count ?? 0,
    });
  }
  if (
    reconciliation.validation_issue_count > 0
    && reconciliation.invalid_identity_invoice_count === 0
  ) return null;
  return {
    sourceMissingCount: reconciliation.source_missing_count,
    sourceMissingOpenCount: 0,
    sourceMissingOtherCount: reconciliation.source_missing_count,
    duplicateFaturaCount: reconciliation.duplicate_fatura_count,
    invalidIdentityInvoiceCount: reconciliation.invalid_identity_invoice_count,
    validationIssueCount: reconciliation.validation_issue_count,
    contactResolutionPendingCount: 0,
  };
}

function parseFreshness(value: unknown): Freshness | null {
  const freshness = asRecord(value);
  if (!freshness || !hasOwn(freshness, 'fresh_until') || !nonNegativeInteger(freshness.competencias_stale)) {
    return null;
  }

  const oldest = freshness.ultimo_sync_mais_antigo == null
    ? null
    : parseAbsoluteTimestamp(freshness.ultimo_sync_mais_antigo);
  const freshUntil = freshness.fresh_until === null
    ? null
    : parseAbsoluteTimestamp(freshness.fresh_until);
  if (
    (freshness.ultimo_sync_mais_antigo != null && !oldest)
    || (freshness.fresh_until !== null && !freshUntil)
  ) return null;

  return {
    competenciasStale: freshness.competencias_stale,
    ultimoSyncMaisAntigo: oldest,
    freshUntil,
  };
}

function parseV2Freshness(value: unknown): Freshness | null {
  if (value === undefined) {
    return { competenciasStale: 0, ultimoSyncMaisAntigo: null, freshUntil: null };
  }
  const freshness = asRecord(value);
  if (!freshness) return null;
  const competenciasStale = freshness.competencias_stale === undefined
    ? 0
    : freshness.competencias_stale;
  if (!nonNegativeInteger(competenciasStale)) return null;
  const oldest = freshness.ultimo_sync_mais_antigo == null
    ? null
    : parseAbsoluteTimestamp(freshness.ultimo_sync_mais_antigo);
  const freshUntil = freshness.fresh_until == null
    ? null
    : parseAbsoluteTimestamp(freshness.fresh_until);
  if (
    (freshness.ultimo_sync_mais_antigo != null && !oldest)
    || (freshness.fresh_until != null && !freshUntil)
  ) return null;
  return { competenciasStale, ultimoSyncMaisAntigo: oldest, freshUntil };
}

function totalsMatchItems(totals: Totals, items: InadimplenciaCanonicaItem[]): boolean {
  const matriculas = new Set(items.map((item) => `${item.unidade_id}|${item.emusys_matricula_id}`));
  let totalOriginal = 0;
  let totalAtualizado = 0;
  for (const item of items) {
    const original = centsOf(item.valor_original);
    const atualizado = centsOf(item.valor_atualizado);
    if (original === null || atualizado === null) return false;
    const nextOriginal = safeAddCents(totalOriginal, original);
    const nextAtualizado = safeAddCents(totalAtualizado, atualizado);
    if (nextOriginal === null || nextAtualizado === null) return false;
    totalOriginal = nextOriginal;
    totalAtualizado = nextAtualizado;
  }
  const expectedOriginal = centsOf(totals.totalOriginal);
  const expectedAtualizado = centsOf(totals.totalAtualizado);
  const maiorAtraso = items.reduce((max, item) => Math.max(max, item.dias_atraso), 0);
  return totals.totalFaturas === items.length
    && totals.totalMatriculas === matriculas.size
    && expectedOriginal !== null
    && expectedAtualizado !== null
    && expectedOriginal === totalOriginal
    && expectedAtualizado === totalAtualizado
    && totals.maiorAtraso === maiorAtraso;
}

const totalsAreZero = (totals: Totals) => (
  totals.totalFaturas === 0
  && totals.totalMatriculas === 0
  && totals.totalOriginal === 0
  && totals.totalAtualizado === 0
  && totals.maiorAtraso === 0
);

function expectedReasons(
  freshness: Freshness,
  reconciliation: Reconciliation,
): InadimplenciaBlockReason[] {
  return BLOCK_REASON_ORDER.filter((reason) => (
    (reason === 'stale_competencia' && freshness.competenciasStale > 0)
    || (reason === 'duplicate_confirmed_fatura' && reconciliation.duplicateFaturaCount > 0)
  ));
}

const equalReasons = (left: unknown[], right: InadimplenciaBlockReason[]) => (
  left.length === right.length && left.every((reason, index) => reason === right[index])
);

function stateFrom(
  schemaVersion: number,
  status: InadimplenciaCanonicaStatus,
  totals: Totals,
  freshness: Freshness,
  reconciliation: Reconciliation,
  collectionAllowed: boolean,
  collectionScope: InadimplenciaCollectionScope,
  blockReasons: InadimplenciaBlockReason[],
  items: InadimplenciaCanonicaItem[],
  avaliadoEm: string | null,
  erro: string | null = null,
  contract: {
    delinquencyRule: InadimplenciaDelinquencyRule;
    consumerMustApplyCollectionGrace: boolean;
  } = {
    delinquencyRule: 'd_plus_0',
    consumerMustApplyCollectionGrace: true,
  },
): InadimplenciaCanonicaState {
  return {
    status,
    schemaVersion,
    delinquencyRule: contract.delinquencyRule,
    collectionGraceDays: COBRANCA_AMIGAVEL_CARENCIA_DIAS,
    consumerMustApplyCollectionGrace: contract.consumerMustApplyCollectionGrace,
    totalFaturas: totals.totalFaturas,
    totalMatriculas: totals.totalMatriculas,
    totalOriginal: totals.totalOriginal,
    totalAtualizado: totals.totalAtualizado,
    maiorAtraso: totals.maiorAtraso,
    avaliadoEm,
    ultimoSyncMaisAntigo: freshness.ultimoSyncMaisAntigo,
    freshUntil: freshness.freshUntil,
    competenciasStale: freshness.competenciasStale,
    sourceMissingCount: reconciliation.sourceMissingCount,
    sourceMissingOpenCount: reconciliation.sourceMissingOpenCount,
    sourceMissingOtherCount: reconciliation.sourceMissingOtherCount,
    duplicateFaturaCount: reconciliation.duplicateFaturaCount,
    invalidIdentityInvoiceCount: reconciliation.invalidIdentityInvoiceCount,
    validationIssueCount: reconciliation.validationIssueCount,
    contactResolutionPendingCount: reconciliation.contactResolutionPendingCount,
    collectionAllowed,
    collectionScope,
    blockReasons,
    items,
    erro,
  };
}

function normalizeV3(root: Record<string, unknown>): InadimplenciaCanonicaState {
  const status = root.status;
  const policy = asRecord(root.policy);
  const operational = asRecord(root.operational);
  const items = parseItems(root.items);
  const totals = parseTotals(root.totals);
  const freshness = parseFreshness(root.freshness);
  const reconciliation = parseReconciliation(root.reconciliation);
  if (
    typeof status !== 'string'
    || !['ok', 'partial', 'stale', 'incomplete', 'error'].includes(status)
    || !policy
    || policy.delinquency_rule !== 'd_plus_0'
    || policy.collection_grace_days !== COBRANCA_AMIGAVEL_CARENCIA_DIAS
    || !operational
    || typeof operational.collection_allowed !== 'boolean'
    || operational.consumer_must_apply_collection_grace !== true
    || (operational.collection_scope !== 'confirmed_only' && operational.collection_scope !== 'blocked')
    || !Array.isArray(operational.block_reasons)
    || !operational.block_reasons.every((reason) => BLOCK_REASON_ORDER.includes(reason as InadimplenciaBlockReason))
    || new Set(operational.block_reasons).size !== operational.block_reasons.length
    || !items
    || !totals
    || !freshness
    || !reconciliation
  ) return errorState();

  const hasError = hasOwn(root, 'error');
  const scalarError = typeof root.error === 'string' ? root.error.trim() : null;
  const knownSqlError = scalarError === 'unsupported_invoice_status';
  if (
    (status === 'error' && !knownSqlError)
    || (status === 'stale' && hasError && root.error !== null && !knownSqlError)
    || (status !== 'error' && status !== 'stale' && hasError && root.error !== null)
  ) return errorState();

  const derivedStatus: InadimplenciaCanonicaStatus = freshness.competenciasStale > 0
    ? 'stale'
    : scalarError ? 'error'
    : reconciliation.duplicateFaturaCount > 0
    ? 'incomplete'
    : reconciliation.sourceMissingCount > 0
      || reconciliation.invalidIdentityInvoiceCount > 0
      || reconciliation.validationIssueCount > 0
      || reconciliation.contactResolutionPendingCount > 0
    ? 'partial'
    : 'ok';
  const reasons = expectedReasons(freshness, reconciliation);
  const collectionAllowed = status === 'ok' || status === 'partial';
  const zeroDebtOk = status === 'ok' && items.length === 0 && totalsAreZero(totals)
  const unresolvedContactItems = items.filter(
    (item) => item.contact_resolution_status !== 'resolved',
  ).length;

  if (
    status !== derivedStatus
    || !equalReasons(operational.block_reasons, reasons)
    || (freshness.freshUntil === null && !zeroDebtOk)
    || (collectionAllowed && (
      operational.collection_allowed !== true
      || operational.collection_scope !== 'confirmed_only'
      || reasons.length !== 0
      || !totalsMatchItems(totals, items)
      || reconciliation.contactResolutionPendingCount !== unresolvedContactItems
    ))
    || (!collectionAllowed && (
      operational.collection_allowed !== false
      || operational.collection_scope !== 'blocked'
      || items.length !== 0
      || !totalsAreZero(totals)
    ))
  ) return errorState();

  if (status === 'error') return errorState(scalarError);
  return stateFrom(
    3,
    status,
    totals,
    freshness,
    reconciliation,
    collectionAllowed,
    collectionAllowed ? 'confirmed_only' : 'blocked',
    collectionAllowed ? [] : reasons,
    collectionAllowed ? items : [],
    nullableText(root.avaliado_em),
    status === 'stale' && knownSqlError ? scalarError : null,
  );
}

function normalizeV4(root: Record<string, unknown>): InadimplenciaCanonicaState {
  const status = root.status;
  const policy = asRecord(root.policy);
  const operational = asRecord(root.operational);
  const items = parseItems(root.items);
  const totals = parseTotals(root.totals);
  const freshness = parseFreshness(root.freshness);
  const reconciliation = parseReconciliation(root.reconciliation);
  if (
    typeof status !== 'string'
    || !['ok', 'partial', 'stale', 'incomplete', 'error'].includes(status)
    || !policy
    || policy.delinquency_rule !== 'd_plus_2'
    || policy.collection_grace_days !== COBRANCA_AMIGAVEL_CARENCIA_DIAS
    || policy.student_scope !== ACTIVE_D2_STUDENT_SCOPE
    || !operational
    || typeof operational.collection_allowed !== 'boolean'
    || operational.consumer_must_apply_collection_grace !== false
    || (operational.collection_scope !== ACTIVE_D2_COLLECTION_SCOPE && operational.collection_scope !== 'blocked')
    || !Array.isArray(operational.block_reasons)
    || !operational.block_reasons.every((reason) => BLOCK_REASON_ORDER.includes(reason as InadimplenciaBlockReason))
    || new Set(operational.block_reasons).size !== operational.block_reasons.length
    || !items
    || !totals
    || !freshness
    || !reconciliation
  ) return errorState();

  const hasError = hasOwn(root, 'error');
  const scalarError = typeof root.error === 'string' ? root.error.trim() : null;
  const knownSqlError = scalarError === 'unsupported_invoice_status';
  if (
    (status === 'error' && !knownSqlError)
    || (status === 'stale' && hasError && root.error !== null && !knownSqlError)
    || (status !== 'error' && status !== 'stale' && hasError && root.error !== null)
  ) return errorState();

  const derivedStatus: InadimplenciaCanonicaStatus = freshness.competenciasStale > 0
    ? 'stale'
    : scalarError ? 'error'
    : reconciliation.duplicateFaturaCount > 0
    ? 'incomplete'
    : reconciliation.sourceMissingCount > 0
      || reconciliation.invalidIdentityInvoiceCount > 0
      || reconciliation.validationIssueCount > 0
      || reconciliation.contactResolutionPendingCount > 0
    ? 'partial'
    : 'ok';
  const reasons = expectedReasons(freshness, reconciliation);
  const collectionAllowed = status === 'ok' || status === 'partial';
  const zeroDebtOk = status === 'ok' && items.length === 0 && totalsAreZero(totals);
  const onlyD2ActiveInvoiceShape = items.every((item) => (
    item.status === 'aberta' && item.dias_atraso >= COBRANCA_AMIGAVEL_CARENCIA_DIAS
  ));

  if (
    status !== derivedStatus
    || !equalReasons(operational.block_reasons, reasons)
    || (freshness.freshUntil === null && !zeroDebtOk)
    || !onlyD2ActiveInvoiceShape
    || (collectionAllowed && (
      operational.collection_allowed !== true
      || operational.collection_scope !== ACTIVE_D2_COLLECTION_SCOPE
      || reasons.length !== 0
      || !totalsMatchItems(totals, items)
    ))
    || (!collectionAllowed && (
      operational.collection_allowed !== false
      || operational.collection_scope !== 'blocked'
      || items.length !== 0
      || !totalsAreZero(totals)
    ))
  ) return errorState();

  if (status === 'error') return errorState(scalarError);
  return stateFrom(
    4,
    status,
    totals,
    freshness,
    reconciliation,
    collectionAllowed,
    collectionAllowed ? ACTIVE_D2_COLLECTION_SCOPE : 'blocked',
    collectionAllowed ? [] : reasons,
    collectionAllowed ? items : [],
    nullableText(root.avaliado_em),
    status === 'stale' && knownSqlError ? scalarError : null,
    {
      delinquencyRule: 'd_plus_2',
      consumerMustApplyCollectionGrace: false,
    },
  );
}

function normalizeV2(root: Record<string, unknown>): InadimplenciaCanonicaState {
  const status = root.status;
  const totals = parseTotals(root.totals);
  const reconciliation = parseV2Reconciliation(root.reconciliation);
  const freshness = parseV2Freshness(root.freshness);
  if (
    (status !== 'ok' && status !== 'stale' && status !== 'incomplete' && status !== 'error')
    || !totals
    || !reconciliation
    || !freshness
    || !Array.isArray(root.items)
  ) return errorState();

  if (status === 'ok') {
    const items = parseItems(root.items, false);
    const zeroDebt = items?.length === 0 && totalsAreZero(totals);
    const reconciliationClear = reconciliation.sourceMissingCount === 0
      && reconciliation.duplicateFaturaCount === 0
      && reconciliation.invalidIdentityInvoiceCount === 0
      && reconciliation.validationIssueCount === 0
      && reconciliation.contactResolutionPendingCount === 0;
    if (
      !items
      || !totalsMatchItems(totals, items)
      || freshness.competenciasStale > 0
      || !reconciliationClear
      || (freshness.freshUntil === null && !zeroDebt)
    ) return errorState();
    const reconciliationWithContactQuarantine: Reconciliation = {
      ...reconciliation,
      contactResolutionPendingCount: items.length,
    };
    return stateFrom(
      2,
      items.length > 0 ? 'partial' : 'ok',
      totals,
      freshness,
      reconciliationWithContactQuarantine,
      true,
      'confirmed_only',
      [],
      items,
      nullableText(root.avaliado_em),
    );
  }

  if (root.items.length !== 0 || !totalsAreZero(totals)) return errorState();
  if (status === 'error') {
    const scalarError = typeof root.error === 'string' ? root.error.trim() : null;
    return scalarError ? errorState(scalarError) : errorState();
  }
  return stateFrom(
    2,
    status,
    totals,
    freshness,
    reconciliation,
    false,
    'blocked',
    [],
    [],
    nullableText(root.avaliado_em),
  );
}

export function normalizarInadimplenciaCanonica(
  payload: unknown,
  error?: { message?: string } | null,
): InadimplenciaCanonicaState {
  if (error) return errorState(error.message || 'Falha ao carregar a inadimplencia canonica.');

  let parsedPayload = payload;
  if (typeof payload === 'string') {
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      parsedPayload = null;
    }
  }

  const root = asRecord(parsedPayload);
  if (!root) return errorState();
  if (root.schema_version === 4) return normalizeV4(root);
  if (root.schema_version === 3) return normalizeV3(root);
  if (root.schema_version === 2) return normalizeV2(root);
  return errorState();
}

export function podeCobrarInadimplenciaCanonica(
  state: InadimplenciaCanonicaState,
  agora = new Date(),
): boolean {
  if (!state.collectionAllowed) return false;
  if (!state.freshUntil) return true;
  const limite = Date.parse(state.freshUntil);
  return Number.isFinite(limite) && agora.getTime() < limite;
}

export const chaveInadimplenciaMatricula = (
  unidadeId: string,
  emusysMatriculaId: string | number,
) => `${unidadeId}|${String(emusysMatriculaId).trim()}`;

export function indexarInadimplenciaPorMatricula(
  state: InadimplenciaCanonicaState,
  agora = new Date(),
) {
  const index = new Map<string, InadimplenciaPorMatricula>();
  if (!podeCobrarInadimplenciaCanonica(state, agora)) return index;

  for (const item of state.items) {
    const key = chaveInadimplenciaMatricula(item.unidade_id, item.emusys_matricula_id);
    const current = index.get(key) ?? {
      faturas: 0,
      valorAtualizado: 0,
      maiorAtraso: 0,
      ultimoSync: null,
    };
    current.faturas += 1;
    current.valorAtualizado = Number((current.valorAtualizado + item.valor_atualizado).toFixed(2));
    current.maiorAtraso = Math.max(current.maiorAtraso, item.dias_atraso);
    const currentEpoch = current.ultimoSync ? Date.parse(current.ultimoSync) : Number.NaN;
    const itemEpoch = item.sync_completed_at ? Date.parse(item.sync_completed_at) : Number.NaN;
    if (Number.isFinite(itemEpoch) && (!Number.isFinite(currentEpoch) || itemEpoch > currentEpoch)) {
      current.ultimoSync = item.sync_completed_at;
    }
    index.set(key, current);
  }
  return index;
}

/** Converte a leitura financeira confirmada em alertas operacionais sem misturar vinculos. */
export function montarAlertasInadimplenciaCanonica(
  state: InadimplenciaCanonicaState,
  alunos: AlunoInadimplenciaCanonicaSource[],
  options: Date | MontarAlertasInadimplenciaCanonicaOptions = {},
): AlertasInadimplenciaCanonicaResult {
  const agora = options instanceof Date ? options : options.agora ?? new Date();
  if (!nonNegativeInteger(state.collectionGraceDays)) {
    return { alertas: [], totalAtivos: 0, semCadastroAtivo: 0 };
  }
  if (!podeCobrarInadimplenciaCanonica(state, agora)) {
    return { alertas: [], totalAtivos: 0, semCadastroAtivo: 0 };
  }

  const itensElegiveis = state.items.filter(
    (item) => item.dias_atraso >= state.collectionGraceDays,
  );
  const alunosPorId = new Map<number, AlunoInadimplenciaCanonicaSource[]>();

  for (const aluno of alunos) {
    if (!positiveSafeInteger(aluno.id)) continue;
    const candidatos = alunosPorId.get(aluno.id) ?? [];
    candidatos.push(aluno);
    alunosPorId.set(aluno.id, candidatos);
  }

  const resolucoesPorMatricula = new Map<string, {
    unidadeId: string;
    matriculaId: string;
    statuses: Set<InadimplenciaContactResolutionStatus>;
    alunoIds: Set<number>;
  }>();
  for (const item of itensElegiveis) {
    const key = chaveInadimplenciaMatricula(item.unidade_id, item.emusys_matricula_id);
    const resolucao = resolucoesPorMatricula.get(key) ?? {
      unidadeId: item.unidade_id,
      matriculaId: item.emusys_matricula_id,
      statuses: new Set<InadimplenciaContactResolutionStatus>(),
      alunoIds: new Set<number>(),
    };
    resolucao.statuses.add(item.contact_resolution_status);
    if (item.aluno_id_canonico !== null) resolucao.alunoIds.add(item.aluno_id_canonico);
    resolucoesPorMatricula.set(key, resolucao);
  }

  const alunoIdResolvidoPorMatricula = new Map<string, number>();
  let semCadastroAtivo = 0;
  for (const [key, resolucao] of resolucoesPorMatricula) {
    const somenteResolvidos = resolucao.statuses.size === 1
      && resolucao.statuses.has('resolved');
    if (!somenteResolvidos) continue;
    if (resolucao.alunoIds.size !== 1) {
      semCadastroAtivo += 1;
      continue;
    }
    alunoIdResolvidoPorMatricula.set(key, [...resolucao.alunoIds][0]);
  }

  const contatosPorAluno = new Map<string, {
    unidadeId: string;
    alunoId: number;
    matriculas: Set<string>;
    faturas: number;
    valorAtualizado: number;
    maiorAtraso: number;
    ultimoSync: string | null;
  }>();
  for (const item of itensElegiveis) {
    const matriculaKey = chaveInadimplenciaMatricula(item.unidade_id, item.emusys_matricula_id);
    const alunoId = alunoIdResolvidoPorMatricula.get(matriculaKey);
    if (alunoId === undefined) continue;
    const contatoKey = `${item.unidade_id}|${alunoId}`;
    const contato = contatosPorAluno.get(contatoKey) ?? {
      unidadeId: item.unidade_id,
      alunoId,
      matriculas: new Set<string>(),
      faturas: 0,
      valorAtualizado: 0,
      maiorAtraso: 0,
      ultimoSync: null,
    };
    contato.matriculas.add(item.emusys_matricula_id);
    contato.faturas += 1;
    contato.valorAtualizado = Number((contato.valorAtualizado + item.valor_atualizado).toFixed(2));
    contato.maiorAtraso = Math.max(contato.maiorAtraso, item.dias_atraso);
    const currentEpoch = contato.ultimoSync ? Date.parse(contato.ultimoSync) : Number.NaN;
    const itemEpoch = item.sync_completed_at ? Date.parse(item.sync_completed_at) : Number.NaN;
    if (Number.isFinite(itemEpoch) && (!Number.isFinite(currentEpoch) || itemEpoch > currentEpoch)) {
      contato.ultimoSync = item.sync_completed_at;
    }
    contatosPorAluno.set(contatoKey, contato);
  }

  const alertas: AlertaInadimplenciaCanonica[] = [];
  for (const contato of contatosPorAluno.values()) {
    const candidatos = alunosPorId.get(contato.alunoId) ?? [];
    const aluno = candidatos.length === 1 ? candidatos[0] : null;
    if (!aluno || aluno.unidade_id !== contato.unidadeId) {
      semCadastroAtivo += 1;
      continue;
    }

    const matriculas = [...contato.matriculas].sort((left, right) => (
      left.localeCompare(right, 'pt-BR', { numeric: true })
    ));

    alertas.push({
      aluno_id: aluno.id,
      aluno_nome: aluno.nome,
      whatsapp: nullableText(aluno.whatsapp) ?? nullableText(aluno.telefone),
      unidade_id: aluno.unidade_id,
      emusys_matricula_id: matriculas[0],
      emusys_matricula_ids: matriculas,
      valor_atualizado: contato.valorAtualizado,
      total_faturas: contato.faturas,
      professor_id: aluno.professor?.id ?? null,
      professor_nome: nullableText(aluno.professor?.nome),
      instrumento: nullableText(aluno.curso?.nome),
      dias_atraso: contato.maiorAtraso,
      ultimo_sync: contato.ultimoSync,
    });
  }

  alertas.sort((left, right) => (
    right.dias_atraso - left.dias_atraso
    || right.valor_atualizado - left.valor_atualizado
    || left.aluno_nome.localeCompare(right.aluno_nome, 'pt-BR')
    || left.aluno_id - right.aluno_id
  ));
  return { alertas, totalAtivos: alertas.length, semCadastroAtivo };
}
