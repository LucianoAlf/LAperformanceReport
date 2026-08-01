import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = readFileSync(
  resolve(
    repoRoot,
    'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
  ),
  'utf8',
);
const tab = readFileSync(
  resolve(
    repoRoot,
    'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx',
  ),
  'utf8',
);

test('frontend reconhece e explica data de nascimento ausente', () => {
  assert.match(types, /'data_nascimento_ausente'/);
  assert.match(types, /'indeterminado'/);
  assert.match(tab, /Data de nascimento não cadastrada/);
});

test('modo teste nao contorna o bloqueio de destinatario indeterminado', () => {
  const ocorrencias = tab.match(/data_nascimento_ausente/g) ?? [];
  assert.ok(
    ocorrencias.length >= 3,
    'codigo deve participar do rotulo, da trava e da orientacao de cadastro',
  );
});
