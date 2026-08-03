import assert from 'node:assert/strict';
import {
  AGENDA_HORA_FIM,
  AGENDA_HORA_INICIO,
  AGENDA_JANELA_MIN_HORAS,
  AGENDA_LARGURA_HORA_MIN_PX,
  formatarRelogio,
  janelaDeHoras,
  larguraDaHora,
  larguraPx,
  posicaoPx,
  segundosAgora,
} from '../../src/lib/agenda';

// segundosAgora / formatarRelogio
assert.equal(segundosAgora(new Date(2026, 7, 2, 11, 44, 7)), 11 * 3600 + 44 * 60 + 7);
assert.equal(formatarRelogio(11 * 3600 + 44 * 60 + 7), '11:44:07');
assert.equal(formatarRelogio(0), '00:00:00');
assert.equal(formatarRelogio(23 * 3600 + 59 * 60 + 59), '23:59:59');

// Janela: dia vazio cai no expediente inteiro
assert.deepEqual(janelaDeHoras([], null), { inicio: AGENDA_HORA_INICIO, fim: AGENDA_HORA_FIM });

// Janela recorta ao que existe, com 1h de folga de cada lado
const tarde = [
  { hora_inicio: '15:00', duracao_minutos: 45 },
  { hora_inicio: '18:00', duracao_minutos: 60 },
];
assert.deepEqual(janelaDeHoras(tarde, null), { inicio: 14, fim: 20 });

// Uma aula so ainda respeita o span minimo
const uma = janelaDeHoras([{ hora_inicio: '15:00', duracao_minutos: 45 }], null);
assert.ok(uma.fim - uma.inicio >= AGENDA_JANELA_MIN_HORAS, `span ${uma.fim - uma.inicio}`);

// O horario atual entra na janela quando o dia exibido e hoje
assert.deepEqual(janelaDeHoras(tarde, 11 * 3600 + 44 * 60), { inicio: 10, fim: 20 });
// ...e nao entra quando nao e hoje
assert.deepEqual(janelaDeHoras(tarde, null), { inicio: 14, fim: 20 });

// Nunca escapa do expediente, nem com aula colada nas bordas
const bordas = janelaDeHoras(
  [{ hora_inicio: '08:00', duracao_minutos: 60 }, { hora_inicio: '21:00', duracao_minutos: 60 }],
  null,
);
assert.equal(bordas.inicio, AGENDA_HORA_INICIO);
assert.equal(bordas.fim, AGENDA_HORA_FIM);

// Relogio fora do expediente (madrugada) nao arrasta a janela
assert.deepEqual(janelaDeHoras(tarde, 3 * 3600), { inicio: 14, fim: 20 });

// larguraDaHora: estica para preencher, mas nunca abaixo do piso
assert.equal(larguraDaHora(1200, 6), 200);
assert.equal(larguraDaHora(400, 14), AGENDA_LARGURA_HORA_MIN_PX);
assert.equal(larguraDaHora(0, 6), 88);
assert.equal(larguraDaHora(1200, 0), 88);
// Sempre inteiro: fracao faz o navegador engolir parte das gridlines
assert.equal(larguraDaHora(1240, 12), 103);   // 103,33 -> 103
assert.equal(larguraDaHora(1000, 7), 142);    // 142,86 -> 142
assert.ok(Number.isInteger(larguraDaHora(1333, 9)));

// posicaoPx/larguraPx respeitam escala e inicio da janela
assert.equal(posicaoPx('15:00', 200, 14), 200);
assert.equal(posicaoPx('14:30', 200, 14), 100);
assert.equal(larguraPx(45, 200), 150);
// Defaults preservam o comportamento antigo (08:00, 88px/h)
assert.equal(posicaoPx('09:00'), 88);
assert.equal(larguraPx(60), 88);

console.log('agenda escala: OK');

// aulaJaOcorreu — 'ausente' do Emusys so vale depois da aula
import { aulaJaOcorreu } from '../../src/lib/agenda';
const agora = new Date(2026, 7, 2, 15, 30); // 02/08/2026 15:30
assert.equal(aulaJaOcorreu('2026-08-01', '20:00', agora), true);  // dia passado
assert.equal(aulaJaOcorreu('2026-08-03', '09:00', agora), false); // dia futuro
assert.equal(aulaJaOcorreu('2026-08-02', '15:00', agora), true);  // hoje, ja terminou
assert.equal(aulaJaOcorreu('2026-08-02', '15:30', agora), true);  // hoje, terminou agora
assert.equal(aulaJaOcorreu('2026-08-02', '16:00', agora), false); // hoje, em curso
console.log('agenda ja ocorreu: OK');
