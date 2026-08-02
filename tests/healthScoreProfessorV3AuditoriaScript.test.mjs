import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync('scripts/auditar-health-score-v3-jun-jul.mjs', 'utf8');

test('auditoria nominal de junho e julho e estritamente somente leitura', () => {
  assert.match(script, /Matheus Lana da Silva/);
  assert.match(script, /Valdo Delfino/);
  assert.match(script, /2026-06-01/);
  assert.match(script, /2026-07-01/);
  assert.match(script, /AUDITORIA_APROVADA=/);
  assert.match(script, /carteira ainda interfere na nota/);
  assert.match(script, /pesos efetivos somam/);
  assert.doesNotMatch(script, /\b(insert|update|delete|truncate|alter|drop|create)\b/i);
});
