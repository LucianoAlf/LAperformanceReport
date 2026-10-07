#!/usr/bin/env node
'use strict';

// 29/09/2026, CG (Jhon): "Sol, Pagamento semanal do segurança - R$100,00 dinheiro"
// saiu como card de DESPESA pela ferramenta. Em 23/09, pelo ditado, saía segurança.
// Raiz: o adaptador da ferramenta monta "saída <cat> R$ …", e "saída" (termo genérico)
// vencia "segurança"; além disso a categoria do MODELO mandava sobre a da pessoa.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const cf = require(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-financeiro.cjs'));
const ex = require(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/caixa-tool-executor.cjs'));

test('categoria de saída dita pela pessoa', () => {
  const c = cf.categoriaSaidaDoTexto;
  assert.equal(c('Sol, Pagamento semanal do segurança - R$100,00 dinheiro'), 'seguranca');
  assert.equal(c('Sol, paguei o segurança R$ 100 em dinheiro'), 'seguranca'); // antes: despesa
  assert.equal(c('saída seguranca R$ 100,00 dinheiro PG Semana'), 'seguranca'); // corpo do adaptador
  assert.equal(c('Sol, compra de material de limpeza R$ 45,90 pix'), 'despesa');
  assert.equal(c('Sol, troco do caixa R$ 50 dinheiro'), 'troco');
  assert.equal(c('Sol, retirada do cofre R$ 300'), 'retirada');
  assert.equal(c('PG pix parcela 09/2026 aluno Fulano R$ 456,00'), null); // entrada não vira saída
  assert.equal(c('Sol, bom dia'), null);
});

test('ferramenta: a categoria da pessoa vence o palpite do modelo', async () => {
  const CHAT = 'g@g.us';
  const corpos = [];
  const eventos = [];
  const handler = {
    reidratarPendencias: async () => ({}), temPendencia: () => false,
    handle: async (ev) => { corpos.push(ev.body); return { acao: 'saida_texto_preview_enviado' }; },
  };
  const exe = ex.criarExecutorCaixaTool({
    obterHandler: async () => handler, obterAbf: async () => ({}),
    grupos: { [CHAT]: { unidade_id: 'u1', nome: 'CG' } }, enviar: async () => 'M',
    log: (e) => eventos.push(e),
  });
  await exe.executar({ tool: { name: 'caixa_preparar_saida', action: 'preparar_saida' },
    ctx: { ok: true, _chat: CHAT, _ator_numero: '55', quem: 'Jhon', unidade_id: 'u1' },
    args: { p_texto_original: 'Sol, Pagamento semanal do segurança - R$100,00 dinheiro',
            p_valor: 100, p_forma: 'dinheiro', p_categoria: 'despesa', p_descricao: 'Pagamento semanal' } });
  assert.equal(corpos.length, 1);
  assert.match(corpos[0], /^saída seguranca R\$ 100,00 dinheiro/);
  assert.equal(cf.categoriaSaidaDoTexto(corpos[0]), 'seguranca');
  assert.ok(eventos.some((e) => e.acao === 'saida_categoria_da_pessoa_prevaleceu'
    && e.categoria_modelo === 'despesa' && e.categoria_pessoa === 'seguranca'));
});

test('ferramenta: sem categoria no texto humano, vale a do modelo', async () => {
  const CHAT = 'g@g.us';
  const corpos = [];
  const handler = { reidratarPendencias: async () => ({}), temPendencia: () => false,
    handle: async (ev) => { corpos.push(ev.body); return { acao: 'saida_texto_preview_enviado' }; } };
  const exe = ex.criarExecutorCaixaTool({ obterHandler: async () => handler, obterAbf: async () => ({}),
    grupos: { [CHAT]: { unidade_id: 'u1', nome: 'CG' } }, enviar: async () => 'M' });
  await exe.executar({ tool: { name: 'caixa_preparar_saida', action: 'preparar_saida' },
    ctx: { ok: true, _chat: CHAT, _ator_numero: '55', quem: 'X', unidade_id: 'u1' },
    args: { p_texto_original: 'Sol, R$ 30 pro gás, dinheiro', p_valor: 30, p_forma: 'dinheiro',
            p_categoria: 'despesa', p_descricao: 'Gás' } });
  assert.match(corpos[0], /^saída despesa R\$ 30,00 dinheiro/);
});
