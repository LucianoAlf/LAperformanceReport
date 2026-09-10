import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getHealthScoreV3Period } from '../src/lib/healthScoreProfessorV3Periodos.ts';

const modal = readFileSync(new URL('../src/components/App/Professores/ModalRelatorioCoordenacao.tsx', import.meta.url), 'utf8');
const corpo = modal.match(/const validarCompetenciaMensal = \(\) => \{([\s\S]*?)\n  \};/u)?.[1];
assert(corpo, 'Adaptador de competencia compartilhado pelos cinco relatorios ausente');
const validar = new Function('periodoSelecionado', 'periodicidade', 'getHealthScoreV3Period', corpo);
const chave = (ano, mes, periodicidade) => validar({ ano, mes, mesmoMes: true }, periodicidade, getHealthScoreV3Period);

test('mensal preserva a competencia selecionada em todos os meses', () => {
  for (let mes = 1; mes <= 12; mes++) assert.deepEqual(chave(2026, mes, 'mensal'), { anoRelatorio: 2026, mesRelatorio: mes });
});
test('troca junho/julho/agosto mensal para ciclo consulta o mesmo documento de junho', () => {
  for (const mes of [6, 7, 8]) assert.deepEqual(chave(2026, mes, 'ciclo'), { anoRelatorio: 2026, mesRelatorio: 6 });
});
test('ciclo vivo setembro/outubro/novembro usa chave de setembro sem alterar o periodo', () => {
  for (const mes of [9, 10, 11]) assert.deepEqual(chave(2026, mes, 'ciclo'), { anoRelatorio: 2026, mesRelatorio: 9 });
});
test('janeiro e fevereiro resolvem dezembro do ano anterior', () => {
  assert.deepEqual(chave(2026, 12, 'ciclo'), { anoRelatorio: 2026, mesRelatorio: 12 });
  for (const mes of [1, 2]) assert.deepEqual(chave(2027, mes, 'ciclo'), { anoRelatorio: 2026, mesRelatorio: 12 });
  for (const mes of [3, 4, 5]) assert.deepEqual(chave(2027, mes, 'ciclo'), { anoRelatorio: 2027, mesRelatorio: 3 });
});
test('intervalo personalizado que atravessa meses continua bloqueado', () => {
  assert.throws(() => validar({ ano: 2026, mes: 6, mesmoMes: false }, 'mensal', getHealthScoreV3Period), /unica competencia/u);
});
