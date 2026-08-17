import { sha256 } from './contasReceberExport.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCIA = /^\d{4}-\d{2}-01$/;
const ACTIVE_D2_SCOPE = 'confirmed_active_d2_3_competencias';
const ACTIVE_D2_STUDENT_SCOPE = 'exact_invoice_enrollment + aluno_ativo_atual; trancado, evadido e arquivado fora da carteira D+2';

type JsonRecord = Record<string, unknown>;

export interface InadimplenciaExportContext {
  unidadeId: string | null;
  asOfDate: string | null;
  agoraMs?: number;
}

export interface InadimplenciaExportResult {
  itens: JsonRecord[];
  manifesto: JsonRecord;
}

const asRecord = (value: unknown): JsonRecord | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

const fail = (reason: string): never => {
  throw new Error(`leitura canonica indisponivel: ${reason}`);
};

const nonEmptyText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${field} invalido`);
  return (value as string).trim();
};

const nullableText = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  return nonEmptyText(value, field);
};

const nonNegativeInteger = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${field} invalido`);
  }
  return value as number;
};

const positiveSafeInteger = (value: unknown, field: string): number => {
  const parsed = nonNegativeInteger(value, field);
  if (parsed === 0) fail(`${field} invalido`);
  return parsed;
};

const money = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${field} invalido`);
  }
  const numeric = value as number;
  const cents = Math.round(numeric * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(numeric * 100 - cents) > 1e-7) {
    fail(`${field} deve ter centavos seguros`);
  }
  return cents / 100;
};

const identifier = (value: unknown, field: string, nullable = false): string | null => {
  if (value === null && nullable) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`identificador numerico inseguro em ${field}`);
    }
    if (value < 0) fail(`${field} invalido`);
    return String(value);
  }
  const parsed = nonEmptyText(value, field);
  return parsed;
};

const validDate = (value: unknown, field: string): string => {
  const parsed = nonEmptyText(value, field);
  if (!DATE.test(parsed)) fail(`${field} invalido`);
  const epoch = Date.parse(`${parsed}T00:00:00.000Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== parsed) {
    fail(`${field} invalido`);
  }
  return parsed;
};

const validCompetencia = (value: unknown): string => {
  const parsed = validDate(value, 'competencia');
  if (!COMPETENCIA.test(parsed)) fail('competencia invalida');
  return parsed;
};

const validTimestamp = (value: unknown, field: string): string => {
  const parsed = nonEmptyText(value, field);
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    fail(`${field} invalido`);
  }
  return parsed;
};

const cents = (value: number) => Math.round(value * 100);
const roundedMoney = (value: number) => Math.round(value * 100) / 100;

