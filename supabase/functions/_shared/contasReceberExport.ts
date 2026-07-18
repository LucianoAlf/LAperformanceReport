export type CadastroMatchStatus = 'unico' | 'nao_encontrado' | 'duplicado';

export interface FaturaSource {
  id: string;
  canonical_fatura_id: string;
  sync_run_id: string;
  unidade_id: string;
  unidade_codigo: string;
  emusys_fatura_id: number | string;
  emusys_matricula_id: number | string | null;
  emusys_student_id: number | string | null;
  descricao: string;
  status: string;
  data_vencimento: string;
  data_pagamento: string | null;
  competencia: string;
  valor_original: number | string;
  valor_pago: number | string | null;
  juros_e_multa: number | string;
  desconto_aplicado: number | string;
  desconto_fixo: number | string;
  desconto_condicional: number | string;
  synced_at?: string | null;
  updated_at?: string | null;
  source_missing?: boolean;
  source_missing_reason?: string | null;
  source_last_seen_at?: string | null;
  source_missing_detected_at?: string | null;
  source_missing_resolved_at?: string | null;
}

const identifier = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error('identificador numerico inseguro recebido da Data API');
  }
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const compareIdentifiers = (left: unknown, right: unknown) => (
  String(left ?? '').localeCompare(String(right ?? ''), 'en', { numeric: true })
);

export interface AlunoSource {
  id: number;
  nome: string;
  unidade_id: string;
  emusys_matricula_id: string | null;
  curso_id: number | null;
}

export interface CursoSource {
  id: number;
  nome: string;
}

