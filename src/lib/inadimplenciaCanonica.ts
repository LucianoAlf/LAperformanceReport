export type InadimplenciaCanonicaStatus =
  | 'loading'
  | 'ok'
  | 'partial'
  | 'stale'
  | 'incomplete'
  | 'error';

export type InadimplenciaCollectionScope = 'confirmed_only' | 'blocked';

export type InadimplenciaBlockReason =
  | 'stale_competencia'
  | 'duplicate_confirmed_fatura'
  | 'invalid_invoice_identity';

export interface InadimplenciaCanonicaItem {
  canonical_fatura_id: string;
  unidade_id: string;
  emusys_fatura_id: string;
  emusys_matricula_id: string | null;
  data_vencimento: string;
  dias_atraso: number;
  valor_original: number;
  valor_atualizado: number;
  sync_completed_at: string | null;
}

export interface InadimplenciaCanonicaState {
  status: InadimplenciaCanonicaStatus;
  schemaVersion: number;
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
  emusys_matricula_id: string | number | null;
  status?: string | null;
  arquivado_em?: string | null;
  is_segundo_curso?: boolean | null;
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

export const INADIMPLENCIA_CANONICA_LOADING: InadimplenciaCanonicaState = {
  status: 'loading',
  schemaVersion: 0,
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
  collectionAllowed: false,
  collectionScope: 'blocked',
  blockReasons: [],
  items: [],
  erro: null,
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const finiteNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableString = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const invalidResponseMessage = 'Resposta invalida da leitura canonica de inadimplencia.';

const errorState = (erro = invalidResponseMessage): InadimplenciaCanonicaState => ({
  ...INADIMPLENCIA_CANONICA_LOADING,
  status: 'error',
  erro,
  items: [],
});

function normalizeItem(value: unknown): InadimplenciaCanonicaItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const canonicalFaturaId = nullableString(row.canonical_fatura_id);
  const unidadeId = nullableString(row.unidade_id);
  const emusysFaturaId = nullableString(row.emusys_fatura_id);
  const dataVencimento = nullableString(row.data_vencimento);
  if (!canonicalFaturaId || !unidadeId || !emusysFaturaId || !dataVencimento) return null;

  return {
    canonical_fatura_id: canonicalFaturaId,
    unidade_id: unidadeId,
    emusys_fatura_id: emusysFaturaId,
    emusys_matricula_id: nullableString(row.emusys_matricula_id),
    data_vencimento: dataVencimento,
    dias_atraso: finiteNumber(row.dias_atraso),
    valor_original: finiteNumber(row.valor_original),
    valor_atualizado: finiteNumber(row.valor_atualizado),
    sync_completed_at: nullableString(row.sync_completed_at),
  };
}

function normalizeItems(value: unknown): InadimplenciaCanonicaItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(normalizeItem);
  return items.every((item): item is InadimplenciaCanonicaItem => item != null)
    ? items
    : null;
}

function scalarError(root: Record<string, unknown>): string | null {
  return typeof root.error === 'string' ? nullableString(root.error) : null;
}

function baseState(
  root: Record<string, unknown>,
  status: InadimplenciaCanonicaStatus,
  collectionAllowed: boolean,
  collectionScope: InadimplenciaCollectionScope,
  blockReasons: InadimplenciaBlockReason[],
  items: InadimplenciaCanonicaItem[],
  erro: string | null,
): InadimplenciaCanonicaState {
  const totals = asRecord(root.totals) ?? {};
  const freshness = asRecord(root.freshness) ?? {};
  const reconciliation = asRecord(root.reconciliation) ?? {};

  return {
    status,
    schemaVersion: finiteNumber(root.schema_version),
    totalFaturas: finiteNumber(totals.total_faturas),
    totalMatriculas: finiteNumber(totals.total_matriculas),
    totalOriginal: finiteNumber(totals.total_original),
    totalAtualizado: finiteNumber(totals.total_atualizado),
    maiorAtraso: finiteNumber(totals.maior_atraso),
    avaliadoEm: nullableString(root.avaliado_em),
    ultimoSyncMaisAntigo: nullableString(freshness.ultimo_sync_mais_antigo),
    freshUntil: nullableString(freshness.fresh_until),
    competenciasStale: finiteNumber(freshness.competencias_stale),
    sourceMissingCount: finiteNumber(reconciliation.source_missing_count),
    sourceMissingOpenCount: finiteNumber(reconciliation.source_missing_open_count),
    sourceMissingOtherCount: finiteNumber(reconciliation.source_missing_other_count),
    duplicateFaturaCount: finiteNumber(reconciliation.duplicate_fatura_count),
    invalidIdentityInvoiceCount: finiteNumber(reconciliation.invalid_identity_invoice_count),
    validationIssueCount: finiteNumber(reconciliation.validation_issue_count),
    collectionAllowed,
    collectionScope,
    blockReasons,
    items,
    erro,
  };
}

