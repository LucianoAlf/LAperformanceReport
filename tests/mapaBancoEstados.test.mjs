import assert from 'node:assert/strict';
import test from 'node:test';
import { classificarEstado, nomeBase } from '../scripts/mapa-banco/estados.mjs';

const nomes = ['get_x_v1', 'get_x_v3', 'get_y', 'fn_trg'];

test('com consumidor no front e ATIVA', () => {
  const r = classificarEstado({ nome: 'get_y', anon: false }, [{ fonte: 'front', origem: 'a.ts' }], nomes);
  assert.equal(r.estado, 'ATIVA');
});

test('so chamada por outra funcao e SO-INTERNA', () => {
  const r = classificarEstado({ nome: 'get_y', anon: false }, [{ fonte: 'funcao', origem: 'fn_z' }], nomes);
  assert.equal(r.estado, 'SO-INTERNA');
});

test('sem nenhum consumidor e ORFA', () => {
  const r = classificarEstado({ nome: 'get_y', anon: false }, [], nomes);
  assert.equal(r.estado, 'ORFA');
});

test('versao antiga com versao maior viva e LEGADO', () => {
  const r = classificarEstado({ nome: 'get_x_v1', anon: false }, [], nomes);
  assert.equal(r.estado, 'LEGADO');
  assert.match(r.motivo, /get_x_v3/);
});

test('LEGADO nao apaga o fato de estar em uso', () => {
  const r = classificarEstado({ nome: 'get_x_v1', anon: false }, [{ fonte: 'front', origem: 'a.ts' }], nomes);
  assert.equal(r.estado, 'ATIVA');
  assert.match(r.motivo, /get_x_v3/);
});

test('flag anon e ortogonal ao estado', () => {
  const r = classificarEstado({ nome: 'get_y', anon: true }, [], nomes);
  assert.equal(r.estado, 'ORFA');
  assert.equal(r.anon, true);
});

test('trigger sem gatilho continua ORFA, com trigger e ATIVA', () => {
  assert.equal(classificarEstado({ nome: 'fn_trg', anon: false }, [], nomes).estado, 'ORFA');
  const comGatilho = classificarEstado(
    { nome: 'fn_trg', anon: false },
    [{ fonte: 'trigger', origem: 'alunos.trg_x' }],
    nomes,
  );
  assert.equal(comGatilho.estado, 'ATIVA');
});

test('nomeBase remove o sufixo de versao', () => {
  assert.equal(nomeBase('get_x_v12'), 'get_x');
  assert.equal(nomeBase('get_x'), 'get_x');
});

test('versao maior so conta se for do mesmo nome-base', () => {
  const r = classificarEstado({ nome: 'get_x_v1', anon: false }, [], ['get_x_v1', 'get_outro_v9']);
  assert.equal(r.estado, 'ORFA');
  assert.equal(r.motivo, '');
});
