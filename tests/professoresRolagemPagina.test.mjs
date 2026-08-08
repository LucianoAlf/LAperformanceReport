import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

function tableShell(source, tour) {
  const match = source.match(new RegExp(`data-tour="${tour}"[\\s\\S]{0,260}`));
  assert.ok(match, `não encontrou a tabela ${tour}`);
  return match[0];
}

test('Performance delega a rolagem vertical para a página', () => {
  const shell = tableShell(
    read('src/components/App/Professores/TabPerformanceProfessores.tsx'),
    'professores-tabela',
  );

  assert.match(shell, /<div className="overflow-x-auto">/);
  assert.doesNotMatch(shell, /max-h-\[70vh\]|overflow-auto/);
});

test('Carteira delega a rolagem vertical para a página', () => {
  const shell = tableShell(
    read('src/components/App/Professores/TabCarteiraProfessores.tsx'),
    'professores-carteira-tabela',
  );

  assert.match(shell, /<div className="overflow-x-auto">/);
  assert.doesNotMatch(shell, /max-h-\[70vh\]|overflow-auto/);
});
