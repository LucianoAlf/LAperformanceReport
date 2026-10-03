#!/usr/bin/env node
'use strict';

// A fumaça da ponte (vps/la-hq/sol/scripts/fumaca-ponte.sh) contra uma ponte FALSA:
// o script precisa passar na ponte saudável e reprovar — com rollback quando
// pedido — nos modos de falha reais: código divergente, motivo errado e a ponte
// caindo na chamada (o incidente de 28/09).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../vps/la-hq/sol/scripts/fumaca-ponte.sh');
const JID = '120363000000000001@g.us';
const UNI = '11111111-1111-1111-1111-111111111111';

function temBash() {
  try { cp.execFileSync('bash', ['-c', 'command -v curl && command -v sha256sum'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

// modo: 'ok' | 'motivo_errado' | 'cai'
function ponteFalsa({ modo, hash }) {
  let inicio = Date.now(); let viva = true;
  const srv = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (d) => { corpo += d; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/health') {
        return res.end(JSON.stringify({ status: viva ? 'connected' : 'disconnected',
          uptime: (Date.now() - inicio) / 1000, scriptHash: hash }));
      }
      if (req.url === '/caixa/tool') {
        if (modo === 'cai') { viva = false; req.socket.destroy(); return; }
        const b = JSON.parse(corpo || '{}');
        const ctx = b.ctx || {};
        let motivo = !ctx.ok ? 'contexto_invalido'
          : (ctx.unidade_id !== UNI ? 'unidade_divergente' : 'valor_total_nao_aparece_no_texto_original');
        if (modo === 'motivo_errado') motivo = 'outra_coisa';
        return res.end(JSON.stringify({ ok: false, estado: 'nada_aconteceu', motivo }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  srv.reviver = () => { viva = true; inicio = Date.now(); };
  return srv;
}

async function rodar({ modo, hashCerto = true, args = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fumaca-'));
  const bridge = path.join(dir, 'bridge.js');
  fs.writeFileSync(bridge, '// ponte nova\n');
  fs.writeFileSync(bridge + '.bak-TESTE', '// ponte antiga\n');
  const env = path.join(dir, '.env');
  fs.writeFileSync(env, `OUTRA=1\nSOL_CAIXA_FINANCE_GROUPS="${JID}|${UNI}|Barra;x@g.us|y|CG"\n`);
  const hash = hashCerto ? crypto.createHash('sha256').update(fs.readFileSync(bridge)).digest('hex').slice(0, 16) : 'deadbeefdeadbeef';
  const srv = ponteFalsa({ modo, hash });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const marca = path.join(dir, 'reiniciou');
  const bashPath = (p) => p.replace(/\\/g, '/');
  // "reiniciar" = marcar + reviver a ponte falsa (ela passa a responder conectada de novo)
  const reviver = http.createServer((q, s) => { srv.reviver(); s.end('ok'); });
  await new Promise((r) => reviver.listen(0, '127.0.0.1', r));
  const res = await new Promise((resolve) => {
    const p = cp.spawn('bash', [bashPath(SCRIPT), ...args], {
      env: { ...process.env,
        FUMACA_BRIDGE_URL: `http://127.0.0.1:${srv.address().port}`,
        FUMACA_ENV_FILE: bashPath(env), FUMACA_BRIDGE_JS: bashPath(bridge),
        FUMACA_GATEWAY_LOG: bashPath(path.join(dir, 'gateway.log')),
        FUMACA_ESPERA_S: '4', FUMACA_PAUSA_S: '1', FUMACA_DIRS_ROLLBACK: bashPath(dir),
        FUMACA_REINICIAR_CMD: `touch '${bashPath(marca)}'; curl -s http://127.0.0.1:${reviver.address().port}/ >/dev/null`,
        FUMACA_NODE: process.execPath.replace(/\\/g, '/') },
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  srv.close(); reviver.close();
  return { ...res, bridge: fs.readFileSync(bridge, 'utf8'), reiniciou: fs.existsSync(marca) };
}

const pular = !temBash();

test('ponte saudável: fumaça passa', { skip: pular }, async () => {
  const r = await rodar({ modo: 'ok' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /FUMAÇA OK/);
  assert.match(r.out, /valor_total_nao_aparece_no_texto_original/);
});

test('código no disco diferente do que roda: reprova', { skip: pular }, async () => {
  const r = await rodar({ modo: 'ok', hashCerto: false });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /código no disco ≠ código rodando/);
});

test('motivo errado na rota: reprova sem rollback quando não pedido', { skip: pular }, async () => {
  const r = await rodar({ modo: 'motivo_errado' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /sem --rollback-de, nada foi revertido/);
  assert.equal(r.bridge, '// ponte nova\n');
});

test('a ponte cai na chamada (incidente de 28/09): rollback restaura o backup e reinicia', { skip: pular }, async () => {
  const r = await rodar({ modo: 'cai', args: ['--rollback-de', 'TESTE'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /rollback: bridge\.js/);
  assert.equal(r.bridge, '// ponte antiga\n', 'arquivo restaurado');
  assert.ok(r.reiniciou, 'reiniciou o gateway');
  assert.match(r.out, /rollback aplicado e ponte conectada/);
});
