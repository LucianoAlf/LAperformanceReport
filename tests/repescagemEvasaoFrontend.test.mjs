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
  assert.match(tela, /Reenviar/);
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

test('botao de reenvio fica desabilitado depois que a repescagem ja saiu', () => {
  const fonte = tela;

  // O botao individual vira "Reenviada" e nao clicavel.
  assert.match(fonte, /jaTeveRepescagem = Boolean\(estadoPorPesquisa\[item\.pesquisa_id\]\)/);
  assert.match(fonte, /disabled=\{jaTeveRepescagem\}/);
  assert.match(fonte, /jaTeveRepescagem \? 'Reenviada' : 'Reenviar'/);

  // O "Reenviar para todos" conta so quem ainda pode receber -- senao o numero
  // mente sobre quantas mensagens sairiam e a operadora clica para receber
  // recusa `ja_enfileirada`.
  assert.match(fonte, /Reenviar para todos \(\{pesquisaIdsElegiveis\.length\}\)/);
  assert.doesNotMatch(fonte, /Reenviar para todos \(\{itens\.length\}\)/);

  // ⚠️ Ordem obrigatoria: pesquisaIds e ENTRADA do hook, estadoPorPesquisa e
  // saida. Derivar a lista de elegiveis antes da chamada fecharia um ciclo e
  // leria a variavel antes da declaracao (ReferenceError em runtime).
  const posHook = fonte.indexOf('useRepescagemEvasao(pesquisaIds)');
  const posElegiveis = fonte.indexOf('const pesquisaIdsElegiveis');
  assert.ok(posHook > 0 && posElegiveis > posHook,
    'pesquisaIdsElegiveis precisa ser derivado DEPOIS de useRepescagemEvasao');
});
