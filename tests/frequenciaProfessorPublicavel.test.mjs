import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260715172000_frequencia_professor_publicavel.sql',
  'utf8',
);

test('camada publicavel depende da frequencia canonica', () => {
  assert.match(migration, /get_frequencia_professor_periodo_publicavel_v1/i);
  assert.match(migration, /get_frequencia_professor_periodo_canonica_v1/i);
});

test('percentual so e publicado com confianca alta', () => {
  assert.match(
    migration,
    /case\s+when\s+f\.confianca_presenca\s*=\s*'alta'\s+then\s+f\.media_presenca\s+else\s+null/i,
  );
  assert.match(
    migration,
    /case\s+when\s+f\.confianca_presenca\s*=\s*'alta'\s+then\s+f\.taxa_faltas\s+else\s+null/i,
  );
  assert.match(migration, /f\.confianca_presenca\s*=\s*'alta'\s+AS\s+publicavel/i);
});

test('RPC publicavel continua interna', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /revoke all[\s\S]*public, anon, authenticated, fabio_agent/i);
  assert.match(migration, /grant execute[\s\S]*service_role/i);
});
