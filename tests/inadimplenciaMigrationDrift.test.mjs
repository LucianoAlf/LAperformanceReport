import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const migrationNames = [
  '20260815222313_sol_caixa_inadimplentes.sql',
  '20260815222416_sol_caixa_inadimplentes_v2_dedupe.sql',
  '20260815224037_sol_caixa_inadimplentes_v3_juros_faixas.sql',
  '20260815231546_sol_caixa_inadimplentes_v4_sync_run_items.sql',
];

test('checkpoint 1 versions all four remotely applied delinquency migrations', () => {
  for (const name of migrationNames) {
    assert.ok(fs.existsSync(path.join(migrationDir, name)), `missing migration: ${name}`);
  }
});

test('restored migration bytes match the remote migration ledger', () => {
  const expected = {
    '20260815222313_sol_caixa_inadimplentes.sql': 'd7cc9edd77b3db7f36dc4273163d556f',
    '20260815222416_sol_caixa_inadimplentes_v2_dedupe.sql': '8e164ec0456c7dc83e03505ad7a256af',
    '20260815224037_sol_caixa_inadimplentes_v3_juros_faixas.sql': '44a3d63f74636ad34a2bfd18bab0e26d',
    '20260815231546_sol_caixa_inadimplentes_v4_sync_run_items.sql': '097a166e5f7be979e91791d6a27ebc14',
  };
  for (const [name, hash] of Object.entries(expected)) {
    const actual = crypto.createHash('md5').update(fs.readFileSync(path.join(migrationDir, name))).digest('hex');
    assert.equal(actual, hash, `migration drift: ${name}`);
  }
});

test('v4 is the sync_run_items implementation and fails closed on source_missing', () => {
  const v4 = fs.readFileSync(path.join(migrationDir, migrationNames.at(-1)), 'utf8');
  assert.match(v4, /sync_run_items/);
  assert.match(v4, /snapshot_complete\s*=\s*true/);
  assert.match(v4, /unidades_concluidas\s*=\s*3/);
  assert.match(v4, /status\s*=\s*'aberta'/);
  assert.match(v4, /coalesce\(i\.source_missing, false\)\s*=\s*false/);
  assert.match(v4, /p_multa_pct/);
  assert.match(v4, /p_mora_pct_mes/);
});

test('checkpoint 1 keeps the Sol operational RPC boundary intact', () => {
  const all = migrationNames
    .map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8'))
    .join('\n');
  for (const forbidden of [
    'sol_caixa_lancar_recebimento',
    'sol_caixa_abrir',
    'sol_caixa_fechar',
    'sol_caixa_casar_parcela',
  ]) {
    assert.doesNotMatch(all, new RegExp(forbidden));
  }
  assert.match(all, /grant execute[\s\S]*service_role/i);
});
