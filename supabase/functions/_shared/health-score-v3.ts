export type HealthScoreV3MetricKey =
  | 'retencao'
  | 'permanencia'
  | 'conversao'
  | 'media_turma'
  | 'numero_alunos'
  | 'presenca';

export interface HealthScoreV3MetricPayload {
  metrica: HealthScoreV3MetricKey;
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
}

export interface HealthScoreV3Payload {
  versao_contrato: 'health_score_professor_v3';
  professor_id: number;
  unidade_id: string | null;
  escopo: string;
  competencia: string;
  periodicidade: 'mensal' | 'ciclo' | 'legado_calendario';
  periodo_inicio: string;
  periodo_fim: string;
  ciclo_codigo: string;
  estado_publicacao: 'parcial' | 'oficial' | 'sem_base';
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
  metricas: HealthScoreV3MetricPayload[];
}

const METRIC_KEYS = new Set<HealthScoreV3MetricKey>([
  'retencao',
  'permanencia',
  'conversao',
  'media_turma',
  'numero_alunos',
  'presenca',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseHealthScoreV3Payload(value: unknown): HealthScoreV3Payload | null {
  if (!isObject(value) || value.versao_contrato !== 'health_score_professor_v3') return null;
  if (!Array.isArray(value.metricas)) return null;

  const metricas = value.metricas.filter((metric): metric is HealthScoreV3MetricPayload => {
    if (!isObject(metric)) return false;
    return METRIC_KEYS.has(String(metric.metrica) as HealthScoreV3MetricKey);
  });

  return { ...value, metricas } as unknown as HealthScoreV3Payload;
}

export function getHealthScoreV3Metric(
  snapshot: HealthScoreV3Payload | null,
  key: HealthScoreV3MetricKey,
): HealthScoreV3MetricPayload | null {
  return snapshot?.metricas.find((metric) => metric.metrica === key) || null;
}

export function isHealthScoreV3Visible(snapshot: HealthScoreV3Payload | null): boolean {
  return Boolean(snapshot?.score_exibivel && snapshot.score !== null);
}

export function isHealthScoreV3OfficialRankable(snapshot: HealthScoreV3Payload | null): boolean {
  return Boolean(
    snapshot
      && snapshot.estado_publicacao === 'oficial'
      && snapshot.ranking_habilitado
      && snapshot.snapshot_publicavel
      && snapshot.score !== null,
  );
}

export function formatHealthScoreV3MetricValue(metric: HealthScoreV3MetricPayload | null): string {
  if (!metric || metric.valor_bruto === null) return 'Sem base';
  if (['retencao', 'conversao', 'presenca'].includes(metric.metrica)) {
    return `${metric.valor_bruto.toFixed(1)}%`;
  }
  if (metric.metrica === 'permanencia') return `${metric.valor_bruto.toFixed(1)} meses`;
  if (metric.metrica === 'media_turma') return metric.valor_bruto.toFixed(2);
  return Math.round(metric.valor_bruto).toString();
}

export function healthScoreV3PublicationLabel(snapshot: HealthScoreV3Payload | null): string {
  if (!snapshot) return 'Sem snapshot V3';
  if (snapshot.estado_publicacao === 'oficial') return 'Oficial';
  if (snapshot.estado_publicacao === 'parcial') return 'Parcial';
  return 'Sem base';
}
