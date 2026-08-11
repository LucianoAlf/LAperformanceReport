import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extrairCampanhaLabel,
  filtrarLeadsCampanhaPorUnidade,
  calcularTaxaConversao,
  calcularCustoPorMatricula,
} from '../src/lib/campanhasConversao.mjs';

test('extrairCampanhaLabel acha o label na tool "transfer" do primeiro agente que tiver', () => {
  const agentes = [
    { tools: [{ name: 'think', config: {} }, { name: 'transfer', config: { campanha_label: 'feirao-matriculas26' } }] },
  ];
  assert.equal(extrairCampanhaLabel(agentes), 'feirao-matriculas26');
});

test('extrairCampanhaLabel retorna null quando nenhum agente tem campanha_label', () => {
  const agentes = [{ tools: [{ name: 'transfer', config: {} }] }, { tools: [] }];
  assert.equal(extrairCampanhaLabel(agentes), null);
});

test('extrairCampanhaLabel retorna null para lista vazia ou undefined', () => {
  assert.equal(extrairCampanhaLabel([]), null);
  assert.equal(extrairCampanhaLabel(undefined), null);
});

test('filtrarLeadsCampanhaPorUnidade mantém só linhas cujo lead.unidade_id bate (lead como objeto)', () => {
  const linhas = [
    { lead_id: 1, leads: { unidade_id: 'cg' } },
    { lead_id: 2, leads: { unidade_id: 'barra' } },
    { lead_id: 3, leads: { unidade_id: 'cg' } },
  ];
  const resultado = filtrarLeadsCampanhaPorUnidade(linhas, 'cg');
  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map(r => r.lead_id), [1, 3]);
});

test('filtrarLeadsCampanhaPorUnidade lida com lead vindo como array (embed one-to-many do PostgREST)', () => {
  const linhas = [{ lead_id: 1, leads: [{ unidade_id: 'cg' }] }];
  const resultado = filtrarLeadsCampanhaPorUnidade(linhas, 'cg');
  assert.equal(resultado.length, 1);
});

test('filtrarLeadsCampanhaPorUnidade descarta linha sem lead vinculado', () => {
  const linhas = [{ lead_id: 1, leads: null }];
  assert.equal(filtrarLeadsCampanhaPorUnidade(linhas, 'cg').length, 0);
});

test('calcularTaxaConversao divide matriculados por leads gerados', () => {
  assert.equal(calcularTaxaConversao(37, 4), 4 / 37);
});

test('calcularTaxaConversao retorna 0 quando não há leads (nunca divide por zero)', () => {
  assert.equal(calcularTaxaConversao(0, 0), 0);
});

test('calcularCustoPorMatricula divide custo real pelos matriculados', () => {
  assert.equal(calcularCustoPorMatricula(16.57, 4), 16.57 / 4);
});

test('calcularCustoPorMatricula retorna null quando não há matriculados (nunca divide por zero)', () => {
  assert.equal(calcularCustoPorMatricula(112.19, 0), null);
});
