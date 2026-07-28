import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixUrl = new URL(
  '../supabase/migrations/20260728129000_fix_grant_disponibilidade_canonica_authenticated.sql',
  import.meta.url,
);

const origemUrl = new URL(
  '../supabase/migrations/20260728128000_professores_disponibilidade_canonica.sql',
  import.meta.url,
);

test('validador em CHECK constraint recebe EXECUTE para authenticated', async () => {
  const sql = await readFile(fixUrl, 'utf8');

  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.fn_disponibilidade_professor_canonica_valida\(jsonb\)\s+to\s+authenticated/i,
  );
});

test('correcao nao reabre a funcao para anon nem mexe em RLS', async () => {
  const sql = await readFile(fixUrl, 'utf8');

  assert.doesNotMatch(sql, /grant[\s\S]*?\bto\s+anon\b/i);
  assert.doesNotMatch(sql, /grant[\s\S]*?\bto\s+public\b/i);
  assert.doesNotMatch(sql, /drop\s+policy/i);
  assert.doesNotMatch(sql, /create\s+policy/i);
  assert.doesNotMatch(sql, /disable\s+row\s+level\s+security/i);
  assert.doesNotMatch(sql, /alter\s+table/i);
  assert.doesNotMatch(sql, /drop\s+constraint/i);
});

test('guardrail do dominio canonico permanece na migration de origem', async () => {
  const origem = await readFile(origemUrl, 'utf8');

  // A correcao e apenas de privilegio: a constraint e o validador seguem intactos.
  assert.match(origem, /professores_unidades_disponibilidade_canonica_check/i);
  assert.match(origem, /check\s*\(\s*public\.fn_disponibilidade_professor_canonica_valida/i);
});
