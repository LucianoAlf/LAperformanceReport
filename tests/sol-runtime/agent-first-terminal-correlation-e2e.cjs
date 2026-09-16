#!/usr/bin/env node
'use strict';

// Prova o contrato puro da correlação usada pela bridge sem abrir socket,
// carregar Baileys ou tocar rede/ledger reais.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const bridgePath = path.join(root, 'vps/la-hq/sol/runtime/bridge.js');
const src = fs.readFileSync(bridgePath, 'utf8');
const start = src.indexOf('function createAgentFirstCorrelation');
const end = src.indexOf('// LAHQ/Sol safety patch:', start);
assert(start >= 0 && end > start, 'helper de correlação agent-first não localizado');
const factory = new Function(`${src.slice(start, end)}\nreturn createAgentFirstCorrelation;`)();

(async () => {
  let now = 1000;
  const recorded = [];
  const correlation = factory({
    nowFn: () => now,
    ttlMs: 100,
    maxEntries: 3,
    recordFn: async (episode, eventType, details) => {
      recorded.push({ episode, eventType, details });
      return { ok: true };
    },
  });
  const ep = { episode_id: `ep1.teste.${'a'.repeat(64)}`, unit_code: 'recreio', source: 'whatsapp_group', message_kind: 'text' };
  assert.strictEqual(correlation.register({ messageId: 'MSG-1', chatId: 'recreio@g.us', episode: ep }), true);

  const wrongChat = await correlation.closeByReply({ messageId: 'MSG-1', chatId: 'barra@g.us', details: {} });
  assert.strictEqual(wrongChat.reason, 'correlation_not_found');
  assert.strictEqual(recorded.length, 0);

  const sent = await correlation.closeByReply({
    messageId: 'MSG-1', chatId: 'recreio@g.us',
    details: { terminal_state: 'agent_reply_sent', action: 'agent_reply', outcome: 'ok' },
  });
  assert.strictEqual(sent.ok, true);
  assert.strictEqual(recorded.length, 1);
  assert.strictEqual(recorded[0].eventType, 'episode_closed');
  assert.strictEqual(recorded[0].details.terminal_state, 'agent_reply_sent');

  const duplicate = await correlation.closeByEpisode({
    episodeId: ep.episode_id, chatId: 'recreio@g.us',
    details: { terminal_state: 'readback_confirmed', action: 'caixa_do_dia', outcome: 'ok' },
  });
  assert.strictEqual(duplicate.duplicate, true);
  assert.strictEqual(recorded.length, 1, 'duplicidade não pode emitir segundo terminal');

  const failedEp = { ...ep, episode_id: `ep1.teste.${'b'.repeat(64)}` };
  correlation.register({ messageId: 'MSG-2', chatId: 'recreio@g.us', episode: failedEp });
  const failed = await correlation.closeByReply({
    messageId: 'MSG-2', chatId: 'recreio@g.us',
    details: { terminal_state: 'agent_reply_failed', action: 'agent_reply', outcome: 'error' },
  });
  assert.strictEqual(failed.ok, true);
  assert.strictEqual(recorded.at(-1).details.terminal_state, 'agent_reply_failed');

  const expiredEp = { ...ep, episode_id: `ep1.teste.${'c'.repeat(64)}` };
  correlation.register({ messageId: 'MSG-3', chatId: 'recreio@g.us', episode: expiredEp });
  now += 101;
  const expired = await correlation.closeByReply({ messageId: 'MSG-3', chatId: 'recreio@g.us', details: {} });
  assert.strictEqual(expired.reason, 'correlation_not_found');

  assert(src.includes("app.post('/governance/agent-first/close'"));
  assert(src.includes("terminal_state: 'agent_reply_sent'"));
  assert(src.includes("terminal_state: 'agent_reply_failed'"));
  assert(src.includes('_agentFirstCorrelation.register({'));
  console.log('agent-first terminal: resposta, falha, TTL e duplicidade — OK');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