function parseItem(value: unknown, asOfDate: string, contextUnit: string | null): JsonRecord {
  const row = asRecord(value);
  if (!row) fail('item invalido');

  const canonicalFaturaId = nonEmptyText(row.canonical_fatura_id, 'canonical_fatura_id');
  const unidadeId = nonEmptyText(row.unidade_id, 'unidade_id');
  const runId = nonEmptyText(row.run_id, 'run_id');
  if (!UUID.test(canonicalFaturaId) || !UUID.test(unidadeId) || !UUID.test(runId)) {
    fail('UUID de item invalido');
  }
  if (contextUnit !== null && unidadeId !== contextUnit) fail('item fora da unidade solicitada');

  const competencia = validCompetencia(row.competencia);
  const currentMonth = `${asOfDate.slice(0, 7)}-01`;
  const currentMonthEpoch = Date.parse(`${currentMonth}T00:00:00.000Z`);
  const oldestMonth = new Date(currentMonthEpoch);
  oldestMonth.setUTCMonth(oldestMonth.getUTCMonth() - 2);
  const competenciaEpoch = Date.parse(`${competencia}T00:00:00.000Z`);
  if (competenciaEpoch < oldestMonth.getTime() || competenciaEpoch > currentMonthEpoch) {
    fail('competencia fora da janela canonica');
  }

  const dataVencimento = validDate(row.data_vencimento, 'data_vencimento');
  const dueEpoch = Date.parse(`${dataVencimento}T00:00:00.000Z`);
  const asOfEpoch = Date.parse(`${asOfDate}T00:00:00.000Z`);
  if (dueEpoch >= asOfEpoch) fail('item nao vencido');
  const diasAtraso = nonNegativeInteger(row.dias_atraso, 'dias_atraso');
  const expectedDays = Math.floor((asOfEpoch - dueEpoch) / 86_400_000);
  if (diasAtraso !== expectedDays) fail('dias_atraso inconsistente');

  if (row.status !== 'aberta' || row.source_missing !== false || row.data_pagamento !== null) {
    fail('item fora do universo confirmado');
  }

  const valorOriginal = money(row.valor_original, 'valor_original');
  const valorComDesconto = money(row.valor_com_desconto, 'valor_com_desconto');
  const valorSemDescontoCondicional = money(
    row.valor_sem_desconto_condicional,
    'valor_sem_desconto_condicional',
  );
  const multa = money(row.multa, 'multa');
  const mora = money(row.mora, 'mora');
  const valorAtualizado = money(row.valor_atualizado, 'valor_atualizado');
  if (cents(valorComDesconto) > cents(valorSemDescontoCondicional)
    || cents(valorSemDescontoCondicional) > cents(valorOriginal)) {
    fail('descontos contratuais inconsistentes');
  }
  const expectedMulta = roundedMoney(valorSemDescontoCondicional * 0.02);
  const expectedMora = roundedMoney(valorSemDescontoCondicional * 0.01 * diasAtraso / 30);
  const expectedUpdated = roundedMoney(valorSemDescontoCondicional + expectedMulta + expectedMora);
  if (
    cents(multa) !== cents(expectedMulta)
    || cents(mora) !== cents(expectedMora)
    || cents(valorAtualizado) !== cents(expectedUpdated)
  ) fail('valor_atualizado inconsistente');
  if (diasAtraso < 2) fail('item fora da carteira d_plus_2');

  const contactStatus = row.contact_resolution_status;
  if (contactStatus !== 'resolved' && contactStatus !== 'missing' && contactStatus !== 'ambiguous') {
    fail('contact_resolution_status invalido');
  }
  const alunoId = contactStatus === 'resolved'
    ? positiveSafeInteger(row.aluno_id_canonico, 'aluno_id_canonico')
    : row.aluno_id_canonico === null ? null : fail('aluno_id_canonico contraditorio');

  const syncCompletedAt = validTimestamp(row.sync_completed_at, 'sync_completed_at');
  const syncFreshUntil = validTimestamp(row.sync_fresh_until, 'sync_fresh_until');

  return {
    canonical_fatura_id: canonicalFaturaId,
    unidade_id: unidadeId,
    unidade_codigo: nonEmptyText(row.unidade_codigo, 'unidade_codigo'),
    competencia,
    run_id: runId,
    sync_completed_at: syncCompletedAt,
    sync_fresh_until: syncFreshUntil,
    emusys_fatura_id: identifier(row.emusys_fatura_id, 'emusys_fatura_id'),
    emusys_matricula_id: identifier(row.emusys_matricula_id, 'emusys_matricula_id'),
    emusys_contrato_id: identifier(row.emusys_contrato_id, 'emusys_contrato_id', true),
    aluno_id_canonico: alunoId,
    contact_resolution_status: contactStatus,
    descricao: typeof row.descricao === 'string' ? row.descricao.trim() : fail('descricao invalida'),
    status: 'aberta',
    data_vencimento: dataVencimento,
    data_pagamento: null,
    dias_atraso: diasAtraso,
    valor_original: valorOriginal,
    valor_com_desconto: valorComDesconto,
    valor_sem_desconto_condicional: valorSemDescontoCondicional,
    multa,
    mora,
    valor_atualizado: valorAtualizado,
    source_missing: false,
  };
}

