import assert from 'node:assert/strict';
import test from 'node:test';
import { decidirEnvioRepescagem } from '../supabase/functions/processar-fila-repescagem-evasao/contract.ts';

const base = {
  respostaStatus: 'sem_resposta',
  envioStatus: 'enviado',
  optOutEm: null,
  jaExisteSaidaDoToque: false,
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

test('cancela se ja existe mensagem de saida deste toque', () => {
  assert.deepEqual(
    decidirEnvioRepescagem({ ...base, jaExisteSaidaDoToque: true }),
    { acao: 'cancelar', motivo: 'ja_enviada' },
  );
});
