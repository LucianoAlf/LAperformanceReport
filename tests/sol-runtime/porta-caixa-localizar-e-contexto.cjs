#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const root = path.resolve(__dirname, '../..');
const portas = fs.readFileSync(path.join(root, 'vps/la-hq/sol/scripts/sol-portas-mcp.mjs'), 'utf8');
assert(portas.includes("name: 'caixa_localizar_lancamento'"));
for (const nome of [
  'caixa_preparar_lancamento', 'caixa_preparar_saida',
  'caixa_preparar_correcao', 'caixa_preparar_estorno',
  'caixa_preparar_abertura', 'caixa_preparar_fechamento',
  'caixa_aprovar_preview', 'caixa_descartar_preview',
]) assert(portas.includes(`name: '${nome}'`), `faltou ${nome}`);
assert(portas.includes("name: 'caixa_do_dia', fn: 'sol_porta_caixa_do_dia_assinado_v1', auth: 'caixa_assinado'"));
assert(portas.includes("auth: 'caixa_assinado'"));
assert(portas.includes('nunca use SQL genérico'));
assert(portas.includes("chat.endsWith('@g.us')"));
assert(portas.includes('caixaToolDecision'));
assert(portas.includes('caixaToolCommand: cmd, caixaToolTarget: alvo'));

const runtime = fs.readFileSync(path.join(root, 'vps/la-hq/sol/runtime/caixa-financeiro.cjs'), 'utf8');
assert(runtime.includes('event.caixaToolDecision ? event.caixaToolDecision'));
assert(runtime.includes('event.caixaToolCommand'));
assert(runtime.includes('event.caixaToolTarget'));

const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260911020000_sol_porta_localizar_lancamento_caixa.sql'), 'utf8');
assert(migration.includes("sol_cracha_verificar_v1(p_cracha, p_chat_id)"));
assert(migration.includes("cracha_assinado_obrigatorio"));
assert(migration.includes("i.item - 'criado_por'"));
assert(migration.includes("recibo_persistido"));
assert(migration.includes("Não lance novamente"));
assert(!/grant execute[\s\S]{0,200}to\s+(?:anon|authenticated)/i.test(migration));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-bridge-context-'));
const bridge = path.join(tmp, 'bridge.js');
fs.writeFileSync(bridge, [
  'const SOL_CAIXA_LIVE = true;',
  'const FINANCE_GROUPS = new Set(',
  "  String(process.env.SOL_CAIXA_FINANCE_GROUPS || '')",
  "    .split(';').map(function (x) { return (x.split('|')[0] || '').trim(); }).filter(Boolean)",
  ');',
  'if (SOL_CAIXA_LIVE && FINANCE_GROUPS.has(chatId)) {',
  '  legacyFinanceHandler();',
  '}',
  'if (event.senderPhone) {',
  '  try {',
  "    const _cr = crachaDoSolicitante(event.senderPhone, chatId);",
  "    if (_cr) event.body = `[cracha: ${_cr}]\\n${event.body || ''}`;",
  '  } catch (_) {}',
  '}',
].join('\n'));
cp.execFileSync(process.execPath, [path.join(root, 'vps/la-hq/sol/scripts/_patch-bridge-contexto-caixa-11set.cjs'), bridge]);
const patched = fs.readFileSync(bridge, 'utf8');
assert(patched.includes('[chat_caixa: ${chatId}]'));
assert.strictEqual((patched.match(/\[chat_caixa:/g) || []).length, 1);
assert(patched.includes('const SOL_CAIXA_TOOLS_GROUPS = new Set('));
assert(patched.includes('SOL_CAIXA_TOOLS_GROUPS.has(chatId) && !event.hasMedia'));
cp.execFileSync(process.execPath, [path.join(root, 'vps/la-hq/sol/scripts/_patch-bridge-contexto-caixa-11set.cjs'), bridge]);
assert.strictEqual(fs.readFileSync(bridge, 'utf8'), patched);

console.log('porta Caixa localizar + contexto assinado: OK');
