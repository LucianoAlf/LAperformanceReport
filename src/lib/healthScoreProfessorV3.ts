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

export type HealthScoreV3Modalidade = 'individual' | 'turma';

export type HealthScoreV3SegmentGoalState = 'configurada' | 'nao_ofertada';

interface HealthScoreV3SegmentGoalBase {
  id: string | null;
  configId: string | null;
  unidadeId: string;
  unidadeNome: string | null;
  cursoId: number;
  cursoNome: string | null;
  modalidade: HealthScoreV3Modalidade;
  parametros: Record<string, unknown>;
  criadoEm: string | null;
  atualizadoEm: string | null;
}

export type HealthScoreV3SegmentGoal = HealthScoreV3SegmentGoalBase & (
  | {
      estado: 'configurada';
      capacidadeMaxima: number;
      metaMediaTurma: number;
      metaCarteiraCurso: number;
    }
  | {
      estado: 'nao_ofertada';
      capacidadeMaxima: null;
      metaMediaTurma: null;
      metaCarteiraCurso: null;
    }
);

export interface HealthScoreV3AssignmentSummary {
  atribuicaoId: string | null;
  professorId: number | null;
  professorNome: string | null;
  unidadeId: string | null;
  unidadeNome: string | null;
  cursoId: number | null;
  cursoNome: string | null;
  modalidade: HealthScoreV3Modalidade | null;
  estado: string | null;
  professoresAfetados: number | null;
  metaCarteiraCurso: number | null;
  evidencias: Record<string, unknown>;
}

export interface HealthScoreV3ConfigPendencias {
  segmentosObservadosSemRegra: HealthScoreV3AssignmentSummary[];
  atribuicoesSemRegra: HealthScoreV3AssignmentSummary[];
  atribuicoesZeroCarteira: HealthScoreV3AssignmentSummary[];
  divergenciasModalidade: HealthScoreV3AssignmentSummary[];
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
  metasSegmentadas: HealthScoreV3SegmentGoal[];
}

export interface HealthScoreV3ConfigUi {
  ativa: HealthScoreV3Config | null;
  rascunho: HealthScoreV3Config | null;
  pendencias: HealthScoreV3ConfigPendencias;
  modo: 'homologacao';
  publicacaoProdutiva: false;
}

export interface HealthScoreV3SimulationCapacityAlertDetail {
  turmaChave: string | null;
  cursoId: number;
  modalidade: HealthScoreV3Modalidade;
  ocupacoesUnicas: number;
  capacidadeMaxima: number;
  competencia: string;
}

export interface HealthScoreV3SimulationCapacityAlert {
  professorId: number | null;
  unidadeId: string;
  cursoId: number;
  cursoNome: string | null;
  modalidade: HealthScoreV3Modalidade;
  alertasCapacidade: HealthScoreV3SimulationCapacityAlertDetail[];
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
  superlotacoes: HealthScoreV3SimulationCapacityAlert[];
  publica: false;
}

export interface HealthScoreV3SnapshotMetric {
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

function asDefensiveNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isMetric(value: unknown): value is HealthMetricKeyV3 {
  return HEALTH_SCORE_V3_METRICS.includes(value as HealthMetricKeyV3);
}

function isModalidade(value: unknown): value is HealthScoreV3Modalidade {
  return value === 'individual' || value === 'turma';
}

function isSegmentGoalState(value: unknown): value is HealthScoreV3SegmentGoalState {
  return value === 'configurada' || value === 'nao_ofertada';
}

function parseAssignmentSummary(value: unknown): HealthScoreV3AssignmentSummary {
  const row = asRecord(value);
  return {
    atribuicaoId: asNullableString(row.atribuicao_id),
    professorId: asDefensiveNullableNumber(row.professor_id),
    professorNome: asNullableString(row.professor_nome),
    unidadeId: asNullableString(row.unidade_id),
    unidadeNome: asNullableString(row.unidade_nome),
    cursoId: asDefensiveNullableNumber(row.curso_id),
    cursoNome: asNullableString(row.curso_nome),
    modalidade: isModalidade(row.modalidade) ? row.modalidade : null,
    estado: asNullableString(row.estado),
    professoresAfetados: asDefensiveNullableNumber(row.professores_afetados),
    metaCarteiraCurso: asDefensiveNullableNumber(row.meta_carteira_curso),
    evidencias: asRecord(row.evidencias),
  };
}

function parseAssignmentSummaries(value: unknown): HealthScoreV3AssignmentSummary[] {
  return Array.isArray(value) ? value.map(parseAssignmentSummary) : [];
}

function parseSimulationCapacityAlerts(
  value: unknown,
): HealthScoreV3SimulationCapacityAlert[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): HealthScoreV3SimulationCapacityAlert[] => {
    const row = asRecord(item);
    const unidadeId = asNullableString(row.unidade_id);
    const cursoId = asDefensiveNullableNumber(row.curso_id);
    if (unidadeId === null || cursoId === null || !isModalidade(row.modalidade)) return [];

    const alertasCapacidade = Array.isArray(row.alertas_capacidade)
      ? row.alertas_capacidade.flatMap((rawAlert): HealthScoreV3SimulationCapacityAlertDetail[] => {
        const alert = asRecord(rawAlert);
        const alertCursoId = asDefensiveNullableNumber(alert.curso_id);
        const competencia = asNullableString(alert.competencia);
        if (
          alertCursoId === null
          || competencia === null
          || !isModalidade(alert.modalidade)
        ) return [];

        return [{
          turmaChave: asNullableString(alert.turma_chave),
          cursoId: alertCursoId,
          modalidade: alert.modalidade,
          ocupacoesUnicas: asNumber(alert.ocupacoes_unicas),
          capacidadeMaxima: asNumber(alert.capacidade_maxima),
          competencia,
        }];
      })
      : [];

    return [{
      professorId: asDefensiveNullableNumber(row.professor_id),
      unidadeId,
      cursoId,
      cursoNome: asNullableString(row.curso_nome),
      modalidade: row.modalidade,
      alertasCapacidade,
    }];
  });
}

