// Calculo de horario da grade do recital — LAPE-39, fase 3.
//
// A regra foi LIDA no prototipo do Arthur com o navegador (18/09/2026), nao suposta:
// Bloco 1 as 09:00 com uma apresentacao de 5 min fecha 09:05, e o Bloco 2 nasce 09:50,
// com o separador "INTERVALO — 45 MINUTOS" desenhado entre eles.
//
// O horario NAO e persistido. Estes testes sao o que garante que a conta continue a mesma
// depois de qualquer arrasto — e o unico lugar onde ela existe.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventos.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-hora-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { calcularHorariosDaGrade, horaParaSegundos, segundosParaHora, formatarDuracao } = lib;

const EVENTO = {
  horario_inicio: '09:00',
  duracao_padrao_segundos: 300, // 5 min
  intervalo_entre_blocos_segundos: 2700, // 45 min
};

const bloco = (id, ordem, apresentacoes, extra = {}) => ({
  id,
  ordem,
  horario_inicial: null,
  inicio_manual: false,
  apresentacoes,
  ...extra,
});
const ap = (id, ordem, duracao_segundos = null) => ({ id, ordem, duracao_segundos });

test('reproduz o prototipo: 09:00-09:05 e o bloco seguinte em 09:50', () => {
  const r = calcularHorariosDaGrade(EVENTO, [
    bloco(1, 1, [ap(10, 1)], { horario_inicial: '09:00', inicio_manual: true }),
    bloco(2, 2, []),
  ]);
  assert.equal(r[0].inicio, '09:00');
  assert.equal(r[0].fim, '09:05');
  // 09:05 + 45min. E o numero que o prototipo mostra.
  assert.equal(r[1].inicio, '09:50');
  assert.equal(r[1].intervaloAntesSegundos, 2700);
});

test('o primeiro bloco sem inicio manual herda o horario do EVENTO', () => {
  const r = calcularHorariosDaGrade(EVENTO, [bloco(1, 1, [ap(10, 1)])]);
  assert.equal(r[0].inicio, '09:00');
  assert.equal(r[0].intervaloAntesSegundos, null, 'nao existe intervalo antes do primeiro');
});

test('apresentacoes se encadeiam dentro do bloco, com 5 min de troca entre elas', () => {
  // Sem a folga a programacao prometia a seguinte no segundo em que a anterior acaba.
  // Depois da ULTIMA nao ha troca: o bloco termina quando ela termina.
  const r = calcularHorariosDaGrade(EVENTO, [bloco(1, 1, [ap(10, 1), ap(11, 2), ap(12, 3)])]);
  assert.deepEqual(r[0].apresentacoes.map((a) => a.inicio), ['09:00', '09:10', '09:20']);
  assert.equal(r[0].fim, '09:25');
});

test('o intervalo entre apresentacoes e configuravel e aceita zero', () => {
  const r = calcularHorariosDaGrade({ ...EVENTO, intervalo_entre_apresentacoes_segundos: 0 }, [
    bloco(1, 1, [ap(10, 1), ap(11, 2)]),
  ]);
  assert.deepEqual(r[0].apresentacoes.map((a) => a.inicio), ['09:00', '09:05']);
  assert.equal(r[0].fim, '09:10');
});

test('a troca entre apresentacoes nao se soma ao intervalo entre blocos', () => {
  const r = calcularHorariosDaGrade(EVENTO, [
    bloco(1, 1, [ap(10, 1), ap(11, 2)]),
    bloco(2, 2, [ap(20, 1)]),
  ]);
  // 09:00-09:05, troca, 09:10-09:15 -> +45 min = 10:00
  assert.equal(r[0].fim, '09:15');
  assert.equal(r[1].inicio, '10:00');
});

test('duracao propria vence a padrao do evento', () => {
  // Numero longo no meio empurra tudo que vem depois — e o motivo de o horario ser
  // derivado e nunca gravado.
  const r = calcularHorariosDaGrade(EVENTO, [bloco(1, 1, [ap(10, 1, 900), ap(11, 2)])]);
  assert.deepEqual(r[0].apresentacoes.map((a) => a.inicio), ['09:00', '09:20']);
  assert.equal(r[0].fim, '09:25');
});

