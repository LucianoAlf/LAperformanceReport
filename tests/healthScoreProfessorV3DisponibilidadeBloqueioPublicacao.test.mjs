import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728127000_health_score_v3_disponibilidade_bloqueia_publicacao.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('politica V1 explicita disponibilidade total como base de horas', () => {
  const sql = migration();

  assert.match(
    sql,
    /add\s+column\s+if\s+not\s+exists\s+base_horas[\s\S]*default\s+'disponibilidade_total'/i,
  );
  assert.match(sql, /base_horas[\s\S]*disponibilidade_total/i);
  assert.match(sql, /versao\s*=\s*1/i);
});

test('sem_base_disponibilidade bloqueia publicacao do snapshot', () => {
  const sql = migration();

  assert.match(
    sql,
    /snapshot_metricas[\s\S]*metrica\s*=\s*'numero_alunos'[\s\S]*estado_base\s*=\s*'sem_base_disponibilidade'/i,
  );
  assert.match(sql, /new\.score\s*:=\s*null/i);
  assert.match(sql, /new\.classificacao\s*:=\s*'sem_base'/i);
  assert.match(sql, /new\.estado_publicacao\s*:=\s*'sem_base'/i);
  assert.match(sql, /new\.score_exibivel\s*:=\s*false/i);
  assert.match(sql, /new\.ranking_habilitado\s*:=\s*false/i);
  assert.match(sql, /new\.publicavel\s*:=\s*false/i);
  assert.match(sql, /new\.publicado\s*:=\s*false/i);
  assert.match(sql, /disponibilidade canonica ausente/i);
});

test('guardrail roda em toda atualizacao de snapshot', () => {
  const sql = migration();

  assert.match(
    sql,
    /create\s+trigger\s+trg_health_score_v3_bloquear_sem_disponibilidade[\s\S]*before\s+update[\s\S]*on\s+public\.health_score_professor_v3_snapshots/i,
  );
  assert.match(
    sql,
    /execute\s+function\s+public\.fn_health_score_v3_bloquear_sem_disponibilidade/i,
  );
});

test('migration nao rematerializa nem reescreve snapshots existentes', () => {
  const sql = migration();

  assert.doesNotMatch(
    sql,
    /update\s+public\.health_score_professor_v3_snapshots/i,
  );
  assert.doesNotMatch(
    sql,
    /materializar_health_score_professor_v3_periodo\s*\(/i,
  );
});

test('funcao de trigger nao fica exposta ao cliente', () => {
  const sql = migration();

  assert.match(sql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.fn_health_score_v3_bloquear_sem_disponibilidade\(\)[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
});
