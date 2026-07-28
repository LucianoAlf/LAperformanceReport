import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728220000_health_score_v3_conversao_ciclo_provisorio.sql';
const performanceMigrationPath =
  'supabase/migrations/20260728220100_health_score_v3_conciliacao_lead_index.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

function functionBlock(sql, name) {
  const start = sql
    .toLowerCase()
    .indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test('conversao usa o ciclo de tres meses mesmo em snapshot mensal', () => {
  const sql = migration();
  const block = functionBlock(
    sql,
    'get_health_score_professor_v3_conversao_ciclo',
  );

  assert.match(
    block,
    /fn_health_score_v3_periodo\s*\(\s*p_competencia\s*,\s*'ciclo'\s*\)/i,
  );
  assert.match(block, /periodo_inicio/i);
  assert.match(block, /periodo_fim/i);
  assert.match(block, /ciclo_codigo/i);
  assert.doesNotMatch(block, /date_trunc\s*\(\s*'month'\s*,\s*p_competencia/i);
});

test('denominador usa evento ou lead e numerador continua exigindo pessoa canonica', () => {
  const sql = migration();
  const block = functionBlock(
    sql,
    'get_health_score_professor_v3_conversao_ciclo',
  );

  assert.match(block, /evento_chave/i);
  assert.match(block, /lead_chave/i);
  assert.match(block, /health_score_v3_experimental_lead_conciliacoes/i);
  assert.match(block, /count\s*\(\s*distinct\s+e\.evento_chave\s*\)/i);
  assert.match(block, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(block, /m\.pessoa_chave\s*=\s*e\.pessoa_chave/i);
  assert.match(block, /between\s+e\.data_aula\s+and\s+e\.data_aula\s*\+\s*30/i);
  assert.doesNotMatch(
    block,
    /filter\s*\(\s*where\s+e\.pessoa_chave\s+is\s+not\s+null\s*\)[\s\S]{0,80}as\s+experimentais/i,
  );
});

test('ciclo Jun-Ago fica visivel como provisorio e fora do score', () => {
  const sql = migration();
  const block = functionBlock(
    sql,
    'get_health_score_professor_v3_conversao_ciclo',
  );

  assert.match(block, /'2026-JUN-AGO'/i);
  assert.match(block, /'provisorio_ciclo'/i);
  assert.match(block, /false\s+as\s+publicavel/i);
  assert.match(block, /fora_do_score/i);
  assert.match(block, /base minima de 3 experimentais/i);
});

test('wrapper troca somente conversao e preserva as demais metricas', () => {
  const sql = migration();
  const block = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_periodo',
  );

  assert.match(
    block,
    /get_health_score_prof_v3_metricas_base_20260728/i,
  );
  assert.match(block, /where\s+b\.metrica\s*<>\s*'conversao'/i);
  assert.match(block, /get_health_score_professor_v3_conversao_ciclo/i);
});

test('conciliacao persiste somente telefone unico com nome coerente sem mutar raw', () => {
  const sql = migration();

  assert.match(
    sql,
    /create table\s+if\s+not\s+exists\s+public\.health_score_v3_experimental_lead_conciliacoes/i,
  );
  assert.match(sql, /normalize_telefone/i);
  assert.match(sql, /qtd_leads_telefone\s*=\s*1/i);
  assert.match(sql, /nome_lead_normalizado\s+in/i);
  assert.match(sql, /metodo\s*=\s*'telefone_nome_coerente'/i);
  assert.doesNotMatch(
    sql,
    /(update|insert\s+into)\s+public\.emusys_experimentais_raw/i,
  );
  assert.doesNotMatch(sql, /(insert|update)\s+public\.alunos/i);
});

test('hardening verifica dependencias estruturais e preserva grant vigente', () => {
  const sql = migration();

  for (const catalog of ['pg_constraint', 'pg_trigger', 'pg_attrdef']) {
    assert.match(sql, new RegExp(`\\b${catalog}\\b`, 'i'));
  }
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_health_score_professor_v3_metricas_periodo\s*\(\s*date\s*,\s*uuid\s*,\s*text\s*\)\s+to\s+authenticated,\s*service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.normalizar_disponibilidade_professor/i,
  );
});

test('indice de conciliacao cobre a FK de lead pela coluna inicial', () => {
  assert.equal(
    existsSync(performanceMigrationPath),
    true,
    `${performanceMigrationPath} deve existir`,
  );
  const sql = readFileSync(performanceMigrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');

  assert.match(
    sql,
    /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+public\.health_score_v3_experimental_lead_conciliacoes\s*\(\s*lead_id\s*\)/i,
  );
});
