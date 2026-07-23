import type {
  HealthMetricKeyV3,
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
  contribuicao: number | null;
  meta: number | null;
  amostra: number | null;
  estadoBase: string;
  metricaPublicavel: boolean;
  confianca: string | null;
  fonte: string;
  regraVersaoMetrica: string;
  motivoSemBase: string | null;
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

    snapshot.metrics.set(metrica, {
      metrica,
      valorBruto: asNullableNumber(row.valor_bruto),
      numerador: asNullableNumber(row.numerador),
      denominador: asNullableNumber(row.denominador),
      nota: asNullableNumber(row.nota),
      peso: asNumber(row.peso),
      pesoDisponivel: row.peso_disponivel === true,
      contribuicao: asNullableNumber(row.contribuicao),
      meta: asNullableNumber(row.meta),
      amostra: asNullableNumber(row.amostra),
      estadoBase: String(row.estado_base || 'sem_base'),
      metricaPublicavel: row.metrica_publicavel === true,
      confianca: row.confianca ? String(row.confianca) : null,
      fonte: String(row.fonte || ''),
      regraVersaoMetrica: String(row.regra_versao_metrica || ''),
      motivoSemBase: row.motivo_sem_base ? String(row.motivo_sem_base) : null,
      detalhes: asRecord(row.detalhes),
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
    contribuicao: number | null;
    meta: number | null;
    amostra: number | null;
    estado_base: string;
    metrica_publicavel: boolean;
    confianca: string | null;
    fonte: string;
    regra_versao_metrica: string;
    motivo_sem_base: string | null;
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
    contribuicao: metric.contribuicao,
    meta: metric.meta,
    amostra: metric.amostra,
    estado_base: metric.estadoBase,
    metrica_publicavel: metric.metricaPublicavel,
    confianca: metric.confianca,
    fonte: metric.fonte,
    regra_versao_metrica: metric.regraVersaoMetrica,
    motivo_sem_base: metric.motivoSemBase,
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
      contribuicao: row.contribuicao,
      meta: row.meta,
      amostra: row.amostra,
      estadoBase: row.estadoBase,
      metricaPublicavel: row.metricaPublicavel,
      confianca: row.confianca,
      fonte: row.fonte,
      regraVersaoMetrica: row.regraVersaoMetrica,
      motivoSemBase: row.motivoSemBase,
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
