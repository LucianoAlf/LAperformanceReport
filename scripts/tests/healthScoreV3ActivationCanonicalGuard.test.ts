import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath =
  'supabase/migrations/20260721154000_health_score_v3_ativacao_guard_canonico.sql';

test('ativacao usa excecoes atuais e nao bloqueia por diagnostico historico', () => {
  assert.equal(existsSync(migrationPath), true, 'migration do guard deve existir');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /get_professor_curso_modalidade_excecoes_v2/i);
  assert.match(
    migration,
    /historicos\s+ou\s+nao\s+pontuaveis/i,
  );
  assert.match(migration, /pg_get_functiondef/i);
  assert.match(migration, /nao_ofertada_observada/i);
  assert.match(migration, /atribuicoes_pontuaveis_sem_meta/i);
  assert.doesNotMatch(
    migration,
    /update\s+public\.health_score_professor_v3_config_versoes/i,
  );
});
