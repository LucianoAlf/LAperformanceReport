import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql';
const cicloMensalMigrationPath =
  'supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql';
const configurableMigrationPath =
  'supabase/migrations/20260813270200_health_score_v3_comparabilidade_configuravel.sql';
const reclassificacaoMigrationPath =
  'supabase/migrations/20260813270300_health_score_v3_reclassificacao_config_aberta.sql';
const escopoCanonicoMigrationPath =
  'supabase/migrations/20260813270400_health_score_v3_leitor_escopo_canonico.sql';

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
  assert.equal(
    fs.existsSync(cicloMensalMigrationPath),
    true,
    'migration com cobertura normalizada ainda nao existe',
  );
  const sql = `${read(migrationPath)}\n${read(cicloMensalMigrationPath)}`;

  assert.match(sql, /p_pilares_validos\s*<\s*3/i);
  assert.match(sql, /coalesce\(p_cobertura,\s*0\)\s*<\s*coalesce\(p_cobertura_minima/i);
  assert.match(sql, /calcular_health_score_professor_v3_cobertura_normalizada/i);
  assert.match(sql, /peso_pontuavel_total/i);
  assert.match(sql, /peso_disponivel_total/i);
  assert.match(sql, /cobertura_normalizada/i);
  assert.match(sql, /not\s+coalesce\(p_tem_fidelizacao/i);
  assert.match(sql, /'em_maturacao'/i);
  assert.match(sql, /'sem_base_operacional'/i);
  assert.match(sql, /'comparavel'/i);
});

test('leitor respeita a exigencia de fidelizacao versionada da configuracao', () => {
  assert.equal(
    fs.existsSync(configurableMigrationPath),
    true,
    'migration que conecta a regra de fidelizacao a configuracao ainda nao existe',
  );
  const sql = read(configurableMigrationPath);

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.avaliar_health_score_professor_v3_comparabilidade\([\s\S]*p_exige_pilar_fidelizacao\s+boolean/i,
  );
  assert.match(
    sql,
    /coalesce\(p_exige_pilar_fidelizacao,\s*true\)\s+and\s+not\s+coalesce\(p_tem_fidelizacao,\s*false\)/i,
  );
  assert.match(
    sql,
    /c\.tem_fidelizacao[\s\S]{0,500}c\.exige_pilar_fidelizacao[\s\S]{0,500}c\.fonte_canonica_disponivel/i,
  );
});

test('leitor separa consolidado e unidade antes de escolher a ultima revisao', () => {
  assert.equal(
    fs.existsSync(escopoCanonicoMigrationPath),
    true,
    'migration que fixa o escopo do leitor ainda nao existe',
  );
  const sql = read(escopoCanonicoMigrationPath);

  assert.match(sql, /s[.]escopo\s*=\s*'consolidado'/i);
  assert.match(sql, /s[.]escopo\s*=\s*'unidade'/i);
  assert.match(sql, /s[.]unidade_id\s+is\s+null/i);
  assert.match(sql, /s[.]unidade_id\s*=\s*p_unidade_id/i);
});

test('reclassificacao aberta e append-only e bloqueia competencias fechadas', () => {
  assert.equal(
    fs.existsSync(reclassificacaoMigrationPath),
    true,
    'migration de reclassificacao da competencia aberta ainda nao existe',
  );
  const sql = read(reclassificacaoMigrationPath);

  assert.match(sql, /create or replace function public[.]reclassificar_health_score_professor_v3_config_aberta/i);
  assert.match(sql, /date_trunc[(]'month', current_date[)]/i);
  assert.match(sql, /s[.]estado[ \t]*<>[ \t]*'fechado'/i);
  assert.match(sql, /snapshot_anterior_id/i);
  assert.match(sql, /health-score-professor-v3-reclassificacao-config-1/i);
  assert.match(sql, /RECLASSIFICACAO_REQUER_MATERIALIZACAO/i);
  assert.match(sql, /grant execute on function public[.]reclassificar_health_score_professor_v3_config_aberta/i);
  assert.match(sql, /to service_role/i);
  assert.doesNotMatch(sql, /update public[.]health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /delete from public[.]health_score_professor_v3_snapshots/i);
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
