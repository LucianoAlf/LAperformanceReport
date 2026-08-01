import assert from 'node:assert/strict';
import {
  posicaoPx,
  larguraPx,
  minutosAgora,
  dentroDoExpediente,
  contarEmAulaAgora,
  formatarFrescor,
  diaIncompleto,
} from '../../src/lib/agenda';

// Posicionamento: 08:00 e a origem do trilho, cada hora vale 88px.
assert.equal(posicaoPx('08:00'), 0, '08:00 fica na origem');
assert.equal(posicaoPx('09:00'), 88, 'uma hora depois = 88px');
assert.equal(posicaoPx('17:30'), 836, '17:30 = 9,5h apos as 08:00');
assert.equal(larguraPx(60), 88, 'aula de 1h ocupa 88px');
assert.equal(larguraPx(30), 44, 'aula de 30min ocupa metade');

// Regua: usa o relogio local, sem conversao de fuso.
assert.equal(minutosAgora(new Date(2026, 7, 4, 13, 17)), 797, '13:17 = 797 minutos');
assert.equal(dentroDoExpediente(797), true, '13:17 esta no expediente');
assert.equal(dentroDoExpediente(60), false, '01:00 esta fora do expediente');
assert.equal(dentroDoExpediente(1320), true, '22:00 e o limite superior, ainda dentro');
assert.equal(dentroDoExpediente(1321), false, '22:01 ja esta fora');

// "Em aula agora": aula cancelada nao conta, e a mesma sala nao conta duas vezes.
const aulas = [
  { hora_inicio: '14:00', duracao_minutos: 50, cancelada: false, sala_nome: 'Slash' },
  { hora_inicio: '14:00', duracao_minutos: 50, cancelada: false, sala_nome: 'Aposan' },
  { hora_inicio: '14:00', duracao_minutos: 50, cancelada: true, sala_nome: 'Barone' },
  { hora_inicio: '16:00', duracao_minutos: 50, cancelada: false, sala_nome: 'Slash' },
];
assert.deepEqual(
  contarEmAulaAgora(aulas, minutosDeHHMMLocal('14:20')),
  { aulas: 2, salas: 2 },
  'as 14:20 ha 2 aulas vivas em 2 salas',
);
assert.deepEqual(
  contarEmAulaAgora(aulas, minutosDeHHMMLocal('14:50')),
  { aulas: 0, salas: 0 },
  'as 14:50 a aula de 50min ja terminou',
);
assert.deepEqual(
  contarEmAulaAgora(aulas, minutosDeHHMMLocal('03:00')),
  { aulas: 0, salas: 0 },
  'de madrugada nao ha ninguem em aula',
);

function minutosDeHHMMLocal(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

// Frescor do sync.
const agora = new Date(2026, 7, 1, 14, 30);
assert.equal(formatarFrescor(null, agora), 'sem dado de sincronizacao');
assert.equal(formatarFrescor(new Date(2026, 7, 1, 14, 30).toISOString(), agora), 'agora mesmo');
assert.equal(formatarFrescor(new Date(2026, 7, 1, 14, 26).toISOString(), agora), 'ha 4 min');
assert.equal(formatarFrescor(new Date(2026, 7, 1, 12, 30).toISOString(), agora), 'ha 2 h');

// Janela historica incompleta (19/07 a 01/08/2026, inclusive).
assert.equal(diaIncompleto('2026-07-18'), false, '18/07 esta integro');
assert.equal(diaIncompleto('2026-07-19'), true, '19/07 abre a janela quebrada');
assert.equal(diaIncompleto('2026-07-25'), true, '25/07 esta dentro da janela');
assert.equal(diaIncompleto('2026-08-01'), true, '01/08 fecha a janela quebrada');
assert.equal(diaIncompleto('2026-08-03'), false, '03/08 ja esta integro');

console.log('agenda timeline: OK');
