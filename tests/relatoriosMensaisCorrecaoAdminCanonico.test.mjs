import assert from 'node:assert/strict';
import test from 'node:test';
import { readSqlContract } from './helpers/sqlContractHelpers.mjs';

const migration = readSqlContract(
  import.meta.url,
  'supabase/migrations/20260801093000_relatorio_admin_mensal_financeiro_retencao.sql',
);

test('correcao administrativa le financeiro e retencao dentro dos snapshots fechados', () => {
  assert.equal(migration.exists, true, 'migration corretiva administrativa ainda nao existe');
  assert.match(migration.source, /financeiro_faturas_emusys[^\n]*->\s*'totais'/i);
  assert.match(migration.source, /kpis_retencao[^\n]*->\s*0/i);
  assert.match(migration.source, /renovacoes_realizadas/i);
  assert.match(migration.source, /total_evasoes[\s\S]*nao_renovacoes/i);
  assert.match(migration.source, /montar_relatorio_admin_mensal_payload_v1/i);
});
