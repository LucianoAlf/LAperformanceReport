#!/usr/bin/env node
// Expõe o chat assinado e, no canário, deixa TEXTO financeiro chegar ao LLM.
// Abertura/fechamento continuam determinísticos e rodam ANTES desse handoff:
// o preview automático nasce fora da conversa e precisa aceitar "pode/não"
// mesmo quando nenhuma janela do grupo foi aberta. Mídia continua no trilho
// atual nesta etapa.
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

const condBase = 'if (SOL_CAIXA_LIVE && FINANCE_GROUPS.has(chatId)) {';
const condBugCanario = 'if (SOL_CAIXA_LIVE && FINANCE_GROUPS.has(chatId)\n'
  + '            && !(SOL_CAIXA_TOOLS_GROUPS.has(chatId) && !event.hasMedia)) {';

// Migra também o runtime já canariado pelo patch anterior. A condição antiga
// pulava o bloco inteiro e, junto com o parser legado, pulava o tratador
// determinístico de abertura/fechamento.
if (src.includes(condBugCanario)) src = src.replace(condBugCanario, condBase);

const marcadorHandoff = "step: 'agent_first_text_handoff_pos_abf'";
if (!src.includes(marcadorHandoff)) {
  const inicioLegado = [
    '            const _fh = await financeHandler();',
    '            let _tratouCaixa = true;',
  ].join('\n');
  const inicioComHandoff = [
    '            // Abertura/fechamento fica determinístico acima. Só depois',
    '            // o texto restante do canário pula o parser financeiro legado.',
    '            const _textoVaiParaAgentTools = SOL_CAIXA_TOOLS_GROUPS.has(chatId) && !event.hasMedia;',
    '            if (_textoVaiParaAgentTools) {',
    "              _caixaLog({ step: 'agent_first_text_handoff_pos_abf', chatId: chatId });",
    '            } else {',
    inicioLegado,
  ].join('\n');
  const fimLegado = [
    '            if (_tratouCaixa) { typingStop(chatId); continue; }   // dinheiro e deterministico: nunca vai pro LLM',
    '          } catch (e) {',
  ].join('\n');
  const fimComHandoff = [
    '            if (_tratouCaixa) { typingStop(chatId); continue; }   // dinheiro e deterministico: nunca vai pro LLM',
    '            }',
    '          } catch (e) {',
  ].join('\n');

  for (const [ancora, rotulo] of [[condBase, 'bloco financeiro'], [inicioLegado, 'inicio legado'], [fimLegado, 'fim legado']]) {
    const n = src.split(ancora).length - 1;
    if (n !== 1) {
      console.error(`ancora ${rotulo}: esperava 1 ocorrencia, achei ${n}`);
      process.exit(1);
    }
  }
  src = src.replace(inicioLegado, inicioComHandoff).replace(fimLegado, fimComHandoff);
}

fs.writeFileSync(alvo, src, 'utf8');
console.log('contexto chat-bound + ABF deterministico + texto agent-tools do Caixa injetados');
