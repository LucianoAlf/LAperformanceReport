#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { URL } = require('url');
const { spawn } = require('child_process');
const { consultorPermitido, quemEh, unidadeNome, responderCutucada } = require('./governanca-client');
const gatilho = require('./consultor-gatilho');

const HOME = '/home/mila';
const BASE = `${HOME}/.openclaw`;
const SECRET_FILE = `${BASE}/secrets/chatwoot.env`;
const WAHA_SECRET_FILE = `${BASE}/secrets/waha.env`;
const LOG_FILE = `${BASE}/workspace/memory/chatwoot-mila-bridge.log`;
const STATE_FILE = `${BASE}/workspace/memory/chatwoot-conversation-state.json`;
const PROCESSED_FILE = `${BASE}/workspace/memory/chatwoot-processed-message-ids.json`;
const ACTIVE_TYPING_FILE = `${BASE}/workspace/memory/chatwoot-active-typing.json`;

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch (_) {}
}
loadEnv(SECRET_FILE);
loadEnv(WAHA_SECRET_FILE);
loadEnv(`${BASE}/secrets/lareport-readonly.env`);

const HOST = process.env.CHATWOOT_BRIDGE_HOST || '0.0.0.0';
const PORT = Number(process.env.CHATWOOT_BRIDGE_PORT || 3211);
const SECRET = process.env.CHATWOOT_WEBHOOK_SECRET || '';
const MODE = process.env.CHATWOOT_MODE || 'auto_reply';
const ALLOWED_INBOXES = new Set(
  (process.env.CHATWOOT_ALLOWED_INBOXES || '205').split(',').map(s => s.trim()).filter(Boolean)
);

// ── Caminho de LEAD (mila-sdr) — DESLIGADO por padrao ────────────────────────
// Com LEAD_MODE_ENABLED != 'true', o bridge se comporta exatamente como hoje
// (so consultor). Ligar so quando for conectar o SDR de leads na VPS.
const LEAD_MODE_ENABLED = process.env.LEAD_MODE_ENABLED === 'true';
// Inboxes onde o modo lead responde (separado do ALLOWED_INBOXES do teste).
const LEAD_INBOXES = new Set(
  (process.env.LEAD_INBOXES || '').split(',').map(s => s.trim()).filter(Boolean)
);
const MILA_SDR_HOME = process.env.MILA_SDR_HERMES_HOME || '/home/mila/.hermes/profiles/mila-sdr';
// ── Modo Sombra (Task 6) — DESLIGADO por padrao ──────────────────────────────
// Com LEAD_SHADOW_MODE != 'true', nao muda nenhum comportamento existente.
// Quando 'true', dispara handleLead em paralelo (fire-and-forget, dry-run) pra
// leads reais das inboxes em LEAD_INBOXES, sem afetar a resposta real.
const LEAD_SHADOW_MODE = process.env.LEAD_SHADOW_MODE === 'true';

// ── Gatilho do MODO CONSULTOR (24/08) ────────────────────────────────────────
// Ela responde quando é chamada pelo nome, e segue na conversa por
// CONSULTOR_JANELA_MIN sem precisar ouvir o nome de novo. O que não for
// dirigido a ela fica guardado e entra como CONTEXTO na próxima resposta.
// A regra mora em consultor-gatilho.js, testada em tests/consultor-gatilho.test.js.
//
// ⚠️ `!== 'false'` e não `=== 'true'`: sem a variável no ambiente, o gatilho
// fica LIGADO. Um default desligado transformaria qualquer deploy que
// esquecesse a env no comportamento antigo -- responder a tudo -- sem nada na
// tela dizendo isso.
const CONSULTOR_GATILHO_ENABLED = process.env.CONSULTOR_GATILHO_ENABLED !== 'false';
const CONSULTOR_GATILHO_FILE = `${BASE}/workspace/memory/chatwoot-consultor-gatilho.json`;
const CONSULTOR_OPCOES = {
  janelaMin: Number(process.env.CONSULTOR_JANELA_MIN || gatilho.PADROES.janelaMin),
  contextoMin: Number(process.env.CONSULTOR_CONTEXTO_MIN || gatilho.PADROES.contextoMin),
  contextoMaxItens: Number(process.env.CONSULTOR_CONTEXTO_ITENS || gatilho.PADROES.contextoMaxItens),
  contextoMaxChars: Number(process.env.CONSULTOR_CONTEXTO_CHARS || gatilho.PADROES.contextoMaxChars),
};

// 🔴 CONTEXTO PROATIVO (16/09/2026). A sessão do Hermes é persistente por
// telefone (--continue chatwoot-consultor-v2-<telefone>), mas só "ouve" o que
// passa por ELA MESMA. Um envio do cron (mila-proativa.py) vai direto ao
// Chatwoot, sem Hermes no meio — então, sem isto, "sim"/"quero" reabre o
// último turno que REALMENTE passou pelo Hermes, que pode ser de dias atrás
// (caso real, 16/09/2026: Alf respondeu ao briefing da manhã e a Mila retomou
// uma conversa de dois dias antes, porque foi o último turno que ela viu de
// verdade). Mesmo padrão de kill switch do gatilho acima.
const CONTEXTO_PROATIVO_ENABLED = process.env.MILA_CONTEXTO_PROATIVO_ENABLED !== 'false';
// ⚠️ NAO e SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (esses apontam para o projeto
// ANTIGO da Mila SDR, wxairgavoteauysgruyv — medido em 16/09/2026, HTTP 404 na
// primeira tentativa). O projeto certo, o MESMO que mila-gestao-tools-mcp.mjs
// usa, e o do LA Report: SUPABASE_LAREPORT_URL/_SERVICE_KEY, em
// secrets/mila-sdr-tools.env (mesmo arquivo que o SDR ja carregava).
const SUPABASE_URL = process.env.SUPABASE_LAREPORT_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_LAREPORT_SERVICE_KEY || '';

/** Chamada direta ao PostgREST — a bridge nunca falou com o Supabase antes de
 *  hoje (quem chama RPC é o Hermes, por dentro do MCP). Sem as duas envs,
 *  devolve null e o chamador segue sem contexto extra — nunca derruba a
 *  resposta por causa disto. */
async function rpcSupabase(fn, args) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(args || {}),
  });
  if (!res.ok) throw new Error(`rpc_${fn}_${res.status}`);
  return res.json();
}

/** Mesma forma do blocoContexto do gatilho (consultor-gatilho.js), rótulo
 *  diferente de propósito: aquele é "o que a PESSOA disse e você não
 *  respondeu"; este é "o que VOCÊ mandou sozinha e ainda não foi respondido"
 *  — confundir os dois faria ela tratar o próprio relatório como pedido da
 *  pessoa. */
