import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sheet = readFileSync('src/mobile/MobileMaisSheet.tsx', 'utf8');
// A casca (veu, alca, Esc, area segura) mora na `FolhaMobile` desde 29/09/2026.
// Os requisitos abaixo continuam sendo do MENU — mudou onde sao cumpridos.
const casca = readFileSync('src/mobile/FolhaMobile.tsx', 'utf8');

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
  assert.match(casca, /env\(safe-area-inset-bottom\)/u);
});

test('🔴 o menu usa a casca compartilhada — nao uma copia da folha', () => {
  // Sem isto o menu ficaria de fora do movimento das folhas: seria a unica a
  // aparecer de uma vez, e e' a que mais se abre. Ancorado no JSX, porque
  // importar sem usar passaria.
  assert.match(sheet, /<FolhaMobile\s/u);
  assert.doesNotMatch(sheet, /fixed inset-x-0 bottom-0/u, 'casca copiada de volta');
  assert.doesNotMatch(sheet, /bg-slate-950\/70/u, 'veu copiado de volta');
});

test('fecha no Esc e tem rotulo de dialogo', () => {
  assert.match(casca, /'Escape'/u);
  assert.match(casca, /role="dialog"/u);
  assert.match(casca, /aria-modal/u);
  // O menu nao herda rotulo generico: o veu diz o que fecha.
  assert.match(sheet, /rotuloFechar="Fechar menu"/u);
});

test('navegar fecha a folha', () => {
  // Sem isto a folha fica por cima da tela nova.
  // Ancorado no NavLink: o onClick do botao-scrim (fechar ao tocar fora) e
  // um requisito diferente e nao pode fazer este teste passar sozinho.
  assert.match(sheet, /<NavLink[^>]*onClick=\{onFechar\}/u);
});
