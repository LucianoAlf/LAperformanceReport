import assert from 'node:assert/strict';
import test from 'node:test';
import { decidirEnvioRepescagem } from '../supabase/functions/processar-fila-repescagem-evasao/contract.ts';

const base = {
  respostaStatus: 'sem_resposta',
  envioStatus: 'enviado',
  optOutEm: null,
  jaExisteSaidaNaPesquisa: false,
  telefoneCompartilhadoJaRespondeu: false,
};

test('envia quando nada mudou desde o enfileiramento', () => {
  assert.deepEqual(decidirEnvioRepescagem(base), { acao: 'enviar' });
});

test('cancela quem respondeu durante a espera na fila', () => {
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, respostaStatus: 'coletando' }),
    { acao: 'cancelar', motivo: 'respondeu_durante_a_espera' },
  );
});

test('cancela apos opt-out', () => {
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, optOutEm: '2026-08-26T12:00:00Z' }),
    { acao: 'cancelar', motivo: 'opt_out' },
  );
});

test('cancela se ja existe mensagem de saida na pesquisa', () => {
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, jaExisteSaidaNaPesquisa: true }),
    { acao: 'cancelar', motivo: 'ja_enviada' },
  );
});

test('irmao no mesmo telefone NAO impede a repescagem', () => {
  // A pesquisa e por ALUNO. Dois irmaos que evadiram tem duas pesquisas, sobre
  // experiencias distintas -- caso real de 05/08/2026: Miguel (prof. Pedro) e
  // Heitor (prof. Willian), mesmo telefone, e o pai respondeu as duas.
  // A guarda antiga (`telefoneCompartilhadoJaRespondeu`) recusava justamente o
  // irmao que ainda nao respondeu, que e quem precisa da repescagem: foi ela a
  // unica recusa no teste do 1o lote real. Campo removido do contrato.
  assert.deepEqual(decidirEnvioRepescagem({ ...base }), { acao: 'enviar' });

  // Um campo desconhecido nao pode reintroduzir o bloqueio por acidente.
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, telefoneCompartilhadoJaRespondeu: true }),
    { acao: 'enviar' },
  );
});

test('a propria pesquisa respondida continua bloqueando', () => {
  // O que impede cobrar a MESMA pessoa duas vezes.
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, respostaStatus: 'revisada' }),
    { acao: 'cancelar', motivo: 'respondeu_durante_a_espera' },
  );
});
