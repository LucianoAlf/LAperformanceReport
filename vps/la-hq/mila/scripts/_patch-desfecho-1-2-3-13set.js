#!/usr/bin/env node
'use strict';
// Patch (13/09/2026): a consultora responde "1", "2" ou "3" a uma cutucada/briefing e o
// bridge fecha o laço SEM modelo — chama public.mila_responder_cutucada_v1 pela conexão
// da governança (mila_acesso_restrito tem EXECUTE nela; a função é SECURITY DEFINER) e
// devolve o ack que o banco escreveu. Vem ANTES do gatilho do modo consultor, senão um
// "1" solto seria descartado como "sem gatilho".
//
// Idempotente: reconhece o marcador e não aplica duas vezes. Faz backup dos dois arquivos.
// Uso (na la-hq, como root): node _patch-desfecho-1-2-3-13set.js && systemctl restart chatwoot-mila-bridge.service
const fs = require('fs');

const BRIDGE = '/home/mila/.openclaw/workspace/scripts/chatwoot-mila-bridge.js';
const GOV = '/home/mila/.openclaw/workspace/scripts/governanca-client.js';
const MARCA = 'desfecho_cutucada';
const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

function patchGovernanca() {
  let s = fs.readFileSync(GOV, 'utf8');
  if (s.includes('responderCutucada')) { console.log('governanca-client: já tem responderCutucada'); return; }
  const anchor = 'async function unidadeNome(unidadeId) {';
  if (s.split(anchor).length !== 2) throw new Error('governanca-client: âncora unidadeNome não é única');
  const fn = `// Laço 1/2/3 (13/09/2026): fecha o último lote de cutucadas da consultora sem modelo.
// A função é SECURITY DEFINER e o papel de leitura tem EXECUTE nela — é a "porta"
// estreita, não SQL livre. Nunca cacheado: cada resposta é um ato.
async function responderCutucada(telefone, opcao) {
  const { rows } = await getPool().query(
    'select public.mila_responder_cutucada_v1($1, $2) as r',
    [telefone, opcao]
  );
  return rows[0]?.r || null;
}

`;
  s = s.replace(anchor, fn + anchor);
  const exp = /module\.exports\s*=\s*\{([^}]*)\}/;
  const m = s.match(exp);
  if (!m) throw new Error('governanca-client: module.exports não encontrado');
  if (!m[1].includes('responderCutucada')) {
    s = s.replace(exp, (full, inner) => `module.exports = {${inner.trimEnd()}, responderCutucada }`);
  }
  fs.copyFileSync(GOV, `${GOV}.bak-${carimbo}-antes-desfecho-123`);
  fs.writeFileSync(GOV, s);
  console.log('governanca-client: responderCutucada adicionado');
}

function patchBridge() {
  let s = fs.readFileSync(BRIDGE, 'utf8');
  if (s.includes(MARCA)) { console.log('bridge: patch já aplicado'); return; }
  const req = "const { consultorPermitido, quemEh, unidadeNome } = require('./governanca-client');";
  if (s.split(req).length !== 2) throw new Error('bridge: require da governança não é único');
  s = s.replace(req, "const { consultorPermitido, quemEh, unidadeNome, responderCutucada } = require('./governanca-client');");

  const anchor = '  // Inboxes de consultor: so responde se for consultor autorizado.';
  if (s.split(anchor).length !== 2) throw new Error('bridge: âncora do modo consultor não é única');
  const bloco = `  // ── Resposta curta 1/2/3 a uma cutucada (13/09/2026) ─────────────────────
  // Fecha o laço SEM modelo: a consultora responde "1", "2" ou "3" e o banco decide
  // o que fazer com o último lote entregue (mila_responder_cutucada_v1). Vem ANTES
  // do gatilho, senão um "1" solto seria descartado como "sem gatilho". Sem lote
  // pendente (nada_pendente) o dígito segue o caminho normal — pode ser resposta a
  // outra pergunta.
  if (consultantMode && /^\\s*[123]\\s*$/.test(String(content || ''))) {
    const opcao = Number(String(content).trim());
    try {
      const r = await responderCutucada(senderPhone, opcao);
      if (r && r.ok && !r.nada_pendente && r.ack_texto) {
        markProcessed(messageId, { conversation_id: conversationId, action: '${MARCA}' });
        const sent = await sendChatwootMessage(conversationId, r.ack_texto);
        log('${MARCA}', { conversation_id: conversationId, message_id: messageId, inbox_id: inboxId,
          telefone: senderPhone, nome: consultorNome, opcao, itens: (r.itens || []).length });
        return { action: 'sent', sent_id: sent?.id, reason: '${MARCA}' };
      }
    } catch (err) {
      // falha aqui NAO cala a Mila: cai no caminho normal (modelo)
      log('${MARCA}_erro', { conversation_id: conversationId, error: String(err?.message || err).slice(0, 300) });
    }
  }
`;
  s = s.replace(anchor, bloco + anchor);
  fs.copyFileSync(BRIDGE, `${BRIDGE}.bak-${carimbo}-antes-desfecho-123`);
  fs.writeFileSync(BRIDGE, s);
  console.log('bridge: intercepto 1/2/3 inserido');
}

patchGovernanca();
patchBridge();
