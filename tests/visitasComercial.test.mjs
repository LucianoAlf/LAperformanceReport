/**
 * LAPE-44 — as três formas de visitar a escola e o que cada uma exige de prova.
 *
 * Roda a função REAL (compilada do .ts com esbuild), não uma cópia — cópia provaria o
 * teste, não o código. Mesmo padrão de tests/comunidadeWaContato.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'visitas-comercial-'));
const saida = join(dir, 'visitasComercial.mjs');
execFileSync('npx', ['esbuild', 'src/lib/visitasComercial.ts', '--format=esm', `--outfile=${saida}`], {
  stdio: 'pipe', shell: process.platform === 'win32',
});
const lib = await import(pathToFileURL(saida).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const agendadaMila = { visita_id: 'v1', visita_status: 'agendada', visita_criado_por: 'mila' };
const agendadaEquipe = { visita_id: 'v2', visita_status: 'agendada', visita_criado_por: 'manual' };
const confirmada = { visita_id: 'v3', visita_status: 'realizada', visita_criado_por: 'mila' };
const faltou = { visita_id: 'v4', visita_status: 'nao_compareceu', visita_criado_por: 'manual' };
const semHora = { canal_origem_id: 6 };

test('agendada sem confirmacao NAO vira "nao compareceu"', () => {
  // A armadilha central: em 23/09/2026 as 139 visitas do banco estavam 100% em
  // `agendada`. Se ausencia de marcacao contasse como falta, a escola inteira teria
  // faltado. Mesmo defeito de `sem_captura` virar "fora da comunidade".
  assert.equal(lib.presencaDaVisita(agendadaMila), 'aguardando');
  assert.equal(lib.presencaDaVisita(agendadaEquipe), 'aguardando');
  assert.equal(lib.visitaAconteceu(agendadaMila), false);
  assert.notEqual(lib.presencaDaVisita(agendadaMila), 'nao_compareceu');
});

test('quem chegou sem hora marcada compareceu por definicao', () => {
  // O lead com canal Visita/Placa so existe porque a pessoa estava na porta.
  assert.equal(lib.presencaDaVisita(semHora), 'compareceu');
  assert.equal(lib.visitaAconteceu(semHora), true);
  assert.equal(lib.podeConfirmarPresenca(semHora), false);
});

test('so a visita agendada admite confirmacao', () => {
  assert.equal(lib.podeConfirmarPresenca(agendadaMila), true);
  assert.equal(lib.podeConfirmarPresenca(agendadaEquipe), true);
});

test('procedencia olha o VINCULO com a tabela, nunca o canal do lead', () => {
  // Um lead que veio do Instagram e agendou visita pela Mila continua sendo visita
  // agendada. Classificar pelo canal o jogaria em "sem hora marcada" e ele deixaria
  // de pedir confirmacao de presenca -- passaria a contar como comparecido sozinho.
  const instagramQueAgendou = { visita_id: 'v9', visita_status: 'agendada', visita_criado_por: 'mila', canal_origem_id: 1 };
  assert.equal(lib.procedenciaDaVisita(instagramQueAgendou), 'mila');
  assert.equal(lib.podeConfirmarPresenca(instagramQueAgendou), true);
  assert.equal(lib.presencaDaVisita(instagramQueAgendou), 'aguardando');
});

test('procedencia separa Mila de equipe', () => {
  assert.equal(lib.procedenciaDaVisita(agendadaMila), 'mila');
  assert.equal(lib.procedenciaDaVisita(agendadaEquipe), 'manual');
  assert.equal(lib.procedenciaDaVisita(semHora), 'sem_hora_marcada');
});

test('resumo separa quem esteve na escola de quem so foi marcado', () => {
  const r = lib.resumoVisitas([agendadaMila, agendadaEquipe, confirmada, faltou, semHora, semHora]);
  assert.equal(r.total, 6);
  assert.equal(r.semHoraMarcada, 2);
  assert.equal(r.agendadas, 4);
  assert.equal(r.confirmadas, 1);
  assert.equal(r.naoCompareceram, 1);
  assert.equal(r.aguardando, 2);
  // aconteceram = walk-in + agendadas confirmadas
  assert.equal(r.aconteceram, 3);
});

test('resumo do estado real de Campo Grande em set/2026', () => {
  // 21 agendadas pela Mila, nenhuma confirmada, mais 7 que chegaram sem hora marcada.
  const itens = [
    ...Array.from({ length: 21 }, (_, i) => ({ visita_id: `m${i}`, visita_status: 'agendada', visita_criado_por: 'mila' })),
    ...Array.from({ length: 7 }, () => ({ canal_origem_id: 6 })),
  ];
  const r = lib.resumoVisitas(itens);
  assert.equal(r.total, 28);
  assert.equal(r.aconteceram, 7);
  assert.equal(lib.textoComposicaoVisitas(r), '7 sem hora marcada · 0 de 21 agendadas confirmadas');
});

test('composicao nao inventa metade que nao existe', () => {
  // Recreio e Barra nao tem uma visita agendada sequer -- escrever "0 de 0 agendadas"
  // seria ruido sobre algo que nao aconteceu.
  const soWalkin = lib.resumoVisitas([semHora, semHora]);
  assert.equal(lib.textoComposicaoVisitas(soWalkin), '2 sem hora marcada');

  const soAgendadas = lib.resumoVisitas([agendadaMila, confirmada]);
  assert.equal(lib.textoComposicaoVisitas(soAgendadas), '1 de 2 agendadas confirmadas');

  assert.equal(lib.textoComposicaoVisitas(lib.resumoVisitas([])), '');
});

test('rotulos existem para todos os estados, sem cair em vazio', () => {
  for (const p of ['mila', 'manual', 'sem_hora_marcada']) {
    assert.ok(lib.rotuloProcedencia(p).length > 0);
    assert.ok(lib.rotuloProcedenciaCurto(p).length > 0);
  }
  for (const p of ['compareceu', 'nao_compareceu', 'aguardando']) {
    assert.ok(lib.rotuloPresenca(p).length > 0);
  }
  // "Aguardando" tem de dizer que falta CONFIRMAR, nunca sugerir ausencia.
  assert.match(lib.rotuloPresenca('aguardando'), /confirma/i);
});