function blocoContextoProativo(pendente) {
  if (!pendente || !pendente.texto) return '';
  return `A ÚLTIMA COISA QUE VOCÊ MANDOU nesta conversa (${pendente.enviado_em}, `
    + `${pendente.origem}), ainda sem resposta — é a isso que a pessoa provavelmente `
    + `está respondendo agora; não invente outro assunto:
"""
${pendente.texto}
"""

`;
}

function log(event, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

process.on('unhandledRejection', err => {
  log('fatal_unhandled_rejection', { error: String(err?.stack || err?.message || err).slice(0, 3000) });
});
process.on('uncaughtException', err => {
  log('fatal_uncaught_exception', { error: String(err?.stack || err?.message || err).slice(0, 3000) });
  setTimeout(() => process.exit(1), 200).unref?.();
});

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function authorized(req, url) {
  if (!SECRET) return true;
  const token = req.headers['x-mila-token'] || req.headers['x-chatwoot-secret'] || url.searchParams.get('token');
  return token && crypto.timingSafeEqual(Buffer.from(String(token)), Buffer.from(SECRET));
}

function extractEvent(p) { return p.event || p.event_type || 'unknown'; }
function extractConversationId(p) {
  return p.conversation?.id || p.conversation_id || p.id || null;
}
function extractMessageId(p) { return p.message?.id || p.id || null; }
// ⚠️ Mensagem de AUDIO chega com `content` vazio e a frase em
//    `attachments[].transcribed_text` — o Chatwoot ja transcreveu. Sem esta
//    queda, audio virava `empty_content` e a Mila nem sabia que falaram com
//    ela (caso Luciano, 08/09 12:19: "o que voce sabe do LA Talent?").
//    NAO transcrevo aqui: o texto ja vem pronto, e uma segunda fonte para a
//    mesma frase e como nascem as divergencias.
function extractTranscricao(p) {
  const anexos = p.attachments || p.message?.attachments || [];
  if (!Array.isArray(anexos)) return '';
  for (const a of anexos) {
    const t = String((a && a.transcribed_text) || '').trim();
    if (t) return t;
  }
  return '';
}
function extractContent(p) {
  const direto = String(p.content || p.message?.content || '').trim();
  if (direto) return direto;
  // sem transcricao disponivel segue vazio de proposito: responder a um audio
  // que ninguem leu e pior que nao responder.
  return extractTranscricao(p);
}
function extractInboxId(p) {
  return String(p.inbox_id || p.conversation?.inbox_id || p.meta?.channel || '');
}
function isIncomingMessage(p) {
  return p.event === 'message_created'
    && (p.message_type === 'incoming' || p.message?.message_type === 'incoming')
    && !(p.sender?.type === 'agent_bot')
    && !(p.message?.sender?.type === 'agent_bot');
}
// ⚠️ Oposto do "isOutgoingHuman" de updateState() (que EXCLUI agent_bot pra
// detectar humano assumindo a conversa). Este aqui e o contrario de proposito:
// so a resposta que o n8n MESMO mandou pro lead. Ver FISC-4.
function isOutgoingBotMessage(p) {
  return p.event === 'message_created'
    && (p.message_type === 'outgoing' || p.message?.message_type === 'outgoing')
    && (p.sender?.type === 'agent_bot' || p.message?.sender?.type === 'agent_bot');
}

function updateState(payload) {
  const conversationId = extractConversationId(payload);
  if (!conversationId) return null;
  const state = readJson(STATE_FILE, {});
  const key = String(conversationId);
  const prev = state[key] || {};
  const event = extractEvent(payload);
  const assignee = payload.conversation?.assignee || payload.assignee || null;
  const hasAssignee = Boolean(assignee && (assignee.id || assignee.name));
  const status = payload.conversation?.status || payload.status || null;
  const isOutgoingHuman = payload.event === 'message_created'
    && (payload.message_type === 'outgoing' || payload.message?.message_type === 'outgoing')
    && !(payload.sender?.type === 'agent_bot')
    && !(payload.message?.sender?.type === 'agent_bot');
  const explicitStatusEvent = event === 'conversation_status_changed' || event === 'conversation_opened' || event === 'conversation_resolved';
  const latchedStatus = explicitStatusEvent && status ? status : (prev.latched_status || prev.status || status || null);
  const humanTakeover = Boolean(prev.human_takeover || hasAssignee || isOutgoingHuman);
  const milaAllowed = latchedStatus === 'pending' && !humanTakeover;
  state[key] = {
    ...prev,
    conversation_id: conversationId,
    last_event: event,
    status: status || prev.status,
    latched_status: latchedStatus,
    assignee: assignee || prev.assignee,
    human_takeover: humanTakeover,
    mila_allowed: milaAllowed,
    updated_at: new Date().toISOString(),
  };
  writeJson(STATE_FILE, state);
  return state[key];
}

function alreadyProcessed(id) {
  if (!id) return false;
  return !!readJson(PROCESSED_FILE, {})[String(id)];
}
function markProcessed(id, meta = {}) {
  if (!id) return;
  const seen = readJson(PROCESSED_FILE, {});
  seen[String(id)] = { ts: new Date().toISOString(), ...meta };
  const keys = Object.keys(seen).slice(-1000);
  const compact = {};
  for (const k of keys) compact[k] = seen[k];
  writeJson(PROCESSED_FILE, compact);
}

function rememberTyping(convId, on) {
  if (!convId) return;
  const data = readJson(ACTIVE_TYPING_FILE, {});
  if (on) data[String(convId)] = { ts: new Date().toISOString() };
  else delete data[String(convId)];
  writeJson(ACTIVE_TYPING_FILE, data);
}
async function clearRememberedTyping() {
  const data = readJson(ACTIVE_TYPING_FILE, {});
  for (const cid of Object.keys(data)) {
    try { await setChatwootTypingStatus(cid, 'off'); } catch (_) {}
    rememberTyping(cid, false);
  }
}

async function setChatwootTypingStatus(conversationId, typingStatus) {
  const base = process.env.CHATWOOT_BASE_URL;
  const token = process.env.CHATWOOT_BOT_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  if (!base || !token || !accountId || !conversationId) return false;
  const url = `${base.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_typing_status`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api_access_token': token },
    body: JSON.stringify({ typing_status: typingStatus, is_private: false }),
  });
  rememberTyping(conversationId, typingStatus === 'on');
  return response.ok;
}

function getWahaSession(inboxId) {
  const id = String(inboxId || '');
  const map = {
    '205': process.env.WAHA_SESSION_TELERA || '',
    '147': process.env.WAHA_SESSION_BARRA || '',
    '155': process.env.WAHA_SESSION_CG || '',
    '148': process.env.WAHA_SESSION_RECREIO || '',
  };
  return map[id] || '';
}

