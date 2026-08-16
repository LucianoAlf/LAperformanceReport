import { sha256 } from './contasReceberExport.ts';

type JsonRecord = Record<string, unknown>;

export interface ContextoExportacaoInadimplenciaCanonica {
  unidadeId: string | null;
  asOfDate: string | null;
  agoraMs?: number;
}

export interface ExportacaoInadimplenciaCanonica {
  itens: JsonRecord[];
  manifesto: JsonRecord;
}

const fail = (detail: string): never => {
  throw new Error(`leitura canonica indisponivel: ${detail}`);
};

const asRecord = (value: unknown, field: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${field} invalido`);
  }
  return value as JsonRecord;
};

const nonEmptyText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') return fail(`${field} invalido`);
  return value.trim();
};

const nullableText = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined) return null;
  return nonEmptyText(value, field);
};

const identifier = (value: unknown, field: string, nullable = false): string | null => {
  if (value === null || value === undefined) {
    if (nullable) return null;
    return fail(`${field} ausente`);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return fail(`${field}: identificador numerico inseguro`);
    return String(value);
  }
  if (typeof value !== 'string' || value.trim() === '') return fail(`${field} invalido`);
  return value.trim();
};

const nonNegativeInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) return fail(`${field} invalido`);
  return Number(value);
};

const positiveSafeIntegerOrNull = (value: unknown, field: string): number | null => {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return fail(`${field} invalido`);
  return Number(value);
};

const finiteNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`${field} invalido`);
  return value;
};

const nonNegativeMoney = (value: unknown, field: string): number => {
  const parsed = finiteNumber(value, field);
  if (parsed < 0) return fail(`${field} invalido`);
  return Number(parsed.toFixed(2));
};

const validDate = (value: unknown, field: string, firstDayOnly = false): string => {
  const normalized = nonEmptyText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return fail(`${field} invalido`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return fail(`${field} invalido`);
  }
  if (firstDayOnly && !normalized.endsWith('-01')) return fail(`${field} invalido`);
  return normalized;
};

const nullableDate = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined) return null;
  return validDate(value, field);
};

const absoluteTimestamp = (value: unknown, field: string): string => {
  const normalized = nonEmptyText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    return fail(`${field} invalido`);
  }
  if (!Number.isFinite(Date.parse(normalized))) return fail(`${field} invalido`);
  return normalized;
};

const parsePayload = (payload: unknown): JsonRecord => {
  if (typeof payload !== 'string') return asRecord(payload, 'payload');
  try {
    return asRecord(JSON.parse(payload), 'payload');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('leitura canonica indisponivel:')) throw error;
    return fail('payload JSON invalido');
  }
};

function normalizeItem(value: unknown, contextUnitId: string | null): JsonRecord {
  const item = asRecord(value, 'item');
  if (item.status !== 'aberta') return fail('item fora do status aberta');
  if (item.source_missing !== false) return fail('item source_missing nao confirmado');

  const unidadeId = identifier(item.unidade_id, 'item.unidade_id')!;
  if (contextUnitId !== null && unidadeId !== contextUnitId) {
    return fail('item fora da unidade solicitada');
  }

  const canonicalFaturaId = identifier(item.canonical_fatura_id, 'item.canonical_fatura_id')!;
  const emusysFaturaId = identifier(item.emusys_fatura_id, 'item.emusys_fatura_id')!;
  const emusysMatriculaId = identifier(item.emusys_matricula_id, 'item.emusys_matricula_id')!;
  const emusysContratoId = identifier(item.emusys_contrato_id, 'item.emusys_contrato_id', true);
  const emusysStudentId = identifier(item.emusys_student_id, 'item.emusys_student_id', true);
  const alunoIdCanonico = positiveSafeIntegerOrNull(item.aluno_id_canonico, 'item.aluno_id_canonico');
  const contactResolutionStatus = nonEmptyText(
    item.contact_resolution_status,
    'item.contact_resolution_status',
  );
  if (!['resolved', 'missing', 'ambiguous'].includes(contactResolutionStatus)) {
    return fail('item.contact_resolution_status invalido');
  }
  if (contactResolutionStatus === 'resolved' && alunoIdCanonico === null) {
    return fail('item resolvido sem aluno_id_canonico');
  }
  if (contactResolutionStatus !== 'resolved' && alunoIdCanonico !== null) {
    return fail('item nao resolvido com aluno_id_canonico');
  }

  const multaPct = finiteNumber(item.multa_pct, 'item.multa_pct');
  const moraPctMes = finiteNumber(item.mora_pct_mes, 'item.mora_pct_mes');
  if (multaPct !== 0.02 || moraPctMes !== 0.01) {
    return fail('item com regra de juros divergente do contrato');
  }

  const normalized: JsonRecord = {
    canonical_fatura_id: canonicalFaturaId,
    unidade_id: unidadeId,
    unidade_codigo: nonEmptyText(item.unidade_codigo, 'item.unidade_codigo'),
    competencia: validDate(item.competencia, 'item.competencia', true),
    run_id: identifier(item.run_id, 'item.run_id'),
    sync_completed_at: absoluteTimestamp(item.sync_completed_at, 'item.sync_completed_at'),
    sync_fresh_until: absoluteTimestamp(item.sync_fresh_until, 'item.sync_fresh_until'),
    emusys_fatura_id: emusysFaturaId,
    emusys_matricula_id: emusysMatriculaId,
    emusys_contrato_id: emusysContratoId,
    aluno_id_canonico: alunoIdCanonico,
    contact_resolution_status: contactResolutionStatus,
    descricao: nullableText(item.descricao, 'item.descricao'),
    status: 'aberta',
    data_vencimento: validDate(item.data_vencimento, 'item.data_vencimento'),
    data_pagamento: nullableDate(item.data_pagamento, 'item.data_pagamento'),
    dias_atraso: nonNegativeInteger(item.dias_atraso, 'item.dias_atraso'),
    valor_original: nonNegativeMoney(item.valor_original, 'item.valor_original'),
    desconto_condicional_perdido: nonNegativeMoney(
      item.desconto_condicional_perdido,
      'item.desconto_condicional_perdido',
    ),
    multa_pct: multaPct,
    mora_pct_mes: moraPctMes,
    valor_atualizado: nonNegativeMoney(item.valor_atualizado, 'item.valor_atualizado'),
    source_missing: false,
  };
  if (emusysStudentId !== null) normalized.emusys_student_id = emusysStudentId;
  return normalized;
}

const compareItems = (left: JsonRecord, right: JsonRecord) => (
  String(left.unidade_id).localeCompare(String(right.unidade_id))
  || String(left.canonical_fatura_id).localeCompare(String(right.canonical_fatura_id))
);

function validateTotals(value: unknown, items: JsonRecord[]): JsonRecord {
  const totals = asRecord(value, 'totals');
  const normalized = {
    total_faturas: nonNegativeInteger(totals.total_faturas, 'totals.total_faturas'),
    total_matriculas: nonNegativeInteger(totals.total_matriculas, 'totals.total_matriculas'),
    total_original: nonNegativeMoney(totals.total_original, 'totals.total_original'),
    total_atualizado: nonNegativeMoney(totals.total_atualizado, 'totals.total_atualizado'),
    maior_atraso: nonNegativeInteger(totals.maior_atraso, 'totals.maior_atraso'),
  };
  const expectedOriginal = Number(items
    .reduce((sum, item) => sum + Number(item.valor_original), 0)
    .toFixed(2));
  const expectedUpdated = Number(items
    .reduce((sum, item) => sum + Number(item.valor_atualizado), 0)
    .toFixed(2));
  const expectedEnrollments = new Set(items.map((item) => `${item.unidade_id}:${item.emusys_matricula_id}`)).size;
  const expectedMaxDelay = items.reduce((maximum, item) => Math.max(maximum, Number(item.dias_atraso)), 0);
  if (
    normalized.total_faturas !== items.length
    || normalized.total_matriculas !== expectedEnrollments
    || normalized.total_original !== expectedOriginal
    || normalized.total_atualizado !== expectedUpdated
    || normalized.maior_atraso !== expectedMaxDelay
  ) {
    return fail('totals divergentes dos itens confirmados');
  }
  return normalized;
}

export async function prepararExportacaoInadimplenciaCanonica(
  payload: unknown,
  contexto: ContextoExportacaoInadimplenciaCanonica,
): Promise<ExportacaoInadimplenciaCanonica> {
  const canonical = parsePayload(payload);
  if (canonical.schema_version !== 3) return fail('schema_version deve ser 3');

  const status = canonical.status;
  if (status !== 'ok' && status !== 'partial') {
    return fail(`status ${String(status ?? 'ausente')} bloqueado`);
  }

  const contextUnitId = contexto.unidadeId === null
    ? null
    : identifier(contexto.unidadeId, 'contexto.unidadeId');
  const contextAsOfDate = contexto.asOfDate === null
    ? null
    : validDate(contexto.asOfDate, 'contexto.asOfDate');
  const canonicalUnitId = identifier(canonical.unidade_id, 'unidade_id', true);
  const canonicalAsOfDate = validDate(canonical.as_of_date, 'as_of_date');
  if (
    canonicalUnitId !== contextUnitId
    || (contextAsOfDate !== null && canonicalAsOfDate !== contextAsOfDate)
  ) {
    return fail('escopo retornado pela RPC diverge da solicitacao');
  }

  const policy = asRecord(canonical.policy, 'policy');
  if (policy.delinquency_rule !== 'd_plus_0' || policy.collection_grace_days !== 2) {
    return fail('politica financeira divergente');
  }

  const operational = asRecord(canonical.operational, 'operational');
  if (
    operational.collection_allowed !== true
    || operational.collection_scope !== 'confirmed_only'
    || operational.consumer_must_apply_collection_grace !== true
    || !Array.isArray(operational.block_reasons)
    || operational.block_reasons.length !== 0
  ) {
    return fail('gate operacional bloqueado ou invalido');
  }

  const freshness = asRecord(canonical.freshness, 'freshness');
  const requiredCompetences = nonNegativeInteger(
    freshness.competencias_necessarias,
    'freshness.competencias_necessarias',
  );
  const freshCompetences = nonNegativeInteger(
    freshness.competencias_frescas,
    'freshness.competencias_frescas',
  );
  const staleCompetences = nonNegativeInteger(
    freshness.competencias_stale,
    'freshness.competencias_stale',
  );
  if (staleCompetences !== 0 || freshCompetences !== requiredCompetences) {
    return fail('frescor das competencias invalido');
  }

  let freshUntil: string | null = null;
  if (freshness.fresh_until !== null && freshness.fresh_until !== undefined) {
    freshUntil = absoluteTimestamp(freshness.fresh_until, 'freshness.fresh_until');
  }
  if ((requiredCompetences === 0) !== (freshUntil === null)) {
    return fail('fresh_until incompativel com competencias necessarias');
  }
  const nowMs = contexto.agoraMs ?? Date.now();
  if (!Number.isFinite(nowMs)) return fail('agoraMs invalido');
  if (freshUntil !== null && nowMs >= Date.parse(freshUntil)) {
    return fail('frescor expirou durante a exportacao');
  }

  if (!Array.isArray(canonical.items)) return fail('items invalido');
  const items = canonical.items.map((value) => normalizeItem(value, contextUnitId));
  items.sort(compareItems);
  const itemKeys = items.map((item) => `${item.unidade_id}:${item.canonical_fatura_id}`);
  if (new Set(itemKeys).size !== itemKeys.length) return fail('item confirmado duplicado');
  if (requiredCompetences === 0 && items.length !== 0) {
    return fail('itens sem competencia necessaria');
  }

  const reconciliation = asRecord(canonical.reconciliation, 'reconciliation');
  const sourceMissingCount = nonNegativeInteger(
    reconciliation.source_missing_count,
    'reconciliation.source_missing_count',
  );
  const invalidIdentityInvoiceCount = nonNegativeInteger(
    reconciliation.invalid_identity_invoice_count,
    'reconciliation.invalid_identity_invoice_count',
  );
  const contactResolutionPendingCount = nonNegativeInteger(
    reconciliation.contact_resolution_pending_count,
    'reconciliation.contact_resolution_pending_count',
  );
  const validationIssueCount = nonNegativeInteger(
    reconciliation.validation_issue_count,
    'reconciliation.validation_issue_count',
  );
  const totals = validateTotals(canonical.totals, items);

  const manifestoSemHash: JsonRecord = {
    modo: 'inadimplencia',
    schema_version: 3,
    status,
    fonte: nullableText(canonical.fonte, 'fonte') ?? 'sync_run_items',
    unidade_id: canonicalUnitId,
    as_of_date: canonicalAsOfDate,
    avaliado_em: absoluteTimestamp(canonical.avaliado_em, 'avaliado_em'),
    collection_allowed: true,
    collection_scope: 'confirmed_only',
    fresh_until: freshUntil,
    delinquency_rule: 'd_plus_0',
    collection_grace_days: 2,
    collection_grace_applied: false,
    confirmed_invoice_count: items.length,
    source_missing_count: sourceMissingCount,
    invalid_identity_invoice_count: invalidIdentityInvoiceCount,
    contact_resolution_pending_count: contactResolutionPendingCount,
    validation_issue_count: validationIssueCount,
    is_fresh: true,
    totals,
  };

  return {
    itens: items,
    manifesto: {
      ...manifestoSemHash,
      manifest_hash: await sha256({ ...manifestoSemHash, items }),
    },
  };
}
