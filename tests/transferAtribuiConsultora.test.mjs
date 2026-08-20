import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { atribuirConversa } from '../supabase/functions/_shared/chatwoot-api.ts';

const CFG = { apiUrl: 'https://crm.example.com', apiToken: 'tok-admin', accountId: '5' };

function stubFetch() {
  const chamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url, init });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { chamadas, restaurar: () => { globalThis.fetch = original; } };
}

test('atribuirConversa fala com o endpoint de assignments', async (t) => {
  await t.test('POST /conversations/:id/assignments com assignee_id', async () => {
    const { chamadas, restaurar } = stubFetch();
    try {
      await atribuirConversa(CFG, 19945, 33);
    } finally { restaurar(); }

    assert.equal(chamadas.length, 1);
    const { url, init } = chamadas[0];
    assert.equal(url, 'https://crm.example.com/api/v1/accounts/5/conversations/19945/assignments');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { assignee_id: 33 });
  });

  await t.test('autentica com o token da config — NÃO troca de credencial', async () => {
    // O token segue sendo o do admin: ele cria contato, conversa e labels (label
    // é operação de conta). Trocar pelo token da consultora derrubaria isso e
    // ainda assinaria a nota privada como se ela tivesse escrito.
    const { chamadas, restaurar } = stubFetch();
    try {
      await atribuirConversa(CFG, 1, 81);
    } finally { restaurar(); }
    assert.equal(chamadas[0].init.headers.api_access_token, 'tok-admin');
  });

  await t.test('id em texto (como vem do jsonb de config) é aceito', async () => {
    const { chamadas, restaurar } = stubFetch();
    try {
      await atribuirConversa(CFG, 1, '30');
    } finally { restaurar(); }
    assert.deepEqual(JSON.parse(chamadas[0].init.body), { assignee_id: 30 });
  });

  await t.test('id ausente ou inválido não vira request', async () => {
    // Unidade sem assignee_id configurado mantém o comportamento de hoje
    // (conversa sem responsável) em vez de mandar assignee_id: null.
    const { chamadas, restaurar } = stubFetch();
    try {
      await atribuirConversa(CFG, 1, undefined);
      await atribuirConversa(CFG, 1, null);
      await atribuirConversa(CFG, 1, '');
      await atribuirConversa(CFG, 1, 'vitoria');
    } finally { restaurar(); }
    assert.equal(chamadas.length, 0);
  });

  await t.test('falha do Chatwoot não estoura para quem chamou', async () => {
    // A transferência inteira não pode cair porque a atribuição falhou — o
    // essencial é o consultor ser avisado.
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('502 bad gateway'); };
    try {
      await assert.doesNotReject(() => atribuirConversa(CFG, 1, 33));
    } finally { globalThis.fetch = original; }
  });
});

// ─── Contrato com o executarTransfer ─────────────────────────────────────────

const webhook = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'agente-webhook', 'index.ts'), 'utf8');
const toolTypes = readFileSync(
  join(process.cwd(), 'supabase', 'functions', '_shared', 'tool-types.ts'), 'utf8');

test('a transferência atribui a conversa à consultora da unidade', async (t) => {
  await t.test('TransferUnit carrega o assignee_id', () => {
    const bloco = toolTypes.slice(toolTypes.indexOf('interface TransferUnit'));
    assert.match(bloco.slice(0, bloco.indexOf('}')), /assignee_id/);
  });

  await t.test('executarTransfer chama a atribuição', () => {
    assert.match(webhook, /atribuirConversa\(cwCfg, conversa\.id, matchedUnit\.assignee_id\)/);
  });

  await t.test('atribui DEPOIS de criar a conversa', () => {
    const iCriar = webhook.indexOf('const conversa = await criarConversa(');
    const iAtribuir = webhook.indexOf('atribuirConversa(cwCfg, conversa.id');
    assert.ok(iCriar > 0 && iAtribuir > iCriar, 'a atribuição precisa vir depois de criarConversa');
  });

  await t.test('a notificação do consultor continua depois da atribuição', () => {
    // Ordem importa: o aviso no WhatsApp é o que não pode faltar. Se um dia a
    // atribuição passar a lançar, ela não pode ficar entre a nota e o aviso.
    const iAtribuir = webhook.indexOf('atribuirConversa(cwCfg, conversa.id');
    const iNotificar = webhook.indexOf('matchedUnit.consultant_phone');
    assert.ok(iNotificar > iAtribuir);
  });
});
