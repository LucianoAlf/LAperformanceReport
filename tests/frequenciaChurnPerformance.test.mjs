import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260715161000_frequencia_churn_sombra_performance.sql';
const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('frequencia materializa mapa de identidade e presencas uma unica vez', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /mapa_identidade\s+AS\s+MATERIALIZED/i);
  assert.match(migration, /presencas_semanticas\s+AS\s+MATERIALIZED/i);
  assert.match(migration, /JOIN\s+presencas_semanticas\s+p/i);
  assert.doesNotMatch(migration, /CROSS\s+JOIN\s+LATERAL[\s\S]*JOIN\s+public\.vw_aluno_presenca_semantica_v1/i);
});

test('otimizacao preserva contrato e isolamento da view canonica', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.vw_aluno_frequencia_canonica_v1/i);
  assert.match(migration, /security_invoker\s*=\s*true/i);
  assert.match(migration, /resultado_evento\s+IN\s*\('presente',\s*'falta_confirmada'\)/i);
  assert.match(migration, /REVOKE\s+ALL[\s\S]*FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /GRANT\s+SELECT[\s\S]*TO\s+service_role/i);
});
