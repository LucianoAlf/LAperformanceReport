import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nav = readFileSync('src/mobile/MobileBottomNav.tsx', 'utf8');

test('reserva a safe-area do iPhone', () => {
  // Sem isto a barra fica atras do traco de home. Nao e coisa de PWA, e do aparelho.
  assert.match(nav, /env\(safe-area-inset-bottom\)/u);
});

test('monta os destinos a partir da fonte unica, sem lista propria', () => {
  assert.match(nav, /ROTAS_BARRA_INFERIOR/u);
  assert.doesNotMatch(nav, /path: '\/app\/alunos'/u, 'a barra nao declara itens — le de menuItems');
});

test('ciano marca navegacao ativa', () => {
  assert.match(nav, /isActive[\s\S]{0,200}cyan-400/u);
});

test('alvo de toque tem no minimo 44px de altura', () => {
  // Diretriz iOS e WCAG. Abaixo disso a barra erra o dedo.
  assert.match(nav, /min-h-\[44px\]/u);
});

test('o botao Mais existe e nao e um NavLink', () => {
  // "Mais" abre uma folha, nao navega — se virar rota, o voltar do celular quebra.
  assert.match(nav, /onAbrirMais/u);
  assert.match(nav, /<button[\s\S]{0,400}onAbrirMais/u);
});
