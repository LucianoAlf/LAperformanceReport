import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = 'scripts/previsualizar-reparo-presenca-v2.mjs';

test('script de previa usa somente as duas RPCs read-only e quatro categorias permitidas', () => {
  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /get_presenca_shadow_comparacao_v2/u);
  assert.match(source, /get_presenca_previa_reparo_v2/u);
  assert.match(source, /decisoes_humanas_byte_identical/u);
  assert.match(source, /cutover_executado: false/u);
  assert.doesNotMatch(source, /\.from\s*\(/u);
  assert.doesNotMatch(source, /\.(?:insert|update|delete|upsert)\s*\(/u);
  for (const key of [
    'vinculos_roster_soft_inativar',
    'estados_snapshot_corrigir',
    'gemeas_reconciliar',
    'funcoes_live_only_versionar',
  ]) assert.match(source, new RegExp(key, 'u'));
});

test('ajuda funciona sem credenciais e declara o limite read-only', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--help'], {
    encoding: 'utf8',
    env: {},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /somente leitura/iu);
  assert.match(result.stdout, /SUPABASE_SERVICE_ROLE_KEY/u);
});
