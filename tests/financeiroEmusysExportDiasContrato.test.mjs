import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exportSource = readFileSync(
  new URL('../supabase/functions/export-financeiro-lancamentos/index.ts', import.meta.url),
  'utf8',
);

test('cada item de varredura exporta os dias da competência pedida', () => {
  assert.match(exportSource, /agruparDiasVarreduraPorUnidade/);
  assert.match(exportSource, /dias:\s*diasPorUnidade\.get\(r\.unidade_id\)\s*\?\?\s*\[\]/);
  assert.match(exportSource, /\.select\(['"]unidade_id,data,status,concluido_em['"]\)/);
  assert.match(exportSource, /\.order\(['"]data['"],\s*\{\s*ascending:\s*true\s*\}\)/);
});
