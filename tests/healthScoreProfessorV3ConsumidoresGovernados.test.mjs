import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728225000_health_score_v3_consumidores_snapshot_governado.sql';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Performance e modal leem somente o snapshot governado mais recente', () => {
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    'migration do cutover governado dos consumidores ainda nao existe',
  );
  const sql = read(migrationPath);

  assert.match(
    sql,
    /create or replace function public\.get_health_score_professor_v3_performance\s*\(\s*p_competencia date,\s*p_unidade_id uuid,\s*p_periodicidade text/i,
  );
  assert.match(
    sql,
    /create or replace function public\.get_health_score_professor_v3_snapshot_modal\s*\(\s*p_competencia date,\s*p_unidade_id uuid,\s*p_professor_id integer,\s*p_periodicidade text/i,
  );
  assert.match(sql, /from public\.health_score_professor_v3_snapshots s/i);
  assert.match(sql, /join public\.health_score_professor_v3_snapshot_metricas m/i);
  assert.match(sql, /partition by s\.professor_id/i);
  assert.match(sql, /\(s\.estado_publicacao = 'oficial'\) desc/i);
  assert.doesNotMatch(sql, /vw_health_score_professor_v3_parcial_(?:observado|operacional)/i);
});

test('Consumidores preservam estado, score e disponibilidade oficiais sem recomputar', () => {
  const sql = read(migrationPath);

  assert.match(sql, /s\.estado_publicacao/i);
  assert.match(sql, /s\.score_exibivel/i);
  assert.match(sql, /s\.ranking_habilitado/i);
  assert.match(sql, /s\.score/i);
  assert.match(sql, /m\.nota/i);
  assert.match(sql, /m\.peso_disponivel/i);
  assert.match(sql, /m\.contribuicao/i);
  assert.doesNotMatch(sql, /coalesce\s*\(\s*s\.score\s*,\s*0/i);
  assert.doesNotMatch(sql, /coalesce\s*\(\s*m\.nota\s*,\s*0/i);
});

test('Hardening verifica dependencias e preserva authenticated nas RPCs de tela', () => {
  const sql = read(migrationPath);

  assert.match(sql, /pg_constraint/i);
  assert.match(sql, /pg_trigger/i);
  assert.match(sql, /pg_attrdef/i);
  assert.match(
    sql,
    /revoke all on function public\.get_health_score_professor_v3_performance\(date, uuid, text\)\s+from public, anon/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.get_health_score_professor_v3_snapshot_modal\(date, uuid, integer, text\)\s+from public, anon/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_health_score_professor_v3_performance\(date, uuid, text\)\s+to authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_health_score_professor_v3_snapshot_modal\(date, uuid, integer, text\)\s+to authenticated, service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /revoke all on function public\.get_health_score_professor_v3_(?:performance|snapshot_modal)[\s\S]{0,120}from public, anon, authenticated/i,
  );
});
