import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260716184500_health_score_v3_reconstrucao_particionada.sql';
const optimizationMigrationPath =
  'supabase/migrations/20260716185500_otimiza_eventos_reconstrucao_particionada.sql';
const manifestMigrationPath =
  'supabase/migrations/20260716190500_manifesto_reconstrucao_particionada.sql';
const edgePath = 'supabase/functions/reconstruir-periodos-professor/index.ts';
const helperPath =
  'supabase/functions/_shared/reconstrucao-particionada-professor.mjs';
const scriptPath = 'scripts/reconstruir-periodos-professor-particionado.mjs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('helper valida limites e enumera particoes sem lacunas', async () => {
  assert.equal(fs.existsSync(helperPath), true, `${helperPath} deve existir`);
  const { validarParticionamento, indicesParticoes } = await import(
    `../supabase/functions/_shared/reconstrucao-particionada-professor.mjs?${Date.now()}`
  );

  assert.deepEqual(indicesParticoes(4), [0, 1, 2, 3]);
  assert.deepEqual(validarParticionamento(32, 31), {
    total: 32,
    indice: 31,
  });
  assert.throws(() => validarParticionamento(1, 0), /PARTICAO_TOTAL_INVALIDO/);
  assert.throws(() => validarParticionamento(129, 0), /PARTICAO_TOTAL_INVALIDO/);
  assert.throws(() => validarParticionamento(8, 8), /PARTICAO_INDICE_INVALIDO/);
});

test('migration particiona por pessoa canonica e materializa somente apos todas as partes', () => {
  assert.equal(fs.existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = read(migrationPath);

  assert.match(sql, /create table public\.professor_periodos_reconstrucao_particoes_v1/i);
  assert.match(sql, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(sql, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(sql, /pessoa_chave/i);
  assert.match(sql, /md5\(base\.particao_pessoa_chave\)/i);
  assert.match(sql, /registrar_particao_periodos_professor_v1/i);
  assert.match(sql, /finalizar_reconstrucao_particionada_professor_v1/i);
  assert.match(sql, /count\(distinct particao_indice\)/i);
  assert.match(sql, /status[^;]+aguardando_particoes/is);
  assert.match(sql, /extensions\.digest/i);
  assert.match(sql, /diagnosticos_detalhados_em/i);
  assert.match(sql, /processamento_particionado/i);
  assert.match(sql, /revoke all[^;]+from public, anon, authenticated/is);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|execute)[^;]+to (?:public|anon|authenticated)/i);
});

test('leitura particionada resolve identidade em joins de conjunto, sem lateral por evento', () => {
  assert.equal(
    fs.existsSync(optimizationMigrationPath),
    true,
    `${optimizationMigrationPath} deve existir`,
  );
  const sql = read(optimizationMigrationPath);
  assert.match(sql, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(sql, /left join public\.vw_aluno_identidade_unidade_canonica i_emusys/i);
  assert.match(sql, /left join public\.vw_aluno_identidade_unidade_canonica i_local/i);
  assert.doesNotMatch(sql, /join lateral/i);
  assert.match(sql, /md5\(base\.particao_pessoa_chave\)/i);
});

test('manifesto calcula identidade uma vez e indexa cada particao do recorte', () => {
  assert.equal(fs.existsSync(manifestMigrationPath), true, `${manifestMigrationPath} deve existir`);
  const sql = read(manifestMigrationPath);
  assert.match(sql, /professor_periodos_reconstrucao_manifesto_v1/i);
  assert.match(sql, /preparar_manifesto_reconstrucao_professor_v1/i);
  assert.match(sql, /unique[\s\S]+roster_staging_id/i);
  assert.match(sql, /particao_indice/i);
  assert.match(sql, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(sql, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(sql, /from public\.professor_periodos_reconstrucao_manifesto_v1/i);
  assert.match(sql, /revoke all[^;]+from public, anon, authenticated/is);
});

test('edge usa RPC paginada no modo particionado e preserva modo pequeno', () => {
  const edge = read(edgePath);

  assert.match(edge, /particao_total/i);
  assert.match(edge, /particao_indice/i);
  assert.match(edge, /validarParticionamento/i);
  assert.match(edge, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(edge, /preparar_manifesto_reconstrucao_professor_v1/i);
  assert.match(edge, /registrar_particao_periodos_professor_v1/i);
  assert.match(edge, /finalizar_reconstrucao_particionada_professor_v1/i);
  assert.match(edge, /materializar_periodos_professor_v1/i);
  assert.match(edge, /processamento_particionado/i);
});

test('orquestrador chama cada indice e permite retomada idempotente', () => {
  assert.equal(fs.existsSync(scriptPath), true, `${scriptPath} deve existir`);
  const script = read(scriptPath);

  assert.match(script, /indicesParticoes/i);
  assert.match(script, /--total-particoes/i);
  assert.match(script, /--inicio-particao/i);
  assert.match(script, /particao_indice/i);
  assert.match(script, /particao_total/i);
  assert.match(script, /reconstruir-periodos-professor/i);
  assert.match(script, /AbortSignal\.timeout\(30_000\)/);
  assert.match(script, /AbortSignal\.timeout\(120_000\)/);
  assert.doesNotMatch(script, /250178Alf|lucianoalf\.la@gmail\.com/i);
});

test('orquestrador prioriza .env.local sobre .env', () => {
  const script = read(scriptPath);
  const envLocalIndex = script.indexOf("carregarEnvArquivo('.env.local')");
  const envIndex = script.indexOf("carregarEnvArquivo('.env')");

  assert.notEqual(envLocalIndex, -1, 'deve carregar .env.local');
  assert.notEqual(envIndex, -1, 'deve carregar .env');
  assert.ok(
    envLocalIndex < envIndex,
    '.env.local deve ser carregado primeiro quando o loader preserva valores existentes',
  );
});
