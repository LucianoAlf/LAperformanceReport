// O trilho que rola para o lado no celular.
//
// 🔴 De onde veio: o Hugo, no Administrativo mobile — *"essas tabs de
// renovações, etc. eu não consigo arrastar pro lado aqui no PC, mas não sei se
// é uma limitação do PC ou se você não fez"*. Medido a 390px: o trilho ROLA
// (scrollWidth 1322 contra clientWidth 380) e o arrasto com o mouse nunca
// funciona num contêiner nativo — o dedo funciona, o ponteiro não.
//
// O defeito que a mesma medição revelou: 7 dos 9 chips ficam fora da vista, o
// último começa a 1179px, e nada na tela dizia que havia mais. É isso que
// estes testes travam.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import esbuild from 'esbuild';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// `node --test` não tem bundler: compilo o módulo TS com o esbuild que o repo
// já usa, em vez de reescrever as regras aqui (reimplementar provaria a cópia).
// ⚠️ Pela API, nunca por `execFileSync('npx.cmd')` — o Node 22 no Windows
// recusa spawn de `.cmd` sem shell e o teste morre antes do primeiro assert.
const { alvoDeRolagem, bordasDoTrilho, mascaraDoTrilho } = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/trilhoRolavel.ts')],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = join(mkdtempSync(join(tmpdir(), 'trilho-')), 'trilhoRolavel.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

// As medidas reais do trilho de filas a 390px, lidas no navegador.
const TRILHO = { scrollLeft: 0, clientWidth: 380, scrollWidth: 1322 };
const ALUNOS_NOVOS = { offsetLeft: 1179, offsetWidth: 131 };
const RENOVACOES = { offsetLeft: 12, offsetWidth: 123 };
const AVISOS = { offsetLeft: 291, offsetWidth: 137 };

test('🔴 o chip aceso que está fora da vista é trazido para dentro', () => {
  const destino = alvoDeRolagem(TRILHO, ALUNOS_NOVOS);
  assert.ok(destino > 0, 'o trilho não se mexeu para um chip a 1179px');
  // Depois de rolar, o chip cabe inteiro na janela visível.
  const inicioVisivel = destino;
  const fimVisivel = destino + TRILHO.clientWidth;
  assert.ok(ALUNOS_NOVOS.offsetLeft >= inicioVisivel, 'o chip ficou cortado à esquerda');
  assert.ok(ALUNOS_NOVOS.offsetLeft + ALUNOS_NOVOS.offsetWidth <= fimVisivel, 'o chip ficou cortado à direita');
});

test('🔴 chip JÁ visível não faz o trilho se mexer', () => {
  // Centralizar o primeiro chip — que abre aceso — empurraria o trilho para
  // longe do começo e esconderia o que já estava certo.
  assert.equal(alvoDeRolagem(TRILHO, RENOVACOES), 0);
  assert.equal(alvoDeRolagem({ ...TRILHO, scrollLeft: 260 }, AVISOS), 260);
});

test('a rolagem nunca passa das pontas', () => {
  const maximo = TRILHO.scrollWidth - TRILHO.clientWidth;
  assert.equal(alvoDeRolagem(TRILHO, { offsetLeft: 1310, offsetWidth: 12 }), maximo);
  assert.equal(
    alvoDeRolagem({ ...TRILHO, scrollLeft: 900 }, { offsetLeft: 0, offsetWidth: 40 }),
    0,
    'voltar ao primeiro chip não pode produzir scrollLeft negativo',
  );
});

test('🔴 o esmaecimento diz a verdade nas DUAS pontas', () => {
  const noComeco = bordasDoTrilho(TRILHO);
  assert.equal(noComeco.temAntes, false, 'no começo não há nada escondido atrás');
  assert.equal(noComeco.temDepois, true);

  const noFim = bordasDoTrilho({ ...TRILHO, scrollLeft: 942 });
  assert.equal(noFim.temAntes, true);
  assert.equal(noFim.temDepois, false, 'no fim o trilho continuava prometendo mais conteúdo');

  const noMeio = bordasDoTrilho({ ...TRILHO, scrollLeft: 400 });
  assert.equal(noMeio.temAntes, true);
  assert.equal(noMeio.temDepois, true);
});

test('trilho que cabe inteiro não ganha máscara nenhuma', () => {
  const cabe = { scrollLeft: 0, clientWidth: 380, scrollWidth: 380 };
  const bordas = bordasDoTrilho(cabe);
  assert.deepEqual(bordas, { temAntes: false, temDepois: false });
  assert.equal(mascaraDoTrilho(bordas), undefined, 'máscara toda preta custa composição por nada');
});

test('a máscara esmaece só o lado que tem conteúdo escondido', () => {
  const soDepois = mascaraDoTrilho({ temAntes: false, temDepois: true });
  assert.match(soDepois, /^linear-gradient\(to right, black 0,/, 'a ponta esquerda não pode nascer esmaecida');
  assert.match(soDepois, /transparent 100%\)$/);

  const soAntes = mascaraDoTrilho({ temAntes: true, temDepois: false });
  assert.match(soAntes, /^linear-gradient\(to right, transparent 0,/);
  assert.match(soAntes, /black 100%\)$/, 'chegando ao fim, a direita volta a ser sólida');
});

// ── Contrato do consumo ────────────────────────────────────────────────────

function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const hook = readFileSync(join(RAIZ, 'src/mobile/useTrilhoRolavel.ts'), 'utf8');
const tela = readFileSync(join(RAIZ, 'src/mobile/telas/administrativo/AdministrativoMobile.tsx'), 'utf8');

test('🔴 a rolagem é escrita em scrollLeft, nunca por scrollIntoView', () => {
  // `scrollIntoView` mexe nos dois eixos: o ancestral vertical aqui é o <main>
  // do shell, então escolher um filtro daria um salto na lista inteira.
  assert.doesNotMatch(semComentarios(hook), /scrollIntoView/, 'voltou a rolar pelos dois eixos');
  assert.match(hook, /scrollTo\(\{\s*left:/, 'o hook parou de escrever a posição horizontal');
});

test('o movimento respeita quem pediu menos movimento', () => {
  assert.match(hook, /prefers-reduced-motion: reduce/, 'a rolagem suave virou obrigatória');
});

test('a máscara leva o prefixo do Safari', () => {
  // Sem `WebkitMaskImage` o esmaecimento simplesmente não existe no iOS, que é
  // metade do público de uma tela de celular.
  assert.match(hook, /WebkitMaskImage/, 'a máscara sumiria no iOS');
});

test('🔴 o trilho de filas está LIGADO ao hook', () => {
  const fonte = semComentarios(tela);
  assert.match(fonte, /ref=\{trilho\.refTrilho\}/, 'o trilho perdeu a referência');
  assert.match(fonte, /style=\{trilho\.estiloDaMascara\}/, 'o esmaecimento parou de ser aplicado');
  assert.match(fonte, /ref=\{ativa \? trilho\.refAtivo : undefined\}/, 'o chip aceso deixou de ser marcado');
  assert.match(fonte, /trazerAtivoAVista\(\);/, 'ninguém mais traz o chip aceso à vista');
});