async function setWahaPresence(inboxId, chatId, presence) {
  const base = process.env.WAHA_BASE_URL;
  const key = process.env.WAHA_API_KEY;
  const session = getWahaSession(inboxId);
  if (!base || !key || !session || !chatId) return false;
  const response = await fetch(`${base.replace(/\/$/, '')}/api/${encodeURIComponent(session)}/presence`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({ chatId, presence: presence === 'typing' ? 'typing' : 'paused' }),
  });
  return response.ok;
}

async function getChatwootConversation(conversationId) {
  const base = process.env.CHATWOOT_BASE_URL;
  const token = process.env.CHATWOOT_BOT_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  if (!base || !token || !accountId) throw new Error('chatwoot_not_configured');
  const response = await fetch(
    `${base.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    { headers: { 'api_access_token': token } }
  );
  const raw = await response.text();
  if (!response.ok) throw new Error(`chatwoot_get_http_${response.status}`);
  return JSON.parse(raw);
}

async function sendChatwootMessage(conversationId, content) {
  const base = process.env.CHATWOOT_BASE_URL;
  const token = process.env.CHATWOOT_BOT_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  if (!base || !token || !accountId) throw new Error('chatwoot_send_not_configured');
  const response = await fetch(
    `${base.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api_access_token': token },
      body: JSON.stringify({ content, message_type: 'outgoing', private: false }),
    }
  );
  const raw = await response.text();
  if (!response.ok) throw new Error(`chatwoot_send_http_${response.status}: ${String(raw).slice(0, 300)}`);
  return JSON.parse(raw);
}

function getChatIdFromConversation(conversation) {
  const sender = conversation?.meta?.sender || conversation?.contact || {};
  const attrs = sender.additional_attributes || {};
  const candidates = [sender.identifier, sender.phone_number, conversation?.contact?.identifier, conversation?.contact?.phone_number];
  if (Array.isArray(attrs.lid_jids)) candidates.push(...attrs.lid_jids);
  for (const raw of candidates) {
    const v = String(raw || '').trim();
    if (!v) continue;
    if (/@g\.us$/.test(v)) return v;
    const digits = v.replace(/\D/g, '');
    if (/^55\d{10,11}$/.test(digits)) return `${digits}@c.us`;
  }
  return '';
}

// === Migrado de OpenClaw para Hermes em 2026-07-09 ===
// O gateway OpenClaw da Mila (porta 19795) foi desativado; o agente agora roda no
// Hermes (/home/mila/.hermes, profile default via HERMES_HOME). Mesma abordagem do
// chatwoot-sol-bridge.js: spawn do CLI Hermes por mensagem, sessao continua por conversa.
const HERMES_BIN = process.env.HERMES_PYTHON_BIN || '/home/mila/.hermes/hermes-agent/venv/bin/python';
const HERMES_CWD = '/home/mila';        // CWD logico: AGENTS.md so carrega da HOME da Mila
const HERMES_HOME_DIR = process.env.HERMES_HOME || '/home/mila/.hermes';

function runHermesRaw(args, timeoutMs, hermesHome, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(HERMES_BIN, args, {
      cwd: HERMES_CWD,
      env: { ...process.env, HOME: HERMES_CWD, HERMES_HOME: hermesHome || HERMES_HOME_DIR, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '', done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`hermes_timeout: ${err.slice(0, 300)}`));
    }, timeoutMs + 5000);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    child.on('close', code => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ code, out: out.trim(), err: err.trim() });
    });
  });
}

// Mantem o nome runHermes pra nao mexer no call site; internamente chama Hermes.
// hermesHome: undefined = perfil base (consultor). MILA_SDR_HOME = perfil de lead.
async function runHermes(conversationId, prompt, timeoutMs = 180000, hermesHome, imagePath, extraEnv) {
  return (await runHermesMeta(conversationId, prompt, timeoutMs, hermesHome, imagePath, extraEnv)).text;
}

// Igual ao runHermes, mas devolve tambem o stderr daquela execucao. O modo
// sombra usa isso pra saber se a resposta veio do modelo configurado ou do
// fallback (mila-modelo.js:detectaFallback) -- sem isso o registro do modelo
// mente justamente quando o provider falha.
async function runHermesMeta(conversationId, prompt, timeoutMs = 180000, hermesHome, imagePath, extraEnv) {
  const sessionName = `chatwoot-${String(conversationId).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}`;
  const baseArgs = ['-m', 'hermes_cli.main', 'chat', '-Q', '-q', prompt, '--source', 'tool'];
  if (imagePath) baseArgs.push('--image', imagePath);

  let result = await runHermesRaw([...baseArgs, '--continue', sessionName], timeoutMs, hermesHome, extraEnv);

  if (result.code !== 0 && /No session found matching/i.test(result.err + result.out)) {
    // Primeira mensagem dessa conversa: cria sessao nova e batiza com o nome fixo,
    // pra proximas mensagens conseguirem retomar via --continue.
    result = await runHermesRaw(baseArgs, timeoutMs, hermesHome, extraEnv);
    if (result.code !== 0) throw new Error(`hermes_exit_${result.code}: ${result.err.slice(0, 500)}`);
    const m = `${result.out}\n${result.err}`.match(/^session_id:\s*(\S+)/m);
    if (m) {
      const renamed = await runHermesRaw(
        ['-m', 'hermes_cli.main', 'sessions', 'rename', m[1], sessionName],
        15000,
        hermesHome,
        extraEnv,
      );
      if (renamed.code !== 0) {
        try { console.error(`hermes_session_rename_failed ${m[1]} -> ${sessionName}: ${renamed.err.slice(0, 200)}`); } catch (_) {}
      }
    }
  } else if (result.code !== 0) {
    throw new Error(`hermes_exit_${result.code}: ${result.err.slice(0, 500)}`);
  }

  const text = result.out
    .replace(/^↻[^\n]*\n?/, '')
    .replace(/^session_id:\s*\S+\s*\n?/, '')
    .trim();
  return { text, stderr: result.err || '', code: result.code };
}


const CONSULTANT_INBOXES = new Set(['147', '148', '155']);
// 09/09/2026 - FUSAO DOS PERFIS. Ate hoje quem tinha pode_editar=true caia no
// perfil raiz e todo o resto no mila-consultor-readonly. Viraram um so: a raiz
// recebeu a alma do readonly (base comercial + contraponto), os 13 toolsets
// desligados, e perdeu os MCPs de n8n/Chatwoot/SQL do LAReport.
//
// 🔴 O PERFIL NUNCA DEVERIA TER SIDO UM SEGUNDO MECANISMO DE PERMISSAO. Quem ve
// o que ja era decidido por governanca.quem_eh(telefone) -- escopo de unidade x
// rede, e midia so para diretoria/marketing/comercial em nivel lider. O split
// so duplicava login de assinatura e fazia as duas almas divergirem: a diretoria
// ficou meses com a alma velha, respondendo metodo de cabeca enquanto a
// consultora recebia o bloco aprovado pelo Alf.
//
// O readonly continua no disco como rede de seguranca ate isto se provar.
const MILA_CONSULTOR_READONLY_HOME = '/home/mila/.hermes/profiles/mila-consultor-readonly';
function pickHermesProfile(_podeEditar) {
  return undefined; // undefined = perfil raiz (HERMES_HOME_DIR)
}

