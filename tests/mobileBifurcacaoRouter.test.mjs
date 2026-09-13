import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = (p) => readFileSync(p, 'utf8');
const responsive = ler('src/components/App/Layout/ResponsiveLayout.tsx');
const hook = ler('src/hooks/useShellMobile.ts');
const router = ler('src/router.tsx');

test('o router monta o ResponsiveLayout, nao mais o AppLayout direto', () => {
  assert.match(router, /<ResponsiveLayout \/>/u);
  assert.doesNotMatch(router, /element: <AppLayout \/>/u);
});

test('a bifurcacao usa a decisao pura, sem reimplementar o corte', () => {
  // A leitura das 3 entradas mudou de lugar (do shell para o hook) porque a
  // tela do Dashboard precisava da MESMA decisao; o que nao pode mudar e que
  // o corte continue morando em shellMobile.ts.
  assert.match(hook, /resolverShell/u);
  assert.match(hook, /useIsMobile/u);
  assert.doesNotMatch(hook, /1023/u, 'o corte mora em shellMobile.ts, nao aqui');
  assert.doesNotMatch(responsive, /1023/u, 'o corte mora em shellMobile.ts, nao aqui');
});

test('o kill switch e o override ALIMENTAM resolverShell, nao ficam soltos', () => {
  // Casar so a string deixaria o teste verde com a env citada num comentario.
  assert.match(hook, /flagDesligada[\s\S]{0,90}VITE_MOBILE_SHELL/u);
  assert.match(hook, /getItem\('shell-override'\)/u);
  assert.match(hook, /resolverShell\(\{[\s\S]{0,240}flagDesligada[\s\S]{0,240}override/u);
});

test('a bifurcacao RENDERIZA os dois shells conforme a decisao', () => {
  // Nao basta o nome aparecer no arquivo: um import solto passaria, e o
  // teste diria "os dois shells existem" com a bifurcacao quebrada.
  assert.match(responsive, /shell === 'mobile'\s*\?\s*<MobileLayout \/>\s*:\s*<AppLayout \/>/u);
});
