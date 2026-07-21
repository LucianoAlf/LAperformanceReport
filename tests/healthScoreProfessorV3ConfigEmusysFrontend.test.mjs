import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typesPath = path.join(repoRoot, 'src/lib/healthScoreProfessorV3.ts');
const hookPath = path.join(
  repoRoot,
  'src/hooks/useHealthScoreProfessorV3Config.ts',
);
const configPath = path.join(
  repoRoot,
  'src/components/App/Professores/HealthScoreV3Config.tsx',
);
const goalsPath = path.join(
  repoRoot,
  'src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx',
);
const exceptionsPath = path.join(
  repoRoot,
  'src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx',
);

const read = (filePath) => fs.readFileSync(filePath, 'utf8');

async function loadHealthScoreModule() {
  const javascript = ts.transpileModule(read(typesPath), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
  );
}

const catalog = [
  {
    unidadeId: 'barra',
    unidadeNome: 'Barra',
    cursoId: 27,
    cursoNome: 'Bateria',
    emusysDisciplinaId: 2701,
    modalidade: 'turma',
    ofertado: true,
    fonte: 'emusys',
    sincronizadoEm: '2026-07-20T12:00:00Z',
  },
  {
    unidadeId: 'barra',
    unidadeNome: 'Barra',
    cursoId: 6,
    cursoNome: 'Canto',
    emusysDisciplinaId: 601,
    modalidade: 'individual',
    ofertado: true,
    fonte: 'emusys',
    sincronizadoEm: '2026-07-20T12:00:00Z',
  },
];

test('frontend declara catalogo oficial e estado visual nao configurado', () => {
  const typesSource = read(typesPath);

  assert.match(typesSource, /HealthScoreV3CatalogSegment/);
  assert.match(typesSource, /estado:\s*'nao_configurada'/);
  assert.match(typesSource, /buildHealthScoreV3SegmentMatrix/);
  assert.match(typesSource, /buildHealthScoreV3DraftLoadState/);
  assert.match(typesSource, /getHealthScoreV3ActivationBlockers/);
});

