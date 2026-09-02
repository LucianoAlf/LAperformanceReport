import assert from 'node:assert/strict';
import test from 'node:test';
import { mapearConsumidores } from '../scripts/mapa-banco/consumidores.mjs';

test('encontra chamada no front', () => {
  const mapa = mapearConsumidores({
    nomes: ['get_agenda_dia'],
    fontes: [{ fonte: 'front', origem: 'src/hooks/useAgenda.ts', texto: "supabase.rpc('get_agenda_dia', {})" }],
  });
  assert.deepEqual(mapa.get('get_agenda_dia'), [
    { fonte: 'front', origem: 'src/hooks/useAgenda.ts' },
  ]);
});

test('NAO casa nome que e prefixo de outro', () => {
  // 'get_kpis' nao pode ser dado como vivo so porque 'get_kpis_v2' aparece
  const mapa = mapearConsumidores({
    nomes: ['get_kpis', 'get_kpis_v2'],
    fontes: [{ fonte: 'front', origem: 'a.ts', texto: "supabase.rpc('get_kpis_v2')" }],
  });
  assert.deepEqual(mapa.get('get_kpis'), []);
  assert.equal(mapa.get('get_kpis_v2').length, 1);
});

test('funcao nao conta como consumidora de si mesma', () => {
  const mapa = mapearConsumidores({
    nomes: ['fn_x'],
    fontes: [{ fonte: 'funcao', origem: 'fn_x', texto: 'begin return fn_x(); end' }],
  });
  assert.deepEqual(mapa.get('fn_x'), []);
});

test('deduplica a mesma origem citada varias vezes', () => {
  const mapa = mapearConsumidores({
    nomes: ['fn_y'],
    fontes: [{ fonte: 'funcao', origem: 'fn_z', texto: 'select fn_y(); select fn_y();' }],
  });
  assert.equal(mapa.get('fn_y').length, 1);
});

test('acha nome dentro de comando de cron', () => {
  const mapa = mapearConsumidores({
    nomes: ['fn_enfileirar_relatorio_presenca'],
    fontes: [{ fonte: 'cron', origem: 'relatorio-presenca-pendencias-9h', texto: 'select fn_enfileirar_relatorio_presenca();' }],
  });
  assert.equal(mapa.get('fn_enfileirar_relatorio_presenca')[0].fonte, 'cron');
});

test('nome ausente devolve lista vazia, nunca undefined', () => {
  const mapa = mapearConsumidores({ nomes: ['fn_orfa'], fontes: [] });
  assert.deepEqual(mapa.get('fn_orfa'), []);
});

test('resultado e ordenado, para a saida do gerador nao oscilar', () => {
  const fontes = [
    { fonte: 'view', origem: 'vw_b', texto: 'select fn_y()' },
    { fonte: 'front', origem: 'z.ts', texto: 'rpc("fn_y")' },
    { fonte: 'front', origem: 'a.ts', texto: 'rpc("fn_y")' },
  ];
  const direto = mapearConsumidores({ nomes: ['fn_y'], fontes });
  const invertido = mapearConsumidores({ nomes: ['fn_y'], fontes: [...fontes].reverse() });
  assert.deepEqual(direto.get('fn_y'), invertido.get('fn_y'));
  assert.deepEqual(direto.get('fn_y').map((c) => c.origem), ['a.ts', 'z.ts', 'vw_b']);
});
