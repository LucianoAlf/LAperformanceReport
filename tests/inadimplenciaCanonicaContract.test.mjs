import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migration = path.join(root, 'supabase', 'migrations', '20260816000731_inadimplencia_canonica_frescor.sql');

function sql() {
  return fs.readFileSync(migration, 'utf8');
}

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
  const source = sql();
  assert.match(source, /canonical_fatura_id/);
  assert.match(source, /emusys_fatura_id/);
  assert.match(source, /emusys_matricula_id/);
  assert.match(source, /source_missing\s+is\s+false/i);
  assert.match(source, /valor_original/);
  assert.match(source, /0\.02/);
  assert.match(source, /0\.01/);
  assert.match(source, /data_vencimento/);
  assert.match(source, /valor_atualizado/);
});

test('canonical reader exposes unknown source_missing rows instead of calling them paid', () => {
  const source = sql();
  assert.match(source, /source_missing.*true|is\s+true.*source_missing/is);
  assert.match(source, /incomplete|reconciliation|reconcili/i);
  assert.doesNotMatch(source, /source_missing[^\n]*pago|pago[^\n]*source_missing/i);
});

test('canonical reader has explicit authenticated/service-role authorization and no Sol operational RPCs', () => {
  const source = sql();
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
