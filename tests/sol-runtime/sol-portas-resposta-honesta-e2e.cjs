#!/usr/bin/env node
'use strict';

// Recreio, 28/09/2026: a ferramenta de caixa respondia `{ok:true,
// ja_publicado_no_grupo:true}` para QUALQUER desfecho — inclusive quando o caixa
// não fez nada (`null`) ou quando o "pode" não achou card. O agente acreditou e
// disse "lançamento efetivado, recibo publicado" sem nenhuma linha no caixa.
// Aqui cada desfecho do runtime tem de virar o `estado` certo, e `ok` só é
// verdade quando saiu card ou o dinheiro foi gravado.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-portas-honesta-'));
const runtime = path.join(tmp, 'runtime.cjs');
const abf = path.join(tmp, 'abf.cjs');
// O aluno declarado escolhe o desfecho que o runtime falso produz.
fs.writeFileSync(runtime, `
module.exports.criarHandlerFinanceiro=({sendFn,log})=>({
 reidratarPendencias:async()=>({ok:true,total:0}), temPendencia:()=>false,
 tratarAgentFirst:async(ev)=>{
  const aluno=ev.caixaToolDecision.itens[0].aluno;
  if(aluno==='Nulo'){log({acao:'agent_first_nao_resolveu',chatId:ev.chatId,motivo:'nenhuma_fatura_aberta'});return null;}
  if(aluno==='Pergunta'){await sendFn(ev.chatId,'❓ Tem 2 alunos com esse nome');log({acao:'agent_first_pergunta',chatId:ev.chatId,motivo:'nome_ambiguo'});return {acao:'agent_first_pergunta',motivo:'nome_ambiguo'};}
  if(aluno==='Card'){await sendFn(ev.chatId,'CARD');return {acao:'preview_multi_aluno_enviado'};}
  if(aluno==='Gravou'){await sendFn(ev.chatId,'Lancei ✅');return {acao:'lancado'};}
  throw new Error('aluno inesperado '+aluno);
 },
 handle:async(ev)=>({acao:'pode_sem_pendencia'})
});`);
fs.writeFileSync(abf, `module.exports={postarAbertura:async()=>({ok:true}),
 tratarPedidoDiretoFechamento:async()=>true, tratarConfirmacao:async()=>false};`);

