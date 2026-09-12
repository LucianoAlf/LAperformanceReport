import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { rotaFoiPortada } from '../src/mobile/rotasPortadas.ts';

test('rotaFoiPortada', async (t) => {
  await t.test('rota nao listada nao foi portada', () => {
    assert.equal(rotaFoiPortada('/app/comercial', []), false);
  });

  await t.test('casa a rota exata', () => {
    assert.equal(rotaFoiPortada('/app/agenda', ['/app/agenda']), true);
  });

  await t.test('sub-rota herda o estado da rota portada', () => {
    // /app/campanhas/123 e a mesma tela de /app/campanhas.
    assert.equal(rotaFoiPortada('/app/campanhas/42', ['/app/campanhas']), true);
  });

  await t.test('nao casa por prefixo de texto solto', () => {
    // '/app/alunos-arquivados' NAO e sub-rota de '/app/alunos'.
    assert.equal(rotaFoiPortada('/app/alunos-arquivados', ['/app/alunos']), false);
  });

  await t.test('a raiz /app so casa com ela mesma', () => {
    assert.equal(rotaFoiPortada('/app', ['/app']), true);
    assert.equal(rotaFoiPortada('/app/alunos', ['/app']), false);
  });
});

test('nesta etapa nenhuma rota foi portada ainda', () => {
  const fonte = readFileSync('src/mobile/rotasPortadas.ts', 'utf8');
  assert.match(fonte, /ROTAS_PORTADAS[^=]*=\s*\[\s*\]/u, 'a etapa 1 entrega o shell, nenhuma tela');
});

test('a faixa avisa sem bloquear', () => {
  const aviso = readFileSync('src/mobile/AvisoNaoOtimizado.tsx', 'utf8');
  assert.match(aviso, /ainda não adaptada/u);
  // Bloquear tiraria acesso que a equipe tem hoje em 17 modulos de uma vez.
  assert.doesNotMatch(aviso, /abra no computador/iu);
});
