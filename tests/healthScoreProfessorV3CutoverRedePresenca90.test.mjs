import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration =
  'supabase/migrations/20260728223000_health_score_v3_cutover_rede_presenca90.sql';

const readMigration = () => fs.readFileSync(migration, 'utf8');

test('materializacao de rede inclui unidades e consolidado em uma unica chamada', () => {
  assert.equal(fs.existsSync(migration), true, 'migration de cutover ainda nao existe');
  const sql = readMigration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.materializar_health_score_professor_v3_rede/i,
  );
  assert.match(
    sql,
    /materializar_health_score_professor_v3_periodo\s*\(\s*p_competencia\s*,\s*p_periodicidade\s*,\s*null::uuid\s*,\s*p_professor_id\s*\)/i,
  );
  assert.match(sql, /'inclui_consolidado'\s*,\s*true/i);
  assert.match(sql, /'escopo_materializacao'\s*,\s*'rede'/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.materializar_health_score_professor_v3_rede[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.materializar_health_score_professor_v3_rede[\s\S]*to\s+service_role/i,
  );
});

test('cobertura de presenca passa a 90 por camada versionada', () => {
  assert.equal(fs.existsSync(migration), true, 'migration de cutover ainda nao existe');
  const sql = readMigration();

  assert.match(
    sql,
    /rename\s+to\s+get_health_score_prof_v3_metricas_base_20260728_c95/i,
  );
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.get_health_score_prof_v3_metricas_base_20260728/i,
  );
  assert.match(sql, /v_cobertura_minima\s+constant\s+numeric\s*:=\s*0\.90/i);
  assert.match(sql, /health-score-professor-v3-presenca-cobertura-90-1/i);
  assert.match(sql, /cobertura semantica inferior a 90% do roster esperado/i);
  assert.match(sql, /'cobertura_minima_percentual'\s*,\s*90/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.get_health_score_prof_v3_metricas_base_20260728[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_health_score_prof_v3_metricas_base_20260728[\s\S]*to\s+service_role/i,
  );
});

test('cutover preserva snapshots fechados e nao reescreve historico', () => {
  assert.equal(fs.existsSync(migration), true, 'migration de cutover ainda nao existe');
  const sql = readMigration();

  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /truncate\s+public\.health_score_professor_v3_snapshots/i);
});
