import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260715173000_kpis_professor_presenca_publicavel_v2.sql',
  'utf8',
) + readFileSync(
  'supabase/migrations/20260715173500_kpis_professor_unidade_compat.sql',
  'utf8',
);
const client = readFileSync('src/lib/professoresKpisCanonicos.ts', 'utf8');

test('KPI v2 troca apenas a presenca pela camada publicavel', () => {
  assert.match(migration, /get_kpis_professor_periodo_canonico_v2/i);
  assert.match(migration, /get_kpis_professor_periodo_canonico\s*\(/i);
  assert.match(migration, /get_frequencia_professor_periodo_publicavel_v1\s*\(/i);
  assert.match(migration, /f\.media_presenca/i);
  assert.match(migration, /f\.taxa_faltas/i);
  assert.doesNotMatch(migration, /coalesce\s*\(\s*f\.media_presenca\s*,\s*0/i);
});

test('KPI v2 limita usuario de unidade ao proprio escopo', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /auth\.uid\s*\(\s*\)/i);
  assert.match(migration, /professores\.ver/i);
  assert.match(migration, /v_unidade_usuario/i);
  assert.match(migration, /v_perfil\s*=\s*'unidade'/i);
  assert.match(migration, /raise exception[\s\S]*acesso negado/i);
  assert.match(migration, /revoke all[\s\S]*public, anon/i);
  assert.match(migration, /grant execute[\s\S]*authenticated, service_role/i);
});

test('cliente preserva null e carrega metadados de confianca', () => {
  assert.match(client, /media_presenca:\s*number\s*\|\s*null/i);
  assert.match(client, /presenca_publicavel:\s*boolean/i);
  assert.match(client, /presenca_confianca:\s*string/i);
  assert.match(client, /presenca_cobertura:\s*number/i);
  assert.match(client, /get_kpis_professor_periodo_canonico_v3/i);
  assert.match(client, /numeroOuNull\s*\(\s*row\.media_presenca\s*\)/i);
});