const CHAT = 'canario-teste@g.us';
const CRACHA = 'SOL1.5521999999999.' + 'a'.repeat(32);
const { criarPonteFalsa } = require('./_ponte-falsa.cjs');
const ponte = criarPonteFalsa({ runtime, abf, grupos: {
  [CHAT]: { unidade_id: '00000000-0000-0000-0000-000000000001', nome: 'Teste' },
} });
const server = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (d) => { corpo += d; });
  req.on('end', () => rotear(req, res, corpo));
});
function rotear(req, res, corpo) {
  if (req.url === '/caixa/tool') return ponte(req, res, corpo);
  res.setHeader('content-type', 'application/json');
  if (req.url === '/rest/v1/rpc/sol_porta_caixa_contexto_v1') {
    return res.end(JSON.stringify({ ok: true, quem: 'Teste', nivel: 'lider',
      unidade_id: '00000000-0000-0000-0000-000000000001', unidade_nome: 'Teste',
      _ator_numero: '5521999999999' }));
  }
  res.statusCode = 404; res.end('{}');
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const child = cp.spawn(process.execPath, [path.join(root, 'vps/la-hq/sol/scripts/sol-portas-mcp.mjs')], {
    env: { ...process.env,
      LA_REPORT_SUPABASE_URL: `http://127.0.0.1:${port}`, LA_REPORT_SERVICE_ROLE_KEY: 'teste',
      SOL_WHATSAPP_BRIDGE_URL: `http://127.0.0.1:${port}`,
      SOL_CAIXA_GOVERNANCA_RUNTIME: path.join(tmp, 'nao-existe.cjs'),
      SOL_CAIXA_TOOLS_CANARIO: CHAT,
    }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const respostas = new Map();
  const chamar = async (id, name, args) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call',
      params: { name, arguments: { p_cracha: CRACHA, p_chat_id: CHAT, ...args } } }) + '\n');
    const limite = Date.now() + 5000;
    while (Date.now() < limite) {
      for (const linha of out.split('\n')) {
        if (!linha.trim()) continue;
        const m = JSON.parse(linha);
        if (m.id === id) { respostas.set(id, JSON.parse(m.result.content[0].text)); return respostas.get(id); }
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('sem resposta para ' + id + ': ' + out);
  };
  const lancar = (id, aluno) => chamar(id, 'caixa_preparar_lancamento', {
    p_texto_original: `Parcela de Setembro de ${aluno} - R$402,50`, p_valor_total: 402.5, p_forma: 'pix',
    p_itens: [{ aluno, categorias: ['parcela'], competencias: ['Setembro'] }],
  });

  try {
    // Chamada sequencial: a captura é por chat e não pode vazar de uma para outra.
    const nulo = await lancar(1, 'Nulo');
    assert.strictEqual(nulo.ok, false, 'runtime que não fez nada não pode virar ok');
    assert.strictEqual(nulo.estado, 'nada_aconteceu');
    assert.strictEqual(nulo.gravou_no_caixa, false);
    assert.strictEqual(nulo.motivo, 'nenhuma_fatura_aberta');
    assert.ok(nulo.motivo_humano && /fatura/.test(nulo.motivo_humano));
    assert.ok(!('ja_publicado_no_grupo' in nulo), 'o carimbo antigo de sucesso não pode voltar');

    const pergunta = await lancar(2, 'Pergunta');
    assert.strictEqual(pergunta.ok, false);
    assert.strictEqual(pergunta.estado, 'mensagem_publicada');
    assert.deepStrictEqual(pergunta.mensagens_publicadas, ['❓ Tem 2 alunos com esse nome']);
    assert.strictEqual(pergunta.motivo, 'nome_ambiguo');

    const card = await lancar(3, 'Card');
    assert.strictEqual(card.ok, true);
    assert.strictEqual(card.estado, 'card_publicado');
    assert.strictEqual(card.gravou_no_caixa, false, 'card não é lançamento');

    const gravou = await lancar(4, 'Gravou');
    assert.strictEqual(gravou.ok, true);
    assert.strictEqual(gravou.estado, 'executado');
    assert.strictEqual(gravou.gravou_no_caixa, true);

    const pode = await chamar(5, 'caixa_aprovar_preview', { p_aprovacao: 'pode' });
    assert.strictEqual(pode.ok, false, '"pode" sem card não pode dizer que aprovou');
    assert.strictEqual(pode.estado, 'nada_aconteceu');
    assert.strictEqual(pode.motivo, 'pode_sem_pendencia');

    // O contrato de leitura vai na descrição de toda ferramenta que executa no caixa.
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }) + '\n');
    const limite = Date.now() + 5000;
    let lista = null;
    while (!lista && Date.now() < limite) {
      const l = out.split('\n').filter(Boolean).map(JSON.parse).find((m) => m.id === 99);
      if (l) lista = l.result.tools; else await new Promise((r) => setTimeout(r, 20));
    }
    const lanc = lista.find((t) => t.name === 'caixa_preparar_lancamento');
    assert.ok(/LEIA A RESPOSTA ANTES DE FALAR/.test(lanc.description));
    const consulta = lista.find((t) => t.name === 'caixa_do_dia');
    assert.ok(consulta && !/LEIA A RESPOSTA/.test(consulta.description), 'consulta não executa no caixa');
    console.log('sol-portas: resposta honesta (nada/mensagem/card/executado) — OK');
  } finally {
    child.kill('SIGTERM');
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
