export type InadimplenciaCanonicaStatus =
  | 'loading'
  | 'ok'
  | 'stale'
  | 'incomplete'
  | 'error';

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
  duplicateFaturaCount: number;
  invalidIdentityInvoiceCount: number;
  validationIssueCount: number;
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
  duplicateFaturaCount: 0,
  invalidIdentityInvoiceCount: 0,
  validationIssueCount: 0,
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

export function normalizarInadimplenciaCanonica(
  payload: unknown,
  error?: { message?: string } | null,
): InadimplenciaCanonicaState {
  if (error) {
    return {
      ...INADIMPLENCIA_CANONICA_LOADING,
      status: 'error',
      erro: error.message || 'Falha ao carregar a inadimplencia canonica.',
      items: [],
    };
  }

  let parsedPayload = payload;
  if (typeof payload === 'string') {
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      parsedPayload = null;
    }
  }
  const root = asRecord(parsedPayload);
  const rawStatus = nullableString(root?.status);
  if (!root || !['ok', 'stale', 'incomplete'].includes(rawStatus ?? '')) {
    return {
      ...INADIMPLENCIA_CANONICA_LOADING,
      status: 'error',
      erro: 'Resposta invalida da leitura canonica de inadimplencia.',
      items: [],
    };
  }

  const status = rawStatus as 'ok' | 'stale' | 'incomplete';
  const totals = asRecord(root.totals) ?? {};
  const freshness = asRecord(root.freshness) ?? {};
  const reconciliation = asRecord(root.reconciliation) ?? {};
  const items: InadimplenciaCanonicaItem[] = status === 'stale'
    ? []
    : (Array.isArray(root.items)
      ? root.items.map(normalizeItem).filter((item): item is InadimplenciaCanonicaItem => item != null)
      : []);

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
    duplicateFaturaCount: finiteNumber(reconciliation.duplicate_fatura_count),
    invalidIdentityInvoiceCount: finiteNumber(reconciliation.invalid_identity_invoice_count),
    validationIssueCount: finiteNumber(reconciliation.validation_issue_count),
    items,
    erro: null,
  };
}

export const chaveInadimplenciaMatricula = (
  unidadeId: string,
  emusysMatriculaId: string | number,
) => `${unidadeId}|${String(emusysMatriculaId).trim()}`;

export function indexarInadimplenciaPorMatricula(state: InadimplenciaCanonicaState) {
  const index = new Map<string, InadimplenciaPorMatricula>();
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
 * Converte a leitura financeira em alertas operacionais sem misturar vinculos.
 * Somente o estado `ok` habilita cobranca: stale, incomplete e erro falham fechados.
 */
export function montarAlertasInadimplenciaCanonica(
  state: InadimplenciaCanonicaState,
  alunos: AlunoInadimplenciaCanonicaSource[],
): AlertasInadimplenciaCanonicaResult {
  if (state.status !== 'ok') {
    return { alertas: [], totalAtivos: 0, semCadastroAtivo: 0 };
  }

  const inadimplenciaPorMatricula = indexarInadimplenciaPorMatricula(state);
  const alunosPorMatricula = new Map<string, AlunoInadimplenciaCanonicaSource[]>();

  for (const aluno of alunos) {
    const matricula = nullableString(aluno.emusys_matricula_id);
    if (
      !matricula
      || aluno.status !== 'ativo'
      || aluno.arquivado_em != null
    ) continue;

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

  return {
    alertas,
    totalAtivos: alertas.length,
    semCadastroAtivo,
  };
}
