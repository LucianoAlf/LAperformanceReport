import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql';

const read = (path) => fs.readFileSync(path, 'utf8');

test('contrato canonico separa score observado de score comparavel', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de comparabilidade ainda nao existe');
  const sql = read(migrationPath);

  assert.match(sql, /avaliar_health_score_professor_v3_comparabilidade/i);
  assert.match(sql, /score_observado\s+numeric/i);
  assert.match(sql, /score_comparavel\s+numeric/i);
  assert.match(sql, /pilares_validos\s+integer/i);
  assert.match(sql, /pilares_esperados\s+integer/i);
  assert.match(sql, /comparabilidade_estado\s+text/i);
  assert.match(sql, /comparabilidade_motivo\s+text/i);
  assert.match(sql, /competencia_referencia\s+date/i);
  assert.match(sql, /score_referencia\s+numeric/i);
  assert.match(sql, /classificacao_referencia\s+text/i);
});

test('gate exige tres pilares, cobertura configurada e fidelizacao', () => {
  const sql = read(migrationPath);

  assert.match(sql, /p_pilares_validos\s*<\s*3/i);
  assert.match(sql, /coalesce\(p_cobertura,\s*0\)\s*<\s*coalesce\(p_cobertura_minima/i);
  assert.match(sql, /not\s+coalesce\(p_tem_fidelizacao/i);
  assert.match(sql, /'em_maturacao'/i);
  assert.match(sql, /'sem_base_operacional'/i);
  assert.match(sql, /'comparavel'/i);
});

test('read model preserva score observado e nao reescreve historico fechado', () => {
  const sql = read(migrationPath);

  assert.match(sql, /create\s+function\s+public\.get_health_score_professor_v3_performance/i);
  assert.match(sql, /b\.score\s+as\s+score_observado/i);
  assert.match(sql, /when\s+.*comparavel[\s\S]*then\s+b\.score/i);
  assert.match(sql, /score_referencia/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /r\.score_referencia\s+as\s+score(?:\s|,)/i);
});

test('modal reutiliza o mesmo contrato canonico da leitura em lote', () => {
  const sql = read(migrationPath);

  assert.match(sql, /create\s+function\s+public\.get_health_score_professor_v3_snapshot_modal/i);
  assert.match(
    sql,
    /from\s+public\.get_health_score_professor_v3_performance\([\s\S]*p_professor_id/i,
  );
});

test('migration mantem ACL das RPCs publicas e bloqueia as funcoes-base', () => {
  const sql = read(migrationPath);

  assert.match(
    sql,
    /grant execute on function public\.get_health_score_professor_v3_performance\(\s*date, uuid, text\s*\)[\s\S]*to authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_health_score_professor_v3_snapshot_modal\(\s*date, uuid, integer, text\s*\)[\s\S]*to authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.get_health_score_professor_v3_performance_base_comparabilidade\(\s*date, uuid, text\s*\)[\s\S]*from public, anon, authenticated/i,
  );
});
