import assert from 'node:assert/strict';
import test from 'node:test';
import { readSqlContract } from './helpers/sqlContractHelpers.mjs';

const migration = readSqlContract(
  import.meta.url,
  'supabase/migrations/20260801094500_relatorio_admin_mensal_evasao_segundo_curso.sql',
);

test('evasao mensal inclui segundo curso sem misturar nao renovacao', () => {
  assert.equal(migration.exists, true, 'migration de evasao de segundo curso ainda nao existe');
  assert.match(migration.source, /jsonb_array_length[\s\S]*evasoes/i);
  assert.match(migration.source, /greatest/i);
  assert.match(migration.source, /nao_renovacoes/i);
});
