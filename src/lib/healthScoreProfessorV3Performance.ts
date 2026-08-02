import type {
  HealthMetricKeyV3,
  HealthScoreV3MetricRole,
  HealthScoreV3SnapshotMetric,
} from './healthScoreProfessorV3';

export interface HealthScoreV3PerformanceMetric {
  metrica: HealthMetricKeyV3;
  valorBruto: number | null;
  numerador: number | null;
  denominador: number | null;
  nota: number | null;
  peso: number;
  pesoDisponivel: boolean;
  pesoEfetivo: number | null;
  contribuicao: number | null;
  meta: number | null;
  amostra: number | null;
  estadoBase: string;
  metricaPublicavel: boolean;
  confianca: string | null;
  fonte: string;
  regraVersaoMetrica: string;
  motivoSemBase: string | null;
  codigoEvidencia: string | null;
  papel: HealthScoreV3MetricRole | null;
  detalhes: Record<string, unknown>;
}

export interface HealthScoreV3ProfessorPerformance {
  professorId: number;
  unidadeId: string | null;
  escopo: string;
  competencia: string;
  trimestreInicio: string;
  periodicidade: 'mensal' | 'ciclo' | 'legado_calendario';
  periodoInicio: string;
  periodoFim: string;
  cicloCodigo: string;
  estadoPublicacao: 'parcial' | 'oficial' | 'sem_base';
  scoreExibivel: boolean;
  rankingHabilitado: boolean;
  configVersao: number;
  revisao: number;
  score: number | null;
  cobertura: number | null;
  classificacao: string | null;
  estado: string;
  snapshotPublicavel: boolean;
  publicado: boolean;
  motivoBloqueio: string | null;
  regraVersaoSnapshot: string;
  metrics: Map<HealthMetricKeyV3, HealthScoreV3PerformanceMetric>;
}

export type HealthScoreV3UiStatus =
  | 'saudavel'
  | 'atencao'
  | 'critico'
  | 'parcial'
  | 'evidencia_pendente';

const HEALTH_SCORE_V3_METRIC_KEYS: HealthMetricKeyV3[] = [
  'retencao',
  'permanencia',
  'conversao',
  'media_turma',
  'numero_alunos',
  'presenca',
];

const HEALTH_SCORE_V3_EVIDENCE_MESSAGES: Record<string, string> = {
  professor_em_maturacao: 'Professor em período de maturação',
  amostra_insuficiente: 'Amostra insuficiente no período',
  sem_experimental_periodo: 'Não realizou aula experimental no período',
  cobertura_presenca_insuficiente: 'Cobertura de presença insuficiente',
  calendario_sem_aulas_elegiveis: 'Calendário sem aulas elegíveis no período',
  segmentacao_incompleta: 'Vínculo de curso ou modalidade precisa de revisão',
  fonte_canonica_indisponivel: 'Dados oficiais do período ainda não disponíveis',
  metrica_nao_aplicavel: 'Indicador não aplicável a este professor',
};

export function resolveHealthScoreV3EvidenceMessage(
  codigo: string | null | undefined,
  metrica?: HealthMetricKeyV3,
  fallback?: string | null,
): string {
  if (codigo && HEALTH_SCORE_V3_EVIDENCE_MESSAGES[codigo]) {
    return HEALTH_SCORE_V3_EVIDENCE_MESSAGES[codigo];
  }
  if (metrica === 'conversao' && codigo === 'sem_base') {
    return HEALTH_SCORE_V3_EVIDENCE_MESSAGES.sem_experimental_periodo;
  }
  return fallback?.trim()
    || HEALTH_SCORE_V3_EVIDENCE_MESSAGES.fonte_canonica_indisponivel;
}