// ── GRUPO ────────────────────────────────────────────────────────────────────
// Allowlist por inbox. Cada Mila so fala no grupo DA SUA unidade -- e nao existe
// "grupo em geral": o que nao esta aqui e silencio.
//
// ⚠️ A fonte NAO pode ser a listagem de grupos do WAHA: `GET /groups` mantem no
// store local os grupos dos quais a sessao ja saiu (medido em 03/09, ao sair de 2
// grupos que continuaram na lista). Estes JIDs vieram do contato do Chatwoot.
const GRUPOS_PERMITIDOS = (() => {
  const padrao = {
    '147': ['5521965832009-1625319907@g.us'], // RELATORIOS DIARIOS BR
    '148': ['5521992426581-1581033423@g.us'], // RELATORIOS DIARIOS RC
    '155': ['5521965832009-1600979279@g.us'], // RELATORIOS DIARIOS CG
  };
  // Override: MILA_GRUPOS_PERMITIDOS="147:jid@g.us,155:outro@g.us"
  const bruto = (process.env.MILA_GRUPOS_PERMITIDOS || '').trim();
  if (bruto) {
    const m = {};
    for (const par of bruto.split(',')) {
      const [ib, jid] = par.split(':').map((x) => String(x || '').trim());
      if (!ib || !jid) continue;
      (m[ib] = m[ib] || []).push(jid);
    }
    if (Object.keys(m).length) return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, new Set(v)]));
  }
  return Object.fromEntries(Object.entries(padrao).map(([k, v]) => [k, new Set(v)]));
})();

/** JID do grupo, ou '' quando a conversa e 1:1.
 *
 *  ⚠️ NAO usar `additional_attributes.is_group`: varios contatos de grupo nao tem
 *  essa chave (o RELATORIOS DIARIOS BR entre eles), entao ela reconheceria uns
 *  grupos e outros nao. O sufixo @g.us esta em todos. */
function extractGroupJid(payload) {
  const candidatos = [
    payload.conversation?.contact_inbox?.source_id,
    payload.conversation?.meta?.sender?.identifier,
    payload.sender?.identifier,
    payload.meta?.sender?.identifier,
  ];
  for (const raw of candidatos) {
    const v = String(raw || '').trim();
    if (/@g\.us$/.test(v)) return v;
  }
  return '';
}

/** Telefone de QUEM FALOU dentro do grupo.
 *
 *  Em grupo o `sender` do Chatwoot e o contato do GRUPO -- por isso
 *  extractSenderPhone devolvia o JID (18 digitos) e nao batia em ninguem na
 *  governanca. O autor real vem em content_attributes:
 *
 *    participant_jid     "182214205677692@lid"            <- id opaco, NAO e telefone
 *    participant_alt_jid "55219XXXXXXXX@s.whatsapp.net"   <- o numero
 *
 *  ⚠️ Devolve '' quando so vier o LID (o WhatsApp esta migrando para esse
 *  formato e o alt_jid pode faltar). Vazio faz o gate recusar -- FAIL-CLOSED de
 *  proposito: sem saber quem falou, a Mila nao fala. O plano B, se isso passar a
 *  acontecer, e mapear LID -> telefone pelo `lid_jids` que o contato do Chatwoot
 *  ja guarda (medido em 03/09: 15 dos 18 autorizados ja tem LID conhecido). */
function extractGroupAuthorPhone(payload) {
  const ca = payload.content_attributes
    || payload.conversation?.messages?.[0]?.content_attributes
    || {};
  const alt = String(ca.participant_alt_jid || '');
  const digits = alt.replace(/@.*$/, '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
}

function extractSenderPhone(payload) {
  const candidates = [
    payload.sender?.phone_number,
    payload.sender?.identifier,
    payload.meta?.sender?.phone_number,
    payload.meta?.sender?.identifier,
  ];
  for (const raw of candidates) {
    const v = String(raw || '').replace(/\D/g, '');
    if (v.length >= 10) return v;
  }
  return '';
}

function extractContactId(payload) {
  return payload.sender?.id || payload.meta?.sender?.id || null;
}

function buildConsultantPrompt(name, phone, escopoLinhas, content, contexto, envioProativo) {
  // O bloco de contexto entra ANTES da mensagem: é o que ela já ouviu mas não
  // respondeu, e vem rotulado como contexto justamente para não ser lido como
  // uma fila de pedidos atrasados.
  const proativo = blocoContextoProativo(envioProativo);
  const antes = proativo + gatilho.blocoContexto(contexto);
  // 🔴 `escopoLinhas` vem da GOVERNANCA (quem e a pessoa), nao do inbox. Ate
  //    08/09 esta linha dizia `Unidade: <inbox>`, e foi o que fez a Mila
  //    esconder da lider do comercial as 3 unidades que a tool tinha acabado
  //    de devolver para ela (conv. 8809).
  return `[MODO CONSULTOR]\nConsultor: ${name}\nTelefone: ${phone}\n${escopoLinhas}\n`
    + `${antes}Mensagem: ${content}`;
}

/** Estado do gatilho, uma entrada por telefone de consultor.
 *
 *  Arquivo próprio, e não o `chatwoot-conversation-state.json`: aquele é por
 *  CONVERSA, e a sessão do consultor é por PESSOA (`consultor-v2-<telefone>`).
 *  Misturar as duas chaves faria a janela de conversa reabrir sozinha toda vez
 *  que o Chatwoot abrisse uma conversa nova para o mesmo consultor. */
function lerGatilho(phone) {
  const todos = readJson(CONSULTOR_GATILHO_FILE, {});
  return todos[String(phone)] || null;
}
function gravarGatilho(phone, estado) {
  const todos = readJson(CONSULTOR_GATILHO_FILE, {});
  todos[String(phone)] = estado;
  // Poda de arquivo: consultor que não fala há uma semana não precisa ocupar
  // linha aqui. Sem isto o JSON só cresce, e ele é lido a cada mensagem.
  const piso = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(todos)) {
    const visto = Math.max(Number(v?.janela_ate || 0),
                           ...(Array.isArray(v?.pendentes) ? v.pendentes.map((p) => p?.ts || 0) : [0]));
    if (visto < piso) delete todos[k];
  }
  writeJson(CONSULTOR_GATILHO_FILE, todos);
}

