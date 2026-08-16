import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');

function normalizeEol(value) {
  return value.replace(/\r\n?/g, '\n');
}

const migrationNames = [
  '20260815222313_sol_caixa_inadimplentes.sql',
  '20260815222416_sol_caixa_inadimplentes_v2_dedupe.sql',
  '20260815224037_sol_caixa_inadimplentes_v3_juros_faixas.sql',
  '20260815231546_sol_caixa_inadimplentes_v4_sync_run_items.sql',
];
const ledgerAlignedNames = [
  '20260816013455_financeiro_sync_queue.sql',
  '20260816013502_inadimplencia_canonica_quarentena_identidade.sql',
  '20260816013512_financeiro_faturas_relatorios_canonicos.sql',
  '20260816020631_inadimplencia_canonica_vencimento_estrito.sql',
  '20260816115755_inadimplencia_canonica_ignora_competencia_futura.sql',
  '20260816125329_inadimplencia_canonica_ativos_janela_tres.sql',
  '20260816213000_inadimplencia_exclui_trancados_repara_matricula.sql',
  '20260816220000_inadimplencia_patch_ativo_idempotente.sql',
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
    const migration = path.join(migrationDir, name);
    const normalizedLocalBytes = Buffer.from(normalizeEol(fs.readFileSync(migration, 'utf8')));
    const remoteStatementBytes = Buffer.from(
      normalizedLocalBytes.toString('utf8').replace(/\n/g, '\r\n'),
    );
    const normalizedRemoteBytes = Buffer.from(normalizeEol(remoteStatementBytes.toString('utf8')));
    const actual = crypto.createHash('md5').update(normalizedLocalBytes).digest('hex');
    const normalizedRemoteHash = crypto.createHash('md5').update(normalizedRemoteBytes).digest('hex');
    assert.equal(actual, hash, `migration drift: ${name}`);
    assert.equal(normalizedRemoteHash, actual, `EOL normalization drift: ${name}`);
  }
});

test('financial canonical migrations use the versions recorded by the remote ledger', () => {
  for (const name of ledgerAlignedNames) {
    assert.ok(fs.existsSync(path.join(migrationDir, name)), `missing ledger-aligned migration: ${name}`);
  }

  for (const provisionalName of [
    '20260816010000_financeiro_sync_queue.sql',
    '20260816020000_inadimplencia_canonica_quarentena_identidade.sql',
    '20260816030000_financeiro_faturas_relatorios_canonicos.sql',
  ]) {
    assert.equal(fs.existsSync(path.join(migrationDir, provisionalName)), false, `provisional migration remained: ${provisionalName}`);
  }

  const strictOverdue = fs.readFileSync(
    path.join(migrationDir, '20260816020631_inadimplencia_canonica_vencimento_estrito.sql'),
    'utf8',
  ).replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  assert.equal(
    crypto.createHash('md5').update(strictOverdue).digest('hex'),
    '62ba14a50f6a79bfb18d3f9e3b6c505a',
    'migration drift: 20260816020631_inadimplencia_canonica_vencimento_estrito.sql',
  );
});

test('patch de cobrança deixa trancados fora e repara somente vínculo único por matrícula', () => {
  const patch = fs.readFileSync(
    path.join(migrationDir, '20260816213000_inadimplencia_exclui_trancados_repara_matricula.sql'),
    'utf8',
  );
  assert.match(patch, /get_inadimplencia_canonica\(uuid,date\)/i);
  assert.match(patch, /estado\.entra_financeiro_ativo\s+is\s+true/i);
  assert.match(patch, /estado\.status_emusys\s*=\s*'ativa'/i);
  assert.match(patch, /estado\.status_operacional\s*=\s*'ativo'/i);
  assert.match(patch, /having\s+count\(distinct\s+btrim\(sri\.emusys_student_id::text\)\)\s*=\s*1/i);
  assert.match(patch, /nullif\(btrim\(a\.emusys_student_id\),\s*''\)\s+is\s+null/i);
  assert.match(patch, /updated_by\s*=\s*'migration:20260816213000'/i);
  for (const forbidden of [
    'sol_caixa_lancar_recebimento',
    'sol_caixa_abrir',
    'sol_caixa_fechar',
    'sol_caixa_casar_parcela',
  ]) {
    assert.doesNotMatch(patch, new RegExp(forbidden));
  }
});

test('patch idempotente tolera a formatação do corpo PL/pgSQL no replay', () => {
  const patch = fs.readFileSync(
    path.join(migrationDir, '20260816220000_inadimplencia_patch_ativo_idempotente.sql'),
    'utf8',
  );
  assert.match(patch, /regexp_replace[\s\S]*eh_trancamento_atual/i);
  assert.match(patch, /active_or_locked/);
  assert.match(patch, /active_only/);
  assert.match(patch, /if\s+v_definition\s*=\s*v_before/i);
  assert.match(patch, /having\s+count\(distinct\s+btrim\(sri\.emusys_student_id::text\)\)\s*=\s*1/i);
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