function monthEnd(reference: string): string {
  const [year, month] = reference.slice(0, 7).split('-').map(Number);
  if (!year || !month) return reference;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function buildMissingMetric(metrica: HealthMetricKeyV3): HealthScoreV3PerformanceMetric {
  return {
    metrica,
    valorBruto: null,
    numerador: null,
    denominador: null,
    nota: null,
    peso: 0,
    pesoDisponivel: false,
    pesoEfetivo: null,
    contribuicao: null,
    meta: null,
    amostra: null,
    estadoBase: 'sem_base',
    metricaPublicavel: false,
    confianca: 'sem_base',
    fonte: 'dados_oficiais_periodo',
    regraVersaoMetrica: 'health_score_v3_evidencia_v1',
    motivoSemBase: resolveHealthScoreV3EvidenceMessage(
      'fonte_canonica_indisponivel',
      metrica,
    ),
    codigoEvidencia: 'fonte_canonica_indisponivel',
    papel: metrica === 'numero_alunos' ? 'diagnostico' : 'nota',
    detalhes: {
      codigo_evidencia: 'fonte_canonica_indisponivel',
      papel: metrica === 'numero_alunos' ? 'diagnostico' : 'nota',
    },
  };
}

export function buildHealthScoreV3MissingPerformance({
  professorId,
  competencia,
  unidadeId,
  periodicidade,
}: {
  professorId: number;
  competencia: string;
  unidadeId: string | null;
  periodicidade: 'mensal' | 'ciclo';
}): HealthScoreV3ProfessorPerformance {
  const reference = /^\d{4}-\d{2}$/.test(competencia)
    ? `${competencia}-01`
    : competencia;
  return {
    professorId,
    unidadeId,
    escopo: unidadeId ? 'unidade' : 'consolidado',
    competencia: reference,
    trimestreInicio: reference,
    periodicidade,
    periodoInicio: reference,
    periodoFim: monthEnd(reference),
    cicloCodigo: periodicidade === 'ciclo' ? 'ciclo_sem_evidencia' : 'mensal',
    estadoPublicacao: 'sem_base',
    scoreExibivel: false,
    rankingHabilitado: false,
    configVersao: 0,
    revisao: 0,
    score: null,
    cobertura: null,
    classificacao: null,
    estado: 'sem_base',
    snapshotPublicavel: false,
    publicado: false,
    motivoBloqueio: 'fonte_canonica_indisponivel',
    regraVersaoSnapshot: 'health_score_v3_evidencia_v1',
    metrics: new Map(
      HEALTH_SCORE_V3_METRIC_KEYS.map((metrica) => [metrica, buildMissingMetric(metrica)]),
    ),
  };
}

export function mergeHealthScoreV3ActiveRoster({
  snapshots,
  professorIds,
  competencia,
  unidadeId,
  periodicidade,
}: {
  snapshots: HealthScoreV3ProfessorPerformance[];
  professorIds: number[];
  competencia: string;
  unidadeId: string | null;
  periodicidade: 'mensal' | 'ciclo';
}): HealthScoreV3ProfessorPerformance[] {
  const byProfessor = new Map(snapshots.map((snapshot) => [snapshot.professorId, snapshot]));
  return Array.from(new Set(professorIds))
    .sort((left, right) => left - right)
    .map((professorId) => byProfessor.get(professorId) || buildHealthScoreV3MissingPerformance({
      professorId,
      competencia,
      unidadeId,
      periodicidade,
    }));
}

export function resolveHealthScoreV3UiStatus(snapshot: Pick<
  HealthScoreV3ProfessorPerformance,
  'score' | 'classificacao' | 'estadoPublicacao' | 'scoreExibivel'
> | null | undefined): HealthScoreV3UiStatus {
  if (!snapshot || snapshot.score === null || !snapshot.scoreExibivel) {
    return 'evidencia_pendente';
  }
  if (snapshot.estadoPublicacao !== 'oficial') return 'parcial';
  if (snapshot.classificacao === 'critico') return 'critico';
  if (snapshot.classificacao === 'atencao') return 'atencao';
  if (snapshot.classificacao === 'saudavel') return 'saudavel';
  return 'evidencia_pendente';
}

export function resolveHealthScoreV3ScoreStatus(snapshot: Pick<
  HealthScoreV3ProfessorPerformance,
  'score' | 'classificacao' | 'estadoPublicacao' | 'scoreExibivel'
> | null | undefined): Exclude<HealthScoreV3UiStatus, 'parcial'> {
  if (!snapshot || snapshot.score === null || !snapshot.scoreExibivel) {
    return 'evidencia_pendente';
  }
  if (snapshot.classificacao === 'critico') return 'critico';
  if (snapshot.classificacao === 'atencao') return 'atencao';
  if (snapshot.classificacao === 'saudavel') return 'saudavel';
  return 'evidencia_pendente';
}

export function formatHealthScoreV3BaseNumber(
  value: number | null | undefined,
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export type HealthScoreV3MetricDisplayState =
  | 'normal'
  | 'observado'
  | 'provisorio'
  | 'auditoria'
  | 'sem_base';

export interface HealthScoreV3MetricDisplay {
  value: number | null;
  observedValue: number | null;
  state: HealthScoreV3MetricDisplayState;
  rankable: boolean;
  metric: HealthScoreV3PerformanceMetric | null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asMetric(value: unknown): HealthMetricKeyV3 | null {
  return [
    'retencao',
    'permanencia',
    'conversao',
    'media_turma',
    'numero_alunos',
    'presenca',
  ].includes(String(value))
    ? (String(value) as HealthMetricKeyV3)
    : null;
}

function asMetricRole(value: unknown): HealthScoreV3MetricRole | null {
  return value === 'nota' || value === 'diagnostico' ? value : null;
}

export function normalizeHealthScoreV3PerformanceRows(
  rows: unknown[],
): HealthScoreV3ProfessorPerformance[] {
  const snapshots = new Map<number, HealthScoreV3ProfessorPerformance>();

  for (const value of rows) {
    const row = asRecord(value);
    const professorId = asNumber(row.professor_id);
    const metrica = asMetric(row.metrica);
    if (!professorId || !metrica) continue;

    let snapshot = snapshots.get(professorId);
    if (!snapshot) {
      snapshot = {
        professorId,
        unidadeId: row.unidade_id ? String(row.unidade_id) : null,
        escopo: String(row.escopo || ''),
        competencia: String(row.competencia || ''),
        trimestreInicio: String(row.trimestre_inicio || ''),
        periodicidade: String(row.periodicidade || 'legado_calendario') as HealthScoreV3ProfessorPerformance['periodicidade'],
        periodoInicio: String(row.periodo_inicio || ''),
        periodoFim: String(row.periodo_fim || ''),
        cicloCodigo: String(row.ciclo_codigo || ''),
        estadoPublicacao: String(row.estado_publicacao || 'sem_base') as HealthScoreV3ProfessorPerformance['estadoPublicacao'],
        scoreExibivel: row.score_exibivel === true,
        rankingHabilitado: row.ranking_habilitado === true,
        configVersao: asNumber(row.config_versao),
        revisao: asNumber(row.revisao),
        score: asNullableNumber(row.score),
        cobertura: asNullableNumber(row.cobertura),
        classificacao: row.classificacao ? String(row.classificacao) : null,
        estado: String(row.estado || ''),
        snapshotPublicavel: row.snapshot_publicavel === true,
        publicado: row.publicado === true,
        motivoBloqueio: row.motivo_bloqueio ? String(row.motivo_bloqueio) : null,
        regraVersaoSnapshot: String(row.regra_versao_snapshot || ''),
        metrics: new Map(),
      };
      snapshots.set(professorId, snapshot);
    }

    const detalhes = asRecord(row.detalhes);
    snapshot.metrics.set(metrica, {
      metrica,
      valorBruto: asNullableNumber(row.valor_bruto),
      numerador: asNullableNumber(row.numerador),
      denominador: asNullableNumber(row.denominador),
      nota: asNullableNumber(row.nota),
      peso: asNumber(row.peso),
      pesoDisponivel: row.peso_disponivel === true,
      pesoEfetivo: asNullableNumber(row.peso_efetivo ?? detalhes.peso_efetivo),
      contribuicao: asNullableNumber(row.contribuicao),
      meta: asNullableNumber(row.meta),
      amostra: asNullableNumber(row.amostra),
      estadoBase: String(row.estado_base || 'sem_base'),
      metricaPublicavel: row.metrica_publicavel === true,
      confianca: row.confianca ? String(row.confianca) : null,
      fonte: String(row.fonte || ''),
      regraVersaoMetrica: String(row.regra_versao_metrica || ''),
      motivoSemBase: row.motivo_sem_base ? String(row.motivo_sem_base) : null,
      codigoEvidencia: row.codigo_evidencia
        ? String(row.codigo_evidencia)
        : detalhes.codigo_evidencia
          ? String(detalhes.codigo_evidencia)
          : null,
      papel: asMetricRole(row.papel ?? detalhes.papel),
      detalhes,
    });
  }

  return Array.from(snapshots.values());
}

function latestStudentClosing(metric: HealthScoreV3PerformanceMetric): number | null {
  const closings = Array.isArray(metric.detalhes.fechamentos)
    ? metric.detalhes.fechamentos
        .map(asRecord)
        .filter((closing) => closing.mes && closing.alunos_fechamento !== undefined)
        .sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
    : [];
  if (closings.length === 0) return null;
  return asNullableNumber(closings[closings.length - 1].alunos_fechamento);
}

export function resolveHealthScoreV3MetricDisplay(
  snapshot: HealthScoreV3ProfessorPerformance,
  metricKey: HealthMetricKeyV3,
): HealthScoreV3MetricDisplay {
  const metric = snapshot.metrics.get(metricKey) || null;
  if (!metric) {
    return { value: null, observedValue: null, state: 'sem_base', rankable: false, metric };
  }

  if (metricKey === 'presenca') {
    const observedValue = asNullableNumber(metric.detalhes.valor_observado);
    const publication = String(metric.detalhes.observacao_publicacao || '');
    if (publication === 'em_auditoria') {
      return { value: null, observedValue, state: 'auditoria', rankable: false, metric };
    }
    if (metric.valorBruto !== null) {
      return {
        value: metric.valorBruto,
        observedValue,
        state: metric.metricaPublicavel ? 'normal' : 'provisorio',
        rankable: metric.metricaPublicavel,
        metric,
      };
    }
    if (publication === 'normal' && observedValue !== null) {
      return { value: observedValue, observedValue, state: 'observado', rankable: false, metric };
    }
    return { value: null, observedValue, state: 'sem_base', rankable: false, metric };
  }

  const value = metricKey === 'numero_alunos' && metric.valorBruto === null
    ? latestStudentClosing(metric)
    : metric.valorBruto;

  if (value === null) {
    return { value: null, observedValue: null, state: 'sem_base', rankable: false, metric };
  }

  if (metric.metricaPublicavel) {
    return { value, observedValue: null, state: 'normal', rankable: true, metric };
  }

  const auditState = metric.estadoBase === 'revisar'
    || metric.confianca === 'revisar'
    || metric.confianca === 'media';
  return {
    value,
    observedValue: null,
    state: auditState ? 'auditoria' : 'provisorio',
    rankable: false,
    metric,
  };
}

export function rankHealthScoreV3Metric(
  snapshots: HealthScoreV3ProfessorPerformance[],
  metricKey: HealthMetricKeyV3,
): Array<{ professorId: number; value: number }> {
  return snapshots
    .filter(isHealthScoreV3SnapshotRankable)
    .flatMap((snapshot) => {
      const display = resolveHealthScoreV3MetricDisplay(snapshot, metricKey);
      return display.rankable && display.value !== null
        ? [{ professorId: snapshot.professorId, value: display.value }]
        : [];
    })
    .sort((a, b) => b.value - a.value || a.professorId - b.professorId);
}

export function formatHealthScoreV3Coverage(cobertura: number | null | undefined): string {
  return cobertura === null || cobertura === undefined
    ? 'Sem base'
    : `${cobertura.toFixed(1)}%`;
}

export function averageHealthScoreV3Coverage(
  snapshots: Array<{ cobertura: number | null | undefined }>,
): number | null {
  const coverages = snapshots
    .map((snapshot) => snapshot.cobertura)
    .filter((value): value is number => value !== null && value !== undefined);

  return coverages.length > 0
    ? coverages.reduce((total, value) => total + value, 0) / coverages.length
    : null;
}

export function isHealthScoreV3SnapshotRankable(
  snapshot: HealthScoreV3ProfessorPerformance,
): boolean {
  return snapshot.rankingHabilitado
    && snapshot.estadoPublicacao === 'oficial'
    && snapshot.snapshotPublicavel
    && snapshot.score !== null;
}

export interface HealthScoreV3AiPayload {
  versao_contrato: 'health_score_professor_v3';
  professor_id: number;
  unidade_id: string | null;
  escopo: string;
  competencia: string;
  periodicidade: HealthScoreV3ProfessorPerformance['periodicidade'];
  periodo_inicio: string;
  periodo_fim: string;
  ciclo_codigo: string;
  estado_publicacao: HealthScoreV3ProfessorPerformance['estadoPublicacao'];
  score_exibivel: boolean;
  ranking_habilitado: boolean;
  config_versao: number;
  revisao: number;
  score: number | null;
  cobertura: number | null;
  classificacao: string | null;
  estado: string;
  snapshot_publicavel: boolean;
  publicado: boolean;
  motivo_bloqueio: string | null;
  regra_versao_snapshot: string;
  metricas: Array<{
    metrica: HealthMetricKeyV3;
    valor_bruto: number | null;
    numerador: number | null;
    denominador: number | null;
    nota: number | null;
    peso: number;
    peso_disponivel: boolean;
    peso_efetivo: number | null;
    contribuicao: number | null;
    meta: number | null;
    amostra: number | null;
    estado_base: string;
    metrica_publicavel: boolean;
    confianca: string | null;
    fonte: string;
    regra_versao_metrica: string;
    motivo_sem_base: string | null;
    codigo_evidencia: string | null;
    papel: HealthScoreV3MetricRole | null;
    detalhes: Record<string, unknown>;
  }>;
}

export function isHealthScoreV3SnapshotVisible(
  snapshot: HealthScoreV3ProfessorPerformance,
): boolean {
  return snapshot.scoreExibivel && snapshot.score !== null;
}

function serializeMetricForAi(metric: HealthScoreV3PerformanceMetric) {
  return {
    metrica: metric.metrica,
    valor_bruto: metric.valorBruto,
    numerador: metric.numerador,
    denominador: metric.denominador,
    nota: metric.nota,
    peso: metric.peso,
    peso_disponivel: metric.pesoDisponivel,
    peso_efetivo: metric.pesoEfetivo,
    contribuicao: metric.contribuicao,
    meta: metric.meta,
    amostra: metric.amostra,
    estado_base: metric.estadoBase,
    metrica_publicavel: metric.metricaPublicavel,
    confianca: metric.confianca,
    fonte: metric.fonte,
    regra_versao_metrica: metric.regraVersaoMetrica,
    motivo_sem_base: metric.motivoSemBase,
    codigo_evidencia: metric.codigoEvidencia,
    papel: metric.papel,
    detalhes: metric.detalhes,
  };
}

function performanceFromMetricRows(
  rows: HealthScoreV3SnapshotMetric[],
): HealthScoreV3ProfessorPerformance | null {
  const first = rows[0];
  if (!first) return null;

  return {
    professorId: first.professorId,
    unidadeId: first.unidadeId,
    escopo: first.escopo,
    competencia: first.competencia,
    trimestreInicio: first.trimestreInicio,
    periodicidade: first.periodicidade,
    periodoInicio: first.periodoInicio,
    periodoFim: first.periodoFim,
    cicloCodigo: first.cicloCodigo,
    estadoPublicacao: first.estadoPublicacao,
    scoreExibivel: first.scoreExibivel,
    rankingHabilitado: first.rankingHabilitado,
    configVersao: first.configVersao,
    revisao: 0,
    score: first.score,
    cobertura: first.cobertura,
    classificacao: first.classificacao,
    estado: first.estado,
    snapshotPublicavel: first.snapshotPublicavel,
    publicado: first.publicado,
    motivoBloqueio: first.motivoBloqueio,
    regraVersaoSnapshot: first.regraVersaoSnapshot,
    metrics: new Map(rows.map((row) => [row.metrica, {
      metrica: row.metrica,
      valorBruto: row.valorBruto,
      numerador: row.numerador,
      denominador: row.denominador,
      nota: row.nota,
      peso: row.peso,
      pesoDisponivel: row.pesoDisponivel,
      pesoEfetivo: row.pesoEfetivo,
      contribuicao: row.contribuicao,
      meta: row.meta,
      amostra: row.amostra,
      estadoBase: row.estadoBase,
      metricaPublicavel: row.metricaPublicavel,
      confianca: row.confianca,
      fonte: row.fonte,
      regraVersaoMetrica: row.regraVersaoMetrica,
      motivoSemBase: row.motivoSemBase,
      codigoEvidencia: row.codigoEvidencia,
      papel: row.papel,
      detalhes: row.detalhes,
    }])),
  };
}

export function serializeHealthScoreV3ForAi(
  value: HealthScoreV3ProfessorPerformance | HealthScoreV3SnapshotMetric[] | null,
): HealthScoreV3AiPayload | null {
  const snapshot = Array.isArray(value) ? performanceFromMetricRows(value) : value;
  if (!snapshot) return null;

  return {
    versao_contrato: 'health_score_professor_v3',
    professor_id: snapshot.professorId,
    unidade_id: snapshot.unidadeId,
    escopo: snapshot.escopo,
    competencia: snapshot.competencia,
    periodicidade: snapshot.periodicidade,
    periodo_inicio: snapshot.periodoInicio,
    periodo_fim: snapshot.periodoFim,
    ciclo_codigo: snapshot.cicloCodigo,
    estado_publicacao: snapshot.estadoPublicacao,
    score_exibivel: snapshot.scoreExibivel,
    ranking_habilitado: snapshot.rankingHabilitado,
    config_versao: snapshot.configVersao,
    revisao: snapshot.revisao,
    score: snapshot.score,
    cobertura: snapshot.cobertura,
    classificacao: snapshot.classificacao,
    estado: snapshot.estado,
    snapshot_publicavel: snapshot.snapshotPublicavel,
    publicado: snapshot.publicado,
    motivo_bloqueio: snapshot.motivoBloqueio,
    regra_versao_snapshot: snapshot.regraVersaoSnapshot,
    metricas: Array.from(snapshot.metrics.values()).map(serializeMetricForAi),
  };
}
