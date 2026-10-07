#!/usr/bin/env node
'use strict';

// O executor das ferramentas roda DENTRO da ponte, junto com as mensagens do
// grupo. A resposta dele tem de contar só o que ESTA chamada fez: um envio de
// outra mensagem processada ao mesmo tempo não pode virar "card publicado".
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const mod = require(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-tool-executor.cjs'));
const CHAT = 'grupo@g.us';
const CTX = { ok: true, _chat: CHAT, _ator_numero: '5521999999999', quem: 'Teste', unidade_id: 'u1' };

function montar(handlerImpl) {
  const enviados = [];
  const enviar = async (c, t) => { enviados.push(t); return 'M'; };
  // O handler real usa o sendFn da ponte, que registra no executor.
  const sendDoHandler = async (c, t) => { mod.registrarEnvio(t); return enviar(c, t); };
  const handler = handlerImpl(sendDoHandler, (e) => mod.registrarEvento(e));
  const ex = mod.criarExecutorCaixaTool({
    obterHandler: async () => handler, obterAbf: async () => ({ tratarConfirmacao: async () => false }),
    grupos: { [CHAT]: { unidade_id: 'u1', nome: 'Teste' } }, enviar,
  });
  return { ex, handler, enviados, sendDoHandler };
}

test('envio de outra mensagem em paralelo não entra na conta da ferramenta', async () => {
  let liberar;
  const trava = new Promise((r) => { liberar = r; });
  const { ex, sendDoHandler } = montar((send, log) => ({
    reidratarPendencias: async () => ({}), temPendencia: () => false,
    tratarAgentFirst: async () => { await trava; log({ acao: 'agent_first_nao_resolveu', motivo: 'nenhuma_fatura_aberta' }); return null; },
    handle: async () => null,
  }));
  const p = ex.executar({ tool: { name: 'caixa_preparar_lancamento', action: 'preparar_lancamento' }, ctx: CTX,
    args: { p_texto_original: 'Parcela - R$402,50', p_valor_total: 402.5 } });
  // Enquanto a ferramenta espera, a ponte processa OUTRA mensagem do grupo e publica um card.
  await new Promise((r) => setImmediate(r));
  await sendDoHandler(CHAT, 'CARD DE OUTRA PESSOA');
  liberar();
  const out = await p;
  assert.equal(out.estado, 'nada_aconteceu');
  assert.equal(out.ok, false);
  assert.deepEqual(out.mensagens_publicadas, []);
  assert.equal(out.motivo, 'nenhuma_fatura_aberta');
});

test('card publicado pela própria chamada é contado', async () => {
  const { ex } = montar((send) => ({
    reidratarPendencias: async () => ({}), temPendencia: () => false,
    tratarAgentFirst: async (ev) => { await send(ev.chatId, 'CARD'); return { acao: 'preview_agent_first_singular' }; },
    handle: async () => null,
  }));
  const out = await ex.executar({ tool: { name: 'x', action: 'preparar_lancamento' }, ctx: CTX,
    args: { p_texto_original: 'Parcela - R$402,50', p_valor_total: 402.5 } });
  assert.equal(out.estado, 'card_publicado');
  assert.equal(out.ok, true);
  assert.equal(out.gravou_no_caixa, false);
});

test('crachá de uma unidade não opera o grupo de outra', async () => {
  const { ex } = montar(() => ({ reidratarPendencias: async () => ({}), tratarAgentFirst: async () => { throw new Error('nao devia'); } }));
  const out = await ex.executar({ tool: { name: 'x', action: 'preparar_lancamento' },
    ctx: { ...CTX, unidade_id: 'outra' }, args: { p_texto_original: 'R$ 10,00', p_valor_total: 10 } });
  assert.equal(out.motivo, 'unidade_divergente');
  assert.equal(out.estado, 'nada_aconteceu');
});

test('grupo que não é financeiro é recusado; contexto sem ator também', async () => {
  const { ex } = montar(() => ({ reidratarPendencias: async () => ({}) }));
  assert.equal((await ex.executar({ tool: { action: 'preparar_lancamento' }, ctx: { ...CTX, _chat: 'x@g.us' }, args: {} })).motivo, 'grupo_fora_do_caixa');
  assert.equal((await ex.executar({ tool: { action: 'preparar_lancamento' }, ctx: { ok: true, _chat: CHAT }, args: {} })).motivo, 'contexto_invalido');
});

test('erro no meio depois de publicar: a resposta diz o que saiu e não é ok', async () => {
  const { ex } = montar((send) => ({
    reidratarPendencias: async () => ({}), temPendencia: () => false,
    tratarAgentFirst: async (ev) => { await send(ev.chatId, 'PERGUNTA'); throw new Error('falhou'); },
  }));
  const out = await ex.executar({ tool: { action: 'preparar_lancamento' }, ctx: CTX,
    args: { p_texto_original: 'R$ 10,00', p_valor_total: 10 } });
  assert.equal(out.ok, false);
  assert.equal(out.estado, 'mensagem_publicada');
  assert.deepEqual(out.mensagens_publicadas, ['PERGUNTA']);
  assert.equal(out.motivo, 'erro_interno');
});

// CG 29/09 10:38 (Mayra): "segunda parcela do passaporte de A (R$200,00) e B (R$200,00)"
// era recusada com "o total não aparece no texto". Somar o que a pessoa escreveu não é
// inventar total; somar data, "13/13" ou telefone seria.
test('total pela SOMA dos valores escritos com R$', () => {
  const { textoContemValor } = require('../../vps/la-hq/sol/runtime/caixa-tool-executor.cjs');
  const frase = 'Sol, são a segunda parcela do passaporte de Aluno A (R$200,00) e Aluno B (R$200,00)';
  assert.equal(textoContemValor(frase, 400), true, 'soma de dois valores com R$ fecha o total');
  assert.equal(textoContemValor(frase, 200), true, 'valor literal continua valendo');
  assert.equal(textoContemValor(frase, 401), false, 'soma que não fecha no centavo recusa');
  assert.equal(textoContemValor('Aluno A R$200,00 parcela 13/13 vence 05/10', 213), false, 'número sem R$ não entra na soma');
  assert.equal(textoContemValor('PG R$ 1.290,00 e R$ 432,00', 1722), true, 'milhar com ponto');
  assert.equal(textoContemValor('R$ 200,00', 400), false, 'um valor só não vira total dobrado');
});
