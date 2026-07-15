import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260715160000_frequencia_churn_canonico_sombra.sql';
const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('frequencia canonica agrega por pessoa e deduplica o evento pedagogico', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /vw_aluno_frequencia_canonica_v1/i);
  assert.match(migration, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(migration, /vw_aluno_presenca_semantica_v1/i);
  assert.match(migration, /unnest\s*\(\s*i\.aluno_ids_locais\s*\)/i);
  assert.match(migration, /evento_chave/i);
  assert.match(migration, /group\s+by\s+[\s\S]*pessoa_chave[\s\S]*evento_chave/i);
  assert.doesNotMatch(migration, /\bp\.\*/i);
});

test('frequencia oficial usa somente resultados confirmados e publica incerteza', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /considera_frequencia_denominador/i);
  assert.match(migration, /faltas_confirmadas/i);
  assert.match(migration, /faltas_provaveis/i);
  assert.match(migration, /chamadas_indeterminadas/i);
  assert.match(migration, /cobertura_resultado_confirmado/i);
  assert.match(migration, /confianca_presenca/i);
});

test('features v2 ficam em sombra e nao substituem o modelo v1', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /features_churn_alunos_ativos_v2_sombra/i);
  assert.match(migration, /modelo_pronto\s+boolean/i);
  assert.match(migration, /false\s+as\s+modelo_pronto/i);
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function\s+public\.features_churn_alunos_ativos\s*\(\s*\)/i);
  assert.doesNotMatch(migration, /cron\.(schedule|alter_job|unschedule)/i);
});

test('camadas de sombra ficam restritas ao service role', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /security_invoker\s*=\s*true/i);
  assert.match(migration, /revoke\s+all[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /grant\s+select[\s\S]*to\s+service_role/i);
  assert.match(migration, /grant\s+execute[\s\S]*to\s+service_role/i);
});
