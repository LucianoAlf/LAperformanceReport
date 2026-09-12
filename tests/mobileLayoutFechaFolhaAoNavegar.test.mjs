import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync('src/mobile/MobileLayout.tsx', 'utf8');
const agenda = readFileSync('src/lib/agenda.ts', 'utf8');

test('a folha "Mais" fecha quando a rota muda (voltar do Android)', () => {
  // Ancorado no efeito INTEIRO — nao so em "setMaisAberto(false)" solto, que
  // ja aparece em outro lugar (o onFechar da MobileMaisSheet) e passaria
  // mesmo sem o useEffect existir.
  assert.match(
    layout,
    /useEffect\(\(\) => \{\s*setMaisAberto\(false\);\s*\}, \[location\.pathname\]\);/u,
  );
});

test('unidadeLabel.ts decide Consolidado x Unidade, MobileLayout so repassa', () => {
  assert.match(layout, /labelDaUnidade\(filtroAtivo, unidadeSelecionada, unidadesDisponiveis\)/u);
  assert.doesNotMatch(layout, /\?\?\s*'Consolidado'/u, 'a decisao nao pode voltar a morar aqui por ausencia de nome');
});

test('a funcao local de iniciais tem nome proprio — nao colide com a de agenda.ts', () => {
  assert.match(layout, /function iniciaisDoUsuario\(/u);
  assert.doesNotMatch(layout, /function iniciaisDoNome\(/u, 'o nome antigo colidia com src/lib/agenda.ts');

  // A de agenda.ts continua intocada: 1 palavra -> 2 letras (slice(0,2)),
  // diferente da local (1 palavra -> 1 letra). Sao funcoes DIFERENTES de
  // proposito — nunca dedupli-las.
  assert.match(agenda, /export function iniciaisDoNome\(nome: string\): string \{/u);
  assert.match(agenda, /partes\[0\]\.slice\(0, 2\)\.toUpperCase\(\)/u);
});
