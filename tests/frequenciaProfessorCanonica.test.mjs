import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260715171000_frequencia_professor_canonica_sombra.sql',
  'utf8',
);

test('frequencia do professor usa pessoa e evento como grao canonico', () => {
  assert.match(migration, /get_frequencia_professor_periodo_canonica_v1/i);
  assert.match(migration, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(migration, /pessoa_chave/i);
  assert.match(migration, /evento_chave/i);
  assert.match(migration, /group by[\s\S]*professor_id[\s\S]*pessoa_chave[\s\S]*evento_chave/i);
});

test('somente presenca e falta humana entram no denominador oficial', () => {
  assert.match(migration, /vw_aluno_presenca_semantica_v1/i);
  assert.match(migration, /resultado_pedagogico\s*=\s*'falta_confirmada'/i);
  assert.match(migration, /faltas_provaveis/i);
  assert.match(migration, /chamadas_indeterminadas/i);
  assert.match(migration, /resultado_evento IN \('presente', 'falta_confirmada'\)/i);
  assert.doesNotMatch(
    migration,
    /status\s*=\s*'ausente'[\s\S]{0,220}falta_confirmada/i,
  );
});

test('fonte publica cobertura e confianca sem tocar no KPI de producao', () => {
  assert.match(migration, /cobertura_resultado_confirmado/i);
  assert.match(migration, /confianca_presenca/i);
  assert.match(migration, /regra_versao/i);
  assert.doesNotMatch(
    migration,
    /create\s+or\s+replace\s+function\s+public\.get_kpis_professor_periodo_canonico\s*\(/i,
  );
});

test('RPC sombra fica restrita ao service role', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /revoke all[\s\S]*public, anon, authenticated, fabio_agent/i);
  assert.match(migration, /grant execute[\s\S]*service_role/i);
});
