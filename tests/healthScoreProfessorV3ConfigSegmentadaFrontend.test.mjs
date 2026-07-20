import assert from 'node:assert/strict';
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

test('hook expoe refresh com alias reload e salva os dois payloads somente por RPC', () => {
  const source = read(hookPath);

  for (const operation of ['refresh', 'createDraft', 'saveDraft', 'simulate', 'activate']) {
    assert.match(source, new RegExp(`${operation}:`));
  }
  assert.match(source, /reload:\s*refresh/);
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