interface ParsedSegmentGoals {
  goals: HealthScoreV3SegmentGoal[];
  modalidadesDesconhecidas: HealthScoreV3AssignmentSummary[];
}

function parseSegmentGoals(value: unknown): ParsedSegmentGoals {
  if (!Array.isArray(value)) {
    return { goals: [], modalidadesDesconhecidas: [] };
  }

  const goals: HealthScoreV3SegmentGoal[] = [];
  const modalidadesDesconhecidas: HealthScoreV3AssignmentSummary[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = asRecord(item);
    if (!isModalidade(row.modalidade)) {
      modalidadesDesconhecidas.push(parseAssignmentSummary(row));
      continue;
    }
    if (!isSegmentGoalState(row.estado)) continue;

    const unidadeId = asNullableString(row.unidade_id);
    const cursoId = asDefensiveNullableNumber(row.curso_id);
    if (unidadeId === null || cursoId === null) continue;

    const base = {
      id: asNullableString(row.id),
      configId: asNullableString(row.config_id),
      unidadeId,
      unidadeNome: asNullableString(row.unidade_nome),
      cursoId,
      cursoNome: asNullableString(row.curso_nome),
      modalidade: row.modalidade,
      parametros: asRecord(row.parametros),
      criadoEm: asNullableString(row.criado_em),
      atualizadoEm: asNullableString(row.atualizado_em),
    };

    if (row.estado === 'configurada') {
      const capacidadeMaxima = asDefensiveNullableNumber(row.capacidade_maxima);
      const metaMediaTurma = asDefensiveNullableNumber(row.meta_media_turma);
      const metaCarteiraCurso = asDefensiveNullableNumber(row.meta_carteira_curso);
      if (
        capacidadeMaxima === null
        || metaMediaTurma === null
        || metaCarteiraCurso === null
      ) continue;

      goals.push({
        ...base,
        estado: 'configurada',
        capacidadeMaxima,
        metaMediaTurma,
        metaCarteiraCurso,
      });
      continue;
    }

    if (
      row.capacidade_maxima !== null
      || row.meta_media_turma !== null
      || row.meta_carteira_curso !== null
    ) continue;

    goals.push({
      ...base,
      estado: 'nao_ofertada',
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
    });
  }

  return { goals, modalidadesDesconhecidas };
}

export function parseHealthScoreV3SegmentGoals(value: unknown): HealthScoreV3SegmentGoal[] {
  return parseSegmentGoals(value).goals;
}

interface ParsedConfig {
  config: HealthScoreV3Config | null;
  modalidadesDesconhecidas: HealthScoreV3AssignmentSummary[];
}

function parseConfig(value: unknown): ParsedConfig {
  if (!value) return { config: null, modalidadesDesconhecidas: [] };
  const row = asRecord(value);
  if (typeof row.id !== 'string') {
    return { config: null, modalidadesDesconhecidas: [] };
  }

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
  const segmentGoals = parseSegmentGoals(row.metas_segmentadas);

  return {
    config: {
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
      metasSegmentadas: segmentGoals.goals,
    },
    modalidadesDesconhecidas: segmentGoals.modalidadesDesconhecidas,
  };
}

export function parseHealthScoreV3Config(value: unknown): HealthScoreV3Config | null {
  return parseConfig(value).config;
}

export function parseHealthScoreV3ConfigUi(value: unknown): HealthScoreV3ConfigUi {
  const row = asRecord(value);
  const ativa = parseConfig(row.ativa);
  const rascunho = parseConfig(row.rascunho);
  const pendencias = asRecord(row.pendencias);
  return {
    ativa: ativa.config,
    rascunho: rascunho.config,
    pendencias: {
      segmentosObservadosSemRegra: parseAssignmentSummaries(
        pendencias.segmentos_observados_sem_regra,
      ),
      atribuicoesSemRegra: parseAssignmentSummaries(pendencias.atribuicoes_sem_regra),
      atribuicoesZeroCarteira: parseAssignmentSummaries(
        pendencias.atribuicoes_zero_carteira,
      ),
      divergenciasModalidade: [
        ...parseAssignmentSummaries(pendencias.divergencias_modalidade),
        ...ativa.modalidadesDesconhecidas,
        ...rascunho.modalidadesDesconhecidas,
      ],
    },
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
    superlotacoes: parseSimulationCapacityAlerts(row.superlotacao),
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

export function serializeHealthScoreV3SegmentGoals(goals: HealthScoreV3SegmentGoal[]) {
  return goals.map((goal) => ({
    unidade_id: goal.unidadeId,
    curso_id: goal.cursoId,
    modalidade: goal.modalidade,
    estado: goal.estado,
    capacidade_maxima: goal.capacidadeMaxima,
    meta_media_turma: goal.metaMediaTurma,
    meta_carteira_curso: goal.metaCarteiraCurso,
    parametros: asRecord(goal.parametros),
  }));
}
