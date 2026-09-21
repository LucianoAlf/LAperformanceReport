import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { abaFoiPortada, rotaTemFaixaPorAba } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pagina = le('../src/components/App/Agenda/AgendaPage.tsx');
const rotas = le('../src/mobile/rotasPortadas.ts');

test('as visoes portadas sao professor e sala — chamada e calendario continuam avisando', () => {
  assert.equal(abaFoiPortada('/app/agenda', 'professor'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'sala'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'chamada'), false);
  assert.equal(abaFoiPortada('/app/agenda', 'calendario'), false);
});

test('a Agenda usa faixa POR ABA, e nao entra em ROTAS_PORTADAS', () => {
  assert.equal(rotaTemFaixaPorAba('/app/agenda'), true);
  // Entrar aqui apagaria a faixa de Chamada e Calendario de uma vez — o erro
  // de 14/09 com Alunos, revertido no mesmo dia.
  assert.doesNotMatch(rotas, /'\/app\/agenda'/);
});

test('a pagina decide pelo MESMO hook do shell', () => {
  assert.match(pagina, /import\s*\{\s*useShellMobile\s*\}\s*from\s*'@\/hooks\/useShellMobile'/);
  assert.match(pagina, /useShellMobile\(\)\s*===\s*'mobile'/);
  assert.doesNotMatch(pagina, /useIsMobile/, 'a pagina le a largura por conta propria');
});

test('o aviso aparece so nas visoes nao portadas', () => {
  assert.match(pagina, /ehCelular\s*&&\s*!abaFoiPortada\('\/app\/agenda',\s*visao\)/);
});

test('o ramo mobile vem ANTES do curto-circuito de dia vazio', () => {
  // Dia sem aula ainda precisa do palco para deslizar. Se o "Nenhuma aula
  // neste dia" vier antes, o arrasto morre justamente no domingo.
  const vazio = pagina.indexOf('Nenhuma aula neste dia');
  const mobile = pagina.indexOf('<AgendaMobile');
  assert.ok(mobile > -1, 'AgendaMobile nao foi montada');
  assert.ok(mobile < vazio, 'o ramo mobile precisa vir antes do curto-circuito de dia vazio');
});

test('a AgendaMobile entra por lazy — o desktop nao paga o bundle dela', () => {
  assert.match(pagina, /lazy\(\(\)\s*=>\s*import\('@\/mobile\/telas\/agenda\/AgendaMobile'\)\)/);
});

test('o desktop continua recebendo a AgendaTimeline intacta', () => {
  assert.match(pagina, /<AgendaTimeline/);
  assert.match(pagina, /agruparPor=\{agruparPor\}/);
});
