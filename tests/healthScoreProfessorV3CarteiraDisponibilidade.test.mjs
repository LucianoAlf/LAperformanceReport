import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728120000_health_score_v3_carteira_disponibilidade.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('politica da carteira e versionada por unidade e vigencia', () => {
  const sql = migration();

  assert.match(
    sql,
    /create\s+table\s+if\s+not\s+exists\s+public\.health_score_professor_v3_carteira_politicas_unidade/i,
  );
  assert.match(sql, /meta_alunos_hora_p50[\s\S]*meta_alunos_hora_p75/i);
  assert.match(sql, /vigencia_inicio[\s\S]*vigencia_fim[\s\S]*versao/i);
  assert.match(sql, /Barra[\s\S]*0\.946[\s\S]*1\.143/i);
  assert.match(sql, /Campo Grande[\s\S]*1\.300[\s\S]*1\.607/i);
  assert.match(sql, /Recreio[\s\S]*0\.921[\s\S]*1\.141/i);
});

test('disponibilidade do LA Report gera horas e hash deterministicos', () => {
  const sql = migration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.fn_health_score_v3_disponibilidade_resumo/i,
  );
  assert.match(
    sql,
    /jsonb_each\s*\(\s*coalesce\s*\(\s*p_disponibilidade/i,
  );
  assert.match(sql, /md5\s*\(\s*coalesce\s*\(\s*p_disponibilidade/i);
  assert.doesNotMatch(sql, /payload_emusys\s*->/i);
});

test('numero de alunos usa carteira canonica e uma meta total por disponibilidade', () => {
  const sql = migration();

  assert.match(
    sql,
    /get_health_score_professor_v3_carteira_periodo\s*\(/i,
  );
  assert.match(
    sql,
    /horas_semanais[\s\S]*meta_alunos_hora_p75[\s\S]*meta_carteira/i,
  );
  assert.match(sql, /pessoas_canonicas_unicas/i);
  assert.doesNotMatch(
    sql,
    /sum\s*\(\s*(?:d\.)?meta_aplicada\s*\)[\s\S]*numero_alunos/i,
  );
});

test('maturacao, disponibilidade ausente e carteira zero nunca fabricam nota zero', () => {
  const sql = migration();

  for (const estado of [
    'em_maturacao',
    'sem_base_disponibilidade',
    'sem_base_zero_carteira',
  ]) {
    assert.match(sql, new RegExp(estado, 'i'));
  }
  assert.match(
    sql,
    /when\s+[^;]*estado_base[^;]*in\s*\([^)]*'em_maturacao'[^)]*'sem_base_disponibilidade'[^)]*'sem_base_zero_carteira'[^)]*\)[\s\S]*then\s+null::numeric/i,
  );
});

test('snapshot congela horas, taxa, hash e inicio do vinculo', () => {
  const sql = migration();

  for (const chave of [
    'horas_semanais_aplicadas',
    'meta_alunos_hora_p50',
    'meta_alunos_hora_p75',
    'meta_carteira_resultante',
    'disponibilidade_hash',
    'data_inicio_vinculo_unidade',
    'meses_vinculo_unidade',
    'politica_versao',
  ]) {
    assert.match(sql, new RegExp(`'${chave}'`, 'i'));
  }
});

test('atribuicao nao pontuavel nao bloqueia media turma nem numero alunos', () => {
  const sql = migration();

  assert.match(
    sql,
    /where\s+s\.atribuicao_pontuavel\s+is\s+true[\s\S]*bool_or/i,
  );
  assert.match(sql, /diagnostico_nao_pontuavel/i);
});

test('migration preserva consumidores e snapshots fechados', () => {
  const sql = migration();

  assert.doesNotMatch(sql, /create\s+or\s+replace\s+view/i);
  assert.doesNotMatch(sql, /get_health_score_professor_v3_consumidor/i);
  assert.doesNotMatch(sql, /update[\s\S]*where[\s\S]*estado\s*=\s*'fechado'/i);
  assert.match(
    sql,
    /materializar_health_score_professor_v3_periodo_impl_base_20260728/i,
  );
  assert.match(sql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function[\s\S]*materializar_health_score_professor_v3_periodo_impl[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
});
