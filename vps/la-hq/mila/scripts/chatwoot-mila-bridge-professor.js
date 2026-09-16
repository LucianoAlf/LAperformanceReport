'use strict';
/**
 * chatwoot-mila-bridge-professor.js — caminho de PROFESSOR do bridge (mila-sdr).
 *
 * Quando um PROFESSOR fala com a Mila (contato com custom_attribute
 * skip_professor_ia=true), a Mila NÃO responde ao professor. Em vez disso, decide
 * se o consultor da unidade precisa ser avisado (ex.: professor não poderá dar uma
 * aula experimental agendada) e, se sim, manda WhatsApp pro consultor + atribui a
 * conversa a ele no Chatwoot.
 *
 * MAIS INTELIGENTE QUE O n8n (que reportava até emoji e sempre atribuía):
 *   1. Pré-filtro barato SEM IA: descarta emoji/saudação/agradecimento/1 letra.
 *   2. Debounce (~35s): junta rajada de mensagens e avalia uma vez só.
 *   3. Classificador conservador (gpt-4o-mini): viés pro silêncio.
 *   4. Só escala (WhatsApp + atribuir) quando acionável. Não acionável = silêncio
 *      TOTAL (não avisa e não atribui). Cooldown por conversa evita bombardeio.
 *
 * NUNCA posta na conversa — zero risco de mandar mensagem pro professor/lead.
 * Segredos vêm do process.env (bridge carrega chatwoot.env + waha.env).
 */

const media = require('./mila-sdr-media.js');

const DRY_RUN = process.env.MILA_SDR_DRY_RUN === 'true';

// inbox_id -> consultor da unidade (mesmo mapeamento da transferência de lead).
// Barra confirmado (Kailane 21984690143, agente 30). Recreio/CG: VERIFICAR telefone.
const PROFESSOR_UNITS = {
  '147': { unit: 'Barra', agentId: 30, consultorNome: 'Kailane', consultorTelefone: '21984690143' },
  '148': { unit: 'Recreio', agentId: 81, consultorNome: 'Daiana', consultorTelefone: '21968060404' },
  '155': { unit: 'Campo Grande', agentId: 33, consultorNome: 'Vitória', consultorTelefone: '' },
};

const HERMES_BOT_BY_INBOX = { '147': 309, '155': 310, '148': 311 };
const DEBOUNCE_MS = 35000;   // espera pra juntar rajada de mensagens do professor
const COOLDOWN_MS = 20 * 60 * 1000; // não re-notifica a mesma conversa dentro disso

const _lastMsg = new Map();    // convId -> messageId (debounce)
const _lastNotify = new Map(); // convId -> ts (cooldown)

// ── Detecção: o contato é professor? (skip_professor_ia=true) ───────────────────
function isProfessor(payload) {
  const cands = [
    payload?.sender?.custom_attributes,
    payload?.conversation?.messages?.[0]?.sender?.custom_attributes,
    payload?.conversation?.meta?.sender?.custom_attributes,
    payload?.meta?.sender?.custom_attributes,
  ];
  for (const ca of cands) {
    if (ca && (ca.skip_professor_ia === true || ca.skip_professor_ia === 'true')) return true;
  }
  return false;
}

// ── Pré-filtro barato (sem IA): mensagem trivial não vale avisar ninguém ─────────
const SAUDACOES = new Set([
  'oi', 'ola', 'olá', 'opa', 'eae', 'eai', 'bom dia', 'boa tarde', 'boa noite',
  'ok', 'okay', 'blz', 'beleza', 'combinado', 'certo', 'perfeito', 'isso', 'sim',
  'obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'tmj', 'de nada', 'aham', 'ss',
  'kk', 'kkk', 'kkkk', 'rs', 'rsrs', 'haha', '👍', '🙏', '😊', '🎵', '❤️',
]);
function isTrivial(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  // só emoji/símbolos/pontuação (nenhuma letra ou número)
  if (!/[a-z0-9à-ú]/i.test(t)) return true;
  const norm = t.toLowerCase().replace(/[!.,;:?)(…\s]+$/g, '').trim();
  if (norm.length <= 2) return true;
  if (SAUDACOES.has(norm)) return true;
  // combinação curta de saudações ("oi bom dia", "ok obrigado")
  const words = norm.split(/\s+/);
  if (words.length <= 3 && words.every(w => SAUDACOES.has(w))) return true;
  return false;
}

// ── Busca mensagens recentes da conversa (contexto pro classificador) ───────────
async function fetchRecentMessages(base, token, account, convId, limit = 10) {
  try {
    const res = await fetch(
      `${String(base).replace(/\/$/, '')}/api/v1/accounts/${account}/conversations/${convId}/messages`,
      { headers: { 'api_access_token': token } }
    );
    if (!res.ok) return '';
    const j = await res.json();
    const arr = (j?.payload || j?.data?.payload || []).slice(-limit);
    return arr
      .filter(m => m && m.content && m.message_type !== 2)
      .map(m => `${m.message_type === 0 ? 'Professor' : 'LA'}: ${String(m.content).replace(/\s+/g, ' ').trim()}`)
      .join('\n');
  } catch (_) { return ''; }
}

