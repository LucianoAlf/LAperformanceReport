import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260715164000_pausar_modelo_churn_legado.sql',
  'utf8',
);

test('pausa apenas o cron nominal do modelo legado', () => {
  assert.match(migration, /jobname\s*=\s*'calcular-risco-evasao-3d'/i);
  assert.match(migration, /cron\.alter_job\s*\([\s\S]*active\s*:=\s*false/i);
  assert.doesNotMatch(migration, /cron\.unschedule/i);
});

test('preserva resultados históricos e falha se o alvo não existir', () => {
  assert.match(migration, /raise exception/i);
  assert.doesNotMatch(migration, /\b(delete|truncate|update)\s+(from\s+)?public\.risco_evasao/i);
});
