#!/usr/bin/env node
// Expõe o chat assinado e, no canário, deixa TEXTO financeiro chegar ao LLM.
// Mídia continua no OCR/bridge atual nesta etapa: não misturamos a inversão de
// decisão com uma troca de extrator de comprovante.
const fs = require('fs');

const alvo = process.argv[2] || '/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js';
let src = fs.readFileSync(alvo, 'utf8');
const de = "if (_cr) event.body = `[cracha: ${_cr}]\\n${event.body || ''}`;";
const para = "if (_cr) event.body = `[chat_caixa: ${chatId}]\\n[cracha: ${_cr}]\\n${event.body || ''}`;";
if (!src.includes('[chat_caixa: ${chatId}]')) {
  const n = src.split(de).length - 1;
  if (n !== 1) {
    console.error(`ancora do cracha: esperava 1 ocorrencia, achei ${n}`);
    process.exit(1);
  }
  src = src.replace(de, para);
}

const ancoraGrupos = [
  'const FINANCE_GROUPS = new Set(',
  "  String(process.env.SOL_CAIXA_FINANCE_GROUPS || '')",
  "    .split(';').map(function (x) { return (x.split('|')[0] || '').trim(); }).filter(Boolean)",
  ');',
].join('\n');
const comTools = ancoraGrupos + '\n' + [
  'const SOL_CAIXA_TOOLS_GROUPS = new Set(',
  "  String(process.env.SOL_CAIXA_TOOLS_CANARIO || '')",
  "    .split(',').map(function (x) { return x.trim(); }).filter(Boolean)",
  ');',
].join('\n');
if (!src.includes('const SOL_CAIXA_TOOLS_GROUPS = new Set(')) {
  const n = src.split(ancoraGrupos).length - 1;
  if (n !== 1) {
    console.error(`ancora dos grupos: esperava 1 ocorrencia, achei ${n}`);
    process.exit(1);
  }
  src = src.replace(ancoraGrupos, comTools);
}

const condAntiga = 'if (SOL_CAIXA_LIVE && FINANCE_GROUPS.has(chatId)) {';
const condNova = 'if (SOL_CAIXA_LIVE && FINANCE_GROUPS.has(chatId)\n'
  + '            && !(SOL_CAIXA_TOOLS_GROUPS.has(chatId) && !event.hasMedia)) {';
if (!src.includes('SOL_CAIXA_TOOLS_GROUPS.has(chatId) && !event.hasMedia')) {
  const n = src.split(condAntiga).length - 1;
  if (n !== 1) {
    console.error(`ancora do roteamento: esperava 1 ocorrencia, achei ${n}`);
    process.exit(1);
  }
  src = src.replace(condAntiga, condNova);
}

fs.writeFileSync(alvo, src, 'utf8');
console.log('contexto chat-bound + texto agent-tools do Caixa injetados');
