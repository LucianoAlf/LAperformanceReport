import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const header = readFileSync('src/mobile/MobileHeader.tsx', 'utf8');

test('o titulo usa a rota como fallback, nao so o literal morto', () => {
  assert.match(header, /tituloDaRota\(location\.pathname, TODOS_OS_ITENS\)/u);
  assert.match(header, /useLocation/u);
  // A regressao original: `pageTitle?.titulo || 'LA Report'` sozinho, sem
  // olhar a rota. Se isto voltar a casar SEM o tituloDaRota ao lado, o
  // fallback morreu nesta review de novo.
  assert.doesNotMatch(
    header,
    /const titulo = pageTitle\?\.titulo \|\| 'LA Report';/u,
    'fallback fixo sem olhar a rota — regressao do item 1',
  );
});

test('o fallback por rota enxerga os 4 grupos de menu, inclusive Admin e Historico', () => {
  assert.match(header, /MENU_PRINCIPAL/u);
  assert.match(header, /MENU_OPERACIONAL/u);
  assert.match(header, /MENU_ADMIN/u);
  assert.match(header, /MENU_HISTORICO/u);
});

test('onAbrirUnidades e opcional — sem folha, o seletor nao pode parecer clicavel', () => {
  assert.match(header, /onAbrirUnidades\?:\s*\(\)\s*=>\s*void/u, 'a prop precisa aceitar ausencia');

  // Com a prop presente: botao com chevron, cor ciano (reservada a navegacao)
  // e foco — SO nesse ramo.
  assert.match(header, /onAbrirUnidades\s*\?\s*\(/u, 'precisa ramificar no valor da prop, nao so aceitar undefined');
  assert.match(header, /<button[\s\S]{0,300}onClick=\{onAbrirUnidades\}[\s\S]{0,450}<ChevronDown/u);

  // Sem a prop: texto simples, sem chevron, sem foco, sem cor de navegacao.
  const ramoTexto = header.match(/\) : \(\s*<span[\s\S]*?<\/span>\s*\)\}/u);
  assert.ok(ramoTexto, 'esperava um ramo <span> como alternativa ao botao');
  assert.doesNotMatch(ramoTexto[0], /ChevronDown/u, 'texto simples nao tem seta de "abrir"');
  assert.doesNotMatch(ramoTexto[0], /focus-visible/u, 'elemento inerte nao afirma foco de interacao');
  assert.doesNotMatch(ramoTexto[0], /cyan/u, 'ciano e exclusivo de navegacao — isto nao navega para lugar nenhum');
});

test('unidadeNome chega pronto (string), a decisao Consolidado x Unidade mora fora daqui', () => {
  assert.match(header, /unidadeNome:\s*string;/u);
  assert.doesNotMatch(header, /Consolidado/u, 'MobileHeader nao decide mais o rotulo — ver unidadeLabel.ts');
});
