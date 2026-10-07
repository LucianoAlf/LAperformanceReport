#!/usr/bin/env node
// Bateria de repetição do caixa da Sol — runtime real, mensagens reais, NADA escreve.
//
// Roda NA VPS (la-hq), como root, num diretório de trabalho próprio (ex.: /root/bateria-v4/),
// num processo node separado da ponte. Não reinicia serviço, não fala com a porta 3000,
// não escreve em /home/sol.
//
// O que faz:
//   1. Lê as mensagens reais dos 3 grupos financeiros (whatsapp-group-observe.jsonl) dos
//      últimos N dias (default 10), EXCLUINDO o dia de hoje (a trava de duplicidade do banco
//      olha "hoje", e o caso de hoje já está lançado de verdade).
//   2. Reproduz a ORDEM e o INTERVALO reais: intervalo curto (<= --cap-ms) é esperado em tempo
//      real; intervalo longo é saltado num relógio virtual (Date é trocado por um relógio que
//      marca a hora da mensagem original).
//   3. Passa cada mensagem pelo mesmo roteamento da ponte (bridge.js) e pelo handler REAL
//      (criarHandlerFinanceiro) com TODAS as escritas trocadas por fakes que só registram.
//   4. Compara o que a Sol faria com o gabarito (sol_caixa_lancamento_auditoria + o estado
//      atual de caixa_movimentacoes).
//
// TRÊS CAMADAS DE "NADA ESCREVE":
//   a) fakes injetados em toda função de escrita do handler (lancar, lote, saída, corrigir,
//      estornar, preview/approval/finalizar V3, governança, envio ao WhatsApp);
//   b) rede cercada: https.request só deixa passar GET no REST do Supabase, POST em RPC da
//      lista READ_RPCS (todas STABLE no banco, conferido em 29/09) e POST no gateway Zen do
//      roteador. Qualquer outra coisa lança erro e fica registrada em `bloqueios`;
//   c) processos cercados: hermes_cli NUNCA roda (ele usa o perfil OAuth da Sol e
//      refrescaria o token da produção) — a chamada é desviada para o gateway Zen com o mesmo
//      prompt; só tesseract/pdftotext/pdftoppm rodam, e só sobre cópia em --work-dir.
//      fs.write* em /home/sol lança erro.
//
// Uso (na VPS):
//   node bateria-sol-v4-repeticao.mjs --runtime-dir /root/bateria-v4/runtime \
//        --work-dir /root/bateria-v4 [--dias 10] [--cap-ms 45000] [--limite N]
//
// Saídas em <work-dir>/saida/: bruto-*.json (COM nomes — fica só na VPS) e
// resumo-anon-*.json (sem nomes nem telefones, ids curtos) — este é o que vira relatório.

import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cp = require('child_process');

// ─── argumentos ─────────────────────────────────────────────────────────────
function arg(nome, padrao) {
  const i = process.argv.indexOf('--' + nome);
  if (i === -1) return padrao;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
const PERFIL = '/home/sol/.hermes/profiles/sol';
const WORK = path.resolve(String(arg('work-dir', '/root/bateria-v4')));
const RUNTIME = path.resolve(String(arg('runtime-dir', path.join(WORK, 'runtime'))));
const OBSERVE = String(arg('observe', PERFIL + '/logs/whatsapp-group-observe.jsonl'));
const CAIXA_LOG = String(arg('caixa-log', PERFIL + '/caixa-ingestao/caixa.log'));
const SESSION = String(arg('session-dir', PERFIL + '/whatsapp/session'));
const DIAS = Number(arg('dias', 10));
const CAP_MS = Number(arg('cap-ms', 45000));
const LIMITE = arg('limite', null) ? Number(arg('limite')) : null;
const MODELO_LLM = String(arg('modelo-llm', 'minimax-m3'));
const SOL_IDS = new Set(['552121700723', '150814236631115']); // número e lid da própria Sol
const OUT = path.join(WORK, 'saida');
const MEDIA = path.join(WORK, 'media');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });

// ─── camada (b)+(c): cercas de rede, processo e disco — ANTES de carregar o runtime ─────
const READ_RPCS = new Set([
  'sol_caixa_resolver_multi_aluno_v1', 'sol_caixa_resolver_envelope_v1', 'sol_caixa_resolver_pagamento_itens_v1',
  'sol_caixa_resolver_composto_aluno_v1', 'sol_caixa_identificar_aluno_novo_v1', 'sol_caixa_casar_parcela',
  'sol_caixa_responsavel_aluno', 'sol_caixa_identificar_por_pagador', 'sol_caixa_ja_lancado_hoje',
  'sol_caixa_parcela_canonica', 'sol_caixa_resumo_do_dia', 'sol_caixa_quem_e', 'sol_caixa_buscar_movimentos_v1',
  'sol_caixa_buscar_lancamento_para_correcao', 'sol_cheque_documento_hash_v1', 'sol_cheque_resolver_fatura_v1',
]);
const bloqueios = [];
const chamadasRede = {};
function contaRede(k) { chamadasRede[k] = (chamadasRede[k] || 0) + 1; }
const _httpsRequest = https.request;
https.request = function cercado(a, b, c) {
  let host, pth, method;
  if (typeof a === 'string' || a instanceof URL) {
    const u = new URL(String(a));
    host = u.hostname; pth = u.pathname;
    method = ((b && typeof b === 'object' && b.method) || 'GET').toUpperCase();
  } else {
    host = a.hostname || a.host; pth = String(a.path || '').split('?')[0];
    method = String(a.method || 'GET').toUpperCase();
  }
  let ok = false;
  if (/\.supabase\.co$/.test(String(host))) {
    if ((method === 'GET' || method === 'HEAD') && pth.startsWith('/rest/v1/')) ok = true;
    const m = pth.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
    if (method === 'POST' && m && READ_RPCS.has(m[1])) ok = true;
  } else if (host === 'opencode.ai' && method === 'POST' && pth.startsWith('/zen/')) ok = true;
  const chave = `${method} ${host}${pth}`;
  if (!ok) {
    bloqueios.push({ chave, em: new Date().toISOString() });
    throw new Error('BATERIA_BLOQUEOU ' + chave);
  }
  contaRede(chave.replace(/^POST [^/]+\/rest\/v1\/rpc\//, 'rpc:'));
  return _httpsRequest.apply(this, arguments);
};
http.request = function () { bloqueios.push({ chave: 'http.request' }); throw new Error('BATERIA_BLOQUEOU http'); };
if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = async (u) => { bloqueios.push({ chave: 'fetch ' + String(u) }); throw new Error('BATERIA_BLOQUEOU fetch'); };
}
for (const fn of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync', 'copyFileSync',
  'writeFile', 'appendFile', 'mkdir', 'rm', 'rename', 'copyFile']) {
  const orig = fs[fn];
  // copy/rename: o que importa é o DESTINO (copiar DE /home/sol para o work-dir é leitura).
  const destinoNoArg2 = /^(copyFile|rename)/.test(fn);
  fs[fn] = function (p, ...rest) {
    const alvo = destinoNoArg2 ? rest[0] : p;
    if (String(alvo).startsWith('/home/sol')) { bloqueios.push({ chave: 'fs.' + fn + ' ' + alvo }); throw new Error('BATERIA_BLOQUEOU fs ' + alvo); }
    return orig.call(this, p, ...rest);
  };
}
const unlinkOrig = fs.unlinkSync;
fs.unlinkSync = function (p) {
  if (String(p).startsWith('/home/sol')) { bloqueios.push({ chave: 'fs.unlinkSync ' + p }); throw new Error('BATERIA_BLOQUEOU fs'); }
  return unlinkOrig.call(this, p);
};

