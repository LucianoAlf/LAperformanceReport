import assert from 'node:assert/strict';
import {
  aulaEmAndamento,
  contarJaOcorreram,
  cursoPredominante,
  distribuicaoPorHora,
  iniciaisDoNome,
  ocupacaoPct,
  resumoSobreposicao,
} from '../../src/lib/agenda';

function aula(hora: string, duracao = 50, cancelada = false) {
  return { hora_inicio: hora, duracao_minutos: duracao, cancelada };
}

// ---------------------------------------------------------------- iniciais
assert.equal(iniciaisDoNome('Bruno Sá'), 'BS');
assert.equal(iniciaisDoNome('  Carla   Nogueira  '), 'CN');
// Primeiro + ULTIMO: dois "Ana Maria" diferentes nao podem colidir.
assert.equal(iniciaisDoNome('Ana Maria Ribeiro'), 'AR');
assert.equal(iniciaisDoNome('Ana Maria Souza'), 'AS');
assert.equal(iniciaisDoNome('Madonna'), 'MA');
assert.equal(iniciaisDoNome(''), '?');
assert.equal(iniciaisDoNome('   '), '?');
assert.equal(iniciaisDoNome('ângela braga'), 'ÂB');

// -------------------------------------------------------- curso predominante
assert.equal(
  cursoPredominante([
    { curso_nome: 'Violão' },
    { curso_nome: 'Piano' },
    { curso_nome: 'Violão' },
  ]),
  'Violão',
);
// Empate desempata por alfabetica para o rotulo nao piscar entre renderizacoes.
assert.equal(
  cursoPredominante([{ curso_nome: 'Violão' }, { curso_nome: 'Bateria' }]),
  'Bateria',
);
assert.equal(cursoPredominante([{ curso_nome: null }]), null);
assert.equal(cursoPredominante([]), null);

// ------------------------------------------------------------------ ocupacao
const janela = { inicio: 13, fim: 21 }; // 8 h = 480 min
// 1 aula de 50 min em 480 -> 10%
assert.equal(ocupacaoPct([aula('14:00')], janela), 10);
// 4 aulas de 50 min -> 200/480 = 41.67 -> 42
assert.equal(
  ocupacaoPct([aula('14:00'), aula('15:00'), aula('16:00'), aula('17:00')], janela),
  42,
);
// Sobreposta conta UMA vez: duas aulas de 60 min no mesmo horario ocupam 60 min.
assert.equal(ocupacaoPct([aula('14:00', 60), aula('14:00', 60)], janela), 13);
// Parcialmente sobreposta: 14:00-15:00 e 14:30-15:30 -> uniao de 90 min
assert.equal(ocupacaoPct([aula('14:00', 60), aula('14:30', 60)], janela), 19);
// Cancelada nao ocupa sala
assert.equal(ocupacaoPct([aula('14:00', 60, true)], janela), 0);
// Aula fora da janela e recortada, nao extrapola
assert.equal(ocupacaoPct([aula('12:00', 120)], janela), 13); // so 13:00-14:00 conta
assert.equal(ocupacaoPct([], janela), 0);
assert.equal(ocupacaoPct([aula('14:00')], { inicio: 13, fim: 13 }), 0);

// ------------------------------------------------------------- sobreposicao
assert.equal(resumoSobreposicao([aula('14:00'), aula('15:00')]), null);
assert.equal(resumoSobreposicao([]), null);
assert.deepEqual(resumoSobreposicao([aula('17:00'), aula('17:00')]), { qtd: 2, hora: '17:00' });
// Sobreposicao parcial tambem conta
assert.deepEqual(resumoSobreposicao([aula('14:00', 60), aula('14:30')]), {
  qtd: 2,
  hora: '14:30',
});
// Escolhe a PIOR (mais aulas), nao a primeira
assert.deepEqual(
  resumoSobreposicao([
    aula('14:00', 60),
    aula('14:00', 60),
    aula('16:00', 60),
    aula('16:00', 60),
    aula('16:00', 60),
  ]),
  { qtd: 3, hora: '16:00' },
);
// Empate de quantidade desempata pelo horario mais cedo
assert.deepEqual(
  resumoSobreposicao([aula('16:00', 60), aula('16:00', 60), aula('14:00', 60), aula('14:00', 60)]),
  { qtd: 2, hora: '14:00' },
);
// Cancelada em cima de outra NAO e conflito
assert.equal(resumoSobreposicao([aula('17:00'), aula('17:00', 50, true)]), null);
// Aula que termina exatamente quando a outra comeca nao se sobrepoe
assert.equal(resumoSobreposicao([aula('14:00', 60), aula('15:00', 60)]), null);

// ---------------------------------------------------------- aula em andamento
assert.equal(aulaEmAndamento(aula('15:00'), 15 * 60 + 20), true);
assert.equal(aulaEmAndamento(aula('15:00'), 15 * 60), true); // inclui o inicio
assert.equal(aulaEmAndamento(aula('15:00'), 15 * 60 + 50), false); // exclui o fim
assert.equal(aulaEmAndamento(aula('15:00'), 14 * 60), false);
// Cancelada nunca esta acontecendo
assert.equal(aulaEmAndamento(aula('15:00', 50, true), 15 * 60 + 20), false);
// Dia que nao e hoje nao tem "agora"
assert.equal(aulaEmAndamento(aula('15:00'), null), false);

// ------------------------------------------------------------ ja ocorreram
const meioDia = new Date(2026, 7, 3, 12, 0, 0); // 03/08/2026 12:00 BRT
function comFim(fim: string, cancelada = false) {
  return { hora_fim: fim, cancelada };
}
assert.equal(
  contarJaOcorreram([comFim('10:50'), comFim('11:50'), comFim('15:50')], '2026-08-03', meioDia),
  2,
);
// Cancelada nao "ocorreu"
assert.equal(contarJaOcorreram([comFim('10:50', true)], '2026-08-03', meioDia), 0);
// Dia passado: todas ocorreram. Dia futuro: nenhuma.
assert.equal(contarJaOcorreram([comFim('20:50')], '2026-08-02', meioDia), 1);
assert.equal(contarJaOcorreram([comFim('08:50')], '2026-08-04', meioDia), 0);

// ------------------------------------------------------- distribuicao/hora
// janelaDeHoras da 1h de folga de cada lado e span minimo de 5h, entao a serie
// tem buracos de proposito — sao eles que dao a nocao de dia cheio x vazio.
const dist = distribuicaoPorHora([aula('14:00'), aula('14:30'), aula('16:00')]);
assert.equal(dist.length >= 5, true);
assert.equal(dist.reduce((s, d) => s + d.qtd, 0), 3);
assert.equal(dist.find((d) => d.hora === 14)?.qtd, 2);
assert.equal(dist.find((d) => d.hora === 15)?.qtd, 0);
assert.equal(dist.find((d) => d.hora === 16)?.qtd, 1);
// Horas vem em ordem crescente e sem furo na sequencia
assert.deepEqual(
  dist.map((d) => d.hora),
  Array.from({ length: dist.length }, (_, i) => dist[0].hora + i),
);
// Cancelada fora do grafico de movimento
assert.equal(distribuicaoPorHora([aula('14:00', 50, true)]).length, 0);
assert.deepEqual(distribuicaoPorHora([]), []);

console.log('agendaTrilho: OK');
