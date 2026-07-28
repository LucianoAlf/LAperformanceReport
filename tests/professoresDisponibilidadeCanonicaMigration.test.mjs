import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260728128000_professores_disponibilidade_canonica.sql',
  import.meta.url,
);

test('migration saneia o caso confirmado sem usar ids fixos', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /Matheus Sterque Mendes/i);
  assert.match(sql, /Campo Grande/i);
  assert.match(sql, /disponibilidade\s*-\s*'Sexta-feira'/i);
  assert.match(sql, /get diagnostics[\s\S]*row_count/i);
  assert.match(sql, /if\s+v_linhas\s*<>\s*1/i);
  assert.doesNotMatch(sql, /professor_id\s*=\s*\d+/i);
  assert.doesNotMatch(sql, /unidade_id\s*=\s*'[0-9a-f-]+'/i);
});

test('migration fecha a entrada para dias fora do dominio canonico', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.fn_disponibilidade_professor_canonica_valida/i,
  );
  assert.match(sql, /jsonb_object_keys/i);
  assert.match(sql, /professores_unidades_disponibilidade_canonica_check/i);
  assert.match(sql, /check\s*\(\s*public\.fn_disponibilidade_professor_canonica_valida/i);
  assert.match(sql, /validate\s+constraint\s+professores_unidades_disponibilidade_canonica_check/i);
  assert.doesNotMatch(sql, /materializar_health_score_professor_v3_periodo/i);
});