const money = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const normalizeUnit = (value: unknown) => {
  const unit = String(value ?? '').trim().toLowerCase();
  if (unit === 'campo_grande' || unit === 'campo grande') return 'cg';
  if (unit === 'recreio') return 'rec';
  if (unit === 'barra') return 'bar';
  return unit;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

export const canonicalStringify = (value: unknown) => JSON.stringify(canonicalize(value));

export async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function validateCompetencia(value: unknown) {
  const competencia = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
    throw new Error('competencia obrigatoria no formato YYYY-MM-01');
  }
  const parsed = new Date(`${competencia}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== competencia) {
    throw new Error('competencia invalida');
  }
  return competencia;
}

function rowHashPayload(row: Record<string, unknown>) {
  return {
    la_report_unidade_id: row.la_report_unidade_id,
    emusys_fatura_id: row.emusys_fatura_id,
    competencia: row.competencia,
    descricao: row.descricao,
    status_origem: row.status_origem,
    data_vencimento: row.data_vencimento,
    data_recebimento: row.data_recebimento,
    valor_original: row.valor_original,
    valor_pago: row.valor_pago,
    juros_e_multa: row.juros_e_multa,
    desconto_aplicado: row.desconto_aplicado,
    desconto_fixo: row.desconto_fixo,
    desconto_condicional: row.desconto_condicional,
    valor_liquido: row.valor_liquido,
    source_missing: row.source_missing,
    source_missing_reason: row.source_missing_reason,
  };
}

export async function buildExportRows({
  faturas,
  alunos,
  cursos,
}: {
  faturas: FaturaSource[];
  alunos: AlunoSource[];
  cursos: CursoSource[];
}) {
  const courseById = new Map(cursos.map((course) => [course.id, course.nome]));
  const candidatesByKey = new Map<string, AlunoSource[]>();

  for (const aluno of alunos) {
    const matricula = String(aluno.emusys_matricula_id ?? '').trim();
    if (!matricula) continue;
    const key = `${aluno.unidade_id}:${matricula}`;
    candidatesByKey.set(key, [...(candidatesByKey.get(key) ?? []), aluno]);
  }

  const rows = [];
  for (const fatura of faturas) {
    const matricula = String(fatura.emusys_matricula_id ?? '').trim();
    const candidates = matricula
      ? [...(candidatesByKey.get(`${fatura.unidade_id}:${matricula}`) ?? [])]
      : [];
    candidates.sort((left, right) => left.id - right.id);

    const cursoCandidatos = candidates.map((candidate) => ({
      aluno_id: candidate.id,
      aluno_nome: candidate.nome,
      curso_id: candidate.curso_id,
      curso_nome: candidate.curso_id == null ? null : (courseById.get(candidate.curso_id) ?? null),
    }));
    const matchStatus: CadastroMatchStatus = candidates.length === 1
      ? 'unico'
      : candidates.length === 0 ? 'nao_encontrado' : 'duplicado';
    const valorOriginal = money(fatura.valor_original);
    const juros = money(fatura.juros_e_multa);
    const descontoAplicado = money(fatura.desconto_aplicado);
    const row: Record<string, unknown> = {
      la_report_fatura_id: fatura.canonical_fatura_id,
      sync_run_id: fatura.sync_run_id,
      sync_run_item_id: fatura.id,
      la_report_unidade_id: fatura.unidade_id,
      unidade: normalizeUnit(fatura.unidade_codigo),
      emusys_fatura_id: identifier(fatura.emusys_fatura_id),
      emusys_matricula_id: identifier(fatura.emusys_matricula_id),
      emusys_student_id: identifier(fatura.emusys_student_id),
      descricao: String(fatura.descricao ?? '').trim(),
      status_origem: String(fatura.status ?? '').trim().toLowerCase() || 'desconhecido',
      data_vencimento: fatura.data_vencimento,
      data_recebimento: fatura.data_pagamento,
      competencia: validateCompetencia(fatura.competencia),
      valor_original: valorOriginal,
      valor_pago: fatura.valor_pago == null ? null : money(fatura.valor_pago),
      juros_e_multa: juros,
      desconto_aplicado: descontoAplicado,
      desconto_fixo: money(fatura.desconto_fixo),
      desconto_condicional: money(fatura.desconto_condicional),
      valor_liquido: Number((valorOriginal + juros - descontoAplicado).toFixed(2)),
      cadastro_match_status: matchStatus,
      aluno_nome: matchStatus === 'unico' ? candidates[0].nome : null,
      curso_nome: matchStatus === 'unico' && candidates[0].curso_id != null
        ? (courseById.get(candidates[0].curso_id) ?? null)
        : null,
      curso_candidatos: cursoCandidatos,
      source_missing: Boolean(fatura.source_missing),
      source_missing_reason: fatura.source_missing_reason ?? null,
      source_last_seen_at: fatura.source_last_seen_at ?? null,
      source_missing_detected_at: fatura.source_missing_detected_at ?? null,
      source_missing_resolved_at: fatura.source_missing_resolved_at ?? null,
      source_updated_at: fatura.updated_at ?? null,
      source_synced_at: fatura.source_last_seen_at ?? fatura.synced_at ?? null,
    };
    row.row_source_hash = await sha256(rowHashPayload(row));
    rows.push(row);
  }

  rows.sort((left, right) => (
    String(left.la_report_unidade_id).localeCompare(String(right.la_report_unidade_id))
    || compareIdentifiers(left.emusys_fatura_id, right.emusys_fatura_id)
  ));
  return rows;
}

export interface SyncRunManifestSource {
  id: string;
  completed_at: string;
  unidades_concluidas: number;
  snapshot_complete: boolean;
}

export async function buildManifest(
  competenciaValue: unknown,
  rows: Record<string, unknown>[],
  run?: SyncRunManifestSource,
  latestCompleteSyncRunId: string | null = run?.id ?? null,
) {
  const competencia = validateCompetencia(competenciaValue);
  const ordered = [...rows].sort((left, right) => (
    String(left.la_report_unidade_id).localeCompare(String(right.la_report_unidade_id))
    || compareIdentifiers(left.emusys_fatura_id, right.emusys_fatura_id)
  ));
  const units = new Map<string, { unidade: string; linhas: number; valor_liquido: number; valor_pago: number }>();
  for (const row of ordered) {
    const key = String(row.la_report_unidade_id);
    const current = units.get(key) ?? {
      unidade: String(row.unidade),
      linhas: 0,
      valor_liquido: 0,
      valor_pago: 0,
    };
    current.linhas += 1;
    current.valor_liquido = Number((current.valor_liquido + money(row.valor_liquido)).toFixed(2));
    current.valor_pago = Number((current.valor_pago + money(row.valor_pago)).toFixed(2));
    units.set(key, current);
  }
  const hashRows = ordered.map((row) => ({
    la_report_unidade_id: row.la_report_unidade_id,
    emusys_fatura_id: row.emusys_fatura_id,
    row_source_hash: row.row_source_hash,
  }));

  return {
    competencia,
    sync_run_id: run?.id ?? null,
    latest_complete_sync_run_id: latestCompleteSyncRunId,
    sync_completed_at: run?.completed_at ?? null,
    unidades_concluidas: run?.unidades_concluidas ?? null,
    snapshot_complete: run?.snapshot_complete ?? false,
    manifest_hash: await sha256({ competencia, rows: hashRows }),
    total_linhas: ordered.length,
    total_valor_liquido: Number(ordered.reduce((sum, row) => sum + money(row.valor_liquido), 0).toFixed(2)),
    total_valor_pago: Number(ordered.reduce((sum, row) => sum + money(row.valor_pago), 0).toFixed(2)),
    cadastro_matches: {
      unico: ordered.filter((row) => row.cadastro_match_status === 'unico').length,
      nao_encontrado: ordered.filter((row) => row.cadastro_match_status === 'nao_encontrado').length,
      duplicado: ordered.filter((row) => row.cadastro_match_status === 'duplicado').length,
    },
    por_unidade: [...units.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([la_report_unidade_id, summary]) => ({ la_report_unidade_id, ...summary })),
  };
}
