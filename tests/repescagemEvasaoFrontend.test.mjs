import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync(
  new URL('../src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts', import.meta.url),
  'utf8',
);
const tela = readFileSync(
  new URL('../src/components/App/SucessoCliente/FilaFollowupEvasao.tsx', import.meta.url),
  'utf8',
);

test('hook usa as RPCs canonicas e le a fila direto da tabela', () => {
  assert.match(hook, /rpc\(\s*'enfileirar_repescagem_evasao'/);
  assert.match(hook, /rpc\(\s*'cancelar_repescagem_evasao'/);
  assert.match(hook, /from\(\s*'pesquisa_evasao_envios_fila'\s*\)/);
});

test('hook nao reimplementa elegibilidade no cliente', () => {
  // a decisao de quem pode ser repescado e do banco; o cliente so exibe o motivo
  assert.doesNotMatch(hook, /recusada_opt_out|resposta_status\s*!==/);
});

test('tela oferece repescar, repescar todos e cancelar', () => {
  assert.match(tela, /Repescar/);
  assert.match(tela, /useRepescagemEvasao/);
  assert.match(tela, /cancelar/i);
});

test('item 6 do review: cancelamento legitimo (respondeu na espera / opt-out / ja enviada) nao aparece como falha vermelha', () => {
  // os 3 motivos precisam ter rotulo neutro proprio, distinto do vermelho de falha
  assert.match(tela, /respondeu_durante_a_espera/);
  assert.match(tela, /opt_out/);
  assert.match(tela, /ja_enviada/);
  assert.match(tela, /classeBadgeRepescagem/);
});
