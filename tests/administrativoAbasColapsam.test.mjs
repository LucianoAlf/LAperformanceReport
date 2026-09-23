// As abas do Administrativo que AINDA NÃO foram portadas precisam, no mínimo,
// caber na tela do celular.
//
// Elas seguem sendo telas de computador, com a faixa âmbar por cima — a
// "degradação combinada" do spec. O que este teste trava é o piso: nenhuma
// grade de 3+ colunas sem ponto de colapso, e nenhum trilho de abas que
// espreme em vez de rolar.
//
// 🔴 De onde veio: o Hugo mandou o screenshot do pódio do Fideliza+ a 390px.
// `grid grid-cols-3` num container de 366px dá **122px por card**, e rótulos
// como "Inadimplencia" (92px de texto) caíam em **35px** de espaço — 2,6× mais
// largos que o buraco. O nome do farmer chegava a sobrepor o avatar. Não era
// uma tela mal desenhada: era uma tela de desktop SEM PONTO DE COLAPSO.
//
// ⚠️ O desktop não muda e isso é verificável sem navegador: `sm` é 640px e a
// menor largura de desktop que o app atende é 1024px (`LARGURA_MAXIMA_MOBILE`
// = 1023). Acima de 640px as duas formas resolvem para a mesma regra de CSS.
// Conferido a 1440px: o pódio volta a 3 colunas reais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

/** As TELAS do Administrativo e da Lojinha. Modais ficam de fora: eles já
 *  foram medidos a 390px e cabem (390px de largura, zero rolagem lateral). */
function telasDoModulo() {
  const achados = [];
  const varrer = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        varrer(caminho);
      } else if (nome.endsWith('.tsx') && !nome.includes('Modal')) {
        achados.push(caminho);
      }
    }
  };
  varrer(join(RAIZ, 'src/components/App/Administrativo'));
  varrer(join(RAIZ, 'src/components/App/Lojinha'));
  return achados;
}

function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** `grid-cols-N` (N>=3) sem nenhum ponto de colapso declarado na mesma classe. */
function gradesSemColapso(fonte) {
  const achados = [];
  // Cada atributo className="..." (ou cn("...")) é examinado inteiro: o que
  // importa é se a MESMA lista de classes declara um colapso.
  for (const m of fonte.matchAll(/(?:className=|cn\()\s*[{"'`]([^"'`]{0,400})/g)) {
    const classes = m[1];
    const fixa = /(?<![\w:-])grid-cols-([3-9])(?![\d])/.exec(classes);
    if (!fixa) continue;
    // colapso declarado = existe um grid-cols menor sem prefixo, e o grande
    // com prefixo responsivo.
    const temPrefixado = /(sm|md|lg|xl):grid-cols-\d/.test(classes);
    if (!temPrefixado) achados.push(classes.slice(0, 80));
  }
  return achados;
}

test('🔴 nenhuma tela do Administrativo tem grade de 3+ colunas que não colapsa', () => {
  const culpadas = [];
  for (const arquivo of telasDoModulo()) {
    const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
    const achados = gradesSemColapso(fonte);
    if (achados.length) {
      culpadas.push(`${relative(RAIZ, arquivo)}: ${achados.join(' | ')}`);
    }
  }
  assert.deepEqual(
    culpadas,
    [],
    'grade fixa de 3+ colunas a 390px dá ~120px por card — foi o que espremeu o pódio do Fideliza+',
  );
});

test('o pódio do Fideliza+ colapsa, e volta a 3 colunas no computador', () => {
  const fonte = readFileSync(join(RAIZ, 'src/components/App/Administrativo/TabProgramaFideliza.tsx'), 'utf8');
  assert.match(
    fonte,
    /grid-cols-1 sm:grid-cols-3[^"]*"\s*>\s*\{farmers\.map/,
    'a grade dos três cards de farmer perdeu o ponto de colapso',
  );
});

test('os trilhos de sub-abas ROLAM em vez de espremer', () => {
  // `overflow-x-auto` sozinho não basta: item de flex encolhe por padrão
  // (`flex-shrink: 1`), então sem `shrink-0` o trilho espreme os botões e
  // continua sem rolar. Os dois andam juntos.
  const trilhos = [
    ['PainelFarmer/index.tsx', 'subTabs.map'],
    ['TabProgramaFideliza.tsx', 'ABAS_CONFIG.map'],
  ];
  for (const [rel, marcador] of trilhos) {
    const fonte = readFileSync(join(RAIZ, 'src/components/App/Administrativo', rel), 'utf8');
    const i = fonte.indexOf(marcador);
    assert.ok(i > 0, `${rel}: o trilho mudou de forma`);
    const container = fonte.slice(Math.max(0, i - 400), i);
    assert.match(container, /overflow-x-auto/, `${rel}: o trilho não rola`);
    const botao = fonte.slice(i, i + 900);
    assert.match(botao, /shrink-0/, `${rel}: sem shrink-0 o trilho espreme em vez de rolar`);
  }
});

test('as seis abas não portadas continuam avisando que são telas de computador', () => {
  const abas = readFileSync(join(RAIZ, 'src/mobile/abasPortadas.ts'), 'utf8');
  // Caber não é o mesmo que ter sido adaptada. A faixa só sai quando a aba
  // ganha uma tela própria — é o contrário de esconder o aviso porque o
  // layout parou de quebrar.
  const linha = /'\/app\/administrativo':\s*\[([^\]]*)\]/.exec(abas);
  assert.ok(linha, 'a rota sumiu de ABAS_PORTADAS');
  const portadas = [...linha[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    portadas,
    ['lancamentos'],
    'colapsar a grade fez a aba caber, não a fez portada — a faixa continua',
  );
});
