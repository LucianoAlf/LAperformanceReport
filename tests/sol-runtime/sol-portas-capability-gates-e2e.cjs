#!/usr/bin/env node
'use strict';

// Regressão de 15/09: um único canário cercava consulta, abertura/fechamento e
// mutações. A escada correta libera consulta + preview operacional nos grupos
// financeiros oficiais, mantendo lançamentos/correções/estornos no canário.
const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-portas-capability-'));
const runtime = path.join(tmp, 'runtime.cjs');
const abf = path.join(tmp, 'abf.cjs');
const calls = path.join(tmp, 'calls.jsonl');
const scopeEnv = path.join(tmp, 'scope.env');
const CHAT_CANARIO = 'recreio@g.us';
const CHAT_BARRA = 'barra@g.us';
const CHAT_FORA = 'outro@g.us';
const CRACHA = 'SOL1.5521999999999.' + 'a'.repeat(32);

fs.writeFileSync(scopeEnv, [
  `SOL_CAIXA_FINANCE_GROUPS=${CHAT_CANARIO}|unidade-recreio|Recreio;${CHAT_BARRA}|unidade-barra|Barra`,
  `SOL_CAIXA_TOOLS_CANARIO=${CHAT_CANARIO}`,
  'SEGREDO_FORA_DO_ESCOPO=nao_importar',
].join('\n'));

fs.writeFileSync(runtime, `
const fs=require('fs'); const LOG=${JSON.stringify(calls)};
module.exports.criarHandlerFinanceiro=()=>({
  reidratarPendencias:async()=>({ok:true,total:0}), temPendencia:()=>false,
  tratarAgentFirst:async()=>{fs.appendFileSync(LOG,JSON.stringify({tipo:'agent_first'})+'\\n');return {acao:'preview'}},
  handle:async()=>({acao:'handle'})
});`);
fs.writeFileSync(abf, `
const fs=require('fs'); const LOG=${JSON.stringify(calls)};
module.exports={
  postarAbertura:async(grupo)=>{fs.appendFileSync(LOG,JSON.stringify({tipo:'abertura',chat:grupo.chat_id})+'\\n');return {ok:true,previewId:'P1'}},
  tratarPedidoDiretoFechamento:async()=>true,
  tratarConfirmacao:async()=>false
};`);

function respostaMcp(linha) {
  const rpc = JSON.parse(linha);
  return JSON.parse(rpc.result.content[0].text);
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/rest/v1/rpc/sol_porta_caixa_contexto_v1') {
      const args = JSON.parse(body || '{}');
      return res.end(JSON.stringify({ ok: true, quem: 'Teste', nivel: 'lider',
        unidade_id: args.p_chat_id === CHAT_BARRA ? 'unidade-barra' : 'unidade-recreio',
        unidade_nome: args.p_chat_id === CHAT_BARRA ? 'Barra' : 'Recreio',
        _ator_numero: '5521999999999' }));
    }
    if (req.url === '/rest/v1/rpc/sol_porta_caixa_do_dia_assinado_v1') {
      return res.end(JSON.stringify({ ok: true, estado: 'aberto' }));
    }
    if (req.url === '/rest/v1/rpc/sol_cracha_verificar_v1') {
      const args = JSON.parse(body || '{}');
      assert.strictEqual(args.p_chat, CHAT_CANARIO);
      assert.strictEqual(args.p_cracha, CRACHA);
      return res.end(JSON.stringify({ ok: true, telefone: '5521999999999' }));
    }
    if (req.url === '/rest/v1/rpc/sol_porta_inadimplencia_v1') {
      const args = JSON.parse(body || '{}');
      assert.deepStrictEqual(args, { p_solicitante_telefone: '5521999999999' });
      return res.end(JSON.stringify({ ok: true, total: 2 }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const child = cp.spawn(process.execPath,
    [path.join(root, 'vps/la-hq/sol/scripts/sol-portas-mcp.mjs')], {
      env: { ...process.env,
        LA_REPORT_SUPABASE_URL: `http://127.0.0.1:${port}`,
        LA_REPORT_SERVICE_ROLE_KEY: 'teste',
        SOL_CAIXA_RUNTIME: runtime, SOL_CAIXA_ABF_RUNTIME: abf,
        SOL_CAIXA_GOVERNANCA_RUNTIME: path.join(root, 'vps/la-hq/sol/runtime/caixa-governanca-shadow.cjs'),
        SOL_CAIXA_GOVERNANCA_SHADOW: '0',
        SOL_CAIXA_SCOPE_ENV_FILE: scopeEnv,
        SOL_CAIXA_TOOLS_CANARIO: undefined,
        SOL_CAIXA_FINANCE_GROUPS: undefined,
      }, stdio: ['pipe', 'pipe', 'pipe'],
    });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const chamar = (id, name, chat, extra = {}) => child.stdin.write(JSON.stringify({
    jsonrpc: '2.0', id, method: 'tools/call',
    params: { name, arguments: { p_cracha: CRACHA, p_chat_id: chat, ...extra } },
  }) + '\n');

  chamar(1, 'caixa_do_dia', CHAT_BARRA, { p_data: '2026-09-14' });
  chamar(2, 'caixa_preparar_abertura', CHAT_BARRA);
  chamar(3, 'caixa_preparar_lancamento', CHAT_BARRA, {
    p_texto_original: 'Pagamento R$ 100,00', p_valor_total: 100,
  });
  chamar(4, 'caixa_do_dia', CHAT_FORA, { p_data: '2026-09-14' });
  child.stdin.write(JSON.stringify({
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'inadimplencia', arguments: {
      p_solicitante_telefone: CRACHA, p_chat_id: CHAT_CANARIO,
    } },
  }) + '\n');

  const limite = Date.now() + 5000;
  while ((out.match(/"jsonrpc"/g) || []).length < 5 && Date.now() < limite) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  child.kill('SIGTERM');
  const respostas = out.trim().split('\n').filter(Boolean).map(JSON.parse)
    .sort((a, b) => a.id - b.id).map((rpc) => respostaMcp(JSON.stringify(rpc)));
  assert.strictEqual(respostas.length, 5, out);
  assert.strictEqual(respostas[0].ok, true, 'consulta oficial da Barra deve funcionar');
  assert.strictEqual(respostas[1].ok, true, 'preview de abertura da Barra deve funcionar');
  assert.strictEqual(respostas[2].motivo, 'caixa_agent_tools_fora_do_canario');
  assert.strictEqual(respostas[3].motivo, 'caixa_capacidade_fora_do_grupo_oficial');
  assert.strictEqual(respostas[4].ok, true, 'crachá genérico deve ser validado no chat antes da RPC');
  const executadas = fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepStrictEqual(executadas, [{ tipo: 'abertura', chat: CHAT_BARRA }]);
  console.log('portas Caixa: consulta/operação oficial separadas do canário agent-first — OK');
})().catch((e) => { console.error(e && e.stack || e); process.exitCode = 1; })
  .finally(() => server.close());
