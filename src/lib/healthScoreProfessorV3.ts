export const HEALTH_SCORE_V3_METRICS = [
  'retencao',
  'permanencia',
  'conversao',
  'media_turma',
  'numero_alunos',
  'presenca',
] as const;

export type HealthMetricKeyV3 = (typeof HEALTH_SCORE_V3_METRICS)[number];

export type HealthScoreV3MetaStatus =
  | 'aprovada'
  | 'rascunho'
  | 'em_calibracao'
  | 'aguardando_dados_reais'
  | 'bloqueada_ate_inicio';

export interface HealthScoreV3MetricConfig {
  metrica: HealthMetricKeyV3;
  peso: number;
  meta: number | null;
  metaStatus: HealthScoreV3MetaStatus;
  amostraMinima: number | null;
  coberturaMinima: number | null;
  parametros: Record<string, unknown>;
}

export interface HealthScoreV3Config {
  id: string;
  versao: number;
  status: 'rascunho' | 'ativa' | 'arquivada';
  vigenciaInicio: string;
  vigenciaFim: string | null;
  coberturaMinima: number;
  faixaAtencaoMin: number;
  faixaSaudavelMin: number;
  exigePilarFidelizacao: boolean;
  justificativa: string;
  criadoEm: string;
  ativadoEm: string | null;
  metricas: HealthScoreV3MetricConfig[];
}

export interface HealthScoreV3ConfigUi {
  ativa: HealthScoreV3Config | null;
  rascunho: HealthScoreV3Config | null;
  modo: 'homologacao';
  publicacaoProdutiva: false;
}

export interface HealthScoreV3Simulation {
  configId: string;
  configVersao: number;
  competencia: string;
  total: number;
  saudaveis: number;
  atencao: number;
  criticos: number;
  semBase: number;
  scoreMedio: number | null;
  publica: false;
}

export interface HealthScoreV3SnapshotMetric {
  professorId: number;
  unidadeId: string | null;
  escopo: string;
  competencia: string;
  trimestreInicio: string;
  configVersao: number;
  score: number | null;
  cobertura: number | null;
  classificacao: string | null;
  estado: string;
  snapshotPublicavel: boolean;
  publicado: boolean;
  motivoBloqueio: string | null;
  regraVersaoSnapshot: string;
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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMetric(value: unknown): value is HealthMetricKeyV3 {
  return HEALTH_SCORE_V3_METRICS.includes(value as HealthMetricKeyV3);
}

export function parseHealthScoreV3Config(value: unknown): HealthScoreV3Config | null {
  if (!value) return null;
  const row = asRecord(value);
  if (typeof row.id !== 'string') return null;

  const metricas = Array.isArray(row.metricas)
    ? row.metricas.flatMap((item): HealthScoreV3MetricConfig[] => {
        const metric = asRecord(item);
        if (!isMetric(metric.metrica)) return [];
        return [{
          metrica: metric.metrica,
          peso: asNumber(metric.peso),
          meta: asNullableNumber(metric.meta),
          metaStatus: (metric.meta_status || 'rascunho') as HealthScoreV3MetaStatus,
          amostraMinima: asNullableNumber(metric.amostra_minima),
          coberturaMinima: asNullableNumber(metric.cobertura_minima),
          parametros: asRecord(metric.parametros),
        }];
      })
    : [];

  return {
    id: row.id,
    versao: asNumber(row.versao),
    status: (row.status || 'rascunho') as HealthScoreV3Config['status'],
    vigenciaInicio: String(row.vigencia_inicio || ''),
    vigenciaFim: row.vigencia_fim ? String(row.vigencia_fim) : null,
    coberturaMinima: asNumber(row.cobertura_minima),
    faixaAtencaoMin: asNumber(row.faixa_atencao_min),
    faixaSaudavelMin: asNumber(row.faixa_saudavel_min),
    exigePilarFidelizacao: Boolean(row.exige_pilar_fidelizacao),
    justificativa: String(row.justificativa || ''),
    criadoEm: String(row.criado_em || ''),
    ativadoEm: row.ativado_em ? String(row.ativado_em) : null,
    metricas,
  };
}

export function parseHealthScoreV3ConfigUi(value: unknown): HealthScoreV3ConfigUi {
  const row = asRecord(value);
  return {
    ativa: parseHealthScoreV3Config(row.ativa),
    rascunho: parseHealthScoreV3Config(row.rascunho),
    modo: 'homologacao',
    publicacaoProdutiva: false,
  };
}

export function parseHealthScoreV3Simulation(value: unknown): HealthScoreV3Simulation {
  const row = asRecord(value);
  return {
    configId: String(row.config_id || ''),
    configVersao: asNumber(row.config_versao),
    competencia: String(row.competencia || ''),
    total: asNumber(row.total),
    saudaveis: asNumber(row.saudaveis),
    atencao: asNumber(row.atencao),
    criticos: asNumber(row.criticos),
    semBase: asNumber(row.sem_base),
    scoreMedio: asNullableNumber(row.score_medio),
    publica: false,
  };
}

export function serializeHealthScoreV3Metrics(metricas: HealthScoreV3MetricConfig[]) {
  return metricas.map((metric) => ({
    metrica: metric.metrica,
    peso: metric.peso,
    meta: metric.meta,
    meta_status: metric.meta === null ? metric.metaStatus : 'aprovada',
  }));
}
