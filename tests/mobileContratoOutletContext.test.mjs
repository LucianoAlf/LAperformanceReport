import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = (p) => readFileSync(p, 'utf8');

/** Extrai as chaves de `context={{ ... }}` do JSX do Outlet. */
function chavesDoContexto(fonte, arquivo) {
  const m = fonte.match(/<Outlet\s+context=\{\{([\s\S]*?)\}\}/u);
  assert.ok(m, `${arquivo}: nao achei <Outlet context={{...}}>`);
  return m[1]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.includes(':') ? p.slice(0, p.indexOf(':')) : p).trim())
    .sort();
}

test('o shell mobile entrega EXATAMENTE o mesmo contexto que o desktop', () => {
  const desktop = chavesDoContexto(ler('src/components/App/Layout/AppLayout.tsx'), 'AppLayout');
  const mobile = chavesDoContexto(ler('src/mobile/MobileLayout.tsx'), 'MobileLayout');

  assert.deepEqual(
    mobile,
    desktop,
    'divergir aqui quebra TODA pagina ao ser aberta no celular — cada uma faz useOutletContext() esperando estas chaves',
  );
  // Guarda contra o teste passar vazio dos dois lados.
  assert.ok(desktop.length >= 5, `esperava 5+ chaves, achei ${desktop.length}`);
});

test('o AppLayout do desktop segue intocado por este plano', () => {
  const desktop = ler('src/components/App/Layout/AppLayout.tsx');
  assert.match(desktop, /marginLeft: isSidebarCollapsed \? '96px' : '256px'/u);
  assert.doesNotMatch(desktop, /mobile/iu, 'AppLayout nao deve conhecer o shell mobile');
});