const INBOX_UNIT = { '147': 'Barra', '155': 'Campo Grande', '148': 'Recreio', '205': 'Teste (Telera)' };

function buildMilaPrompt(payload, conversation) {
  const content = extractContent(payload);
  const sender = conversation?.meta?.sender || {};
  const inboxId = extractInboxId(payload) || String(conversation?.inbox_id || '');
  const unit = INBOX_UNIT[inboxId] || 'nao identificada';
  const contactName = sender.name || 'Lead';
  const phone = sender.phone_number || sender.identifier || '';
  const convId = String(extractConversationId(payload) || conversation?.id || '');
  return `Lead: ${contactName}
Telefone: ${phone}
Unidade: ${unit}
Conversa_ID: ${convId}
Mensagem: ${content}`;
}

// 🔴 O WEBHOOK DO CHATWOOT NAO CARREGA `transcribed_text` — so o GET da API.
//    Medido em 08/09: audio criado 16:56:19, webhook processado 16:56:21 com
//    content vazio, e o GET devolvendo a frase inteira. Varredura de 14
//    conversas: 12 audios, 12 transcritos, ZERO sem — a transcricao e
//    automatica na conta; o que falta e o campo no payload do evento.
// ⚠️ Nao e permissao: o CHATWOOT_BOT_TOKEN le (200) e e aceito pelo endpoint
//    de transcrever (422 "nao tem audio pendente" = token ok, audio ja feito).
async function buscarMensagemChatwoot(conversationId, messageId) {
  const base = process.env.CHATWOOT_BASE_URL;
  const token = process.env.CHATWOOT_BOT_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  if (!base || !token || !accountId) return null;
  const r = await fetch(
    `${base.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages?limit=20`,
    // ⚠️ User-Agent explicito: o proxy do Chatwoot ja devolveu 403 sem ele
    { headers: { api_access_token: token, 'User-Agent': 'la-mila-bridge' } });
  if (!r.ok) throw new Error(`chatwoot_msgs_http_${r.status}`);
  const d = await r.json();
  const lista = Array.isArray(d) ? d : (d && d.payload) || [];
  return lista.find((m) => String(m && m.id) === String(messageId)) || null;
}

// Pede a transcricao — o MESMO botao que a interface do Chatwoot usa. Nao e
// uma segunda fonte: e o mesmo motor, sob demanda, quando o automatico ainda
// nao chegou. 422 significa "ja transcrito" e nao e erro.
async function pedirTranscricao(conversationId, messageId) {
  const base = process.env.CHATWOOT_BASE_URL;
  const token = process.env.CHATWOOT_BOT_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  if (!base || !token || !accountId) return;
  try {
    await fetch(
      `${base.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages/${messageId}/audio_transcription`,
      { method: 'POST',
        headers: { api_access_token: token, 'User-Agent': 'la-mila-bridge',
                   'content-type': 'application/json' } });
  } catch (_) { /* pedir e melhoria, nunca requisito */ }
}

// Devolve o texto do audio, ou string vazia. NUNCA inventa marcador: fazer a
// Mila responder a uma frase que ela nao leu e pior que nao responder.
async function resolverTranscricaoDeAudio(conversationId, messageId) {
  const esperas = [0, 1500, 3000];   // a transcricao e assincrona; o webhook
                                     // chega ~2s depois da criacao da mensagem
  let temAudio = false;
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i]) await new Promise((ok) => setTimeout(ok, esperas[i]));
    let m;
    try { m = await buscarMensagemChatwoot(conversationId, messageId); }
    catch (e) {
      log('audio_busca_falhou', { conversation_id: conversationId, message_id: messageId,
                                  tentativa: i + 1, error: String(e && e.message).slice(0, 200) });
      return '';
    }
    if (!m) return '';
    const anexos = m.attachments || [];
    temAudio = anexos.some((a) => a && a.file_type === 'audio');
    if (!temAudio) return '';   // sem audio nao ha o que resolver
    for (const a of anexos) {
      const t = String((a && a.transcribed_text) || '').trim();
      if (t) {
        log('audio_transcricao_resolvida', { conversation_id: conversationId,
              message_id: messageId, tentativa: i + 1, chars: t.length });
        return t;
      }
    }
    // ainda sem texto: na 2a volta, PEDE (e o que a interface faz)
    if (i === 0) await pedirTranscricao(conversationId, messageId);
  }
  log('audio_sem_transcricao', { conversation_id: conversationId, message_id: messageId,
        tem_audio: temAudio, nota: 'segue em silencio, como antes' });
  return '';
}