test('a ordem do array nao manda — manda o campo `ordem`', () => {
  // O drag-and-drop reescreve `ordem`; a lista pode chegar do PostgREST em qualquer ordem.
  const r = calcularHorariosDaGrade(EVENTO, [
    bloco(2, 2, [ap(20, 1)]),
    bloco(1, 1, [ap(11, 2), ap(10, 1)], { horario_inicial: '09:00', inicio_manual: true }),
  ]);
  assert.equal(r[0].blocoId, 1);
  assert.deepEqual(r[0].apresentacoes.map((a) => a.id), [10, 11]);
});

test('inicio manual MANDA, mesmo quebrando o encadeamento', () => {
  const r = calcularHorariosDaGrade(EVENTO, [
    bloco(1, 1, [ap(10, 1)]),
    bloco(2, 2, [ap(20, 1)], { horario_inicial: '14:00', inicio_manual: true }),
  ]);
  assert.equal(r[1].inicio, '14:00', 'quem digitou a hora decide');
  assert.equal(r[1].conflitaComAnterior, false);
});

test('inicio manual ANTES do fim do anterior e CONFLITO declarado', () => {
  // Sem isto a programacao impressa prometeria duas coisas no mesmo minuto, em silencio.
  const r = calcularHorariosDaGrade(EVENTO, [
    bloco(1, 1, [ap(10, 1, 3600)]), // 09:00 -> 10:00
    bloco(2, 2, [ap(20, 1)], { horario_inicial: '09:30', inicio_manual: true }),
  ]);
  assert.equal(r[1].inicio, '09:30', 'o calculo nao corrige o humano por conta propria');
  assert.equal(r[1].conflitaComAnterior, true, 'mas precisa dizer que ha conflito');
  assert.ok(r[1].intervaloAntesSegundos < 0);
});

test('`inicio_manual` com hora invalida cai no calculado, sem virar NaN', () => {
  // NaN aqui contaminaria TODOS os blocos seguintes, e o sintoma ("--:--" na grade
  // inteira) apareceria longe da causa.
  const r = calcularHorariosDaGrade(EVENTO, [
    bloco(1, 1, [ap(10, 1)]),
    bloco(2, 2, [ap(20, 1)], { horario_inicial: 'quarta-feira', inicio_manual: true }),
  ]);
  assert.equal(r[1].inicio, '09:50');
  assert.ok(!Number.isNaN(r[1].duracaoSegundos));
});

test('bloco vazio nao some nem quebra a cadeia', () => {
  const r = calcularHorariosDaGrade(EVENTO, [
    bloco(1, 1, [ap(10, 1)]),
    bloco(2, 2, []),
    bloco(3, 3, [ap(30, 1)]),
  ]);
  assert.equal(r[1].inicio, r[1].fim, 'bloco sem apresentacao tem duracao zero');
  assert.equal(r[1].duracaoSegundos, 0);
  // 09:50 + 0 + 45min
  assert.equal(r[2].inicio, '10:35');
});

test('intervalo zero e valido — recital corrido', () => {
  const r = calcularHorariosDaGrade(
    { ...EVENTO, intervalo_entre_blocos_segundos: 0 },
    [bloco(1, 1, [ap(10, 1)]), bloco(2, 2, [ap(20, 1)])],
  );
  assert.equal(r[1].inicio, '09:05');
  assert.equal(r[1].conflitaComAnterior, false, 'encostar nao e conflito; sobrepor e');
});

test('horaParaSegundos aceita as duas formas e recusa lixo', () => {
  assert.equal(horaParaSegundos('09:00'), 32400);
  assert.equal(horaParaSegundos('09:00:00'), 32400);
  assert.equal(horaParaSegundos('9:05'), 32700);
  assert.equal(horaParaSegundos(''), null);
  assert.equal(horaParaSegundos(null), null);
  assert.equal(horaParaSegundos('25:99'), null);
  assert.equal(horaParaSegundos('abc'), null);
});

test('passar da meia-noite nao da a volta', () => {
  // 25:10 e estranho e verdadeiro; 01:10 seria bonito e mentira.
  assert.equal(segundosParaHora(25 * 3600 + 600), '25:10');
});

test('formatarDuracao fala como gente', () => {
  assert.equal(formatarDuracao(300), '5 min');
  assert.equal(formatarDuracao(45), '45s');
  assert.equal(formatarDuracao(3600), '1h');
  assert.equal(formatarDuracao(5400), '1h30');
});
