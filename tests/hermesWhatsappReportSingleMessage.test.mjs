import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerReportSingleMessageRoute,
} from '../scripts/hermes-whatsapp-bridge/report-single-message.js';


function createHarness({ connected = true, allowedGroups = [] } = {}) {
  let handler;
  const app = {
    post(path, value) {
      assert.equal(path, '/send-report');
      handler = value;
    },
  };
  const sendCalls = [];
  const tracked = [];
  const sock = {
    user: {
      id: '5521999999999:7@s.whatsapp.net',
      lid: '123456789:7@lid',
    },
  };

  registerReportSingleMessageRoute({
    app,
    getSocket: () => sock,
    getConnectionState: () => connected ? 'connected' : 'disconnected',
    formatOutgoingMessage: (message) => String(message),
    sendWithTimeout: async (chatId, payload) => {
      sendCalls.push({ chatId, payload });
      return { key: { id: 'MSG-1' } };
    },
    trackSentMessageId: (sent) => tracked.push(sent.key.id),
    isAllowedGroupChatId: (chatId) => allowedGroups.includes(chatId),
  });

  async function invoke(body) {
    const response = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(value) {
        this.body = value;
        return this;
      },
    };
    await handler({ body }, response);
    return response;
  }

  return { invoke, sendCalls, tracked };
}

test('texto acima de 4096 usa exatamente uma chamada', async () => {
  const group = '120363000000000000@g.us';
  const harness = createHarness({ allowedGroups: [group] });
  const message = 'x'.repeat(7000);

  const response = await harness.invoke({ chatId: group, message });

  assert.equal(response.statusCode, 200);
  assert.equal(harness.sendCalls.length, 1);
  assert.equal(harness.sendCalls[0].payload.text.length, 7000);
  assert.deepEqual(harness.tracked, ['MSG-1']);
  assert.deepEqual(response.body, {
    success: true,
    singleMessage: true,
    messageId: 'MSG-1',
    messageIds: ['MSG-1'],
  });
});

test('rejeita texto acima do limite sem enviar', async () => {
  const group = '120363000000000000@g.us';
  const harness = createHarness({ allowedGroups: [group] });
  const response = await harness.invoke({
    chatId: group,
    message: 'x'.repeat(16001),
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.body.error, 'report_too_long');
  assert.equal(harness.sendCalls.length, 0);
});

test('aceita apenas grupo permitido ou conversa da propria Sol', async () => {
  const harness = createHarness();
  const blockedGroup = await harness.invoke({
    chatId: '120363111111111111@g.us',
    message: 'Relatório',
  });
  const blockedDm = await harness.invoke({
    chatId: '5521888888888@s.whatsapp.net',
    message: 'Relatório',
  });
  const ownDm = await harness.invoke({
    chatId: '5521999999999@s.whatsapp.net',
    message: 'Relatório',
  });

  assert.equal(blockedGroup.statusCode, 403);
  assert.equal(blockedDm.statusCode, 403);
  assert.equal(ownDm.statusCode, 200);
  assert.equal(harness.sendCalls.length, 1);
});

test('rejeita quando bridge esta desconectado', async () => {
  const harness = createHarness({ connected: false });
  const response = await harness.invoke({
    chatId: '5521999999999@s.whatsapp.net',
    message: 'Relatório',
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, 'not_connected_to_whatsapp');
  assert.equal(harness.sendCalls.length, 0);
});
