import type { HealthMetricKeyV3 } from './healthScoreProfessorV3';

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
    .flatMap((snapshot) => {
      const display = resolveHealthScoreV3MetricDisplay(snapshot, metricKey);
      return display.rankable && display.value !== null
        ? [{ professorId: snapshot.professorId, value: display.value }]
        : [];
    })
    .sort((a, b) => b.value - a.value || a.professorId - b.professorId);
}

export function isHealthScoreV3SnapshotRankable(
  snapshot: HealthScoreV3ProfessorPerformance,
): boolean {
  return snapshot.snapshotPublicavel && snapshot.score !== null;
}
