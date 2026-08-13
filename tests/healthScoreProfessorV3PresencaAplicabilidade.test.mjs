import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260813232430_health_score_v3_presenca_canonica_aplicabilidade.sql';
const policyMigrationPath =
  'supabase/migrations/20260813233616_presenca_canonica_politica_emusys_pendente.sql';

const read = () => fs.readFileSync(migrationPath, 'utf8');

test('presenca V3 usa o contrato canonico no grao de ocorrencia', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration da presenca canonica ainda nao existe');
  const sql = read();

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.get_health_score_professor_v3_presenca_periodo_v2/i);
  assert.match(sql, /vw_aluno_presenca_semantica_v1/i);
  assert.match(sql, /partition\s+by\s+s\.unidade_id\s*,\s*s\.aluno_id\s*,\s*s\.professor_id\s*,\s*s\.data_hora_inicio/i);
  assert.match(sql, /fn_presenca_e_forte\s*\(\s*s\.respondido_por\s*\)/i);
  assert.match(sql, /ae\.data_hora_fim\s*<\s*(?:clock_timestamp\(\)|now\(\))/i);
  assert.match(sql, /ae\.id\s*=\s*public\.fn_aula_operacional_id\s*\(\s*ae\.id\s*\)/i);
  assert.match(sql, /s\.considera_frequencia_denominador/i);
  assert.match(sql, /(?:r\.aluno_id\s*=\s*s\.aluno_id|s\.aluno_id\s*=\s*r\.aluno_id)/i);
  assert.match(sql, /(?:r\.data_hora_inicio\s*=\s*s\.data_hora_inicio|s\.data_hora_inicio\s*=\s*r\.data_hora_inicio)/i);
  assert.doesNotMatch(sql, /s\.aula_emusys_id\s*=\s*r\.aula_id/i);
});

test('comparabilidade nao transforma metrica sem base em pilar obrigatorio', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration da aplicabilidade ainda nao existe');
  const sql = read();

  assert.match(sql, /health_score_professor_v3_config_metricas/i);
  assert.match(sql, /cm\.parametros/i);
  assert.match(sql, /peso_disponivel/i);
  assert.match(sql, /pilares_esperados/i);
  assert.match(sql, /least\s*\(\s*coalesce\s*\(\s*c\.pilares_minimos/i);
  assert.match(sql, /pilares_minimos_aplicado/i);
  assert.match(sql, /comparabilidade_sem_base/i);
});

test('leitor preserva score observado quando o snapshot antigo o bloqueou por cobertura', () => {
  const sql = read();

  assert.match(sql, /score_observado_calculado/i);
  assert.match(sql, /sum\s*\(\s*m\.nota\s*\*\s*m\.peso\s*\)/i);
  assert.match(sql, /coalesce\s*\(\s*s\.score\s*,\s*c\.score_observado_calculado\s*\)/i);
  assert.match(sql, /m\.pilar_aplicavel\s+and\s+nullif\s*\(\s*m\.metrica_detalhes\s*->>\s*'motivo_auditoria'/i);
});

test('reprocessamento aberto e append-only e nao toca historico fechado', () => {
  const sql = read();

  assert.match(sql, /reprocessar_health_score_professor_v3_competencia_aberta/i);
  assert.match(sql, /materializar_health_score_professor_v3_periodo/i);
  assert.match(sql, /date_trunc\s*\(\s*'month'\s*,\s*current_date\s*\)/i);
  assert.match(sql, /competencia_aberta/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots\s+set/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.health_score_professor_v3_snapshots/i);
});

test('politica canonica versiona ausencia do Emusys como pendencia', () => {
  assert.equal(fs.existsSync(policyMigrationPath), true, 'migration da politica canonica ainda nao existe');
  const sql = fs.readFileSync(policyMigrationPath, 'utf8');

  assert.match(sql, /presenca-politica-unidades-20260719-v2/i);
  assert.match(sql, /set\s+ativa\s*=\s*false/i);
  assert.match(sql, /ausencia_emusys_resultado[\s\S]*'indeterminado'/i);
  assert.match(sql, /presenca-politica-canonica-20260813-v1/i);
});
