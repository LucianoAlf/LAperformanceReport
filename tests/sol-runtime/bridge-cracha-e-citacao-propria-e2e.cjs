#!/usr/bin/env node
'use strict';

// Regressões do bridge observadas na Barra em 14/09/2026:
// 1. bridge ESM chamava require() dentro de catch silencioso e nunca emitia crachá;
// 2. resposta a um card enviado pela própria Sol chegava só com stanzaId, sem texto.
const assert = require('assert');
const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const bridgePath = path.join(root, 'vps/la-hq/sol/runtime/bridge.js');
const src = fs.readFileSync(bridgePath, 'utf8');

assert(src.includes("import { randomBytes, createHash, createHmac } from 'crypto';"));
assert(!src.includes("require('fs').readFileSync"));
assert(!src.includes("require('crypto').createHmac"));

const badgeStart = src.indexOf('let _crachaSegredo;');
const badgeEnd = src.indexOf('const MAX_QUEUE_SIZE', badgeStart);
assert(badgeStart >= 0 && badgeEnd > badgeStart, 'bloco do crachá não localizado');
const badgeCode = src.slice(badgeStart, badgeEnd);
const fixedNow = 1_789_140_000_000;
const FakeDate = class extends Date { static now() { return fixedNow; } };
const badgeFactory = new Function('readFileSync', 'createHmac', 'Date', `${badgeCode}\nreturn crachaDoSolicitante;`);
const issue = badgeFactory(() => 'SOL_CRACHA_HMAC=segredo-de-teste\n', crypto.createHmac, FakeDate);
const tel = '5521888888888';
const chat = 'barra@g.us';
const janela = Math.floor(fixedNow / 1000 / 1800);
const expected = crypto.createHmac('sha256', 'segredo-de-teste')
  .update(`${tel}|${chat}|${janela}`).digest('hex').slice(0, 32);
assert.strictEqual(issue(tel, chat), `SOL1.${tel}.${expected}`);

const epAt = src.indexOf('if (_ep) event.body = `[episode_caixa:');
const badgeAt = src.indexOf('const _cr = crachaDoSolicitante', epAt);
assert(epAt >= 0 && badgeAt > epAt, 'episódio deve ser injetado antes e independentemente do crachá');
assert(src.includes("_fh.decidirRoteadorV4(event, _r.acao, { modo: 'preflight_operacional' })"));
assert(src.includes("_intencaoOperacional === 'abrir_caixa' || _intencaoOperacional === 'fechar_caixa'"));
assert(src.includes('_abf.tratarPedidoDiretoAbertura'));
assert(src.includes('_abf.tratarPedidoDiretoFechamento'));
assert(src.includes('intencaoEstruturada: _intencaoOperacional'));
assert(src.includes("Number(_decOperacional.confianca || 0) >= 0.9"));
assert(src.includes("process.env.SOL_CAIXA_V4_OPERATIONAL_PREFLIGHT === '1'"));
assert(src.includes('caixaBadgeReady: !!crachaSegredo()'));
assert(src.includes("event: 'caixa_badge_unavailable'"));

const cacheStart = src.indexOf('function pruneRecentlySentMessages');
const cacheEnd = src.indexOf('function normalizeWhatsAppId', cacheStart);
assert(cacheStart >= 0 && cacheEnd > cacheStart, 'cache de mensagens próprias não localizado');
const cacheCode = src.slice(cacheStart, cacheEnd);
const cacheFactory = new Function(`
  const recentlySentMessages = new Map();
  const MAX_RECENT_SENT_MESSAGES = 500;
  const MAX_RECENT_SENT_MESSAGE_TEXT = 2000;
  const RECENT_SENT_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
  ${cacheCode}
  return { rememberSentMessage, findRecentlySentMessage };
`);
const cache = cacheFactory();
cache.rememberSentMessage({ key: { id: 'CARD-SOL-1' } }, chat, { text: 'Comprovante recebido — Barra' }, 1000);
assert.strictEqual(cache.findRecentlySentMessage('CARD-SOL-1', chat, 2000).text, 'Comprovante recebido — Barra');
assert.strictEqual(cache.findRecentlySentMessage('CARD-SOL-1', 'outro@g.us', 2000), null);
assert.strictEqual(cache.findRecentlySentMessage('CARD-SOL-1', chat, 1000 + 24 * 60 * 60 * 1000 + 1), null);

// O patch histórico também não pode recolocar require() num arquivo ESM.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-cracha-esm-'));
const tempBridge = path.join(tempDir, 'bridge.js');
fs.writeFileSync(tempBridge, [
  "import { readFileSync } from 'fs';",
  "import { createHash } from 'crypto';",
  "function crachaDoSolicitante() {",
  "  const t = require('fs').readFileSync('/tmp/segredo', 'utf8');",
  "  return require('crypto').createHmac('sha256', t);",
  "}",
].join('\n'));
cp.execFileSync(process.execPath, [
  path.join(root, 'vps/la-hq/sol/scripts/_patch-bridge-cracha-08set.js'), tempBridge,
]);
const patched = fs.readFileSync(tempBridge, 'utf8');
assert(patched.includes("import { readFileSync } from 'fs';"));
assert(patched.includes("import { createHash, createHmac } from 'crypto';"));
assert(!patched.includes("require('fs')"));
assert(!patched.includes("require('crypto')"));
cp.execFileSync(process.execPath, ['--check', tempBridge]);

console.log('bridge: crachá ESM + episódio independente + citação própria — OK');
