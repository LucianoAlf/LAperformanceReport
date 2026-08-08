import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consultarOpcional,
  consultarSupabaseOpcional,
} from '../src/lib/professoresConsultasOpcionais.mjs';

test('consulta opcional preserva o dado quando a promessa resolve', async () => {
  assert.deepEqual(await consultarOpcional(Promise.resolve(['ok'])), {
    data: ['ok'],
    error: null,
  });
});

test('consulta opcional transforma rejeição em indisponibilidade sem propagar erro', async () => {
  const error = new Error('timeout');
  assert.deepEqual(await consultarOpcional(Promise.reject(error)), {
    data: null,
    error,
  });
});

test('resposta Supabase com erro não interrompe as consultas irmãs', async () => {
  const error = { code: '57014', message: 'timeout' };
  assert.deepEqual(await consultarSupabaseOpcional(Promise.resolve({ data: null, error })), {
    data: null,
    error,
  });
});

