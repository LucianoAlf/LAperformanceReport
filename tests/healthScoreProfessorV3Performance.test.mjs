import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260719001000_health_score_v3_performance_gate8.sql';
const segmentedMetricsMigrationPath =
  'supabase/migrations/20260719203000_health_score_v3_metricas_segmentadas.sql';
const helperPath = 'src/lib/healthScoreProfessorV3Performance.ts';
const hookPath = 'src/hooks/useHealthScoreProfessorV3Performance.ts';
const tabPath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Gate 8 cria leitura batch V3 guardada no escopo exato e na ultima revisao', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration batch V3 ainda nao existe');
  const sql = read(migrationPath);

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_performance/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public, pg_temp/i);
  assert.match(sql, /fn_health_score_professor_v3_ator_gerenciador\(\)/i);
  assert.match(sql, /s\.unidade_id\s+is\s+not\s+distinct\s+from\s+p_unidade_id/i);
  assert.match(sql, /row_number\(\)\s+over\s*\([\s\S]*partition by s\.professor_id/i);
  assert.match(sql, /order by s\.revisao desc/i);
  assert.match(sql, /where rn = 1/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]*to authenticated, service_role/i);
});

test('normalizador batch preserva null, valor observado e auditoria sem fallback', async () => {
  assert.equal(fs.existsSync(helperPath), true, 'normalizador V3 da Performance ainda nao existe');
  const {
    normalizeHealthScoreV3PerformanceRows,
    resolveHealthScoreV3MetricDisplay,
  } = await import(`../${helperPath}`);

  const snapshots = normalizeHealthScoreV3PerformanceRows([
    {
      professor_id: 31,
      unidade_id: 'cg',
      escopo: 'unidade',
      competencia: '2026-07-01',
      trimestre_inicio: '2026-07-01',
      config_versao: 1,
      revisao: 3,
      score: null,
      cobertura: 25,
      classificacao: 'sem_base',
      estado: 'provisorio',
      snapshot_publicavel: false,
      publicado: false,
      motivo_bloqueio: 'cobertura abaixo do minimo',
      regra_versao_snapshot: 'v3',
      metrica: 'presenca',
      valor_bruto: null,
      numerador: 0,
      denominador: 0,
      nota: null,
      peso: 10,
      peso_disponivel: false,
      contribuicao: null,
      meta: null,
      amostra: 0,
      estado_base: 'sem_base',
      metrica_publicavel: false,
      confianca: 'sem_base',
      fonte: 'vw_aluno_presenca_semantica_v1',
      regra_versao_metrica: 'presenca-v3',
      motivo_sem_base: 'fora da vigencia pontuavel',
      detalhes: {
        valor_observado: 8.64,
        observacao_publicacao: 'em_auditoria',
        cobertura_observada: 79.41,
      },
    },
    {
      professor_id: 31,
      unidade_id: 'cg',
      escopo: 'unidade',
      competencia: '2026-07-01',
      trimestre_inicio: '2026-07-01',
      config_versao: 1,
      revisao: 3,
      score: null,
      cobertura: 25,
      classificacao: 'sem_base',
      estado: 'provisorio',
      snapshot_publicavel: false,
      publicado: false,
      motivo_bloqueio: 'cobertura abaixo do minimo',
      regra_versao_snapshot: 'v3',
      metrica: 'numero_alunos',
      valor_bruto: null,
      numerador: 26,
      denominador: 1,
      nota: null,
      peso: 10,
      peso_disponivel: false,
      contribuicao: null,
      meta: 33,
      amostra: 1,
      estado_base: 'provisorio',
      metrica_publicavel: false,
      confianca: 'provisoria',
      fonte: 'periodos',
      regra_versao_metrica: 'numero-v3',
      motivo_sem_base: 'trimestre incompleto',
      detalhes: {
        fechamentos: [{ mes: '2026-07-01', alunos_fechamento: 26 }],
      },
    },
  ]);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].score, null);

  const presenca = resolveHealthScoreV3MetricDisplay(snapshots[0], 'presenca');
  assert.equal(presenca.value, null);
  assert.equal(presenca.observedValue, 8.64);
  assert.equal(presenca.state, 'auditoria');
  assert.equal(presenca.rankable, false);

  const alunos = resolveHealthScoreV3MetricDisplay(snapshots[0], 'numero_alunos');
  assert.equal(alunos.value, 26);
  assert.equal(alunos.state, 'provisorio');
  assert.equal(alunos.rankable, false);
});

