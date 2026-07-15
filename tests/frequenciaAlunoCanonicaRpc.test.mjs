import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260715170000_frequencia_aluno_canonica_rpc.sql',
  'utf8',
);

test('RPC estreita resolve identidade antes de ler presença', () => {
  assert.match(migration, /get_frequencia_aluno_canonica_v1/i);
  assert.match(migration, /WITH identidade AS MATERIALIZED/i);
  assert.match(migration, /p_aluno_id\s*=\s*ANY\(i\.aluno_ids_locais\)/i);
  assert.match(migration, /ap\.aluno_id\s*=\s*ANY\(i\.aluno_ids_locais\)/i);
});

test('RPC deduplica por aula e não promove ausência automática', () => {
  assert.match(migration, /evento_chave/i);
  assert.match(migration, /GROUP BY[\s\S]*evento_chave/i);
  assert.match(migration, /professor_la_teacher[\s\S]*falta_confirmada/i);
  assert.match(migration, /tem_falta_provavel/i);
  assert.doesNotMatch(
    migration,
    /respondido_por IN \('emusys', 'sistema'\)[\s\S]{0,220}AS tem_falta_confirmada/i,
  );
});

test('Health Score sombra consome a RPC estreita', () => {
  assert.match(
    migration,
    /FROM public\.get_frequencia_aluno_canonica_v1\(p_aluno_id\)/i,
  );
  const healthBody = migration.slice(
    migration.lastIndexOf('CREATE OR REPLACE FUNCTION public.calcular_health_score_aluno_v2_sombra'),
  );
  assert.doesNotMatch(healthBody, /vw_aluno_frequencia_canonica_v1/i);
});

test('RPCs ficam restritas ao service role', () => {
  assert.match(migration, /security definer/ig);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/ig);
  assert.match(migration, /revoke all[\s\S]*fabio_agent/ig);
  assert.match(migration, /grant execute[\s\S]*service_role/ig);
});
