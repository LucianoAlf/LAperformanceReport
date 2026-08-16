import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrations = [
  path.join(root, 'supabase', 'migrations', '20260816003732_inadimplencia_canonica_frescor.sql'),
  path.join(root, 'supabase', 'migrations', '20260816004257_inadimplencia_canonica_dedupe_global.sql'),
];

function sql() {
  return migrations.map((migration) => fs.readFileSync(migration, 'utf8')).join('\n');
}

function effectiveSql() {
  return fs.readFileSync(migrations.at(-1), 'utf8');
}

test('canonical migration files match the remote migration ledger bytes', () => {
  const expectedRemoteMd5 = new Map([
    ['20260816003732_inadimplencia_canonica_frescor.sql', '820ece01b47640f467cb42963b2731b3'],
    ['20260816004257_inadimplencia_canonica_dedupe_global.sql', 'badcb830c5475154f83a6dddf8c9af43'],
  ]);

  for (const migration of migrations) {
    const remoteStatementBytes = Buffer.concat([
      fs.readFileSync(migration),
      Buffer.from('\r\n'),
    ]);
    assert.equal(
      createHash('md5').update(remoteStatementBytes).digest('hex'),
      expectedRemoteMd5.get(path.basename(migration)),
      `drift detectado em ${path.basename(migration)}`,
    );
  }
});

test('canonical delinquency reader exposes freshness and a fail-closed status', () => {
  const source = sql();
  assert.match(source, /get_inadimplencia_canonica\s*\(/);
  assert.match(source, /'status'/);
  assert.match(source, /'freshness'/);
  assert.match(source, /'fresh_until'/);
  assert.match(source, /'stale'/);
  assert.match(source, /'items'/);
  assert.match(source, /then\s*'\[\]'::jsonb|jsonb_build_object\([^;]*'items'/is);
});

test('canonical reader is invoice-grain, strict about source_missing, and centralizes contract interest', () => {
  const source = effectiveSql();
  assert.match(source, /canonical_fatura_id/);
  assert.match(source, /emusys_fatura_id/);
  assert.match(source, /emusys_matricula_id/);
  assert.match(source, /source_missing\s+is\s+false/i);
  assert.match(source, /valor_original/);
  assert.match(source, /0\.02/);
  assert.match(source, /0\.01/);
  assert.match(source, /data_vencimento/);
  assert.match(source, /valor_atualizado/);
  assert.match(source, /partition\s+by\s+\w+\.canonical_fatura_id/i);
  assert.doesNotMatch(source, /partition\s+by\s+\w+\.unidade_id\s*,\s*\w+\.canonical_fatura_id/i);
  assert.match(source, /duplicatas_canonicas/i);
});

test('canonical reader exposes unknown source_missing rows instead of calling them paid', () => {
  const source = effectiveSql();
  assert.match(source, /source_missing.*true|is\s+true.*source_missing/is);
  assert.match(source, /incomplete|reconciliation|reconcili/i);
  assert.doesNotMatch(source, /source_missing[^\n]*pago|pago[^\n]*source_missing/i);
});

test('canonical reader has explicit authenticated/service-role authorization and no Sol operational RPCs', () => {
  const source = effectiveSql();
  assert.match(source, /security\s+definer/i);
  assert.match(source, /auth\.role\(\)/i);
  assert.match(source, /get_user_unidade_ids/i);
  assert.match(source, /service_role/i);
  for (const forbidden of [
    'sol_caixa_lancar_recebimento',
    'sol_caixa_abrir',
    'sol_caixa_fechar',
    'sol_caixa_casar_parcela',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test('canonical reader fixes the public signature, BRT default, and explicit grants', () => {
  const source = effectiveSql();
  assert.match(source, /get_inadimplencia_canonica\s*\(\s*p_unidade_id\s+uuid\s+default\s+null\s*,\s*p_as_of_date\s+date\s+default\s+\(now\(\)\s+at\s+time\s+zone\s+'America\/Sao_Paulo'\)::date/is);
  assert.match(source, /revoke\s+all\s+on\s+function\s+public\.get_inadimplencia_canonica\(uuid,\s*date\)\s+from\s+public,\s*anon/is);
  assert.match(source, /grant\s+execute\s+on\s+function\s+public\.get_inadimplencia_canonica\(uuid,\s*date\)\s+to\s+authenticated,\s*service_role/is);
});
