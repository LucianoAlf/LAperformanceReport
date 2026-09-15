import assert from 'node:assert/strict';
import test from 'node:test';

import {
  labelDaUnidade, LABEL_CONSOLIDADO, LABEL_UNIDADE_DESCONHECIDA,
} from '../src/mobile/unidadeLabel.ts';

const UNIDADES = [
  { id: 'cg', nome: 'Campo Grande' },
  { id: 'sem-nome', nome: null },
];

test('labelDaUnidade', async (t) => {
  await t.test('filtroAtivo null e a UNICA condicao para "Consolidado"', () => {
    assert.equal(labelDaUnidade(null, null, UNIDADES), LABEL_CONSOLIDADO);
    assert.equal(labelDaUnidade(null, 'cg', UNIDADES), LABEL_CONSOLIDADO);
    assert.equal(LABEL_CONSOLIDADO, 'Consolidado');
  });

  await t.test('unidade com nome: devolve o nome', () => {
    assert.equal(labelDaUnidade('cg', 'cg', UNIDADES), 'Campo Grande');
  });

  await t.test('unidade selecionada mas SEM nome nao vira "Consolidado"', () => {
    // e' o bug do item 3: unidadesDisponiveis e' [] pra admin por desenho, e o
    // fallback legado de nao-admin pode ter nome null. Nenhum dos dois casos
    // e' rede inteira.
    assert.equal(labelDaUnidade('sem-nome', 'sem-nome', UNIDADES), LABEL_UNIDADE_DESCONHECIDA);
    assert.notEqual(labelDaUnidade('sem-nome', 'sem-nome', UNIDADES), LABEL_CONSOLIDADO);
  });

  await t.test('unidadesDisponiveis vazia (admin escolhendo uma unidade) tambem nao vira "Consolidado"', () => {
    assert.equal(labelDaUnidade('cg', 'cg', []), LABEL_UNIDADE_DESCONHECIDA);
  });
});
