// Convite do recital por WhatsApp (LAPE-39, item 10). A prévia e o envio usam o mesmo
// texto montado aqui; estes testes travam o que a família lê.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventoConvite.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-convite-')), 'eventoConvite.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { montarConvite, CONVITE_PADRAO, saudacaoPorHora, dataDoBloco, horarioDoBloco, camposSemValor, telefoneLegivel } = lib;

// 14h BRT = 17h UTC
const TARDE = new Date('2026-10-09T17:00:00Z');

test('monta o convite da Fernanda com nome, bloco, data e horário', () => {
  const texto = montarConvite(CONVITE_PADRAO, {
    destinatario: 'Roseane da Silva',
    aluno: 'Miguel Ribeiro',
    blocos: [{ nome: 'Bloco 1', data: '2026-11-14', inicio: '09:00' }],
    agora: TARDE,
  });
  assert.match(texto, /^Boa tarde Roseane!/);
  assert.match(texto, /participação de Miguel Ribeiro no Recital/);
  assert.match(texto, /Miguel Ribeiro está no BLOCO 1! 😎/);
  assert.match(texto, /📅 Data: 14\/11\/2026 \(SÁBADO\)/);
  assert.match(texto, /🕓 Horário do BLOCO 1: 09h00/);
  assert.doesNotMatch(texto, /\{[a-z_]+\}/);
});

test('quem toca em dois blocos recebe os dois no mesmo convite', () => {
  const texto = montarConvite('{bloco} | {data} | {dia_semana} | {horario}', {
    destinatario: 'Ana',
    aluno: 'Léo',
    blocos: [
      { nome: 'Bloco 1', data: '2026-11-14', inicio: '09:00' },
      { nome: 'Bloco 3', data: '2026-11-15', inicio: '11:20:00' },
    ],
  });
  assert.equal(texto, 'BLOCO 1 e BLOCO 3 | 14/11/2026 e 15/11/2026 | SÁBADO e DOMINGO | 09h00 e 11h20');
});

test('mesmo dia em dois blocos não repete a data', () => {
  const texto = montarConvite('{data}', {
    destinatario: 'Ana',
    aluno: 'Léo',
    blocos: [
      { nome: 'Bloco 1', data: '2026-11-14', inicio: '09:00' },
      { nome: 'Bloco 2', data: '2026-11-14', inicio: '10:00' },
    ],
  });
  assert.equal(texto, '14/11/2026');
});

test('saudação segue a hora de Brasília, não a do navegador', () => {
  assert.equal(saudacaoPorHora(new Date('2026-10-09T11:00:00Z')), 'Bom dia'); // 08h BRT
  assert.equal(saudacaoPorHora(new Date('2026-10-09T17:00:00Z')), 'Boa tarde'); // 14h BRT
  assert.equal(saudacaoPorHora(new Date('2026-10-09T23:30:00Z')), 'Boa noite'); // 20h30 BRT
});

test('data e horário em formato de convite', () => {
  assert.deepEqual(dataDoBloco('2026-11-14'), { data: '14/11/2026', dia: 'SÁBADO' });
  assert.equal(dataDoBloco(null), null);
  assert.equal(horarioDoBloco('9:05'), '09h05');
  assert.equal(horarioDoBloco(null), '');
});

test('aponta o campo que ficou sem valor', () => {
  assert.deepEqual(
    camposSemValor({ destinatario: 'Ana', aluno: 'Léo', blocos: [{ nome: 'Bloco 1', data: null, inicio: '09:00' }] }),
    ['{data}'],
  );
  assert.deepEqual(camposSemValor({ destinatario: '', aluno: 'Léo', blocos: [] }), ['{responsavel}', '{bloco}']);
});

test('telefone legível', () => {
  assert.equal(telefoneLegivel('5521987654321'), '(21) 98765-4321');
  assert.equal(telefoneLegivel('552139551135'), '(21) 3955-1135');
});
