import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260715165000_health_score_aluno_canonico_sombra.sql',
  'utf8',
);

test('health score v2 substitui apenas o fator presença e não persiste', () => {
  assert.match(migration, /calcular_health_score_aluno_v2_sombra/i);
  assert.match(migration, /calcular_health_score_aluno\(p_aluno_id\)/i);
  assert.match(migration, /vw_aluno_frequencia_canonica_v1/i);
  assert.match(migration, /Presenca canonica/i);
  assert.doesNotMatch(migration, /\b(update|insert|delete|truncate)\b/i);
});

test('somente confiança alta e ao menos quatro eventos alteram a nota', () => {
  assert.match(migration, /v_confianca\s*=\s*'alta'/i);
  assert.match(migration, /eventos_resultado_confirmado[\s\S]{0,80}>=\s*4/i);
  assert.match(migration, /v_score_presenca\s*:=\s*75/i);
  assert.match(migration, /v_modelo_pronto\s*:=\s*false/i);
});

test('função sombra fica restrita ao service role', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /revoke all[\s\S]*public[\s\S]*anon[\s\S]*authenticated[\s\S]*fabio_agent/i);
  assert.match(migration, /grant execute[\s\S]*service_role/i);
});
