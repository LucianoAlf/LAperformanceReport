#!/usr/bin/env node
'use strict';

// Costura MCP -> contexto assinado -> adaptador -> runtime, sem rede/DB reais.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-portas-agent-'));
const log = path.join(tmp, 'calls.jsonl');
const runtime = path.join(tmp, 'runtime.cjs');
const abf = path.join(tmp, 'abf.cjs');
fs.writeFileSync(runtime, `
const fs=require('fs');
const LOG=${JSON.stringify(log)};
module.exports.criarHandlerFinanceiro=({sendFn})=>({
 reidratarPendencias:async()=>({ok:true,total:0}), temPendencia:()=>false,
 tratarAgentFirst:async(ev,grupo)=>{fs.appendFileSync(LOG,JSON.stringify({tipo:'lancamento',ev,grupo})+'\\n');await sendFn(ev.chatId,'CARD');return {acao:'preview_multi_aluno_enviado'}},
 handle:async(ev)=>{fs.appendFileSync(LOG,JSON.stringify({tipo:'handle',ev})+'\\n');await sendFn(ev.chatId,'CARD');return {acao:'movimento_operacao_preview_enviado'}}
});`);
fs.writeFileSync(abf, `module.exports={
 postarAbertura:async()=>({ok:true}), tratarPedidoDiretoFechamento:async()=>true,
 tratarConfirmacao:async()=>false
};`);

const CHAT = 'canario-teste@g.us';
const CRACHA = 'SOL1.5521999999999.' + 'a'.repeat(32);
const server = http.createServer((req, res) => {
  if (req.url === '/rest/v1/rpc/sol_porta_caixa_contexto_v1') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true, quem: 'Teste', nivel: 'lider',
      unidade_id: '00000000-0000-0000-0000-000000000001', unidade_nome: 'Teste',
      _ator_numero: '5521999999999' }));
  }
  if (req.url === '/send') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ success: true, messageId: 'MSG-1' }));
  }
  res.statusCode = 404; res.end('{}');
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const child = cp.spawn(process.execPath,
    [path.join(root, 'vps/la-hq/sol/scripts/sol-portas-mcp.mjs')], {
      env: { ...process.env,
        LA_REPORT_SUPABASE_URL: `http://127.0.0.1:${port}`,
        LA_REPORT_SERVICE_ROLE_KEY: 'teste', SOL_WHATSAPP_BRIDGE_URL: `http://127.0.0.1:${port}`,
        SOL_CAIXA_RUNTIME: runtime, SOL_CAIXA_ABF_RUNTIME: abf,
        SOL_CAIXA_TOOLS_CANARIO: CHAT,
      }, stdio: ['pipe', 'pipe', 'pipe'],
    });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const chamar = (id, name, args) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id,
    method: 'tools/call', params: { name, arguments: args } }) + '\n');
  chamar(1, 'caixa_preparar_correcao', {
    p_cracha: CRACHA, p_chat_id: CHAT,
    p_movimentacao_id: '00000000-0000-0000-0000-000000000099',
    p_valor_atual: 500, p_categoria_atual: 'parcela', p_forma_atual: 'pix',
    p_nova_forma: 'dinheiro', p_motivo: 'forma errada',
  });
  chamar(2, 'caixa_preparar_lancamento', {
    p_cracha: CRACHA, p_chat_id: CHAT,
    p_texto_original: 'Pagamento de Ana R$ 500,00 no cartão 2x', p_valor_total: 500,
    p_forma: 'cartao', p_cartao_modalidade: 'credito', p_cartao_parcelas: 2,
    p_itens: [{ aluno: 'Ana', categorias: ['parcela'], competencias: [] }],
  });
  const limite = Date.now() + 5000;
  while ((out.match(/"jsonrpc"/g) || []).length < 2 && Date.now() < limite) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  child.kill('SIGTERM');
  assert.strictEqual((out.match(/"jsonrpc"/g) || []).length, 2, out);
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(calls[0].ev.caixaToolTarget.movimentacao_id,
    '00000000-0000-0000-0000-000000000099');
  assert.strictEqual(calls[0].ev.caixaToolCommand.correcoes.forma_pagamento, 'dinheiro');
  assert.strictEqual(calls[1].ev.caixaToolDecision.valor_total, 500);
  assert.strictEqual(calls[1].ev.caixaToolDecision.itens[0].aluno, 'Ana');
  assert.strictEqual(calls[1].ev.caixaToolDecision.cartao_modalidade, 'credito');
  assert.strictEqual(calls[1].ev.caixaToolDecision.cartao_parcelas, 2);
  console.log('sol-portas MCP agent-first: contexto, alvo e envelope OK');
})().finally(() => { server.close(); });
