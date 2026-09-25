/// <reference lib="deno.ns" />

import { assertEquals } from 'jsr:@std/assert@1';
import { tokenObservadorAutoriza } from './auth.ts';

const TOKEN = 'observador-token-valido';
const URL_BASE = 'https://exemplo.supabase.co/functions/v1/debug-webhook-emusys-observador';

function req(query = '', headers: Record<string, string> = {}): Request {
  return new Request(`${URL_BASE}${query}`, { method: 'POST', headers, body: '{}' });
}

Deno.test('sem OBSERVADOR_TOKEN configurado, nada passa (fail-closed)', () => {
  assertEquals(tokenObservadorAutoriza(req(), ''), false);
  assertEquals(tokenObservadorAutoriza(req(`?token=${TOKEN}`), ''), false);
  assertEquals(
    tokenObservadorAutoriza(req('', { 'x-observador-token': TOKEN }), ''),
    false,
  );
});

Deno.test('token errado ou ausente leva rejeicao', () => {
  assertEquals(tokenObservadorAutoriza(req(), TOKEN), false);
  assertEquals(tokenObservadorAutoriza(req('?token=errado'), TOKEN), false);
  assertEquals(
    tokenObservadorAutoriza(req('', { 'x-observador-token': 'errado' }), TOKEN),
    false,
  );
});

Deno.test('token correto na query passa (formato que o Emusys entrega)', () => {
  assertEquals(tokenObservadorAutoriza(req(`?token=${TOKEN}`), TOKEN), true);
});

Deno.test('token correto no header passa', () => {
  assertEquals(
    tokenObservadorAutoriza(req('', { 'x-observador-token': TOKEN }), TOKEN),
    true,
  );
});
