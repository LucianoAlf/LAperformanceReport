import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const envio = readFileSync(
  new URL('../supabase/functions/enviar-pesquisa-pos-primeira-aula/index.ts', import.meta.url),
  'utf8',
);
const auto = readFileSync(
  new URL('../supabase/functions/disparar-pesquisa-1a-aula-auto/index.ts', import.meta.url),
  'utf8',
);

// 39 das 42 duplicatas medidas vieram do disparo das 11h, em series paralelas defasadas
// 0,4-1,2s. Ler-e-entao-enviar nao resolve: as execucoes leem antes de qualquer marcacao.
test('envio automatico reserva antes do POST', () => {
  assert.match(envio, /rpc\(\s*'reservar_envio_pesquisa_whatsapp'/);

  const reserva = envio.indexOf('reservar_envio_pesquisa_whatsapp');
  const post = envio.indexOf('await enviarBotoes(baseUrl, token, numero, textoMsg)', reserva);
  assert.ok(reserva > 0 && post > reserva, 'a reserva tem que vir antes do envio');
});

test('a trava vale so para a automacao', () => {
  assert.match(envio, /origem\s*===\s*'auto'/);
});

// Se o pulo voltasse como falha, a orquestradora concluiria que ninguem recebeu e reenviaria
// o lote inteiro -- que e outro caminho de duplicata.
test('aluno pulado volta como ok, nao como falha', () => {
  const bloco = envio.match(/ja_enviada_recentemente[\s\S]{0,200}/)?.[0] ?? '';

  assert.notEqual(bloco, '', 'motivo do pulo nao encontrado');
  assert.doesNotMatch(bloco, /ok:\s*false/);
});

// Sem liberar, uma falha real deixaria o aluno bloqueado por 10 min e o retry legitimo da
// orquestradora (5s depois) nao funcionaria.
test('falha no envio libera a reserva', () => {
  assert.match(envio, /tentativa_envio_em:\s*null/);
});

test('a orquestradora se identifica como automacao', () => {
  assert.match(auto, /origem:\s*'auto'/);
});