// ── Envia WhatsApp pro consultor (WAHA) — nunca pro professor ────────────────────
async function wahaSendConsultor(session, telefoneConsultor, text) {
  if (DRY_RUN) { console.error(`[DRY_RUN] WAHA consultor ${telefoneConsultor}: ${String(text).slice(0, 140)}`); return true; }
  const base = String(process.env.WAHA_BASE_URL || '').replace(/\/$/, '');
  const key = process.env.WAHA_API_KEY;
  if (!base || !key || !session) throw new Error('waha_nao_configurado');
  let d = String(telefoneConsultor).replace(/\D/g, '');
  if (!d.startsWith('55')) d = '55' + d;
  const res = await fetch(`${base}/api/sendText`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({ session, chatId: `${d}@c.us`, text }),
  });
  if (!res.ok) throw new Error(`waha_http_${res.status}`);
  return true;
}

// ── Atribui a conversa ao consultor da unidade (interno, não gera mensagem) ──────
async function chatwootAssign(base, account, convId, agentId) {
  if (DRY_RUN) { console.error(`[DRY_RUN] atribuir conv=${convId} -> agente ${agentId}`); return true; }
  const token = process.env.CHATWOOT_API_TOKEN;
  if (!token) throw new Error('sem_chatwoot_api_token');
  const res = await fetch(
    `${String(base).replace(/\/$/, '')}/api/v1/accounts/${account}/conversations/${convId}/assignments`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api_access_token': token },
      body: JSON.stringify({ assignee_id: agentId }),
    }
  );
  if (!res.ok) throw new Error(`chatwoot_assign_http_${res.status}`);
  return true;
}

// ── Handler principal ───────────────────────────────────────────────────────────
async function handleProfessor(ctx) {
  const { payload, inboxId, conversationId, messageId, helpers } = ctx;
  const { log, extractContent, getWahaSession } = helpers;
  const base = helpers.chatwootBase, account = helpers.chatwootAccount, token = helpers.chatwootToken;

  const u = PROFESSOR_UNITS[inboxId];
  if (!u) return { action: 'not_sent', reason: `professor_inbox_sem_unidade_${inboxId}` };

  // TRAVA: só age pós-cutover (bot Hermes da unidade atribuído à inbox). Pré-cutover
  // o n8n cuida do professor — sem essa trava, ligar a flag avisaria consultor em dobro.
  try {
    const leadMod = require('./chatwoot-mila-bridge-lead.js');
    const assigned = await leadMod.assignedBotId(ctx, inboxId);
    if (assigned !== HERMES_BOT_BY_INBOX[inboxId]) {
      return { action: 'not_sent', reason: `professor_bot_nao_atribuido(assigned=${assigned})` };
    }
  } catch (e) {
    return { action: 'not_sent', reason: 'professor_guard_error' };
  }

  const content = extractContent(payload);

  // CAMADA 1: pré-filtro trivial (sem IA) — silêncio total.
  if (isTrivial(content)) {
    log('professor_trivial', { conversation_id: conversationId, unidade: u.unit, preview: String(content).slice(0, 80) });
    return { action: 'not_sent', reason: 'professor_trivial' };
  }

  // CAMADA 2: debounce — se chegar msg mais nova nessa conversa, este ciclo desiste.
  _lastMsg.set(conversationId, messageId);
  await new Promise(r => setTimeout(r, DEBOUNCE_MS));
  if (_lastMsg.get(conversationId) !== messageId) {
    return { action: 'not_sent', reason: 'professor_debounced' };
  }

  // CAMADA 3: classificador conservador (viés pro silêncio).
  const historico = await fetchRecentMessages(base, token, account, conversationId, 10);
  const { acionavel, resumo } = await media.classifyProfessorMessage(content, historico, u.consultorNome);
  if (!acionavel || !resumo) {
    log('professor_nao_acionavel', { conversation_id: conversationId, unidade: u.unit, preview: String(content).slice(0, 80) });
    return { action: 'not_sent', reason: 'professor_nao_acionavel' };
  }

  // Cooldown: não bombardeia o consultor com a mesma conversa.
  const now = Date.now();
  const last = _lastNotify.get(conversationId) || 0;
  if (now - last < COOLDOWN_MS) {
    log('professor_cooldown', { conversation_id: conversationId, unidade: u.unit });
    return { action: 'not_sent', reason: 'professor_cooldown' };
  }

  // ESCALAR: WhatsApp pro consultor + atribuir a conversa a ele.
  if (!u.consultorTelefone) {
    log('professor_sem_telefone_consultor', { conversation_id: conversationId, unidade: u.unit });
    return { action: 'not_sent', reason: `professor_sem_telefone_${u.unit}` };
  }
  const session = getWahaSession(inboxId);
  const msg = `👨‍🏫 *Recado de professor* (${u.unit})\n\n${resumo}\n\n_Conversa no Chatwoot: ${conversationId}_`;
  const passos = [];
  try { await wahaSendConsultor(session, u.consultorTelefone, msg); passos.push('waha_consultor'); }
  catch (e) { log('professor_waha_error', { conversation_id: conversationId, error: String(e?.message || e).slice(0, 200) }); }
  try { await chatwootAssign(base, account, conversationId, u.agentId); passos.push('atribuido'); }
  catch (e) { log('professor_assign_error', { conversation_id: conversationId, error: String(e?.message || e).slice(0, 200) }); }

  _lastNotify.set(conversationId, now);
  log('professor_escalado', { conversation_id: conversationId, unidade: u.unit, consultor: u.consultorNome, passos: passos.join(','), resumo: resumo.slice(0, 160) });
  return { action: 'sent', reason: 'professor_escalado', passos };
}

module.exports = { handleProfessor, isProfessor, isTrivial, PROFESSOR_UNITS };
