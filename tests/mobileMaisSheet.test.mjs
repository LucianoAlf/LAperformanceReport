import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sheet = readFileSync('src/mobile/MobileMaisSheet.tsx', 'utf8');

test('usa a regra unica de visibilidade, nao reimplementa', () => {
  assert.match(sheet, /filtrarVisiveis/u);
  assert.doesNotMatch(sheet, /visibilidade_global/u, 'a consulta de flag nao mora aqui');
});

test('mantem os dois grupos da sidebar', () => {
  assert.match(sheet, /MENU_PRINCIPAL/u);
  assert.match(sheet, /MENU_OPERACIONAL/u);
  assert.match(sheet, /Principal/u);
  assert.match(sheet, /Operacional/u);
});

test('grade de 4 colunas e safe-area', () => {
  assert.match(sheet, /grid-cols-4/u);
  assert.match(sheet, /env\(safe-area-inset-bottom\)/u);
});

test('fecha no Esc e tem rotulo de dialogo', () => {
  assert.match(sheet, /'Escape'/u);
  assert.match(sheet, /role="dialog"/u);
  assert.match(sheet, /aria-modal/u);
});

test('navegar fecha a folha', () => {
  // Sem isto a folha fica por cima da tela nova.
  // Ancorado no NavLink: o onClick do botao-scrim (fechar ao tocar fora) e
  // um requisito diferente e nao pode fazer este teste passar sozinho.
  assert.match(sheet, /<NavLink[^>]*onClick=\{onFechar\}/u);
});