function normalizeV3(root: Record<string, unknown>): InadimplenciaCanonicaState {
  const status = root.status;
  const operational = asRecord(root.operational);
  const items = normalizeItems(root.items);
  const validReasons: InadimplenciaBlockReason[] = [
    'stale_competencia',
    'duplicate_confirmed_fatura',
    'invalid_invoice_identity',
  ];

  if (
    typeof status !== 'string'
    || !['ok', 'partial', 'stale', 'incomplete', 'error'].includes(status)
    || !operational
    || typeof operational.collection_allowed !== 'boolean'
    || (operational.collection_scope !== 'confirmed_only' && operational.collection_scope !== 'blocked')
    || !Array.isArray(operational.block_reasons)
    || !operational.block_reasons.every((reason): reason is InadimplenciaBlockReason => (
      typeof reason === 'string' && validReasons.includes(reason as InadimplenciaBlockReason)
    ))
    || !items
  ) return errorState();

  const allowedStatus = status === 'ok' || status === 'partial';
  const blockedStatus = status === 'stale' || status === 'incomplete' || status === 'error';
  const allowedContract = allowedStatus
    && operational.collection_allowed === true
    && operational.collection_scope === 'confirmed_only'
    && operational.block_reasons.length === 0;
  const blockedContract = blockedStatus
    && operational.collection_allowed === false
    && operational.collection_scope === 'blocked'
    && items.length === 0;

  if (!allowedContract && !blockedContract) return errorState();

  if (allowedContract) {
    return baseState(root, status as 'ok' | 'partial', true, 'confirmed_only', [], items, null);
  }

  if (status === 'error') return errorState(scalarError(root) ?? invalidResponseMessage);

  return baseState(
    root,
    status as 'stale' | 'incomplete',
    false,
    'blocked',
    operational.block_reasons as InadimplenciaBlockReason[],
    [],
    null,
  );
}

function normalizeV2(root: Record<string, unknown>): InadimplenciaCanonicaState {
  const status = root.status;
  if (status !== 'ok' && status !== 'stale' && status !== 'incomplete' && status !== 'error') {
    return errorState();
  }

  const items = normalizeItems(root.items);
  if (!items) return errorState();

  if (status === 'ok') {
    return baseState(root, 'ok', true, 'confirmed_only', [], items, null);
  }

  return baseState(
    root,
    status,
    false,
    'blocked',
    [],
    [],
    status === 'error' ? scalarError(root) ?? invalidResponseMessage : null,
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
    if (!item.emusys_matricula_id) continue;
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
    if (item.sync_completed_at && (!current.ultimoSync || item.sync_completed_at > current.ultimoSync)) {
      current.ultimoSync = item.sync_completed_at;
    }
    index.set(key, current);
  }
  return index;
}

/**
 * Converte a leitura financeira confirmada em alertas operacionais sem misturar vinculos.
 */
export function montarAlertasInadimplenciaCanonica(
  state: InadimplenciaCanonicaState,
  alunos: AlunoInadimplenciaCanonicaSource[],
  agora = new Date(),
): AlertasInadimplenciaCanonicaResult {
  if (!podeCobrarInadimplenciaCanonica(state, agora)) {
    return { alertas: [], totalAtivos: 0, semCadastroAtivo: 0 };
  }

  const inadimplenciaPorMatricula = indexarInadimplenciaPorMatricula(state, agora);
  const alunosPorMatricula = new Map<string, AlunoInadimplenciaCanonicaSource[]>();

  for (const aluno of alunos) {
    const matricula = nullableString(aluno.emusys_matricula_id);
    if (!matricula || aluno.status !== 'ativo' || aluno.arquivado_em != null) continue;

    const key = chaveInadimplenciaMatricula(aluno.unidade_id, matricula);
    const candidatos = alunosPorMatricula.get(key) ?? [];
    candidatos.push(aluno);
    alunosPorMatricula.set(key, candidatos);
  }

  const alertas: AlertaInadimplenciaCanonica[] = [];
  let semCadastroAtivo = 0;

  for (const [key, inadimplencia] of inadimplenciaPorMatricula) {
    const candidatos = [...(alunosPorMatricula.get(key) ?? [])].sort((left, right) => (
      Number(left.is_segundo_curso === true) - Number(right.is_segundo_curso === true)
      || left.id - right.id
    ));
    const aluno = candidatos[0];
    if (!aluno) {
      semCadastroAtivo += 1;
      continue;
    }

    const matricula = nullableString(aluno.emusys_matricula_id);
    if (!matricula) continue;
    alertas.push({
      aluno_id: aluno.id,
      aluno_nome: aluno.nome,
      whatsapp: nullableString(aluno.whatsapp) ?? nullableString(aluno.telefone),
      unidade_id: aluno.unidade_id,
      emusys_matricula_id: matricula,
      valor_atualizado: inadimplencia.valorAtualizado,
      total_faturas: inadimplencia.faturas,
      professor_id: aluno.professor?.id ?? null,
      professor_nome: nullableString(aluno.professor?.nome),
      instrumento: nullableString(aluno.curso?.nome),
      dias_atraso: inadimplencia.maiorAtraso,
      ultimo_sync: inadimplencia.ultimoSync,
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
