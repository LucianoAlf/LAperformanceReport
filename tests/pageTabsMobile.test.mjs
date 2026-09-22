import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tabs = le('../src/components/ui/page-tabs.tsx');
const css = le('../src/index.css');

/** O bloco do celular (`lg:hidden`) — o do desktop é `hidden lg:block`. */
const blocoMobile = () => {
  const i = tabs.indexOf('{/* Mobile Tabs */}');
  assert.ok(i > -1, 'o bloco mobile sumiu do PageTabs');
  return tabs.slice(i);
};

test('🔴 toda classe de scrollbar usada EXISTE no CSS', () => {
  // O defeito que originou este teste: o trilho declarava `scrollbar-hide` e a
  // classe nao estava definida em lugar nenhum do projeto — uma promessa vazia.
  // No computador a barra e discreta e ninguem percebeu; a 390px ela vira uma
  // faixa cinza de 12px sob as abas, em 14 telas.
  const usadas = new Set(
    [...le('../src/components/ui/page-tabs.tsx').matchAll(/\bscrollbar-[a-z-]+\b/g)].map((m) => m[0]),
  );
  assert.ok(usadas.size > 0, 'nenhuma classe de scrollbar — o assert perdeu o alvo');
  for (const classe of usadas) {
    assert.match(
      css,
      new RegExp(`\\.${classe}\\s*\\{`),
      `\`${classe}\` e usada mas NAO esta definida em src/index.css`,
    );
  }
});

test('esconder a barra exige DAR outra pista de que rola', () => {
  // Barra escondida sem substituto e pior que barra feia: o trilho passa a
  // parecer completo, e as abas alem da dobra viram invisiveis.
  assert.match(css, /\.scrollbar-hide\s*\{[\s\S]*?scrollbar-width:\s*none/);
  assert.match(css, /\.scrollbar-hide::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
  // A pista: desvanecimento na borda direita enquanto houver conteudo oculto.
  assert.match(blocoMobile(), /mask-image|maskImage|after:|bg-gradient-to-l/);
});

test('o alvo de toque da aba tem 44px', () => {
  const bloco = blocoMobile();
  const alturas = [...bloco.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(alturas.length > 0, 'a aba nao declara altura minima');
  for (const px of alturas) {
    assert.ok(px >= 44, `alvo de ${px}px — o minimo e 44`);
  }
});

test('a aba do celular nao usa fonte de 10px', () => {
  // 10px com `uppercase` e `tracking-wider` e o pior par possivel: o caixa alta
  // tira as ascendentes e descendentes que o olho usa para reconhecer a palavra,
  // justamente no tamanho em que ela ja esta no limite.
  const bloco = blocoMobile();
  assert.doesNotMatch(bloco, /text-\[10px\]/, 'a fonte de 10px voltou');
  const tamanhos = [...bloco.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  for (const px of tamanhos) {
    assert.ok(px >= 12, `fonte de ${px}px no celular — o minimo e 12`);
  }
});

test('⚠️ o bloco do DESKTOP nao foi tocado', () => {
  // A restricao fundadora da versao mobile: o computador nao muda. Os dois
  // blocos sao irmaos (`hidden lg:block` e `lg:hidden`), entao da para corrigir
  // um sem encostar no outro — e este assert e quem garante isso.
  const i = tabs.indexOf('hidden lg:block');
  const j = tabs.indexOf('{/* Mobile Tabs */}');
  assert.ok(i > -1 && j > i, 'a ordem dos blocos mudou — reveja o assert');
  const desktop = tabs.slice(i, j);
  assert.match(desktop, /text-sm/, 'o bloco do desktop perdeu o tamanho de fonte dele');
  assert.doesNotMatch(desktop, /min-h-\[44px\]/, 'o alvo do celular vazou para o desktop');
});
