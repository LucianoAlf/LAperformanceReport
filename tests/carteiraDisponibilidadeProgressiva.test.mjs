import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/App/Professores/TabCarteiraProfessores.tsx', 'utf8');

test('Carteira contratual aparece antes dos enriquecimentos que podem expirar', () => {
  const carteiraRecebida = source.indexOf('linhasContratuaisFallback = carteiraResult.data || []');
  const carteiraInicial = source.indexOf('setCarteiras(carteirasContratuaisIniciais.filter');
  const aguardaEnriquecimentos = source.indexOf('await complementaresPromise');

  assert.ok(carteiraRecebida >= 0, 'a resposta contratual deve ser preservada');
  assert.ok(carteiraInicial > carteiraRecebida, 'a resposta contratual deve alimentar a tela');
  assert.ok(
    carteiraInicial < aguardaEnriquecimentos,
    'a tela não pode aguardar KPI de período, Média/Turma ou trancados para exibir a carteira',
  );
});

test('Carteira sempre envia p_unidade_id, inclusive no Consolidado', () => {
  assert.match(
    source,
    /const rpcParams = \{\s*p_unidade_id:\s*unidadeAtual !== 'todos' \? unidadeAtual : null,?\s*\};/,
  );
});
