import assert from 'node:assert/strict';

import {
  CATEGORIAS_CAIXA_PADRAO,
  filtrarCategoriasCaixaPorAmbiente,
  normalizarSlugCategoriaCaixa,
  prepararNovaCategoriaCaixa,
} from '../src/lib/caixaCategorias.ts';

assert.equal(normalizarSlugCategoriaCaixa('Passaporte'), 'passaporte');
assert.equal(normalizarSlugCategoriaCaixa('Venda lojinha - Camiseta'), 'venda_lojinha_camiseta');

assert.ok(
  CATEGORIAS_CAIXA_PADRAO.some((categoria) => categoria.slug === 'passaporte' && categoria.nome === 'Passaporte'),
  'Passaporte precisa existir na lista padrao',
);

const categoriasVenda = filtrarCategoriasCaixaPorAmbiente(CATEGORIAS_CAIXA_PADRAO, 'venda');
assert.ok(categoriasVenda.some((categoria) => categoria.slug === 'passaporte'));
assert.ok(categoriasVenda.every((categoria) => categoria.ativo));

const nova = prepararNovaCategoriaCaixa(' Aula experimental ', 'ambos', 'Luciano');
assert.deepEqual(
  { slug: nova.slug, nome: nova.nome, ambiente: nova.ambiente, criado_por: nova.criado_por },
  { slug: 'aula_experimental', nome: 'Aula experimental', ambiente: 'ambos', criado_por: 'Luciano' },
);

console.log('caixa categorias ok');