// Zen: chave lida do mesmo arquivo que o runtime lê (nunca impressa).
function chaveZen() {
  if (process.env.OPENCODE_ZEN_API_KEY) return process.env.OPENCODE_ZEN_API_KEY;
  try {
    const m = fs.readFileSync(PERFIL + '/caixa-ingestao/.secrets/zen.env', 'utf8').match(/OPENCODE_ZEN_API_KEY=(.+)/);
    return m ? m[1].trim() : null;
  } catch (_) { return null; }
}
let llmDesviadas = 0;
function zenChat(prompt, timeout) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model: MODELO_LLM, max_tokens: 4000, temperature: 0,
      messages: [{ role: 'user', content: prompt }] });
    let req;
    try {
      req = https.request('https://opencode.ai/zen/v1/chat/completions', { method: 'POST', headers: {
        Authorization: 'Bearer ' + chaveZen(), 'Content-Type': 'application/json',
        'User-Agent': 'sol-caixa-bateria/1.0', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let d = ''; res.on('data', (c) => { d += c; });
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(null);
          try { resolve(JSON.parse(d).choices[0].message.content || null); } catch (_) { resolve(null); }
        });
      });
    } catch (e) { return resolve(null); }
    req.on('error', () => resolve(null));
    req.setTimeout(timeout || 45000, () => req.destroy());
    req.write(body); req.end();
  });
}
const PERMITIDOS = new Set(['/usr/bin/tesseract', '/usr/bin/pdftotext', '/usr/bin/pdftoppm']);
function dentroDoWork(args) { return (args || []).some((x) => String(x).startsWith(WORK)); }
const _execFile = cp.execFile;
cp.execFile = function (file, args, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  const fake = { kill() {}, on() { return fake; }, pid: 0 };
  if (/hermes-agent\/venv\/bin\/python$/.test(String(file)) && (args || []).includes('hermes_cli.main')) {
    // hermes_cli NUNCA roda aqui (perfil OAuth da produção). Visão (--image) falha;
    // texto vai ao Zen com o MESMO prompt.
    if (args.includes('--image')) { setImmediate(() => cb && cb(new Error('bateria: visao desligada'), '')); return fake; }
    const i = args.indexOf('-q');
    const prompt = i >= 0 ? args[i + 1] : '';
    llmDesviadas++;
    zenChat(prompt, options && options.timeout).then((txt) => {
      if (!cb) return;
      if (txt == null) cb(new Error('bateria: zen sem resposta'), ''); else cb(null, txt, '');
    });
    return fake;
  }
  if (PERMITIDOS.has(String(file)) && dentroDoWork(args)) return _execFile.call(this, file, args, options, cb);
  bloqueios.push({ chave: 'execFile ' + file });
  setImmediate(() => cb && cb(new Error('BATERIA_BLOQUEOU execFile ' + file), ''));
  return fake;
};
const _spawnSync = cp.spawnSync;
cp.spawnSync = function (file, args, options) {
  if ((PERMITIDOS.has(String(file)) || String(file) === '/usr/bin/python3') && dentroDoWork(args)) {
    return _spawnSync.call(this, file, args, options);
  }
  bloqueios.push({ chave: 'spawnSync ' + file });
  return { status: 1, stdout: '', stderr: 'bloqueado pela bateria' };
};
for (const fn of ['spawn', 'exec', 'execSync', 'execFileSync', 'fork']) {
  cp[fn] = function () { bloqueios.push({ chave: 'cp.' + fn }); throw new Error('BATERIA_BLOQUEOU cp.' + fn); };
}

