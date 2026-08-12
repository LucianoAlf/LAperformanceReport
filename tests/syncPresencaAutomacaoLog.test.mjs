import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sync = readFileSync(
  new URL('../supabase/functions/sync-presenca-emusys/index.ts', import.meta.url),
  'utf8',
);

test('conflito de cancelamento humano registra aluno_nome obrigatorio', () => {
  const conflito = sync.match(
    /from\('automacao_log'\)\.insert\(\{[\s\S]{0,900}?acao:\s*'conflito_cancelamento_humano'[\s\S]{0,900}?\}\);/,
  )?.[0] ?? '';

  assert.notEqual(conflito, '', 'bloco de auditoria do conflito nao encontrado');
  assert.match(conflito, /aluno_nome\s*:/);
});