export async function prepararExportacaoInadimplenciaCanonica(
  payload: unknown,
  contexto: InadimplenciaExportContext,
): Promise<InadimplenciaExportResult> {
  const root = asRecord(payload);
  if (!root || root.schema_version !== 4) fail('schema_version deve ser 4');
  if (root.status !== 'ok' && root.status !== 'partial') fail(`status ${String(root.status ?? 'error')}`);
  if (root.fonte !== 'sync_run_items') fail('fonte invalida');

  const contextUnit = contexto.unidadeId;
  if (contextUnit !== null && !UUID.test(contextUnit)) fail('unidade do contexto invalida');
  const rootUnit = root.unidade_id === null ? null : nonEmptyText(root.unidade_id, 'unidade_id');
  if (rootUnit !== null && !UUID.test(rootUnit)) fail('unidade_id invalido');
  if (contextUnit !== rootUnit) fail('unidade_id diverge do contexto');

  const asOfDate = validDate(root.as_of_date, 'as_of_date');
  if (contexto.asOfDate !== null && validDate(contexto.asOfDate, 'as_of_date do contexto') !== asOfDate) {
    fail('as_of_date diverge do contexto');
  }
  const avaliadoEm = validTimestamp(root.avaliado_em, 'avaliado_em');

  const policy = asRecord(root.policy);
  if (
    !policy
    || policy.delinquency_rule !== 'd_plus_2'
    || policy.collection_grace_days !== 2
    || policy.student_scope !== ACTIVE_D2_STUDENT_SCOPE
  ) {
    fail('politica canonica invalida');
  }
  const operational = asRecord(root.operational);
  if (
    !operational
    || operational.collection_allowed !== true
    || operational.collection_scope !== ACTIVE_D2_SCOPE
    || operational.consumer_must_apply_collection_grace !== false
    || !Array.isArray(operational.block_reasons)
    || operational.block_reasons.length !== 0
  ) fail('gate operacional bloqueado');

  const freshness = asRecord(root.freshness);
  if (!freshness) fail('freshness invalido');
  const competenciasNecessarias = nonNegativeInteger(
    freshness.competencias_necessarias,
    'competencias_necessarias',
  );
  const competenciasFrescas = nonNegativeInteger(
    freshness.competencias_frescas,
    'competencias_frescas',
  );
  const competenciasStale = nonNegativeInteger(freshness.competencias_stale, 'competencias_stale');
  if (competenciasStale !== 0 || competenciasFrescas !== competenciasNecessarias) {
    fail('competencias sem frescor');
  }

  const agoraMs = contexto.agoraMs ?? Date.now();
  if (!Number.isFinite(agoraMs)) fail('agoraMs invalido');
  let freshUntil: string | null = null;
  if (freshness.fresh_until !== null) {
    freshUntil = validTimestamp(freshness.fresh_until, 'fresh_until');
    if (agoraMs >= Date.parse(freshUntil)) fail('frescor expirado');
  } else if (competenciasNecessarias !== 0) {
    fail('fresh_until ausente');
  }

  const reconciliation = asRecord(root.reconciliation);
  if (!reconciliation) fail('reconciliation invalido');
  const sourceMissingCount = nonNegativeInteger(reconciliation.source_missing_count, 'source_missing_count');
  const sourceMissingOpenCount = nonNegativeInteger(
    reconciliation.source_missing_open_count,
    'source_missing_open_count',
  );
  const sourceMissingOtherCount = nonNegativeInteger(
    reconciliation.source_missing_other_count,
    'source_missing_other_count',
  );
  const duplicateFaturaCount = nonNegativeInteger(
    reconciliation.duplicate_fatura_count,
    'duplicate_fatura_count',
  );
  const invalidIdentityInvoiceCount = nonNegativeInteger(
    reconciliation.invalid_identity_invoice_count,
    'invalid_identity_invoice_count',
  );
  const contactResolutionPendingCount = nonNegativeInteger(
    reconciliation.contact_resolution_pending_count,
    'contact_resolution_pending_count',
  );
  const validationIssueCount = nonNegativeInteger(
    reconciliation.validation_issue_count,
    'validation_issue_count',
  );
  if (sourceMissingOpenCount + sourceMissingOtherCount !== sourceMissingCount) {
    fail('contagem source_missing inconsistente');
  }
  if (duplicateFaturaCount !== 0) fail('duplicidade confirmada');

  if (!Array.isArray(root.items)) fail('items invalido');
  const itens = (root.items as unknown[]).map((row) => parseItem(row, asOfDate, contextUnit));
  itens.sort((left, right) => (
    String(left.unidade_id).localeCompare(String(right.unidade_id))
    || String(left.canonical_fatura_id).localeCompare(String(right.canonical_fatura_id))
  ));
  const uniqueKeys = new Set(itens.map((item) => `${item.unidade_id}|${item.canonical_fatura_id}`));
  if (uniqueKeys.size !== itens.length) fail('canonical_fatura_id duplicado');
  const unresolvedContacts = itens.filter(
    (item) => item.contact_resolution_status !== 'resolved',
  ).length;
  if (unresolvedContacts > contactResolutionPendingCount) {
    fail('contagem de contato inconsistente');
  }

  const totals = asRecord(root.totals);
  if (!totals) fail('totals invalido');
  const totalFaturas = nonNegativeInteger(totals.total_faturas, 'total_faturas');
  const totalMatriculas = nonNegativeInteger(totals.total_matriculas, 'total_matriculas');
  const totalOriginal = money(totals.total_original, 'total_original');
  const totalAtualizado = money(totals.total_atualizado, 'total_atualizado');
  const maiorAtraso = nonNegativeInteger(totals.maior_atraso, 'maior_atraso');
  const matriculas = new Set(itens.map((item) => `${item.unidade_id}|${item.emusys_matricula_id}`));
  const itensOriginal = itens.reduce((sum, item) => sum + cents(item.valor_original as number), 0);
  const itensAtualizado = itens.reduce((sum, item) => sum + cents(item.valor_atualizado as number), 0);
  const itensMaiorAtraso = itens.reduce((max, item) => Math.max(max, item.dias_atraso as number), 0);
  if (
    totalFaturas !== itens.length
    || totalMatriculas !== matriculas.size
    || cents(totalOriginal) !== itensOriginal
    || cents(totalAtualizado) !== itensAtualizado
    || maiorAtraso !== itensMaiorAtraso
  ) fail('totais divergentes dos itens');

  const hasReconciliation = sourceMissingCount > 0
    || invalidIdentityInvoiceCount > 0
    || validationIssueCount > 0
    || contactResolutionPendingCount > 0;
  if (
    (root.status === 'ok' && hasReconciliation)
    || (root.status === 'partial' && !hasReconciliation)
    || (reconciliation.status !== (hasReconciliation ? 'pending' : 'clear'))
    || (validationIssueCount > 0 && invalidIdentityInvoiceCount === 0)
  ) fail('status de reconciliacao inconsistente');
  if (freshUntil === null && (itens.length !== 0 || totalFaturas !== 0)) {
    fail('divida sem fresh_until');
  }

  const manifestoBase = {
    modo: 'inadimplencia',
    schema_version: 4,
    status: root.status,
    fonte: 'sync_run_items',
    unidade_id: contextUnit,
    as_of_date: asOfDate,
    avaliado_em: avaliadoEm,
    collection_allowed: true,
    collection_scope: ACTIVE_D2_SCOPE,
    fresh_until: freshUntil,
    delinquency_rule: 'd_plus_2',
    collection_grace_days: 2,
    collection_grace_applied: true,
    confirmed_invoice_count: itens.length,
    source_missing_count: sourceMissingCount,
    invalid_identity_invoice_count: invalidIdentityInvoiceCount,
    contact_resolution_pending_count: contactResolutionPendingCount,
    validation_issue_count: validationIssueCount,
    is_fresh: true,
    totals: {
      total_faturas: totalFaturas,
      total_matriculas: totalMatriculas,
      total_original: totalOriginal,
      total_atualizado: totalAtualizado,
      maior_atraso: maiorAtraso,
    },
  };
  const manifestHash = await sha256({
    ...manifestoBase,
    duplicate_fatura_count: duplicateFaturaCount,
    source_missing_open_count: sourceMissingOpenCount,
    source_missing_other_count: sourceMissingOtherCount,
    items: itens,
  });

  return {
    itens,
    manifesto: {
      ...manifestoBase,
      manifest_hash: manifestHash,
    },
  };
}