async function processIncoming(payload, state) {
  const conversationId = extractConversationId(payload);
  const messageId = extractMessageId(payload);
  // `let`: mensagem de audio chega sem texto e o conteudo e completado abaixo.
  let content = extractContent(payload);
  const inboxId = extractInboxId(payload);

  // Ver FISC-4: a resposta que o n8n manda pro lead ja chega neste mesmo
  // webhook de conta (dispara incoming E outgoing) -- so bufferizar em vez de
  // descartar, pro proximo turno da sombra ver o que o lead realmente recebeu.
  // Roda ANTES do gate de MODE de proposito: e leitura passiva, nunca envia
  // nada, nao deve depender do interruptor de auto-resposta do bridge. Sai
  // cedo tambem quando nao ha shadow rodando nessa inbox -- nada pra alimentar.
  if (isOutgoingBotMessage(payload) && LEAD_SHADOW_MODE
      && (LEAD_INBOXES.size === 0 || LEAD_INBOXES.has(inboxId))) {
    try { require('./chatwoot-mila-bridge-lead.js').bufferN8nOutgoing(conversationId, content); }
    catch (_) {}
    return { action: 'not_sent', reason: 'buffered_n8n_outgoing' };
  }

  if (MODE !== 'auto_reply') return { action: 'not_sent', reason: `mode_${MODE}` };
  if (!isIncomingMessage(payload)) return { action: 'not_sent', reason: 'not_incoming_message' };

  // 🔴 AUDIO: mensagem de entrada sem texto. O webhook nao traz a transcricao,
  //    entao vamos perguntar a API o que essa mensagem realmente e.
  // ⚠️ COMPLETO O PAYLOAD, nao so a variavel local: `buildMilaPrompt`, o
  //    caminho de lead e o buffer chamam `extractContent(payload)` por conta
  //    propria. Corrigir num lugar so deixaria os outros lendo vazio — e
  //    reimplementar a busca em cada um e como nascem as divergencias.
  // ⚠️ `empty_content` deu 8 vezes em 3 meses; nao e caminho quente.
  if (!content && conversationId && messageId) {
    const falado = await resolverTranscricaoDeAudio(conversationId, messageId);
    if (falado) {
      content = falado;
      payload.content = falado;
      if (payload.message && typeof payload.message === 'object') payload.message.content = falado;
    }
  }
  const grupoJid = extractGroupJid(payload);
  // Em grupo quem importa e o AUTOR, nao o contato do grupo.
  const senderPhone = grupoJid ? extractGroupAuthorPhone(payload) : extractSenderPhone(payload);
  const contactId = extractContactId(payload);

  // ── Regras de GRUPO (as tres barram antes de qualquer resposta) ───────────
  if (grupoJid) {
    if (!GRUPOS_PERMITIDOS[inboxId]?.has(grupoJid)) {
      log('grupo_nao_permitido', { conversation_id: conversationId, inbox_id: inboxId, grupo: grupoJid });
      return { action: 'not_sent', reason: 'grupo_nao_permitido' };
    }
    if (!senderPhone) {
      // Sem saber QUEM falou nao da para aplicar a governanca. Silencio.
      log('grupo_autor_desconhecido', { conversation_id: conversationId, inbox_id: inboxId, grupo: grupoJid });
      return { action: 'not_sent', reason: 'grupo_autor_desconhecido' };
    }
  }
  const consultantMode = CONSULTANT_INBOXES.has(inboxId)
    && await consultorPermitido(senderPhone, 'mila', String(inboxId));
  // Recusa AUDIVEL: quem o Chatwoot marca como consultor mas a governanca nao
  // reconhece. Sem isto a recusa e muda -- foi assim que ninguem soube por meses
  // que a consultora de CG falava por um numero fora de agente_usuarios.
  // Le do payload (sem chamada extra) e so dispara com a flag do Chatwoot, entao
  // lead nao gera ruido.
  if (!consultantMode && CONSULTANT_INBOXES.has(inboxId)
      && (payload.sender?.custom_attributes?.consultor === true
          || payload.meta?.sender?.custom_attributes?.consultor === true)) {
    log("consultor_nao_reconhecido", {
      conversation_id: conversationId, inbox_id: inboxId,
      telefone: senderPhone, nome: payload.sender?.name || null,
    });
  }
  let podeEditar = false;
  let consultorNome;
  let consultorUnidade;
  // 🔴 Quem tem `unidade_id` nulo na governanca lidera a REDE (diretoria,
  //    lider do comercial, Sucesso do Aluno). Para essa pessoa a caixa de
  //    entrada e so a porta — nunca o limite.
  let escopoRede = false;
  if (consultantMode) {
    const identidade = await quemEh(senderPhone);
    podeEditar = identidade?.pode_editar === true;
    // ⚠️ FAIL-CLOSED: sem identidade confirmada o escopo de rede NAO nasce, e
    //    a unidade volta a ser a do inbox (o comportamento de antes daqui).
    escopoRede = !!identidade && identidade.unidade_id == null;
    consultorNome = identidade?.nome || 'desconhecido';
    consultorUnidade = identidade
      ? await unidadeNome(identidade.unidade_id)
      : (INBOX_UNIT[inboxId] || 'desconhecida');
  }
  // ── Resposta curta 1/2/3 a uma cutucada (13/09/2026) ─────────────────────
  // Fecha o laço SEM modelo: a consultora responde "1", "2" ou "3" e o banco decide
  // o que fazer com o último lote entregue (mila_responder_cutucada_v1). Vem ANTES
  // do gatilho, senão um "1" solto seria descartado como "sem gatilho". Sem lote
  // pendente (nada_pendente) o dígito segue o caminho normal — pode ser resposta a
  // outra pergunta.
  if (consultantMode && /^\s*[123]\s*$/.test(String(content || ''))) {
    const opcao = Number(String(content).trim());
    try {
      const r = await responderCutucada(senderPhone, opcao);
      if (r && r.ok && !r.nada_pendente && r.ack_texto) {
        markProcessed(messageId, { conversation_id: conversationId, action: 'desfecho_cutucada' });
        const sent = await sendChatwootMessage(conversationId, r.ack_texto);
        log('desfecho_cutucada', { conversation_id: conversationId, message_id: messageId, inbox_id: inboxId,
          telefone: senderPhone, nome: consultorNome, opcao, itens: (r.itens || []).length });
        return { action: 'sent', sent_id: sent?.id, reason: 'desfecho_cutucada' };
      }
    } catch (err) {
      // falha aqui NAO cala a Mila: cai no caminho normal (modelo)
      log('desfecho_cutucada_erro', { conversation_id: conversationId, error: String(err?.message || err).slice(0, 300) });
    }
  }
  // Inboxes de consultor: so responde se for consultor autorizado.
  // Com LEAD_MODE_ENABLED, nao-consultor NAO para aqui — cai no caminho de lead abaixo.
  // ⚠️ Grupo NUNCA vira lead. Um grupo nao e um lead, e tratar como tal faria a
  // Mila abordar comercialmente um grupo interno -- exatamente o que o follow-up
  // fez em 01-02/09 ("Oi On, qual instrumento voce quer aprender?"). Em grupo so
  // existe um caminho: consultor autorizado.
  if (grupoJid && !consultantMode) {
    log('grupo_nao_consultor', { conversation_id: conversationId, inbox_id: inboxId, grupo: grupoJid, telefone: senderPhone });
    return { action: 'not_sent', reason: 'grupo_nao_consultor' };
  }
  if (CONSULTANT_INBOXES.has(inboxId) && !consultantMode && !LEAD_MODE_ENABLED && !LEAD_SHADOW_MODE) return { action: 'not_sent', reason: 'not_consultant' };
  // ── Caminho de LEAD ──────────────────────────────────────────────────────
  // Com LEAD_MODE_ENABLED off, comporta como hoje (nunca responde lead).
  // Com on + inbox de lead permitida, delega ao modulo isolado do SDR.
  if (!consultantMode) {
    if (!LEAD_MODE_ENABLED) {
      if (LEAD_SHADOW_MODE && (LEAD_INBOXES.size === 0 || LEAD_INBOXES.has(inboxId)) && content) {
        let leadPathShadow;
        try { leadPathShadow = require('./chatwoot-mila-bridge-lead.js'); } catch (_) { leadPathShadow = null; }
        if (leadPathShadow) {
          leadPathShadow.handleLead({
            payload, inboxId, conversationId, messageId, senderPhone, contactId, shadow: true,
            helpers: {
              log, runHermes, runHermesMeta, getChatwootConversation, sendChatwootMessage,
              setChatwootTypingStatus, setWahaPresence, getChatIdFromConversation,
              markProcessed, extractContent, INBOX_UNIT, MILA_SDR_HOME,
              chatwootBase: process.env.CHATWOOT_BASE_URL,
              chatwootToken: process.env.CHATWOOT_BOT_TOKEN,
              chatwootAccount: process.env.CHATWOOT_ACCOUNT_ID,
            },
          }).catch((err) => log('shadow_lead_erro', { conversation_id: conversationId, error: String(err?.message || err).slice(0, 300) }));
        }
      }
      return { action: 'not_sent', reason: 'lead_mode_disabled' };
    }
    if (LEAD_INBOXES.size > 0 && !LEAD_INBOXES.has(inboxId)) return { action: 'not_sent', reason: `lead_inbox_not_allowed_${inboxId}` };
    if (!conversationId) return { action: 'not_sent', reason: 'missing_conversation_id' };
    if (alreadyProcessed(messageId)) return { action: 'not_sent', reason: 'duplicate_message' };

    // ── Caminho de PROFESSOR (skip_professor_ia) — Mila não responde; avisa consultor ──
    let professorPath;
    try { professorPath = require('./chatwoot-mila-bridge-professor.js'); } catch (_) { professorPath = null; }
    if (professorPath && professorPath.isProfessor(payload)) {
      markProcessed(messageId, { conversation_id: conversationId, action: 'queued_professor' });
      return await professorPath.handleProfessor({
        payload, inboxId, conversationId, messageId,
        helpers: {
          log, extractContent, getWahaSession,
          chatwootBase: process.env.CHATWOOT_BASE_URL,
          chatwootToken: process.env.CHATWOOT_BOT_TOKEN,
          chatwootAccount: process.env.CHATWOOT_ACCOUNT_ID,
        },
      });
    }

    if (!content) return { action: 'not_sent', reason: 'empty_content' };
    markProcessed(messageId, { conversation_id: conversationId, action: 'queued_lead' });
    let leadPath;
    try { leadPath = require('./chatwoot-mila-bridge-lead.js'); }
    catch (e) { log('lead_module_load_error', { error: String(e?.message || e).slice(0, 300) }); return { action: 'error', reason: 'lead_module_missing' }; }
    return await leadPath.handleLead({
      payload, inboxId, conversationId, messageId, senderPhone, contactId,
      helpers: {
        log, runHermes, getChatwootConversation, sendChatwootMessage,
        setChatwootTypingStatus, setWahaPresence, getChatIdFromConversation,
        markProcessed, extractContent, INBOX_UNIT, MILA_SDR_HOME,
        chatwootBase: process.env.CHATWOOT_BASE_URL,
        chatwootToken: process.env.CHATWOOT_BOT_TOKEN,
        chatwootAccount: process.env.CHATWOOT_ACCOUNT_ID,
      },
    });
  }
  if (!conversationId) return { action: 'not_sent', reason: 'missing_conversation_id' };
  if (!content) return { action: 'not_sent', reason: 'empty_content' };
  if (alreadyProcessed(messageId)) return { action: 'not_sent', reason: 'duplicate_message' };

  // ── Ela foi chamada? ──────────────────────────────────────────────────────
  // Antes de QUALQUER sinal de vida: sem isto, ela aparece digitando no chat e
  // depois não responde -- que é pior que responder, porque deixa a pessoa
  // esperando. Por isso vem antes do typing do Chatwoot e da presença no WAHA.
  let contextoGuardado = [];
  if (CONSULTOR_GATILHO_ENABLED) {
    let decisao;
    try {
      decisao = gatilho.avaliar({
        texto: content,
        agora: Date.now(),
        estado: lerGatilho(senderPhone),
        opcoes: CONSULTOR_OPCOES,
      });
      gravarGatilho(senderPhone, decisao.estado);
    } catch (err) {
      // ⚠️ Falha do gatilho NÃO cala a Mila. Ele existe para ela falar menos,
      // não para virar um jeito novo de o consultor ficar sem resposta: disco
      // cheio ou JSON corrompido derrubariam o atendimento inteiro em silêncio.
      log('consultor_gatilho_erro', {
        conversation_id: conversationId,
        error: String(err?.message || err).slice(0, 300),
      });
      decisao = null;
    }
    if (decisao && !decisao.responder) {
      markProcessed(messageId, { conversation_id: conversationId, action: 'sem_gatilho' });
      log('consultor_sem_gatilho', {
        conversation_id: conversationId, message_id: messageId, inbox_id: inboxId,
        telefone: senderPhone, guardadas: decisao.estado.pendentes.length,
        preview: content.slice(0, 160),
      });
      return { action: 'not_sent', reason: 'consultor_sem_gatilho' };
    }
    if (decisao) {
      contextoGuardado = decisao.contexto;
      // telefone/inbox entram aqui porque sao o UNICO jeito de a aba Modo
      // Consultor do LA-OS dizer QUEM falou e de que unidade: medido em 08/09,
      // nenhum dos 58 `reply_sent` do historico carrega telefone, e o leitor nao
      // tem acesso ao Chatwoot para descobrir depois.
      log('consultor_acordou', {
        conversation_id: conversationId, message_id: messageId,
        inbox_id: inboxId, telefone: senderPhone,
        // `consultorNome` ja vem de governanca.quem_eh(senderPhone) la em cima.
        // Sem ele a aba Modo Consultor do LA-OS mostra o id da mensagem no
        // lugar da pessoa, e a pergunta "quem falou com a Mila" fica sem
        // resposta -- que e justamente para o que a aba existe.
        nome: consultorNome,
        // O que a PESSOA escreveu. O `consultor_sem_gatilho` ja guardava isso;
        // aqui faltava, e sem ele a janela de conversa do LA-OS mostraria so a
        // resposta da Mila, sem a pergunta que a gerou. Mesmo corte de 160.
        preview: content.slice(0, 160),
        motivo: decisao.motivo, com_contexto: contextoGuardado.length,
      });
    }
  }

  markProcessed(messageId, { conversation_id: conversationId, action: 'queued' });

  let typingOn = false;
  let wahaTypingOn = false;
  let currentConversation = null;

  // Em grupo o "digitando" vai para o GRUPO, nao para o autor -- senao a Mila
  // apareceria digitando no privado de quem falou.
  const earlyWahaChatId = grupoJid
    || (senderPhone && senderPhone.length >= 10 ? `${senderPhone}@c.us` : null);
  if (earlyWahaChatId && inboxId) {
    try { await setWahaPresence(inboxId, earlyWahaChatId, 'typing'); wahaTypingOn = true; } catch (_) {}
  }

  try {
    await setChatwootTypingStatus(conversationId, 'on');
    typingOn = true;
  } catch (err) {
    log('typing_error', { conversation_id: conversationId, stage: 'on', error: String(err?.message || err).slice(0, 200) });
  }

  try {
    currentConversation = await getChatwootConversation(conversationId);

    const cwSender = currentConversation?.meta?.sender || {};
    const effectiveSessionId = consultantMode ? `consultor-v2-${senderPhone}` : conversationId;
    // A caixa de entrada entra no prompt como PORTA, nunca como cerca.
    const escopoLinhas = escopoRede
      ? 'Escopo: REDE — as 3 unidades (Barra, Campo Grande, Recreio). Quem fala aqui lidera a rede: o que as '
        + 'ferramentas devolverem das três é dela por direito, e esconder qualquer parte disso é mentir.' + `\n`
        + `Caixa de entrada: ${INBOX_UNIT[inboxId] || 'desconhecida'} (é apenas a porta por onde ela escreveu, NÃO o limite do que ela enxerga)`
      : `Unidade: ${consultorUnidade || INBOX_UNIT[inboxId] || 'desconhecida'}`;
    let envioProativoPendente = null;
    if (consultantMode && CONTEXTO_PROATIVO_ENABLED && senderPhone) {
      try {
        envioProativoPendente = await rpcSupabase('mila_envio_proativo_pendente_v1',
          { p_telefone: senderPhone, p_horas: 36 });
      } catch (err) {
        log('contexto_proativo_erro', { conversation_id: conversationId,
          error: String(err?.message || err).slice(0, 200) });
      }
    }
    const prompt = consultantMode
      ? buildConsultantPrompt(cwSender.name || 'Consultor', senderPhone, escopoLinhas, content,
                               contextoGuardado, envioProativoPendente)
      : buildMilaPrompt(payload, currentConversation);
    const hermesHome = consultantMode ? pickHermesProfile(podeEditar) : undefined;
    // MILA_UNIDADE vai SEMPRE: e o carimbo que o MCP usa para recusar tool
    // chamada com unidade diferente da inbox. Fora do alcance do modelo.
    const extraEnv = {
      MILA_UNIDADE: INBOX_UNIT[inboxId] || '',
      ...(consultantMode ? {
        MILA_CONSULTOR_NOME: consultorNome,
        MILA_CONSULTOR_TELEFONE: senderPhone,
        MILA_CONSULTOR_UNIDADE: consultorUnidade,
        // Canal de origem do pedido. So o bridge do WhatsApp spawna por
        // mensagem, entao so aqui da para carimbar o canal. Sem esta env o
        // MCP grava 'desconhecido' -- nunca chuta (14/09/2026).
        MILA_CONSULTOR_CANAL: 'whatsapp',
        // 🔴 FAIL-CLOSED SO AQUI (09/09/2026). O config do perfil declara
        // MILA_CARIMBO_OBRIGATORIO: "${MILA_CARIMBO_OBRIGATORIO}", entao o valor
        // vem do ambiente do spawn. Como o bridge sobe um processo POR MENSAGEM,
        // "1" chega e o wrapper RECUSA iniciar o MCP sem saber quem pergunta --
        // ninguem e atendido com a identidade de outra pessoa.
        // O gateway (Telegram) e os crons nao exportam nada: la chega o
        // placeholder literal, o wrapper le como vazio e cai no fallback do
        // arquivo, que e o certo -- nao existe remetente para carimbar.
        // ⚠️ Antes da fusao a raiz nao tinha essa trava (servia so a diretoria).
        // Sem esta linha, a fusao teria REBAIXADO a seguranca dos 20.
        MILA_CARIMBO_OBRIGATORIO: '1',
      } : {}),
    };
    const reply = await runHermes(effectiveSessionId, prompt, 180000, hermesHome, undefined, extraEnv);

    if (!reply || reply.trim().length === 0) {
      markProcessed(messageId, { conversation_id: conversationId, action: 'empty_reply' });
      log('empty_reply', { conversation_id: conversationId, message_id: messageId });
      return { action: 'not_sent', reason: 'empty_reply' };
    }

    const sent = await sendChatwootMessage(conversationId, reply.trim());
    markProcessed(messageId, { conversation_id: conversationId, action: 'sent', sent_id: sent?.id });
    log('reply_sent', { conversation_id: conversationId, message_id: messageId, inbox_id: inboxId, telefone: senderPhone, nome: consultorNome, preview: reply.slice(0, 160) });
    if (consultantMode && CONTEXTO_PROATIVO_ENABLED && senderPhone) {
      rpcSupabase('mila_marcar_contexto_proativo_usado_v1', { p_telefone: senderPhone }).catch((err) => {
        log('contexto_proativo_marcar_erro', { conversation_id: conversationId,
          error: String(err?.message || err).slice(0, 200) });
      });
    }
    return { action: 'sent', sent_id: sent?.id };

  } catch (err) {
    const msg = String(err?.message || err).slice(0, 500);
    markProcessed(messageId, { conversation_id: conversationId, action: 'error', error: msg });
    log('reply_error', { conversation_id: conversationId, message_id: messageId, inbox_id: inboxId, telefone: senderPhone, nome: consultorNome, error: msg });
    return { action: 'error', error: msg };
  } finally {
    if (wahaTypingOn && currentConversation) {
      const chatId = getChatIdFromConversation(currentConversation);
      if (chatId && inboxId) {
        try { await setWahaPresence(inboxId, chatId, 'paused'); } catch (_) {}
      }
    }
    if (typingOn) {
      try { await setChatwootTypingStatus(conversationId, 'off'); } catch (_) {}
    }
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, service: 'chatwoot-mila-bridge', mode: MODE, port: PORT });
  }
  if (req.method !== 'POST' || url.pathname !== '/webhooks/chatwoot') {
    return send(res, 404, { ok: false, error: 'not_found' });
  }
  if (!authorized(req, url)) return send(res, 401, { ok: false, error: 'unauthorized' });

  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) req.destroy(); });
  req.on('end', async () => {
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch (_) { return send(res, 400, { ok: false, error: 'bad_json' }); }

    const event = extractEvent(payload);
    const conversationId = extractConversationId(payload);
    const state = updateState(payload);
    const incoming = isIncomingMessage(payload);

    send(res, 200, { ok: true, mode: MODE, received: true, conversation_id: conversationId, mila_allowed: !!state?.mila_allowed, action: 'accepted_async' });

    log('webhook_accepted', { event, conversation_id: conversationId, incoming, mila_allowed: !!state?.mila_allowed, mode: MODE, content_preview: extractContent(payload).slice(0, 160) });

    setImmediate(async () => {
      let result = { action: 'logged_only' };
      try { result = await processIncoming(payload, state); } catch (err) { result = { action: 'error', error: String(err?.message || err).slice(0, 500) }; }
      log('reply_result', { event, conversation_id: conversationId, incoming, mila_allowed: !!state?.mila_allowed, mode: MODE, reply_action: result.action, reply_reason: result.reason || null });
    });
  });
});

server.listen(PORT, HOST, () => {
  log('started', { host: HOST, port: PORT, mode: MODE });
  clearRememberedTyping().catch(() => {});
});