test('fluxo governado nao usa controles nativos nem confirmacao imperativa', () => {
  const configSource = read(configPath);
  const goalsSource = read(goalsPath);
  const exceptionsSource = read(exceptionsPath);
  const combined = configSource + goalsSource + exceptionsSource;

  assert.doesNotMatch(combined, /type=["']range["']/i);
  assert.doesNotMatch(combined, /type=["']date["']/i);
  assert.doesNotMatch(combined, /<select\b/i);
  assert.doesNotMatch(combined, /window\.confirm/i);
  assert.match(exceptionsSource, /Excecoes de vinculos Emusys/);
});

test('helper puro de load monta matriz limpa sem fabricar zero nem mutar entradas', async () => {
  const module = await loadHealthScoreModule();
  assert.equal(typeof module.buildHealthScoreV3DraftLoadState, 'function');

  const persisted = [];
  const catalogSnapshot = structuredClone(catalog);
  const persistedSnapshot = structuredClone(persisted);
  const loadState = module.buildHealthScoreV3DraftLoadState(persisted, catalog);

  assert.deepEqual(catalog, catalogSnapshot, 'load nao pode mutar o catalogo');
  assert.deepEqual(persisted, persistedSnapshot, 'load nao pode sujar metas persistidas');
  assert.deepEqual(Object.keys(loadState).sort(), ['dirty', 'matrix']);
  assert.equal(loadState.dirty, false);
  assert.equal(loadState.matrix.length, 2);
  for (const row of loadState.matrix) {
    assert.equal(row.estado, 'nao_configurada');
    assert.equal(row.persistida, false);
    assert.equal(row.capacidadeMaxima, null);
    assert.equal(row.metaMediaTurma, null);
    assert.equal(row.metaCarteiraCurso, null);
  }
});

test('helper puro carrega meta persistida sem marcar rascunho como alterado', async () => {
  const module = await loadHealthScoreModule();
  assert.equal(typeof module.buildHealthScoreV3DraftLoadState, 'function');

  const persisted = [{
    id: 'meta-barra-bateria-turma',
    configId: 'config-v3',
    unidadeId: 'barra',
    unidadeNome: 'Barra',
    cursoId: 27,
    cursoNome: 'Bateria',
    modalidade: 'turma',
    estado: 'configurada',
    persistida: true,
    capacidadeMaxima: 2,
    metaMediaTurma: 1.5,
    metaCarteiraCurso: 20,
    parametros: {},
    criadoEm: '2026-07-20T12:00:00Z',
    atualizadoEm: '2026-07-20T12:00:00Z',
  }];
  const catalogSnapshot = structuredClone(catalog);
  const persistedSnapshot = structuredClone(persisted);
  const loadState = module.buildHealthScoreV3DraftLoadState(persisted, catalog);

  assert.deepEqual(catalog, catalogSnapshot);
  assert.deepEqual(persisted, persistedSnapshot);
  assert.equal(loadState.dirty, false);
  assert.equal(loadState.matrix.length, 2);

  const configured = loadState.matrix.find((row) => row.cursoId === 27);
  assert.equal(configured?.estado, 'configurada');
  assert.equal(configured?.persistida, true);
  assert.equal(configured?.capacidadeMaxima, 2);
  assert.equal(configured?.metaMediaTurma, 1.5);
  assert.equal(configured?.metaCarteiraCurso, 20);

  const pending = loadState.matrix.find((row) => row.cursoId === 6);
  assert.equal(pending?.estado, 'nao_configurada');
  assert.equal(pending?.persistida, false);
  assert.equal(pending?.capacidadeMaxima, null);
  assert.equal(pending?.metaMediaTurma, null);
  assert.equal(pending?.metaCarteiraCurso, null);
});

test('hook usa o helper puro para carregar metas persistidas e catalogo oficial', () => {
  const hookSource = read(hookPath);
  const healthScoreImport = hookSource.match(
    /import\s*\{[\s\S]*?\}\s*from\s*['"]@\/lib\/healthScoreProfessorV3['"];?/,
  )?.[0] || '';

  assert.match(healthScoreImport, /buildHealthScoreV3DraftLoadState/);
  assert.match(
    hookSource,
    /buildHealthScoreV3DraftLoadState\s*\(\s*[^,\s][^,]*,\s*[^)\s][^)]*\)/,
    'hook deve chamar o helper com metas persistidas e segmentos do catalogo',
  );
});

test('serializacao persiste somente configurada e nao ofertada', async () => {
  const module = await loadHealthScoreModule();
  assert.equal(typeof module.serializeHealthScoreV3SegmentGoals, 'function');

  const matrix = [
    {
      ...catalog[0],
      estado: 'nao_configurada',
      persistida: false,
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
    },
    {
      ...catalog[1],
      estado: 'configurada',
      persistida: false,
      capacidadeMaxima: 1,
      metaMediaTurma: 1,
      metaCarteiraCurso: 8,
    },
    {
      ...catalog[0],
      emusysDisciplinaId: 2702,
      estado: 'nao_ofertada',
      persistida: false,
      capacidadeMaxima: null,
      metaMediaTurma: null,
      metaCarteiraCurso: null,
    },
  ];

  const serialized = module.serializeHealthScoreV3SegmentGoals(matrix);
  assert.deepEqual(
    serialized.map((row) => row.estado).sort(),
    ['configurada', 'nao_ofertada'],
  );
});

test('save parcial e permitido, mas simulacao e ativacao listam faltantes oficiais', async () => {
  const module = await loadHealthScoreModule();
  assert.equal(typeof module.canSaveHealthScoreV3Draft, 'function');
  assert.equal(typeof module.getHealthScoreV3ActivationBlockers, 'function');

  const matrix = module.buildHealthScoreV3SegmentMatrix([], catalog);
  assert.equal(
    module.canSaveHealthScoreV3Draft(matrix),
    true,
    'linhas oficiais ainda intocadas nao impedem save parcial',
  );

  const blockers = module.getHealthScoreV3ActivationBlockers(matrix, catalog);
  assert.equal(blockers.length, catalog.length);
  assert.ok(blockers.every((item) => item.estado === 'nao_configurada'));
});

test('conciliacao continua disponivel enquanto metas possuem alteracoes locais', () => {
  const configSource = read(configPath);
  const componentBlock = configSource.match(
    /<ProfessorCursoModalidadeReconciliacao[\s\S]*?\/>/,
  )?.[0] || '';

  assert.notEqual(componentBlock, '', 'painel de excecoes deve permanecer montado');
  assert.doesNotMatch(
    componentBlock,
    /disabled=\{[^}]*draftIsDirty/i,
    'rascunho sujo nao pode bloquear a conciliacao independente',
  );
});