// ─── relógio virtual ─────────────────────────────────────────────────────────
const RealDate = Date;
let OFFSET = 0;
class VDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + OFFSET); else super(...a); }
  static now() { return RealDate.now() + OFFSET; }
}
VDate.UTC = RealDate.UTC; VDate.parse = RealDate.parse;
globalThis.Date = VDate;
const realNow = () => RealDate.now();
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── ambiente do runtime (igual ao da ponte em 29/09, exceto as escritas) ────────────────
function lerChaveEnv(nome) {
  try {
    const l = fs.readFileSync(PERFIL + '/.env', 'utf8').split('\n').find((x) => x.startsWith(nome + '='));
    return l ? l.slice(nome.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch (_) { return ''; }
}
const FINANCE = lerChaveEnv('SOL_CAIXA_FINANCE_GROUPS');
const grupos = {};
for (const parte of FINANCE.split(';')) {
  const [chat, unidade, nome] = parte.split('|').map((s) => (s || '').trim());
  if (chat && unidade) grupos[chat] = { chat_id: chat, unidade_id: unidade, nome: nome || chat };
}
const CHATS = Object.keys(grupos);
if (CHATS.length !== 3) { console.error('SOL_CAIXA_FINANCE_GROUPS nao tem 3 grupos'); process.exit(2); }
Object.assign(process.env, {
  SOL_CAIXA_V3_LEDGER_FAKE: '1', SOL_CAIXA_V3_LEDGER_MODE: 'production', SOL_CAIXA_V3_LEDGER_STRICT: '1',
  SOL_CAIXA_V4_SHADOW: '0', SOL_CAIXA_V4_CANARIO: CHATS.join(','), SOL_CAIXA_TOOLS_CANARIO: CHATS.join(','),
  SOL_CAIXA_V4_OPERATIONAL_PREFLIGHT: '1', SOL_CAIXA_FINANCE_GROUPS: FINANCE,
  // dryRun=0 DE PROPÓSITO: com dryRun=1 o "pode" sai antes de montar o payload e do vínculo
  // de fatura — não daria para medir qual fatura a Sol vincularia. As escritas são fakes (a)
  // e a rede está cercada (b); não há caminho de gravação.
  SOL_CAIXA_DRYRUN: '0',
});
const resumoShortcut = lerChaveEnv('SOL_RESUMO_SHORTCUT');
if (resumoShortcut) process.env.SOL_RESUMO_SHORTCUT = resumoShortcut;

const fin = require(path.join(RUNTIME, 'caixa-financeiro.cjs'));
const abf = require(path.join(RUNTIME, 'caixa-abertura-fechamento.cjs'));
const ge = require(path.join(RUNTIME, 'group-engagement.cjs'));
const chq = require(path.join(RUNTIME, 'caixa-cheques.cjs'));

// ─── utilidades ─────────────────────────────────────────────────────────────
const sha = (s) => crypto.createHash('sha256').update(String(s || '')).digest('hex');
const curto = (s) => sha(s).slice(0, 8);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

function restGet(q) {
  const { url, key } = fin.carregarEnv();
  return new Promise((resolve, reject) => {
    const u = new URL(`${url}/rest/v1/${q}`);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => {
        if (res.statusCode >= 300) return reject(new Error('GET ' + u.pathname + ' ' + res.statusCode + ' ' + d.slice(0, 200)));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.end();
  });
}
async function restGetIn(tabela, coluna, ids, select) {
  const out = [];
  const lista = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < lista.length; i += 60) {
    const fatia = lista.slice(i, i + 60).map((x) => encodeURIComponent(x)).join(',');
    out.push(...await restGet(`${tabela}?select=${select}&${coluna}=in.(${fatia})`));
  }
  return out;
}

function brtDia(ms) { return new RealDate(ms - 3 * 3600 * 1000).toISOString().slice(0, 10); }
const hojeBrt = brtDia(realNow());
const inicioHojeMs = RealDate.parse(hojeBrt + 'T03:00:00Z');
const inicioJanelaMs = inicioHojeMs - DIAS * 86400 * 1000;

// ─── 1. mensagens reais ──────────────────────────────────────────────────────
const linhas = fs.readFileSync(OBSERVE, 'utf8').split('\n');
let msgs = [];
const vistosIds = new Set();
for (const l of linhas) {
  let e; try { e = JSON.parse(l); } catch (_) { continue; }
  if (!e || !grupos[e.chatId]) continue;
  const ms = Number(e.timestamp) * 1000;
  if (!(ms >= inicioJanelaMs && ms < inicioHojeMs)) continue;
  const quem = String(e.senderId || '').replace(/@.*/, '');
  if (SOL_IDS.has(quem)) continue;
  if (vistosIds.has(e.messageId)) continue;
  vistosIds.add(e.messageId);
  msgs.push({ ...e, ms });
}
msgs.sort((a, b) => a.ms - b.ms);
if (LIMITE) msgs = msgs.slice(0, LIMITE);
const msgPorId = new Map(msgs.map((m) => [m.messageId, m]));

// telefone do remetente: mesmo arquivo que a ponte lê (somente leitura)
function telefoneDe(senderId) {
  const id = String(senderId || '').replace(/@.*/, '');
  if (String(senderId).endsWith('@s.whatsapp.net')) return id;
  if (!/^\d+$/.test(id)) return null;
  try { return String(JSON.parse(fs.readFileSync(path.join(SESSION, `lid-mapping-${id}_reverse.json`), 'utf8'))).replace(/\D/g, '') || null; }
  catch (_) { return null; }
}

// ─── 2. gabarito ─────────────────────────────────────────────────────────────
const desdeIso = new RealDate(inicioJanelaMs).toISOString();
const ateIso = new RealDate(inicioHojeMs).toISOString();
const aud = await restGet(`sol_caixa_lancamento_auditoria?select=id,chat_id,origem_message_id,preview_message_id,resultado,movimentacao_id,payload,criado_em&criado_em=gte.${desdeIso}&criado_em=lt.${ateIso}&order=criado_em.asc`);
const movIds = aud.map((a) => a.movimentacao_id).filter(Boolean);
const movs = await restGetIn('caixa_movimentacoes', 'id', movIds, 'id,aluno_id,fatura_id,valor,categoria,forma_pagamento,tipo,unidade_id,descricao');
const movPorId = new Map(movs.map((m) => [m.id, m]));
const links = await restGetIn('vw_caixa_movimentacao_fatura_links', 'movimentacao_id', movIds, 'movimentacao_id,fatura_id');
const linksPorMov = new Map();
for (const l of links) { if (!linksPorMov.has(l.movimentacao_id)) linksPorMov.set(l.movimentacao_id, new Set()); linksPorMov.get(l.movimentacao_id).add(l.fatura_id); }

// Um caso = uma origem (comprovante) com seus lançamentos aprovados.
const casos = new Map();
for (const a of aud) {
  if (!['lancado', 'lancado_lote', 'saida_lancada', 'recusado'].includes(a.resultado)) continue;
  const origem = a.origem_message_id || (a.payload && a.payload.origem_message_id);
  if (!origem) continue;
  const c = casos.get(origem) || { origem, chat: a.chat_id || (a.payload && a.payload.chat_id), itens: [], resultado: a.resultado,
    preview_real: a.preview_message_id, criado_em: a.criado_em, payload_valor: a.payload && a.payload.valor,
    payload_forma: a.payload && a.payload.forma, payload_categoria: a.payload && a.payload.categoria,
    payload_cartao: a.payload && a.payload.cartao_modalidade, payload_parcelas: a.payload && a.payload.cartao_parcelas };
  if (a.resultado === 'recusado') { c.recusado_real = true; casos.set(origem, c); continue; }
  const m = a.movimentacao_id && movPorId.get(a.movimentacao_id);
  const fats = new Set();
  if (m && m.fatura_id) fats.add(m.fatura_id);
  for (const f of (linksPorMov.get(a.movimentacao_id) || [])) fats.add(f);
  c.itens.push({ mov: a.movimentacao_id, existe: !!m, aluno_id: m ? m.aluno_id : a.payload && a.payload.aluno_id,
    faturas: [...fats], valor: m ? Number(m.valor) : Number(a.payload && a.payload.valor), categoria: m ? m.categoria : a.payload && a.payload.categoria,
    aluno_nome: a.payload && a.payload.aluno, forma: m ? m.forma_pagamento : a.payload && a.payload.forma });
  c.resultado = a.resultado;
  casos.set(origem, c);
}
const casoPorPreviewReal = new Map();
for (const c of casos.values()) if (c.preview_real) casoPorPreviewReal.set(c.preview_real, c.origem);
// origem pode ser "a+b" (lote de mídia consolidado)
const casoPorMsg = new Map();
for (const c of casos.values()) for (const id of String(c.origem).split('+')) casoPorMsg.set(id, c);

// dicas do caixa.log (valor/forma que o OCR real leu, casado por chat + tempo)
const dicasOcr = [];
try {
  for (const l of fs.readFileSync(CAIXA_LOG, 'utf8').split('\n')) {
    if (!l.includes('agent_first_midia_estruturada')) continue;
    try { const o = JSON.parse(l); const ms = RealDate.parse(o.ts); if (ms >= inicioJanelaMs - 3600e3 && ms < inicioHojeMs + 3600e3) dicasOcr.push({ ...o, ms }); } catch (_) {}
  }
} catch (_) {}

// ─── 3. mídia: arquivo real (cópia) quando existe; senão OCR sintético ──────────────
const midiaInfo = new Map(); // caminho usado -> { fonte, texto, visao }
function textoSintetico({ valor, forma, cartao, parcelas, dataMs }) {
  const v = Number(valor).toFixed(2).replace('.', ',');
  const d = new RealDate(dataMs - 3 * 3600e3);
  const data = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  if (forma === 'cartao') {
    const mod = cartao === 'debito' ? 'DEBITO A VISTA'
      : (Number(parcelas) > 1 ? `CREDITO PARCELADO LOJA ${parcelas}X` : 'CREDITO A VISTA');
    return `COMPROVANTE DE VENDA\nVIA ESTABELECIMENTO\n${mod}\nVALOR: R$ ${v}\n${data} 14:32\nTRANSACAO APROVADA`;
  }
  if (forma === 'transferencia') return `Comprovante de transferência\nTED realizada\nValor: R$ ${v}\nData: ${data}\nAutenticação 8F3A2C`;
  if (forma === 'dinheiro') return `RECIBO\nValor recebido: R$ ${v}\nData: ${data}`;
  return `Comprovante de Pix\nPix enviado\nValor\nR$ ${v}\nData e hora\n${data} - 14:32:10\nTipo de transferência\nPix\nID da transação\nE18236120202609201732s0${Math.floor(dataMs / 1000) % 100000}`;
}
function prepararMidia(m) {
  const orig = (m.mediaUrls || [])[0];
  if (!orig) return [];
  const base = path.basename(orig);
  const destino = path.join(MEDIA, m.messageId + '__' + base);
  let fonte = null;
  if (fs.existsSync(orig) && m.mediaType !== 'audio') {
    try { fs.copyFileSync(orig, destino); fonte = 'arquivo_real'; } catch (_) { fonte = null; }
  }
  if (!fonte) {
    const caso = casoPorMsg.get(m.messageId);
    let valor = null, forma = null, cartao = null, parcelas = null, origemDado = null;
    if (caso && (caso.payload_valor || caso.itens.length)) {
      valor = caso.itens.length > 1 ? caso.itens.reduce((t, i) => t + Number(i.valor || 0), 0) : Number(caso.payload_valor || caso.itens[0].valor);
      forma = caso.payload_forma || (caso.itens[0] && caso.itens[0].forma);
      cartao = caso.payload_cartao; parcelas = caso.payload_parcelas; origemDado = 'gabarito';
    } else {
      const d = dicasOcr.filter((x) => x.chatId === m.chatId && x.ms >= m.ms - 5000 && x.ms <= m.ms + 180000)
        .sort((a, b) => a.ms - b.ms)[0];
      if (d && d.valor) { valor = d.valor; forma = d.forma; cartao = d.cartao_modalidade; parcelas = d.cartao_parcelas; origemDado = 'ocr_real_log'; }
    }
    if (m.mediaType === 'audio') midiaInfo.set(destino, { fonte: 'audio', texto: '' });
    else if (valor) midiaInfo.set(destino, { fonte: 'sintetico_' + origemDado, texto: textoSintetico({ valor, forma, cartao, parcelas, dataMs: m.ms }),
      visao: { valor: Number(valor), aluno: null, pagador_nome: null, forma: forma || null } });
    else midiaInfo.set(destino, { fonte: 'sintetico_ilegivel', texto: '' });
  } else midiaInfo.set(destino, { fonte });
  return [destino];
}

// ─── 4. handler com escritas fakes ───────────────────────────────────────────
const als = new AsyncLocalStorage();
const enviadas = []; // { id, chatId, texto, gatilho, tReal, tVirt }
const escritas = []; // { tipo, payload, gatilho }
const logsSemContexto = [];
let seq = 0;
const politica = ge.createGroupEngagementPolicy({ gruposQueRespondem: new Set(CHATS), janelaMs: 180000 });

function ctxAtual() { return als.getStore() || null; }
async function sendFake(chatId, texto) {
  const id = 'BAT' + String(++seq).padStart(6, '0');
  const c = ctxAtual();
  const rec = { id, chatId, texto: String(texto || ''), gatilho: c ? c.msgId : null, tReal: realNow(), tVirt: Date.now() };
  enviadas.push(rec);
  if (c) c.envios.push(rec);
  politica.registrarRespostaDaSol({ chatId });
  return id;
}
function registraEscrita(tipo, payload, extra = {}) {
  const c = ctxAtual();
  escritas.push({ tipo, payload, gatilho: c ? c.msgId : null, tVirt: Date.now(), ...extra });
}
let movSeq = 0;
const handler = fin.criarHandlerFinanceiro({
  grupos,
  sendFn: sendFake,
  lancarFn: async (p) => { registraEscrita('lancar', p); return { ok: true, movimentacao_id: 'fake-mov-' + (++movSeq), valor: Number(p.valor), forma: p.forma }; },
  lancarLoteFn: async (p) => {
    registraEscrita('lancar_lote', p);
    const itens = Array.isArray(p.itens) ? p.itens : [];
    return { ok: true, lote_id: 'fake-lote-' + (++movSeq), movimentacoes: itens.map((it, i) => ({ movimentacao_id: 'fake-mov-' + movSeq + '-' + i, valor: it.valor, aluno_nome: it.aluno_nome })) };
  },
  lancarSaidaFn: async (p) => { registraEscrita('saida', p); return { ok: true, movimentacao_id: 'fake-saida-' + (++movSeq), valor: Number(p.valor), forma: p.forma }; },
  corrigirMovimentoFn: async (p) => { registraEscrita('corrigir', p); return { ok: true, movimentacao_id: p.movimentacao_id }; },
  estornarMovimentoFn: async (p) => { registraEscrita('estornar', p); return { ok: true, movimentacao_id: p.movimentacao_id }; },
  registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'fake-prev-' + (++movSeq) }),
  registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'fake-appr-' + (++movSeq) }),
  finalizarPreviewV3Fn: async () => ({ ok: true }),
  listarPreviewsAbertosFn: async () => [],
  governanceFn: async () => ({ ok: false, disabled: true }),
  ocrFn: async (media, opts = {}) => {
    const info = midiaInfo.get(media);
    if (info && info.fonte === 'arquivo_real') return fin.ocrLocal(media, opts);
    const texto = info ? info.texto : '';
    const r = { text: texto, status: texto ? 'ok' : 'texto_vazio', duration_ms: 1, file_bytes: null, bateria: info ? info.fonte : 'sem_info' };
    return opts.detailed ? r : texto;
  },
  visaoFn: async (media) => { const info = midiaInfo.get(media); return info && info.visao ? { ...info.visao } : null; },
  log: (o) => { const c = ctxAtual(); if (c) c.logs.push(o); else logsSemContexto.push(o); },
  dryRun: false,
});
// camada extra: qualquer default de escrita que tenha sobrado viraria bloqueio de rede (b).

