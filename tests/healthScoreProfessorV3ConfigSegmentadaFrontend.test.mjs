import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typesPath = path.join(repoRoot, 'src/lib/healthScoreProfessorV3.ts');
const hookPath = path.join(repoRoot, 'src/hooks/useHealthScoreProfessorV3Config.ts');

const read = (filePath) => fs.readFileSync(filePath, 'utf8');

async function loadHealthScoreModule() {
  const javascript = ts.transpileModule(read(typesPath), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

function createReactHarness() {
  return {
    useCallback: (callback) => callback,
    useEffect: () => undefined,
    useState: (initialValue) => {
      let currentValue = typeof initialValue === 'function' ? initialValue() : initialValue;
      const setValue = (nextValue) => {
        currentValue = typeof nextValue === 'function'
          ? nextValue(currentValue)
          : nextValue;
      };
      return [currentValue, setValue];
    },
  };
}

async function loadHealthScoreHook(supabase) {
  const healthScore = await loadHealthScoreModule();
  const harnessKey = `__healthScoreV3HookHarness_${randomUUID().replaceAll('-', '')}`;
  globalThis[harnessKey] = {
    ...createReactHarness(),
    supabase,
    parseHealthScoreV3Config: healthScore.parseHealthScoreV3Config,
    parseHealthScoreV3ConfigUi: healthScore.parseHealthScoreV3ConfigUi,
    parseHealthScoreV3Simulation: healthScore.parseHealthScoreV3Simulation,
    serializeHealthScoreV3Metrics: healthScore.serializeHealthScoreV3Metrics,
    serializeHealthScoreV3SegmentGoals: healthScore.serializeHealthScoreV3SegmentGoals,
  };

  const source = read(hookPath).replace(/\r\n/g, '\n')
    .replace("import { useCallback, useEffect, useState } from 'react';\n", '')
    .replace("import { supabase } from '@/lib/supabase';\n", '')
    .replace(
      /import \{[\s\S]*?\} from '@\/lib\/healthScoreProfessorV3';\n/,
      '',
    );
  assert.doesNotMatch(source, /^import /m, 'harness deve substituir todos os imports do hook');

  const injectedSource = `
const {
  useCallback,
  useEffect,
  useState,
  supabase,
  parseHealthScoreV3Config,
  parseHealthScoreV3ConfigUi,
  parseHealthScoreV3Simulation,
  serializeHealthScoreV3Metrics,
  serializeHealthScoreV3SegmentGoals,
} = globalThis[${JSON.stringify(harnessKey)}];
${source}
`;
  const javascript = ts.transpileModule(injectedSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  try {
    const hookModule = await import(
      `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
    );
    return {
      healthScore,
      hookModule,
      cleanup: () => { delete globalThis[harnessKey]; },
    };
  } catch (error) {
    delete globalThis[harnessKey];
    throw error;
  }
}

function compileTypeFixture(source) {
  const virtualPath = path.join(
    repoRoot,
    'tests',
    '__healthScoreProfessorV3ConfigSegmentadaTypes__.ts',
  );
  const normalizedVirtualPath = path.normalize(virtualPath).toLowerCase();
  const options = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const isVirtual = (fileName) => (
    path.normalize(fileName).toLowerCase() === normalizedVirtualPath
  );

  host.fileExists = (fileName) => isVirtual(fileName) || originalFileExists(fileName);
  host.readFile = (fileName) => (isVirtual(fileName) ? source : originalReadFile(fileName));
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => (
    isVirtual(fileName)
      ? ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
  );

  const program = ts.createProgram([virtualPath], options, host);
  return ts.getPreEmitDiagnostics(program);
}

function formatDiagnostics(diagnostics) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => '\n',
  };
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
}

function rawDraftConfig() {
  const metricas = [
    ['retencao', 20, 80],
    ['permanencia', 15, 18],
    ['conversao', 20, 70],
    ['media_turma', 15, null],
    ['numero_alunos', 15, null],
    ['presenca', 15, 85],
  ].map(([metrica, peso, meta]) => ({
    metrica,
    peso,
    meta,
    meta_status: 'aprovada',
    amostra_minima: null,
    cobertura_minima: null,
    parametros: {},
  }));

  return {
    id: 'config-rascunho',
    versao: 2,
    status: 'rascunho',
    vigencia_inicio: '2026-08-01',
    vigencia_fim: null,
    cobertura_minima: 0.6,
    faixa_atencao_min: 60,
    faixa_saudavel_min: 80,
    exige_pilar_fidelizacao: true,
    justificativa: 'Calibracao segmentada por curso',
    criado_em: '2026-07-20T12:00:00Z',
    ativado_em: null,
    metricas,
    metas_segmentadas: [
      {
        id: 'goal-1',
        config_id: 'config-rascunho',
        unidade_id: 'unidade-1',
        unidade_nome: 'Barra',
        curso_id: 42,
        curso_nome: 'Piano',
        modalidade: 'turma',
        estado: 'configurada',
        capacidade_maxima: 8,
        meta_media_turma: 4,
        meta_carteira_curso: 20,
        parametros: { fonte: 'manual' },
        criado_em: '2026-07-20T12:00:00Z',
        atualizado_em: '2026-07-20T12:00:00Z',
      },
    ],
  };
}

test('declara o contrato frontend das metas segmentadas', () => {
  const source = read(typesPath);

  assert.match(
    source,
    /export type HealthScoreV3Modalidade\s*=\s*'individual'\s*\|\s*'turma'/,
  );
  assert.match(
    source,
    /export type HealthScoreV3SegmentGoalState\s*=\s*'configurada'\s*\|\s*'nao_ofertada'/,
  );
  assert.match(source, /export interface HealthScoreV3SegmentGoal\s*{/);
  assert.match(source, /export interface HealthScoreV3AssignmentSummary\s*{/);
  assert.match(
    source,
    /export interface HealthScoreV3Config\s*{[\s\S]*metasSegmentadas:\s*HealthScoreV3SegmentGoal\[\]/,
  );
  assert.match(
    source,
    /export interface HealthScoreV3ConfigUi\s*{[\s\S]*pendencias:/,
  );
});

test('parser preserva null e nao converte numero invalido em zero', async () => {
  const { parseHealthScoreV3SegmentGoals } = await loadHealthScoreModule();
  const goals = parseHealthScoreV3SegmentGoals([
    {
      id: 'goal-1',
      config_id: 'config-1',
      unidade_id: 'unidade-1',
      unidade_nome: 'Barra',
      curso_id: '42',
      curso_nome: 'Piano',
      modalidade: 'turma',
      estado: 'configurada',
      capacidade_maxima: '8',
      meta_media_turma: null,
      meta_carteira_curso: 'numero-invalido',
      parametros: { fonte: 'manual' },
      criado_em: '2026-07-19T20:40:00Z',
      atualizado_em: null,
    },
    {
      id: 'goal-2',
      config_id: 'config-1',
      unidade_id: 'unidade-1',
      unidade_nome: 'Barra',
      curso_id: 42,
      curso_nome: 'Piano',
      modalidade: 'hibrida',
      estado: 'configurada',
      capacidade_maxima: 8,
      meta_media_turma: 4,
      meta_carteira_curso: 20,
      parametros: {},
    },
  ]);

  assert.deepEqual(goals, [
    {
      id: 'goal-1',
      configId: 'config-1',
      unidadeId: 'unidade-1',
      unidadeNome: 'Barra',
      cursoId: 42,
      cursoNome: 'Piano',
      modalidade: 'turma',
      estado: 'configurada',
      capacidadeMaxima: 8,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
      parametros: { fonte: 'manual' },
      criadoEm: '2026-07-19T20:40:00Z',
      atualizadoEm: null,
    },
  ]);
});

test('serializador envia exatamente os oito campos de negocio', async () => {
  const { serializeHealthScoreV3SegmentGoals } = await loadHealthScoreModule();
  const serialized = serializeHealthScoreV3SegmentGoals([
    {
      id: 'goal-1',
      configId: 'config-1',
      unidadeId: 'unidade-1',
      unidadeNome: 'Barra',
      cursoId: 42,
      cursoNome: 'Piano',
      modalidade: 'individual',
      estado: 'nao_ofertada',
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
      parametros: { fonte: 'manual' },
      criadoEm: '2026-07-19T20:40:00Z',
      atualizadoEm: '2026-07-19T20:45:00Z',
    },
  ]);

  assert.deepEqual(Object.keys(serialized[0]), [
    'unidade_id',
    'curso_id',
    'modalidade',
    'estado',
    'capacidade_maxima',
    'meta_media_turma',
    'meta_carteira_curso',
    'parametros',
  ]);
  assert.deepEqual(serialized[0], {
    unidade_id: 'unidade-1',
    curso_id: 42,
    modalidade: 'individual',
    estado: 'nao_ofertada',
    capacidade_maxima: null,
    meta_media_turma: null,
    meta_carteira_curso: null,
    parametros: { fonte: 'manual' },
  });
});

test('config antiga parseia sem matriz e modalidade descartada vira pendencia', async () => {
  const {
    parseHealthScoreV3Config,
    parseHealthScoreV3ConfigUi,
  } = await loadHealthScoreModule();
  const legacyConfig = {
    id: 'config-legada',
    versao: 1,
    status: 'ativa',
    metricas: [],
  };

  assert.deepEqual(parseHealthScoreV3Config(legacyConfig)?.metasSegmentadas, []);

  const parsed = parseHealthScoreV3ConfigUi({
    ativa: legacyConfig,
    rascunho: {
      ...legacyConfig,
      id: 'config-rascunho',
      status: 'rascunho',
      metas_segmentadas: [
        {
          unidade_id: 'unidade-1',
          curso_id: 42,
          modalidade: 'desconhecida',
          estado: 'configurada',
        },
      ],
    },
    pendencias: {
      segmentos_observados_sem_regra: [
        {
          unidade_id: 'unidade-1',
          curso_id: 42,
          curso_nome: 'Piano',
          modalidade: 'turma',
          professores_afetados: '3',
        },
      ],
      atribuicoes_sem_regra: [],
      atribuicoes_zero_carteira: [],
      divergencias_modalidade: [],
    },
  });

  assert.deepEqual(parsed.rascunho?.metasSegmentadas, []);
  assert.equal(parsed.pendencias.divergenciasModalidade.length, 1);
  assert.equal(
    parsed.pendencias.segmentosObservadosSemRegra[0].professoresAfetados,
    3,
  );
  assert.equal(
    parsed.pendencias.segmentosObservadosSemRegra[0].cursoNome,
    'Piano',
  );
});

test('TypeScript aceita shapes validos e rejeita modalidade estado e campos obrigatorios', () => {
  const fixture = `
import type {
  HealthScoreV3AssignmentSummary,
  HealthScoreV3Config,
  HealthScoreV3ConfigUi,
  HealthScoreV3SegmentGoal,
} from '../src/lib/healthScoreProfessorV3';

const validGoal: HealthScoreV3SegmentGoal = {
  id: null,
  configId: 'config-1',
  unidadeId: 'unidade-1',
  unidadeNome: 'Barra',
  cursoId: 42,
  cursoNome: 'Piano',
  modalidade: 'individual',
  estado: 'configurada',
  capacidadeMaxima: 8,
  metaMediaTurma: 4,
  metaCarteiraCurso: 20,
  parametros: {},
  criadoEm: null,
  atualizadoEm: null,
};

const validAssignment: HealthScoreV3AssignmentSummary = {
  atribuicaoId: null,
  professorId: 7,
  professorNome: 'Professor',
  unidadeId: 'unidade-1',
  unidadeNome: 'Barra',
  cursoId: 42,
  cursoNome: 'Piano',
  modalidade: 'turma',
  estado: 'modalidade_nao_resolvida',
  professoresAfetados: 1,
  metaCarteiraCurso: null,
  evidencias: {},
};

const validConfig: HealthScoreV3Config = {
  id: 'config-1',
  versao: 1,
  status: 'rascunho',
  vigenciaInicio: '2026-08-01',
  vigenciaFim: null,
  coberturaMinima: 0.6,
  faixaAtencaoMin: 60,
  faixaSaudavelMin: 80,
  exigePilarFidelizacao: true,
  justificativa: 'Teste compilado',
  criadoEm: '2026-07-20T12:00:00Z',
  ativadoEm: null,
  metricas: [],
  metasSegmentadas: [validGoal],
};

const validUi: HealthScoreV3ConfigUi = {
  ativa: null,
  rascunho: validConfig,
  pendencias: {
    segmentosObservadosSemRegra: [],
    atribuicoesSemRegra: [validAssignment],
    atribuicoesZeroCarteira: [],
    divergenciasModalidade: [],
  },
  modo: 'homologacao',
  publicacaoProdutiva: false,
};

// @ts-expect-error modalidade deve ser individual ou turma
const invalidModalidade: HealthScoreV3SegmentGoal = { ...validGoal, modalidade: 'hibrida' };
// @ts-expect-error estado deve ser configurada ou nao_ofertada
const invalidEstado: HealthScoreV3SegmentGoal = { ...validGoal, estado: 'pendente' };

const { unidadeId: _unidadeId, ...goalSemUnidade } = validGoal;
// @ts-expect-error unidadeId e obrigatorio
const invalidSemUnidade: HealthScoreV3SegmentGoal = goalSemUnidade;
const { parametros: _parametros, ...goalSemParametros } = validGoal;
// @ts-expect-error parametros e obrigatorio
const invalidSemParametros: HealthScoreV3SegmentGoal = goalSemParametros;
const { metasSegmentadas: _metasSegmentadas, ...configSemMetas } = validConfig;
// @ts-expect-error metasSegmentadas e obrigatorio
const invalidConfig: HealthScoreV3Config = configSemMetas;
const { pendencias: _pendencias, ...uiSemPendencias } = validUi;
// @ts-expect-error pendencias e obrigatorio
const invalidUi: HealthScoreV3ConfigUi = uiSemPendencias;

void [
  validUi,
  invalidModalidade,
  invalidEstado,
  invalidSemUnidade,
  invalidSemParametros,
  invalidConfig,
  invalidUi,
];
`;
  const diagnostics = compileTypeFixture(fixture);
  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    [],
    formatDiagnostics(diagnostics),
  );

  const fixtureSemSupressoes = fixture.replace(
    /^\/\/ @ts-expect-error[^\n]*\n/gm,
    '',
  );
  const controlledRed = compileTypeFixture(fixtureSemSupressoes);
  assert.equal(controlledRed.length, 6, formatDiagnostics(controlledRed));
  assert.ok(controlledRed.some(({ code }) => code === 2322));
  assert.ok(controlledRed.some(({ code }) => code === 2741));
});

test('saveDraft e simulate executam payloads RPC sem ativacao automatica', async () => {
  const calls = [];
  const rawConfig = rawDraftConfig();
  const simulationResponse = {
    config_id: 'config-rascunho',
    config_versao: 2,
    competencia: '2026-08-01',
    total: 10,
    saudaveis: 4,
    atencao: 3,
    criticos: 2,
    sem_base: 1,
    score_medio: 78.5,
  };
  const supabase = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === 'salvar_health_score_professor_v3_config_rascunho') {
        return { data: rawConfig, error: null };
      }
      if (name === 'simular_health_score_professor_v3_config') {
        return { data: simulationResponse, error: null };
      }
      throw new Error(`RPC inesperada no harness: ${name}`);
    },
  };
  const {
    cleanup,
    healthScore,
    hookModule,
  } = await loadHealthScoreHook(supabase);

  try {
    const draft = healthScore.parseHealthScoreV3Config(rawConfig);
    assert.ok(draft, 'fixture deve produzir um rascunho valido');
    const hook = hookModule.useHealthScoreProfessorV3Config();

    const saved = await hook.saveDraft(draft);
    const simulation = await hook.simulate(draft.id, '2026-08-01');

    assert.equal(saved.id, draft.id);
    assert.equal(simulation.scoreMedio, 78.5);
    assert.deepEqual(calls.map(({ name }) => name), [
      'salvar_health_score_professor_v3_config_rascunho',
      'simular_health_score_professor_v3_config',
    ]);

    const savePayload = calls[0].payload;
    assert.deepEqual(Object.keys(savePayload).sort(), [
      'p_config_id',
      'p_justificativa',
      'p_metas_segmentadas',
      'p_metricas',
      'p_vigencia_inicio',
    ]);
    assert.deepEqual(savePayload.p_metricas, [
      { metrica: 'retencao', peso: 20, meta: 80, meta_status: 'aprovada' },
      { metrica: 'permanencia', peso: 15, meta: 18, meta_status: 'aprovada' },
      { metrica: 'conversao', peso: 20, meta: 70, meta_status: 'aprovada' },
      { metrica: 'media_turma', peso: 15, meta: null, meta_status: 'aprovada' },
      { metrica: 'numero_alunos', peso: 15, meta: null, meta_status: 'aprovada' },
      { metrica: 'presenca', peso: 15, meta: 85, meta_status: 'aprovada' },
    ]);
    assert.deepEqual(savePayload.p_metas_segmentadas, [
      {
        unidade_id: 'unidade-1',
        curso_id: 42,
        modalidade: 'turma',
        estado: 'configurada',
        capacidade_maxima: 8,
        meta_media_turma: 4,
        meta_carteira_curso: 20,
        parametros: { fonte: 'manual' },
      },
    ]);
    assert.deepEqual(calls[1].payload, {
      p_config_id: 'config-rascunho',
      p_competencia: '2026-08-01',
    });
    assert.equal(
      calls.some(({ name }) => name === 'ativar_health_score_professor_v3_config'),
      false,
    );
  } finally {
    cleanup();
  }
});

test('hook expoe refresh com alias reload e salva os dois payloads somente por RPC', () => {
  const source = read(hookPath);

  for (const operation of ['refresh', 'createDraft', 'saveDraft', 'simulate', 'activate']) {
    assert.match(source, new RegExp(`${operation}:`));
  }
  assert.match(source, /reload:\s*refresh/);
  assert.match(
    source,
    /p_metricas:\s*serializeHealthScoreV3Metrics\(draft\.metricas\)/,
  );
  assert.match(
    source,
    /p_metas_segmentadas:\s*serializeHealthScoreV3SegmentGoals\(draft\.metasSegmentadas\)/,
  );

  for (const rpc of [
    'get_health_score_professor_v3_config_ui',
    'criar_health_score_professor_v3_config_rascunho',
    'salvar_health_score_professor_v3_config_rascunho',
    'simular_health_score_professor_v3_config',
    'ativar_health_score_professor_v3_config',
  ]) {
    assert.match(source, new RegExp(`rpc\\(\\s*['"]${rpc}['"]`));
  }

  assert.doesNotMatch(source, /\.from\(['"]health_score_professor_v3_/i);
  assert.doesNotMatch(source, /\.from\(['"]professor_unidade_curso_modalidade['"]\)/i);

  const saveBlock = source.slice(
    source.indexOf('const saveDraft'),
    source.indexOf('const simulate'),
  );
  const simulateBlock = source.slice(
    source.indexOf('const simulate'),
    source.indexOf('const activate'),
  );
  assert.doesNotMatch(saveBlock, /ativar_health_score_professor_v3_config/);
  assert.doesNotMatch(simulateBlock, /ativar_health_score_professor_v3_config/);
});