test('ranking V3 aceita somente snapshot oficial habilitado e nunca transforma sem base em zero', async () => {
  assert.equal(fs.existsSync(helperPath), true, 'helper V3 da Performance ainda nao existe');
  const {
    averageHealthScoreV3Coverage,
    formatHealthScoreV3Coverage,
    rankHealthScoreV3Metric,
  } = await import(`../${helperPath}`);

  const base = (professorId, value, publicavel, oficial = false) => ({
    professorId,
    unidadeId: 'barra',
    escopo: 'unidade',
    competencia: '2026-07-01',
    trimestreInicio: '2026-07-01',
    configVersao: 1,
    revisao: 3,
    score: oficial ? 80 : null,
    cobertura: 25,
    classificacao: oficial ? 'saudavel' : 'sem_base',
    estado: 'provisorio',
    estadoPublicacao: oficial ? 'oficial' : 'parcial',
    rankingHabilitado: oficial,
    scoreExibivel: oficial,
    snapshotPublicavel: oficial,
    publicado: oficial,
    motivoBloqueio: 'snapshot provisorio',
    regraVersaoSnapshot: 'v3',
    metrics: new Map([['media_turma', {
      metrica: 'media_turma',
      valorBruto: value,
      numerador: value === null ? null : value * 10,
      denominador: value === null ? null : 10,
      nota: null,
      peso: 15,
      pesoDisponivel: false,
      contribuicao: null,
      meta: 1.44,
      amostra: value === null ? 0 : 10,
      estadoBase: publicavel ? 'ok' : 'provisorio',
      metricaPublicavel: publicavel,
      confianca: publicavel ? 'alta' : 'provisoria',
      fonte: 'fonte',
      regraVersaoMetrica: 'v3',
      motivoSemBase: publicavel ? null : 'sem base',
      detalhes: {},
    }]]),
  });

  const ranking = rankHealthScoreV3Metric([
    base(1, 1.5, true),
    base(2, 9.9, false),
    base(3, null, false),
    base(4, 1.7, true, true),
  ], 'media_turma');

  assert.deepEqual(ranking.map((item) => item.professorId), [4]);
  assert.equal(ranking[0].value, 1.7);
  assert.equal(formatHealthScoreV3Coverage(null), 'Sem base');
  assert.equal(formatHealthScoreV3Coverage(25), '25.0%');
  assert.equal(averageHealthScoreV3Coverage([
    { cobertura: null },
    { cobertura: 25 },
    { cobertura: 75 },
  ]), 50);
  assert.equal(averageHealthScoreV3Coverage([
    { cobertura: null },
    { cobertura: undefined },
  ]), null);
});

test('hook faz uma unica leitura batch e a tabela mantem rollback V2 por feature flag', () => {
  assert.equal(fs.existsSync(hookPath), true, 'hook batch V3 ainda nao existe');
  const hook = read(hookPath);
  const tab = read(tabPath);

  assert.match(hook, /get_health_score_professor_v3_performance/i);
  assert.doesNotMatch(hook, /get_health_score_professor_v3_snapshot_modal/i);
  assert.doesNotMatch(hook, /\.from\(['"]health_score_professor_v3_/i);
  assert.match(tab, /VITE_HEALTH_SCORE_V3_PERFORMANCE_ENABLED/i);
  assert.match(tab, /useHealthScoreProfessorV3Performance/i);
  assert.match(tab, /HEALTH_SCORE_V3_PERFORMANCE_ENABLED\s*\?/i);
  assert.match(tab, /calcularHealthScore/i, 'motor V2 deve continuar disponivel para rollback');
  assert.match(tab, /Perman[eÃª]ncia/i);
  assert.match(tab, /Em auditoria/i);
  assert.match(tab, /Sem base/i);
});

test('Task 5 mantem leitura parcial sem recalcular pilares segmentados por meta global', () => {
  assert.equal(
    fs.existsSync(segmentedMetricsMigrationPath),
    true,
    `${segmentedMetricsMigrationPath} deve existir`,
  );
  const sql = read(segmentedMetricsMigrationPath);
  const start = sql.toLowerCase().indexOf(
    'create or replace view public.vw_health_score_professor_v3_parcial_observado',
  );
  assert.notEqual(start, -1, 'view parcial deve ser redefinida');
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  const view = next === -1 ? rest : rest.slice(0, next + 1);

  assert.match(
    view,
    /when\s+m\.metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)\s+then\s+m\.nota/i,
  );
  assert.match(view, /m\.valor_bruto\s*\/\s*m\.meta_aplicada\s*\*\s*100/i);
  assert.match(
    sql,
    /'nome_exibicao'\s*,\s*case[\s\S]*?numero_alunos'[\s\S]*?'Carteira por curso'/i,
  );
  assert.doesNotMatch(sql, /meta_global|fallback_global|rateio|proporcional/i);
});