// ─── 5. roteamento da ponte (bridge.js, 28-29/09) ───────────────────────────
const identidadesProprias = new Set([...SOL_IDS]);
function similaridade(a, b) {
  const A = new Set(norm(a).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const B = new Set(norm(b).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const w of A) if (B.has(w)) i++;
  return i / Math.min(A.size, B.size);
}
const cardsPorOrigem = new Map(); // origem (msg humana) -> ids de card da repetição
function mapearCitacao(m) {
  const q = m.quotedMessageId;
  if (!q) return { id: null, via: null };
  if (msgPorId.has(q)) return { id: q, via: 'humana' };
  const origemCaso = casoPorPreviewReal.get(q);
  if (origemCaso) {
    for (const o of String(origemCaso).split('+')) {
      const ids = cardsPorOrigem.get(o);
      if (ids && ids.length) return { id: ids[ids.length - 1], via: 'card_do_gabarito' };
    }
  }
  const candidatos = enviadas.filter((s) => s.chatId === m.chatId && s.tVirt <= Date.now() && s.tVirt >= Date.now() - 6 * 3600e3);
  let melhor = null, nota = 0;
  for (const s of candidatos) { const n = similaridade(m.quotedPreview || '', s.texto); if (n > nota) { nota = n; melhor = s; } }
  if (melhor && nota >= 0.35) return { id: melhor.id, via: 'texto_parecido', nota: Number(nota.toFixed(2)) };
  return { id: 'REAL-' + q, via: 'sem_par' };
}
function mencoes(body) { return (String(body || '').match(/@(\d{6,})/g) || []).map((x) => x.slice(1) + '@lid'); }

async function processar(m) {
  const cit = mapearCitacao(m);
  const ev = {
    messageId: m.messageId, chatId: m.chatId, senderId: m.senderId, senderName: m.senderName,
    senderPhone: telefoneDe(m.senderId), chatName: m.chatName, isGroup: true,
    body: m.body || '', hasMedia: !!m.hasMedia, mediaType: m.mediaType || '', mediaUrls: m.hasMedia ? prepararMidia(m) : [],
    mentionedIds: mencoes(m.body), quotedMessageId: cit.id, quotedResolved: !!m.quotedResolved, quotedPreview: m.quotedPreview || '',
    hasQuotedMessage: !!m.quotedMessageId, timestamp: Math.floor(m.ms / 1000), ts: new RealDate(m.ms).toISOString(),
    caixaGovernancaEpisode: null,
  };
  const c = ctxAtual();
  c.citacao = cit;
  const body = ev.body;
  if (m.hasMedia) c.midia = midiaInfo.get(ev.mediaUrls[0]) ? midiaInfo.get(ev.mediaUrls[0]).fonte : null;
  if (m.hasMedia && chq.pareceLoteCheques(ev)) c.cheques = true;
  // abertura/fechamento: executor determinístico com RPC própria — não executado aqui.
  if (abf.pedidoDiretoFechar(body)) { c.rota = 'abf_fechamento_direto(nao_executado)'; return; }
  if (abf.pedidoReabrir(body)) { c.rota = 'abf_reabertura_direta(nao_executado)'; return; }
  if (m.quotedMessageId && /ABERTURA DE CAIXA|FECHAMENTO DE CAIXA|Posso abrir|Posso fechar/i.test(m.quotedPreview || '')
      && abf.afirmativo(body, { respondeuPreview: true })) { c.rota = 'abf_confirmacao(nao_executado)'; return; }
  const confirm = !!(handler.deveTratarConfirmacaoDeterministica && handler.deveTratarConfirmacaoDeterministica(ev));
  const compl = !!(handler.deveTratarComplementoDeterministico && handler.deveTratarComplementoDeterministico(ev));
  const chamou = !ev.hasMedia && politica.prever({ chatId: ev.chatId, texto: body, mentionedIds: ev.mentionedIds, senderId: ev.senderId, identidadesProprias }).responder;
  if (chamou && !confirm && !compl) {
    politica.decidir({ chatId: ev.chatId, texto: body, mentionedIds: ev.mentionedIds, senderId: ev.senderId, identidadesProprias });
    c.rota = 'agente_hermes(nao_reproduzido)';
    if (handler.resumoCardsAbertosParaAgente) { try { c.cardsAbertosNoMomento = !!handler.resumoCardsAbertosParaAgente(ev.chatId); } catch (_) {} }
    return;
  }
  c.rota = confirm ? 'handler:confirmacao' : compl ? 'handler:complemento' : ev.hasMedia ? 'handler:midia' : 'handler:texto';
  const t0 = realNow();
  const r = await handler.handle(ev);
  c.acao = r && r.acao; c.msHandle = realNow() - t0;
  let tratou = !(r && (r.acao === 'nada' || r.acao === 'ignorado_fora_grupo'));
  const souConversa = !!(handler.ehConversaSemComando && handler.ehConversaSemComando(body));
  if (!tratou && souConversa && handler.temPendencia(ev.chatId)) { tratou = true; c.pos = 'guarda_conversa_calada'; }
  const pareceProSol = !!ge.pareceChamarSol(body);
  const citouCard = !!(ev.quotedMessageId && handler.citaAlgumaPendencia && handler.citaAlgumaPendencia(ev.chatId, ev.quotedMessageId));
  const cardPendente = handler.temPendencia(ev.chatId);
  if (!tratou && pareceProSol && r && r.acao === 'nada' && handler.decidirRoteadorV4) {
    let dec = null;
    try { dec = await handler.decidirRoteadorV4(ev, r.acao, { modo: 'preflight_operacional' }); } catch (_) {}
    if (dec && ((dec.intencao === 'abrir_caixa') || (dec.intencao === 'fechar_caixa' && !cardPendente)) && Number(dec.confianca || 0) >= 0.9) {
      c.pos = 'abf_v4_' + dec.intencao + '(nao_executado)'; return;
    }
  }
  if (!tratou && (pareceProSol || citouCard) && r && r.acao === 'nada' && cardPendente) {
    let llm = null;
    try { llm = handler.tratarNaoEntendida ? await handler.tratarNaoEntendida(ev) : null; } catch (_) {}
    if (llm && llm.tratou) { tratou = true; c.pos = 'fallback_llm:' + llm.acao; }
    else {
      await sendFake(ev.chatId, 'Não entendi essa 🤔 — e tem lançamento em aberto aqui, então não vou chutar.\n\nResponde *pode* para lançar como está, *não* para descartar, ou cita o card e escreve *aluno: Nome Completo* para eu corrigir.');
      tratou = true; c.pos = 'guarda_nao_entendi';
    }
  }
  if (!tratou) {
    const d = politica.decidir({ chatId: ev.chatId, texto: body, mentionedIds: ev.mentionedIds, senderId: ev.senderId, identidadesProprias });
    if (d.cortesia) await sendFake(ev.chatId, 'De nada! 🌻');
    c.pos = d.responder ? 'agente_hermes_pos_caixa(nao_reproduzido)' : 'politica:' + d.motivo;
  }
}

// ─── 6. repetição ─────────────────────────────────────────────────────────────
const registros = [];
const emVoo = new Set();
async function drenar(maxMs) {
  const t = realNow();
  while (emVoo.size && realNow() - t < maxMs) await Promise.race([...emVoo, realSleep(1000)]);
}
function snapshotPendentes() {
  const out = [];
  for (const [chat, arr] of handler._pendentes.entries()) {
    for (const p of arr || []) {
      let v = null; try { v = fin.derivarVinculo(p); } catch (_) {}
      out.push({ chat, origem: p.origem, previewId: p.previewId, aluno: p.aluno || null, valor: p.valor, categoria: p.categoria,
        forma: p.forma, fatura_id: v && v.fatura_id || null, fatura_ids: v && v.fatura_ids || null, aluno_id: v && v.aluno_id || null,
        bloqueia: !!p.bloqueiaLancamento, itens: Array.isArray(p.itens) ? p.itens.map((i) => ({ aluno_nome: i.aluno_nome, valor: i.valor, fatura_id: i.fatura_id || null, aluno_id: i.aluno_id || null })) : null });
    }
  }
  return out;
}
const ultimoCardPorOrigem = new Map();
const t0Bateria = realNow();
console.log(`bateria: ${msgs.length} mensagens de ${brtDia(inicioJanelaMs)} a ${brtDia(inicioHojeMs - 1)} | casos no gabarito: ${casos.size}`);
for (let i = 0; i < msgs.length; i++) {
  const m = msgs[i];
  if (i === 0) OFFSET = m.ms - realNow();
  const gap = m.ms - Date.now();
  if (gap > CAP_MS) {
    await drenar(240000);
    OFFSET = Math.max(OFFSET, m.ms - realNow());
  } else if (gap > 0) await realSleep(gap);
  const reg = { i, msgId: m.messageId, chat: m.chatId, unidade: grupos[m.chatId].nome, ms: m.ms, tVirtDespacho: Date.now(), tRealDespacho: realNow(),
    remetente: m.senderName, corpo: m.body, midia: m.hasMedia ? m.mediaType : null, citou: m.quotedMessageId || null,
    envios: [], logs: [], rota: null, acao: null };
  registros.push(reg);
  const p = als.run(reg, async () => {
    try { await processar(m); }
    catch (e) { reg.erro = String(e && e.stack || e).slice(0, 600); }
    finally {
      reg.tRealFim = realNow();
      reg.pendentesDepois = snapshotPendentes();
      for (const s of reg.envios) {
        if (/pode/i.test(s.texto) && /R\$/.test(s.texto)) {
          // card: associa à origem (mensagem que o originou) pelo pendente com este previewId
          const pend = reg.pendentesDepois.find((x) => x.previewId === s.id);
          const origens = pend ? String(pend.origem || '').split('+') : [m.messageId];
          for (const o of origens) { const a = cardsPorOrigem.get(o) || []; a.push(s.id); cardsPorOrigem.set(o, a); ultimoCardPorOrigem.set(o, s); }
        }
      }
    }
  });
  emVoo.add(p); p.finally(() => emVoo.delete(p));
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${msgs.length} · ${Math.round((realNow() - t0Bateria) / 1000)}s · escritas-fake ${escritas.length} · bloqueios ${bloqueios.length}`);
}
await drenar(300000);

// ─── 7. análise ─────────────────────────────────────────────────────────────
function tipoEnvio(t) {
  if (/^✅ Lancei/.test(t)) return 'lancado';
  if (/^🧪/.test(t)) return 'dryrun';
  if (/N[ãa]o entendi/i.test(t)) return 'nao_entendi';
  if (/N[ãa]o lancei|n[ãa]o consegui|bloque|⚠️|🚨/i.test(t)) return 'recusa_ou_alerta';
  if (/pode/i.test(t) && /R\$/.test(t)) return 'card';
  if (/\?\s*$/.test(t.trim()) || /me (diz|manda|confirma)/i.test(t)) return 'pergunta';
  return 'outro';
}
for (const e of enviadas) e.tipo = tipoEnvio(e.texto);
const regPorMsg = new Map(registros.map((r) => [r.msgId, r]));

const alunosIds = new Set();
for (const c of casos.values()) for (const it of c.itens) if (it.aluno_id) alunosIds.add(it.aluno_id);
for (const w of escritas) { if (w.payload && w.payload.aluno_id) alunosIds.add(w.payload.aluno_id); for (const it of (w.payload && w.payload.itens) || []) if (it.aluno_id) alunosIds.add(it.aluno_id); }
for (const r of registros) for (const p of r.pendentesDepois || []) if (p.aluno_id) alunosIds.add(p.aluno_id);
const alunos = await restGetIn('alunos', 'id', [...alunosIds], 'id,nome,unidade_id,emusys_student_id');
const alunoPorId = new Map(alunos.map((a) => [a.id, a]));
function mesmaPessoa(a, b) {
  if (!a || !b) return false; if (String(a) === String(b)) return true;
  const A = alunoPorId.get(Number(a)) || alunoPorId.get(a); const B = alunoPorId.get(Number(b)) || alunoPorId.get(b);
  if (!A || !B) return false;
  if (A.unidade_id !== B.unidade_id) return false;
  if (A.emusys_student_id && A.emusys_student_id === B.emusys_student_id) return true;
  return norm(A.nome).trim() === norm(B.nome).trim();
}
const fatIds = new Set();
for (const c of casos.values()) for (const it of c.itens) for (const f of it.faturas) fatIds.add(f);
for (const w of escritas) { if (w.payload && w.payload.fatura_id) fatIds.add(w.payload.fatura_id); for (const f of (w.payload && w.payload.fatura_ids) || []) fatIds.add(f); for (const it of (w.payload && w.payload.itens) || []) if (it.fatura_id) fatIds.add(it.fatura_id); }
const faturas = await restGetIn('emusys_faturas', 'id', [...fatIds], 'id,descricao,competencia,status');
const faturaPorId = new Map(faturas.map((f) => [f.id, f]));
// Rótulo SEM nome: tipo + competência + id curto (a descrição da fatura pode trazer nome).
function rotuloFatura(id) {
  const f = faturaPorId.get(id) || {};
  const tipo = /^parcela/i.test(f.descricao || '') ? 'Parcela' : (/matr/i.test(f.descricao || '') ? 'Taxa matricula'
    : (f.descricao ? String(f.descricao).split(/\s+-\s+/)[0].replace(/[A-ZÀ-Ú][a-zà-ú]+ [A-ZÀ-Ú][a-zà-ú]+.*/, '').trim().slice(0, 30) : '?'));
  return `${tipo} ${f.competencia || ''} [${String(id).slice(0, 8)}${f.status ? ' ' + f.status : ''}]`.replace(/\s+/g, ' ');
}

function escritasDoCaso(c) {
  const ids = String(c.origem).split('+');
  return escritas.filter((w) => w.payload && ids.some((o) => String(w.payload.origem_message_id || '').split('+').includes(o)));
}
function registrosDoCaso(c) {
  return String(c.origem).split('+').map((o) => regPorMsg.get(o)).filter(Boolean);
}
const resultados = [];
for (const c of casos.values()) {
  const regs = registrosDoCaso(c);
  const res = { caso: curto(c.origem), unidade: grupos[c.chat] ? grupos[c.chat].nome : '?', resultado_real: c.resultado,
    categoria_real: c.payload_categoria || (c.itens[0] && c.itens[0].categoria) || null, n_itens_real: c.itens.length,
    movs: c.itens.map((it) => String(it.mov || '').slice(0, 8)), mensagem_no_log: regs.length > 0, notas: [] };
  if (!regs.length) { res.classe = 'fora_da_repeticao'; res.notas.push('mensagem de origem nao esta no observe log da janela'); resultados.push(res); continue; }
  const reg = regs[0];
  res.rota = reg.rota; res.acao = reg.acao; res.pos = reg.pos || null; res.midia_fonte = reg.midia || null;
  const envCaso = enviadas.filter((e) => regs.some((r) => r.msgId === e.gatilho));
  const card = cardsPorOrigem.get(String(c.origem).split('+')[0]);
  const primeiroCard = enviadas.find((e) => card && card.includes(e.id));
  res.ms_ate_card = primeiroCard ? primeiroCard.tReal - reg.tRealDespacho : null;
  res.envios_no_gatilho = envCaso.map((e) => e.tipo);
  const logsAcoes = regs.flatMap((r) => r.logs.map((l) => l.acao || l.step)).filter(Boolean);
  res.caminho = logsAcoes.some((a) => /^(preview_agent_first|agent_first_preview|agent_first_card|agent_first_publicado)/.test(a)) ? 'agent_first'
    : logsAcoes.some((a) => /agent_first/.test(a)) && !logsAcoes.includes('preview_enviado') ? 'agent_first(sem_card)'
    : logsAcoes.includes('preview_enviado') ? 'legado' : (reg.rota || '').startsWith('agente') ? 'agente_hermes' : 'indefinido';
  res.acoes_log = [...new Set(logsAcoes)].slice(0, 25);
  const ws = escritasDoCaso(c);
  const gabFats = new Set(c.itens.flatMap((it) => it.faturas));
  const gabAlunos = c.itens.map((it) => it.aluno_id).filter(Boolean);
  const gabValor = c.itens.reduce((t, it) => t + Number(it.valor || 0), 0);
  if (c.recusado_real && !c.itens.length) res.notas.push('no real, o banco recusou o lancamento');
  if (ws.length) {
    const w = ws[ws.length - 1];
    res.lancaria = w.tipo;
    const p = w.payload;
    const repFats = new Set([p.fatura_id, ...(p.fatura_ids || []), ...((p.itens || []).map((i) => i.fatura_id))].filter(Boolean));
    const repAlunos = [p.aluno_id, ...((p.itens || []).map((i) => i.aluno_id))].filter(Boolean);
    const repValor = w.tipo === 'lancar_lote' ? (p.itens || []).reduce((t, i) => t + Number(i.valor || 0), 0) : Number(p.valor);
    res.fatura_real = [...gabFats].map((f) => rotuloFatura(f));
    res.fatura_sol = [...repFats].map((f) => rotuloFatura(f));
    res.valor_real = gabValor; res.valor_sol = repValor;
    const mesmasFats = gabFats.size === repFats.size && [...gabFats].every((f) => repFats.has(f));
    const alunoOk = !gabAlunos.length || !repAlunos.length || gabAlunos.every((a) => repAlunos.some((b) => mesmaPessoa(a, b)));
    if (repFats.size && gabFats.size && !mesmasFats) res.classe = 'fatura_errada';
    else if (!alunoOk) res.classe = 'aluno_errado';
    else if (gabFats.size && !repFats.size) res.classe = 'lancaria_sem_vinculo';
    else if (!gabFats.size && repFats.size) res.classe = 'vinculo_a_mais';
    else if (Math.abs(repValor - gabValor) > 0.009) res.classe = 'valor_diferente';
    else res.classe = 'certo';
    if (ws.length > 1) res.notas.push(`lancaria ${ws.length} vezes a mesma origem`);
  } else {
    const snap = [...regs].reverse().flatMap((r) => r.pendentesDepois || [])
      .find((p) => String(p.origem || '').split('+').some((o) => String(c.origem).split('+').includes(o)));
    const todosEnvios = enviadas.filter((e) => e.chatId === c.chat && e.tReal >= reg.tRealDespacho && e.tVirt <= reg.tVirtDespacho + 20 * 60e3);
    if (snap) {
      const repFats = new Set([snap.fatura_id, ...(snap.fatura_ids || [])].filter(Boolean));
      res.card_propunha_fatura = [...repFats].map((f) => rotuloFatura(f));
      res.fatura_real = [...gabFats].map((f) => rotuloFatura(f));
      const mesmas = gabFats.size === repFats.size && [...gabFats].every((f) => repFats.has(f));
      if (repFats.size && gabFats.size && !mesmas) res.classe = 'fatura_errada(card_nao_aprovado)';
      else res.classe = 'card_nao_aprovado';
      if (snap.bloqueia) res.notas.push('card com bloqueiaLancamento');
    } else if (!envCaso.length && !todosEnvios.length) res.classe = 'calada';
    else if (envCaso.some((t) => t.tipo === 'recusa_ou_alerta') || todosEnvios.some((t) => t.tipo === 'recusa_ou_alerta' || t.tipo === 'nao_entendi')) res.classe = 'recusou';
    else if ((reg.rota || '').startsWith('agente')) res.classe = 'foi_ao_agente';
    else res.classe = 'sem_card';
    res.envios_20min = todosEnvios.map((e) => e.tipo);
  }
  if (envCaso.filter((e) => ['card', 'nao_entendi', 'recusa_ou_alerta', 'lancado'].includes(e.tipo)).length >= 2) {
    const tipos = envCaso.map((e) => e.tipo);
    if (tipos.filter((t) => t === 'card').length >= 2 || (tipos.includes('card') && (tipos.includes('nao_entendi') || tipos.includes('recusa_ou_alerta')))) res.duas_respostas = tipos;
  }
  resultados.push(res);
}

// mensagens (todas): respostas múltiplas no mesmo gatilho e erros
const porMensagem = registros.map((r) => ({ msg: curto(r.msgId), unidade: r.unidade, rota: r.rota, acao: r.acao || null, pos: r.pos || null,
  midia: r.midia, midia_fonte: r.midia ? (r.envios && null) : null, envios: r.envios.map((e) => e.tipo), erro: r.erro ? r.erro.split('\n')[0] : null,
  citacao: r.citacao ? r.citacao.via : null, ms_handle: r.msHandle || null, cheques: !!r.cheques }));
const multiplas = registros.filter((r) => r.envios.filter((e) => ['card', 'nao_entendi', 'recusa_ou_alerta', 'lancado'].includes(e.tipo)).length >= 2)
  .map((r) => ({ msg: curto(r.msgId), unidade: r.unidade, envios: r.envios.map((e) => e.tipo) }));

const placar = {};
for (const r of resultados) {
  placar[r.classe] = placar[r.classe] || { total: 0 };
  placar[r.classe].total++;
  placar[r.classe][r.unidade] = (placar[r.classe][r.unidade] || 0) + 1;
}
const rotas = {};
for (const r of registros) { const k = (r.rota || '?').replace(/\(.*\)/, '') + (r.pos ? ' → ' + r.pos.replace(/\(.*\)/, '') : ''); rotas[k] = (rotas[k] || 0) + 1; }
const temposCard = resultados.map((r) => r.ms_ate_card).filter((x) => x != null).sort((a, b) => a - b);
const pct = (p) => temposCard.length ? temposCard[Math.min(temposCard.length - 1, Math.floor(p * temposCard.length))] : null;

const carimbo = new RealDate().toISOString().replace(/[:.]/g, '-');
const meta = { gerado_em: new RealDate().toISOString(), janela: [brtDia(inicioJanelaMs), brtDia(inicioHojeMs - 1)], mensagens: msgs.length,
  casos: casos.size, modelo_llm_desviado: MODELO_LLM, llm_desviadas: llmDesviadas, cap_ms: CAP_MS, duracao_s: Math.round((realNow() - t0Bateria) / 1000),
  escritas_fake: escritas.reduce((o, w) => { o[w.tipo] = (o[w.tipo] || 0) + 1; return o; }, {}),
  bloqueios, chamadas_rede: chamadasRede,
  midia: [...midiaInfo.values()].reduce((o, x) => { o[x.fonte] = (o[x.fonte] || 0) + 1; return o; }, {}),
  tempo_ate_card_ms: { n: temposCard.length, p50: pct(0.5), p90: pct(0.9), max: temposCard[temposCard.length - 1] || null },
  citacoes: registros.reduce((o, r) => { const k = r.citacao && r.citacao.via; if (k) o[k] = (o[k] || 0) + 1; return o; }, {}),
  erros: registros.filter((r) => r.erro).length };
fs.writeFileSync(path.join(OUT, `bruto-${carimbo}.json`), JSON.stringify({ meta, resultados, registros, enviadas, escritas, casos: [...casos.values()], logsSemContexto }, null, 1));
fs.writeFileSync(path.join(OUT, `resumo-anon-${carimbo}.json`), JSON.stringify({ meta, placar, rotas, resultados, multiplas, porMensagem }, null, 1));
console.log(JSON.stringify({ meta: { ...meta, bloqueios: bloqueios.length }, placar, rotas }, null, 1));
console.log('saida:', OUT, carimbo);
process.exit(0);
