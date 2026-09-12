import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LARGURA_MAXIMA_MOBILE, MEDIA_QUERY_MOBILE, ehLarguraMobile, resolverShell,
} from '../src/lib/shellMobile.ts';

test('o corte e 1023px: iPad retrato e mobile, iPad paisagem nao', () => {
  assert.equal(LARGURA_MAXIMA_MOBILE, 1023);
  assert.equal(MEDIA_QUERY_MOBILE, '(max-width: 1023px)');
  assert.equal(ehLarguraMobile(390), true, 'iPhone');
  assert.equal(ehLarguraMobile(768), true, 'iPad retrato');
  assert.equal(ehLarguraMobile(1023), true, 'ultimo pixel mobile');
  assert.equal(ehLarguraMobile(1024), false, 'iPad paisagem ja e desktop');
  assert.equal(ehLarguraMobile(1920), false);
});

test('resolverShell', async (t) => {
  await t.test('sem flag e sem override, decide pela largura', () => {
    assert.equal(resolverShell({ larguraMobile: true }), 'mobile');
    assert.equal(resolverShell({ larguraMobile: false }), 'desktop');
  });

  await t.test('kill switch vence a largura — e o rollback sem revert', () => {
    assert.equal(resolverShell({ larguraMobile: true, flagDesligada: true }), 'desktop');
  });

  await t.test('override manual vence tudo, para testar no proprio aparelho', () => {
    assert.equal(resolverShell({ larguraMobile: false, override: 'mobile' }), 'mobile');
    assert.equal(resolverShell({ larguraMobile: true, override: 'desktop' }), 'desktop');
    // Kill switch e decisao de operacao: nem o override o contraria.
    assert.equal(resolverShell({ larguraMobile: true, flagDesligada: true, override: 'mobile' }), 'desktop');
  });

  await t.test('override com lixo e ignorado, nao quebra', () => {
    assert.equal(resolverShell({ larguraMobile: true, override: 'banana' }), 'mobile');
    assert.equal(resolverShell({ larguraMobile: true, override: null }), 'mobile');
  });
});
