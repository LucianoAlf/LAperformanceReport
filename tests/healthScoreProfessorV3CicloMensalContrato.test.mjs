import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql';
const periodSourcePath = 'src/lib/healthScoreProfessorV3Periodos.ts';
const periodMigrationPath =
  'supabase/migrations/20260719120000_health_score_v3_ciclos_publicacao_parcial.sql';

const read = (path) => fs.readFileSync(path, 'utf8');

test('calendario mensal e ciclos fixos preservam a virada Dez-Jan-Fev', () => {
  const source = read(periodSourcePath);
  const sql = read(periodMigrationPath);

  assert.match(source, /codigo:\s*`\$\{year\}-MAR-MAI`/i);
  assert.match(source, /codigo:\s*`\$\{year\}-JUN-AGO`/i);
  assert.match(source, /codigo:\s*`\$\{year\}-SET-NOV`/i);
  assert.match(source, /codigo:\s*`\$\{year\}-DEZ-\$\{year \+ 1\}-FEV`/i);
  assert.match(source, /inicio:\s*isoDate\(year,\s*12,\s*1\)[\s\S]*fim:\s*isoDate\(year \+ 1,\s*2,/i);
  assert.match(sql, /v_mes\s*=\s*12[\s\S]*make_date\(v_ano,\s*12,\s*1\)[\s\S]*make_date\(v_ano\s*\+\s*1,\s*3,\s*1\)\s*-\s*1/i);
  assert.match(sql, /v_mes\s+between\s+1\s+and\s+2[\s\S]*make_date\(v_ano\s*-\s*1,\s*12,\s*1\)/i);
});

test('contrato canonico publica pesos brutos e cobertura normalizada', () => {
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    'migration mensal/ciclo ainda nao existe',
  );
  const sql = read(migrationPath);

  assert.match(sql, /calcular_health_score_professor_v3_cobertura_normalizada/i);
  assert.match(sql, /peso_pontuavel_total\s+numeric/i);
  assert.match(sql, /peso_disponivel_total\s+numeric/i);
  assert.match(sql, /cobertura_normalizada\s+numeric/i);
  assert.match(
    sql,
    /p?_peso_disponivel_total[\s\S]*\/\s*nullif\(p?_peso_pontuavel_total,\s*0\)\s*\*\s*100/i,
  );
  assert.match(sql, /comparabilidade_motivos\s+jsonb/i);
});

test('produtor roteia mensal e ciclo sem misturar conversao de periodos', () => {
  const sql = read(migrationPath);

  assert.match(sql, /get_health_score_professor_v3_conversao_mensal/i);
  assert.match(sql, /get_health_score_professor_v3_conversao_ciclo/i);
  assert.match(sql, /p_periodicidade\s*=\s*'mensal'/i);
  assert.match(sql, /p_periodicidade\s*=\s*'ciclo'/i);
  assert.match(sql, /HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA/i);
  assert.doesNotMatch(sql, /v_codigo\s*=\s*'2026-JUN-AGO'/i);
});

test('ausencias conhecidas recebem codigos causais e auditoria exige motivo', () => {
  const sql = read(migrationPath);

  for (const code of [
    'sem_experimental_mes',
    'amostra_experimental_insuficiente',
    'sem_aulas_elegiveis_mes',
    'presenca_ainda_nao_registrada_mes',
    'sem_vinculos_encerrados_elegiveis',
    'amostra_vinculos_insuficiente',
  ]) {
    assert.match(sql, new RegExp(code, 'i'));
  }
  assert.match(sql, /fonte_canonica_indisponivel[\s\S]*motivo_auditoria/i);
});

test('ciclo aberto usa projecao viva e falha de produtor nao fabrica grade nula', () => {
  const sql = read(migrationPath);

  assert.match(sql, /get_health_score_professor_v3_projecao_viva_coerente\([\s\S]*'ciclo'/i);
  assert.match(sql, /ciclo_em_acompanhamento/i);
  assert.match(sql, /HEALTH_SCORE_V3_CICLO_INDISPONIVEL/i);
  assert.doesNotMatch(sql, /HEALTH_SCORE_V3_CICLO_INDISPONIVEL[\s\S]*return\s+query[\s\S]*null::numeric/i);
});
