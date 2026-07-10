import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260709213803_la_teacher_009_carteira_fonte_unica.sql',
  'utf8',
);

test('carteira do professor usa a jornada canonica e payload minimo', () => {
  assert.match(migration, /create or replace function public\.app_minha_carteira\(\)/i);
  assert.match(migration, /public\.fn_professor_do_usuario\(\)/i);
  assert.match(migration, /from public\.vw_jornada_professor_atual/i);
  assert.match(migration, /where c\.professor_id = v_prof/i);
  assert.match(migration, /revoke all on function public\.app_minha_carteira\(\) from public, anon/i);
  assert.doesNotMatch(migration, /telefone|whatsapp|financeiro|valor_parcela|mrr/i);
});
