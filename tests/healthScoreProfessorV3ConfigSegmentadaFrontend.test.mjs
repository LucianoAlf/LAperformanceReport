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
const configComponentPath = path.join(
  repoRoot,
  'src/components/App/Professores/HealthScoreV3Config.tsx',
);
const segmentedGoalsComponentPath = path.join(
  repoRoot,
  'src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx',
);
const reconciliationHookPath = path.join(
  repoRoot,
  'src/hooks/useProfessorCursoModalidadeReconciliacao.ts',
);
const reconciliationComponentPath = path.join(
  repoRoot,
  'src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx',
);
const pageTabsPath = path.join(repoRoot, 'src/components/ui/page-tabs.tsx');

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

async function loadSegmentedGoalsHelpers() {
  assert.equal(
    fs.existsSync(segmentedGoalsComponentPath),
    true,
    'Task 8 deve criar HealthScoreV3MetasSegmentadas.tsx',
  );
  const source = read(segmentedGoalsComponentPath).replace(/\r\n/g, '\n');
  const componentMarker = 'export function HealthScoreV3MetasSegmentadas';
  const componentStart = source.indexOf(componentMarker);
  assert.notEqual(
    componentStart,
    -1,
    `componente deve exportar ${componentMarker}`,
  );
  const helpersSource = source
    .slice(0, componentStart)
    .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '');
  assert.doesNotMatch(
    helpersSource,
    /^import /m,
    'harness deve isolar helpers puros dos imports React',
  );

  const javascript = ts.transpileModule(helpersSource, {
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
  assert.match(source, /export type HealthScoreV3SegmentGoal\s*=/);
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

test('parser aceita somente identidades e combinacoes de estado validas', async () => {
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
      meta_media_turma: '4',
      meta_carteira_curso: '20',
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
      modalidade: 'individual',
      estado: 'nao_ofertada',
      capacidade_maxima: null,
      meta_media_turma: null,
      meta_carteira_curso: null,
      parametros: {},
    },
    {
      unidade_id: null,
      curso_id: 42,
      modalidade: 'turma',
      estado: 'configurada',
      capacidade_maxima: 8,
      meta_media_turma: 4,
      meta_carteira_curso: 20,
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 'numero-invalido',
      modalidade: 'turma',
      estado: 'configurada',
      capacidade_maxima: 8,
      meta_media_turma: 4,
      meta_carteira_curso: 20,
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 42,
      modalidade: 'turma',
      estado: 'configurada',
      capacidade_maxima: 'numero-invalido',
      meta_media_turma: 4,
      meta_carteira_curso: 20,
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 42,
      modalidade: 'turma',
      estado: 'configurada',
      capacidade_maxima: 8,
      meta_media_turma: null,
      meta_carteira_curso: 20,
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 42,
      modalidade: 'turma',
      estado: 'configurada',
      capacidade_maxima: 8,
      meta_media_turma: 4,
      meta_carteira_curso: 'numero-invalido',
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 42,
      modalidade: 'individual',
      estado: 'nao_ofertada',
      capacidade_maxima: 1,
      meta_media_turma: null,
      meta_carteira_curso: null,
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 42,
      modalidade: 'individual',
      estado: 'nao_ofertada',
      capacidade_maxima: null,
      meta_media_turma: 'numero-invalido',
      meta_carteira_curso: null,
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 42,
      modalidade: 'individual',
      estado: 'nao_ofertada',
      capacidade_maxima: null,
      meta_media_turma: null,
      meta_carteira_curso: 20,
    },
    {
      unidade_id: 'unidade-1',
      curso_id: 42,
      modalidade: 'turma',
      estado: 'pendente',
      capacidade_maxima: 8,
      meta_media_turma: 4,
      meta_carteira_curso: 20,
    },
    {
      id: 'goal-ignorada',
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
      metaMediaTurma: 4,
      metaCarteiraCurso: 20,
      parametros: { fonte: 'manual' },
      criadoEm: '2026-07-19T20:40:00Z',
      atualizadoEm: null,
    },
    {
      id: 'goal-2',
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
      parametros: {},
      criadoEm: null,
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
import { serializeHealthScoreV3SegmentGoals } from '../src/lib/healthScoreProfessorV3';
import type {
  HealthScoreV3AssignmentSummary,
  HealthScoreV3Config,
  HealthScoreV3ConfigUi,
  HealthScoreV3SegmentGoal,
} from '../src/lib/healthScoreProfessorV3';

const validConfigured: HealthScoreV3SegmentGoal = {
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

const validNaoOfertada: HealthScoreV3SegmentGoal = {
  ...validConfigured,
  id: null,
  configId: null,
  estado: 'nao_ofertada',
  capacidadeMaxima: null,
  metaMediaTurma: null,
  metaCarteiraCurso: null,
};

serializeHealthScoreV3SegmentGoals([validConfigured, validNaoOfertada]);

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
  metasSegmentadas: [validConfigured, validNaoOfertada],
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
const invalidModalidade: HealthScoreV3SegmentGoal = { ...validConfigured, modalidade: 'hibrida' };
// @ts-expect-error estado deve ser configurada ou nao_ofertada
const invalidEstado: HealthScoreV3SegmentGoal = { ...validConfigured, estado: 'pendente' };

const { unidadeId: _unidadeId, ...goalSemUnidade } = validConfigured;
// @ts-expect-error unidadeId e obrigatorio
const invalidSemUnidade: HealthScoreV3SegmentGoal = goalSemUnidade;
// @ts-expect-error unidadeId nao pode ser null
const invalidUnidadeNula: HealthScoreV3SegmentGoal = { ...validConfigured, unidadeId: null };
const { cursoId: _cursoId, ...goalSemCurso } = validConfigured;
// @ts-expect-error cursoId e obrigatorio
const invalidSemCurso: HealthScoreV3SegmentGoal = goalSemCurso;
// @ts-expect-error cursoId nao pode ser null
const invalidCursoNulo: HealthScoreV3SegmentGoal = { ...validConfigured, cursoId: null };
const { parametros: _parametros, ...goalSemParametros } = validConfigured;
// @ts-expect-error parametros e obrigatorio
const invalidSemParametros: HealthScoreV3SegmentGoal = goalSemParametros;

// @ts-expect-error configurada exige capacidadeMaxima number
const invalidConfiguradaSemCapacidade: HealthScoreV3SegmentGoal = {
  ...validConfigured,
  capacidadeMaxima: null,
};
// @ts-expect-error configurada exige metaMediaTurma number
const invalidConfiguradaSemMedia: HealthScoreV3SegmentGoal = {
  ...validConfigured,
  metaMediaTurma: null,
};
// @ts-expect-error configurada exige metaCarteiraCurso number
const invalidConfiguradaSemCarteira: HealthScoreV3SegmentGoal = {
  ...validConfigured,
  metaCarteiraCurso: null,
};
// @ts-expect-error nao_ofertada exige capacidadeMaxima null
const invalidNaoOfertadaComCapacidade: HealthScoreV3SegmentGoal = {
  ...validNaoOfertada,
  capacidadeMaxima: 8,
};
// @ts-expect-error nao_ofertada exige metaMediaTurma null
const invalidNaoOfertadaComMedia: HealthScoreV3SegmentGoal = {
  ...validNaoOfertada,
  metaMediaTurma: 4,
};
// @ts-expect-error nao_ofertada exige metaCarteiraCurso null
const invalidNaoOfertadaComCarteira: HealthScoreV3SegmentGoal = {
  ...validNaoOfertada,
  metaCarteiraCurso: 20,
};
// @ts-expect-error serializador aceita somente metas segmentadas validas
serializeHealthScoreV3SegmentGoals([{ ...validNaoOfertada, metaCarteiraCurso: 20 }]);

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
  invalidUnidadeNula,
  invalidSemCurso,
  invalidCursoNulo,
  invalidSemParametros,
  invalidConfiguradaSemCapacidade,
  invalidConfiguradaSemMedia,
  invalidConfiguradaSemCarteira,
  invalidNaoOfertadaComCapacidade,
  invalidNaoOfertadaComMedia,
  invalidNaoOfertadaComCarteira,
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
  const expectedErrors = fixture.match(/^\/\/ @ts-expect-error/gm)?.length ?? 0;
  assert.equal(controlledRed.length, expectedErrors, formatDiagnostics(controlledRed));
  assert.ok(controlledRed.some(({ code }) => code === 2322));
  assert.ok(controlledRed.some(({ code }) => code === 2741));
});

test('saveDraft atualiza a UI canonica antes de simulate sem ativacao automatica', async () => {
  const calls = [];
  const rawConfig = rawDraftConfig();
  const configUiResponse = {
    ativa: null,
    rascunho: rawConfig,
    pendencias: {
      segmentos_observados_sem_regra: [],
      atribuicoes_sem_regra: [],
      atribuicoes_zero_carteira: [],
      divergencias_modalidade: [],
    },
  };
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
      if (name === 'get_health_score_professor_v3_config_ui') {
        return { data: configUiResponse, error: null };
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
      'get_health_score_professor_v3_config_ui',
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
    assert.equal(calls[1].payload, undefined);
    assert.deepEqual(calls[2].payload, {
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

function segmentedMatrixFixture() {
  const barraId = '368d47f5-2d88-4475-bc14-ba084a9a348e';
  const recreioId = '95553e96-971b-4590-a6eb-0201d013c14d';
  const campoGrandeId = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
  const existingGoal = {
    id: 'goal-piano-individual',
    configId: 'config-rascunho',
    unidadeId: barraId,
    unidadeNome: 'Barra',
    cursoId: 10,
    cursoNome: 'Piano',
    modalidade: 'individual',
    estado: 'configurada',
    capacidadeMaxima: 8,
    metaMediaTurma: 4,
    metaCarteiraCurso: 20,
    parametros: { fonte: 'manual' },
    criadoEm: '2026-07-19T12:00:00Z',
    atualizadoEm: '2026-07-20T12:00:00Z',
  };

  return {
    barraId,
    recreioId,
    campoGrandeId,
    existingGoal,
    metas: [existingGoal],
    pendencias: {
      segmentosObservadosSemRegra: [
        {
          unidadeId: barraId,
          unidadeNome: 'Barra',
          cursoId: 10,
          cursoNome: 'Piano',
          modalidade: 'individual',
        },
        {
          unidadeId: barraId,
          unidadeNome: 'Barra',
          cursoId: 10,
          cursoNome: 'Piano',
          modalidade: 'turma',
        },
      ],
      atribuicoesSemRegra: [
        {
          atribuicaoId: 'atribuicao-canto',
          professorId: 7,
          professorNome: 'Ana',
          unidadeId: recreioId,
          unidadeNome: 'Recreio',
          cursoId: 20,
          cursoNome: 'Canto',
          modalidade: 'turma',
        },
        {
          atribuicaoId: 'atribuicao-incompleta',
          professorId: 8,
          professorNome: 'Bruno',
          unidadeId: null,
          unidadeNome: null,
          cursoId: 30,
          cursoNome: 'Violao',
          modalidade: null,
        },
      ],
      atribuicoesZeroCarteira: [
        {
          atribuicaoId: 'atribuicao-bateria-zero',
          professorId: 9,
          professorNome: 'Carla',
          unidadeId: campoGrandeId,
          unidadeNome: 'Campo Grande',
          cursoId: 40,
          cursoNome: 'Bateria',
          modalidade: 'individual',
          metaCarteiraCurso: 12,
        },
      ],
      divergenciasModalidade: [
        {
          professorId: 10,
          professorNome: 'Diego',
          unidadeId: campoGrandeId,
          unidadeNome: 'Campo Grande',
          cursoId: 50,
          cursoNome: 'Guitarra',
          modalidade: 'turma',
          estado: 'conflito_modalidade_jornada_aula',
        },
      ],
    },
  };
}

test('Task 8 separa pesos, metas globais e matriz segmentada no fluxo governado', () => {
  assert.equal(
    fs.existsSync(segmentedGoalsComponentPath),
    true,
    'Task 8 deve criar o componente focado de metas segmentadas',
  );
  const matrixSource = read(segmentedGoalsComponentPath);
  const configSource = read(configComponentPath);

  assert.match(matrixSource, /export function HealthScoreV3MetasSegmentadas/);
  assert.match(matrixSource, /metas:\s*HealthScoreV3SegmentGoal\[\]/);
  assert.match(matrixSource, /pendencias:\s*HealthScoreV3ConfigPendencias/);
  assert.match(matrixSource, /editable:\s*boolean/);
  assert.match(matrixSource, /onMetasChange/);
  assert.match(matrixSource, /from '@\/components\/ui\/tabs'/);
  assert.match(matrixSource, /from '@\/components\/ui\/select'/);
  assert.match(matrixSource, /from '@\/components\/ui\/Tooltip'/);
  assert.match(matrixSource, /overflow-x-auto/);
  assert.match(matrixSource, /aria-invalid/);

  for (const label of [
    'Barra',
    'Recreio',
    'Campo Grande',
    'Curso',
    'Modalidade',
    'Capacidade máxima',
    'Meta média/turma',
    'Meta carteira',
    'Estado',
    'Fonte',
    'Regra ausente',
    'Zero carteira',
    'Superlotação',
    'Divergência de modalidade',
    'Pendências de atribuição',
    'Somente leitura',
  ]) {
    assert.match(matrixSource, new RegExp(label));
  }
  assert.match(matrixSource, /Todos os cursos/);
  assert.match(matrixSource, /Todas as modalidades/);
  assert.match(matrixSource, /Com pendência/);
  assert.doesNotMatch(matrixSource, /Ativar versão/);

  assert.match(configSource, /import \{ HealthScoreV3MetasSegmentadas/);
  assert.match(configSource, /Pesos dos pilares/);
  assert.match(configSource, /Metas globais remanescentes/);
  assert.match(configSource, /Metas por unidade, curso e modalidade/);
  assert.match(configSource, /Simulação/);
  assert.match(configSource, /Segmentada por unidade\/curso\/modalidade/);
  assert.match(
    configSource,
    /metasSegmentadas:\s*config\.metasSegmentadas\.map\([\s\S]*?parametros:\s*\{\s*\.\.\.goal\.parametros\s*\}/,
    'cloneConfig deve clonar a matriz e os parametros de cada meta',
  );
  assert.match(
    configSource,
    /GLOBAL_TARGET_METRICS[\s\S]*?retencao[\s\S]*?permanencia[\s\S]*?conversao[\s\S]*?presenca/,
  );
  const requiredTargetsBlock = configSource.slice(
    configSource.indexOf('const hasRequiredTargets'),
    configSource.indexOf('const canActivate'),
  );
  assert.match(requiredTargetsBlock, /GLOBAL_TARGET_METRICS/);
  assert.doesNotMatch(requiredTargetsBlock, /media_turma|numero_alunos/);

  const simulateBlock = configSource.slice(
    configSource.indexOf('const handleSimulate'),
    configSource.indexOf('const handleActivate'),
  );
  assert.doesNotMatch(simulateBlock, /saveDraft\(/);
  assert.doesNotMatch(simulateBlock, /activate\(/);
  const saveBlock = configSource.slice(
    configSource.indexOf('const handleSave'),
    configSource.indexOf('const handleSimulate'),
  );
  assert.doesNotMatch(saveBlock, /activate\(/);
});

test('matriz visivel e a uniao deduplicada sem cartesiano ou identidades inventadas', async () => {
  const {
    buildHealthScoreV3SegmentMatrix,
    ensureHealthScoreV3DraftSegmentGoals,
  } = await loadSegmentedGoalsHelpers();
  const fixture = segmentedMatrixFixture();

  const matrix = buildHealthScoreV3SegmentMatrix(fixture.metas, fixture.pendencias);
  assert.deepEqual(
    matrix.map(({ goal }) => [
      goal.unidadeNome,
      goal.cursoNome,
      goal.modalidade,
    ]),
    [
      ['Barra', 'Piano', 'individual'],
      ['Barra', 'Piano', 'turma'],
      ['Recreio', 'Canto', 'turma'],
      ['Campo Grande', 'Bateria', 'individual'],
    ],
  );
  assert.equal(matrix.length, 4, 'a uniao nao pode criar produto cartesiano');
  assert.equal(
    matrix.some(({ goal }) => goal.cursoNome === 'Guitarra'),
    false,
    'divergencia de modalidade fica na fila e nao vira meta',
  );
  assert.equal(
    matrix.some(({ goal }) => goal.cursoNome === 'Violao'),
    false,
    'atribuicao sem identidade completa nao vira linha inventada',
  );
  assert.equal(
    matrix.find(({ goal }) => goal.cursoNome === 'Bateria')?.pending.zeroCarteira,
    true,
    'curso formal com carteira zero permanece visivel',
  );

  const draftGoals = ensureHealthScoreV3DraftSegmentGoals(
    fixture.metas,
    fixture.pendencias,
    'config-rascunho',
  );
  assert.equal(draftGoals.length, 4);
  assert.equal(draftGoals[0].metaCarteiraCurso, 20, 'meta existente deve ser preservada');
  for (const goal of draftGoals.slice(1)) {
    assert.equal(goal.estado, 'configurada');
    assert.equal(goal.capacidadeMaxima, 0);
    assert.equal(goal.metaMediaTurma, 0);
    assert.equal(goal.metaCarteiraCurso, 0);
    assert.equal(goal.configId, 'config-rascunho');
  }
});

test('estado nao ofertada limpa metas atomicamente e validacao local explica cada erro', async () => {
  const {
    areHealthScoreV3SegmentGoalsValid,
    getHealthScoreV3SegmentGoalErrors,
    transitionHealthScoreV3SegmentGoalState,
  } = await loadSegmentedGoalsHelpers();
  const { existingGoal } = segmentedMatrixFixture();

  const naoOfertada = transitionHealthScoreV3SegmentGoalState(existingGoal, 'nao_ofertada');
  assert.deepEqual(
    {
      estado: naoOfertada.estado,
      capacidadeMaxima: naoOfertada.capacidadeMaxima,
      metaMediaTurma: naoOfertada.metaMediaTurma,
      metaCarteiraCurso: naoOfertada.metaCarteiraCurso,
    },
    {
      estado: 'nao_ofertada',
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
    },
  );

  const reaberta = transitionHealthScoreV3SegmentGoalState(naoOfertada, 'configurada');
  assert.equal(reaberta.capacidadeMaxima, 0);
  assert.equal(reaberta.metaMediaTurma, 0);
  assert.equal(reaberta.metaCarteiraCurso, 0);
  assert.equal(areHealthScoreV3SegmentGoalsValid([reaberta]), false);

  const acimaDaCapacidade = {
    ...existingGoal,
    capacidadeMaxima: 3,
    metaMediaTurma: 4,
  };
  const errors = getHealthScoreV3SegmentGoalErrors(acimaDaCapacidade);
  assert.match(errors.metaMediaTurma, /não pode superar a capacidade máxima/i);
  assert.equal(areHealthScoreV3SegmentGoalsValid([acimaDaCapacidade]), false);
  assert.equal(areHealthScoreV3SegmentGoalsValid([existingGoal]), true);
});

test('simulacao preserva a superlotacao canonica devolvida pelo backend', async () => {
  const { parseHealthScoreV3Simulation } = await loadHealthScoreModule();

  const simulation = parseHealthScoreV3Simulation({
    config_id: 'config-rascunho',
    config_versao: 2,
    competencia: '2026-08-01',
    total: 10,
    saudaveis: 4,
    atencao: 3,
    criticos: 2,
    sem_base: 1,
    score_medio: 78.5,
    superlotacao: [
      {
        professor_id: 9,
        unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
        curso_id: 40,
        curso_nome: 'Bateria',
        modalidade: 'turma',
        alertas_capacidade: [
          {
            turma_chave: 'T_Seg_18',
            curso_id: 40,
            modalidade: 'turma',
            ocupacoes_unicas: 3,
            capacidade_maxima: 2,
            competencia: '2026-08-01',
          },
          {
            turma_chave: 'T_Qua_18',
            curso_id: 40,
            modalidade: 'turma',
            ocupacoes_unicas: 4,
            capacidade_maxima: 2,
            competencia: '2026-08-01',
          },
        ],
      },
    ],
  });

  assert.deepEqual(simulation.superlotacoes, [
    {
      professorId: 9,
      unidadeId: '368d47f5-2d88-4475-bc14-ba084a9a348e',
      cursoId: 40,
      cursoNome: 'Bateria',
      modalidade: 'turma',
      alertasCapacidade: [
        {
          turmaChave: 'T_Seg_18',
          cursoId: 40,
          modalidade: 'turma',
          ocupacoesUnicas: 3,
          capacidadeMaxima: 2,
          competencia: '2026-08-01',
        },
        {
          turmaChave: 'T_Qua_18',
          cursoId: 40,
          modalidade: 'turma',
          ocupacoesUnicas: 4,
          capacidadeMaxima: 2,
          competencia: '2026-08-01',
        },
      ],
    },
  ]);
});

test('matriz usa superlotacao canonica e nao confunde meta local invalida com ocupacao observada', async () => {
  const { buildHealthScoreV3SegmentMatrix } = await loadSegmentedGoalsHelpers();
  const fixture = segmentedMatrixFixture();
  const invalidGoal = {
    ...fixture.existingGoal,
    capacidadeMaxima: 3,
    metaMediaTurma: 4,
  };

  const withoutCanonicalEvidence = buildHealthScoreV3SegmentMatrix(
    [invalidGoal],
    {
      segmentosObservadosSemRegra: [],
      atribuicoesSemRegra: [],
      atribuicoesZeroCarteira: [],
      divergenciasModalidade: [],
    },
    [],
  );
  assert.equal(withoutCanonicalEvidence[0].pending.superlotacao, false);

  const withCanonicalEvidence = buildHealthScoreV3SegmentMatrix(
    fixture.metas,
    fixture.pendencias,
    [{
      professorId: 9,
      unidadeId: fixture.barraId,
      cursoId: 10,
      cursoNome: 'Piano',
      modalidade: 'individual',
      alertasCapacidade: 2,
    }],
  );
  assert.equal(withCanonicalEvidence[0].pending.superlotacao, true);
});

test('contador de carteira zero deduplica o mesmo professor em varias atribuicoes', async () => {
  const { countHealthScoreV3ZeroPortfolioProfessors } = await loadSegmentedGoalsHelpers();
  const fixture = segmentedMatrixFixture();

  assert.equal(
    countHealthScoreV3ZeroPortfolioProfessors([
      ...fixture.pendencias.atribuicoesZeroCarteira,
      {
        ...fixture.pendencias.atribuicoesZeroCarteira[0],
        atribuicaoId: 'atribuicao-bateria-zero-2',
        cursoId: 41,
        cursoNome: 'Percussao',
      },
      {
        ...fixture.pendencias.atribuicoesZeroCarteira[0],
        atribuicaoId: 'atribuicao-outro-professor',
        professorId: 10,
        professorNome: 'Diego',
      },
    ]),
    2,
  );
});

test('matriz mantem as tres unidades canonicas mesmo quando uma delas nao possui linhas', async () => {
  const { buildHealthScoreV3UnitTabs } = await loadSegmentedGoalsHelpers();
  const fixture = segmentedMatrixFixture();
  const matrix = [{
    goal: fixture.existingGoal,
    key: `${fixture.barraId}|10|individual`,
    synthetic: false,
    pending: { regraAusente: false, zeroCarteira: false, superlotacao: false },
  }];

  assert.deepEqual(buildHealthScoreV3UnitTabs(matrix), [
    { id: fixture.barraId, name: 'Barra' },
    { id: fixture.recreioId, name: 'Recreio' },
    { id: fixture.campoGrandeId, name: 'Campo Grande' },
  ]);
});

test('rascunho sujo protege saida e simulacao obsoleta nao permanece visivel', () => {
  const configSource = read(configComponentPath);
  const pageTabsSource = read(pageTabsPath);

  assert.match(configSource, /addEventListener\(\s*'beforeunload'/);
  assert.match(configSource, /document\.addEventListener\(\s*'click'[\s\S]*?true\s*\)/);
  assert.match(configSource, /import\s*\{\s*useBlocker\s*\}\s*from\s*'react-router-dom'/);
  assert.match(configSource, /useBlocker\(\s*draftIsDirty\s*\)/);
  assert.match(configSource, /routeBlocker\.state\s*!==\s*'blocked'/);
  assert.match(configSource, /routeBlocker\.(?:proceed|reset)\s*\(/);
  assert.match(configSource, /window\.confirm/);
  assert.match(
    pageTabsSource,
    /Mobile Tabs[\s\S]{0,180}data-tour=\{dataTour\}/,
    'as abas mobile precisam expor o mesmo marcador das abas desktop',
  );
  assert.match(
    configSource,
    /simulationIsCurrent\s*&&\s*simulation\s*&&\s*\(/,
    'resultado antigo nao pode continuar visivel depois de mudar rascunho ou competencia',
  );
});

test('filtros e controles da matriz possuem nomes acessiveis', () => {
  const matrixSource = read(segmentedGoalsComponentPath);

  for (const accessibleName of [
    'Filtrar por curso',
    'Filtrar por modalidade',
    'Filtrar por pendência',
    'Estado da meta',
  ]) {
    assert.match(
      matrixSource,
      new RegExp(`aria-label[\\s\\S]{0,80}${accessibleName}`, 'i'),
      `${accessibleName} deve nomear seu controle`,
    );
  }
  assert.match(matrixSource, /<Input[\s\S]{0,180}aria-label=\{label\}/);
  for (const inputLabel of ['Capacidade máxima', 'Meta média por turma', 'Meta de carteira']) {
    assert.match(matrixSource, new RegExp(`label=\\{[^\\n]{0,100}${inputLabel}`, 'i'));
  }
});

test('Gate 9 concilia atribuicoes somente por RPC sem tocar no cadastro legado', () => {
  assert.equal(fs.existsSync(reconciliationHookPath), true);
  assert.equal(fs.existsSync(reconciliationComponentPath), true);

  const hookSource = read(reconciliationHookPath);
  const panelSource = read(reconciliationComponentPath);
  const configSource = read(configComponentPath);

  assert.match(hookSource, /\.rpc\(\s*'get_professor_curso_modalidade_reconciliacao_v1'/);
  assert.match(hookSource, /\.rpc\(\s*'salvar_professor_curso_modalidade_atribuicoes_v1'/);
  assert.doesNotMatch(hookSource, /\.from\s*\(/);
  assert.doesNotMatch(hookSource, /professores_cursos|ModalProfessor|ProfessoresPage/);

  assert.match(panelSource, /aria-label=["']Filtrar por unidade["']/);
  assert.match(panelSource, /aria-label=["']Filtrar por professor["']/);
  assert.match(panelSource, /aria-label=["']Filtrar por estado["']/);
  assert.match(panelSource, /Fonte|fonte/);
  assert.match(panelSource, /Confian[cç]a|confianca/);
  assert.match(panelSource, /manter/);
  assert.match(panelSource, /encerrar/);
  assert.match(panelSource, /revisar/);
  assert.match(panelSource, /pista_professores_cursos_sem_escopo/);
  assert.match(panelSource, /zero alunos|carteira vazia/i);
  assert.match(panelSource, /justificativa/i);
  assert.match(panelSource, /window\.confirm/);
  assert.doesNotMatch(panelSource, /reativar|ativo\s*=|professor\.ativo/);
  assert.match(panelSource, /row\.estado\s*!==\s*'historico'/);
  assert.match(panelSource, /!row\.atribuicaoId\s*&&\s*row\.vigenciaInicio/);

  assert.match(configSource, /ProfessorCursoModalidadeReconciliacao/);
  assert.match(configSource, /onSaved=\{refreshAfterReconciliation\}/);
});
