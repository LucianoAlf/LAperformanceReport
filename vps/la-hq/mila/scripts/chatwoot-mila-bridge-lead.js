'use strict';
/**
 * chatwoot-mila-bridge-lead.js — caminho de LEAD do bridge (profile mila-sdr).
 *
 * Isolado do arquivo vivo do bridge: so e carregado quando LEAD_MODE_ENABLED=true.
 *
 * SEGURANCA CONTRA DUPLICIDADE (agent_bot = interruptor unico):
 *   Cada unidade tem um bot Hermes proprio (Milla Hermes Barra/CG/Recreio).
 *   O bridge SO responde o lead quando o bot Hermes da unidade esta atribuido
 *   a inbox. Se estiver o bot do n8n (ou nenhum), o bridge fica quieto.
 *   Como o Chatwoot so permite 1 agent_bot por inbox, nunca ha duplicidade:
 *   ou responde o n8n, ou responde o bridge — nunca os dois.
 *   Cutover = set_agent_bot(inbox, botHermes). Rollback = set_agent_bot(inbox, botN8n).
 *
 * IDENTIDADE: o bridge posta a resposta com o TOKEN do bot Hermes da unidade,
 *   entao a mensagem aparece como "Milla Hermes <unidade>".
 *
 * MVP (Barra): guard + gates + prompt + roteamento + fracionamento.
 * TODO(incrementos): audio in/out, imagem, personas por sentimento,
 *   espelho de memoria em n8n_chat_histories.
 */

const fs = require('fs');
const media = require('./mila-sdr-media.js');
const { logShadowSimulation } = require('./mila-shadow-log.js');
const { modeloConfigurado, detectaFallback } = require('./mila-modelo.js');

// DRY-RUN: com MILA_SDR_DRY_RUN=true, nada e enviado ao WhatsApp — so loga o que
// seria enviado. Evita risco de ban do numero em testes.
const DRY_RUN = process.env.MILA_SDR_DRY_RUN === 'true';

// ── MODO SOMBRA: sidecar de tool calls gravado por mila-sdr-tools quando ──────
// MILA_SDR_DRY_RUN=true (ver Task 2). Usado pra ler as tool calls simuladas
// desta execucao e anexar no registro de auditoria (mila.chatwoot_simulations).
const SHADOW_TOOLCALLS_FILE = '/home/mila/.openclaw/workspace/memory/shadow-tool-calls.jsonl';
function safeFileSize(path) {
  try { return fs.statSync(path).size; } catch (_) { return 0; }
}
function readToolCallsSince(path, offsetBytes) {
  try {
    // Buffer (nao string): o offset vem de statSync e e em BYTES. Cortar uma
    // string por esse numero desalinha assim que aparece acento/emoji (UTF-8 multi-byte).
    const buf = fs.readFileSync(path);
    const slice = buf.subarray(offsetBytes).toString('utf8');
    return slice.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

const HOME = '/home/mila';
const UNITS_MD = `${HOME}/UNITS.md`;
const ATENDIMENTO_MD = `${HOME}/ATENDIMENTO.md`;

// ── Chave de sessao do Hermes por PESSOA+UNIDADE (nao por conversa do Chatwoot) ──
// Assim a memoria acompanha o lead mesmo que o Chatwoot abra uma conversa nova
// depois. A unidade vem SEMPRE do inbox_id (fixo), nunca de texto do lead.
function unidadeSlug(unidade) { return String(unidade || '').replace(/[^A-Za-z0-9]/g, ''); }
function sessionKeyFor(unidade, phone) {
  return `${unidadeSlug(unidade)}-${String(phone || '').replace(/\D/g, '')}`;
}

// ── Marcador de "primeiro turno" (pra semear o historico do n8n so 1x por lead) ──
// Mesmo padrao dos outros state files do bridge. Zero dependencia nova (sem sqlite).
const SEED_FILE = `${HOME}/.openclaw/workspace/memory/chatwoot-mila-seeded.json`;
let _seeded = null;
function loadSeeded() {
  if (_seeded) return _seeded;
  try { _seeded = new Set(JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))); }
  catch (_) { _seeded = new Set(); }
  return _seeded;
}
function markSeeded(key) {
  const s = loadSeeded();
  if (s.has(key)) return;
  s.add(key);
  try { fs.writeFileSync(SEED_FILE, JSON.stringify([...s])); } catch (_) {}
}
function formatHistorico(hist) {
  return hist
    .map((m) => `${m.type === 'ai' ? 'Mila' : 'Lead'}: ${String(m.content).replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

// ── Debounce de ENTRADA (como o n8n): junta mensagens picadas do lead antes de ──
// acionar o agente. Buffer + timer em memória (bridge é processo único de longa vida).
const LEAD_DEBOUNCE_MS = Number(process.env.LEAD_DEBOUNCE_MS || 9000);
const _leadBuffer = new Map();   // convId -> [{ messageId, content, imagePath, leadMandouAudio }]
const _leadLastMsg = new Map();  // convId -> messageId (último da rajada)

// ── Buffer de SAÍDA do n8n (ver FISC-4) ──────────────────────────────────────
// A sombra só via a mensagem do LEAD; a partir do turno 2 ela nunca soube o que
// o n8n respondeu de verdade, e o contexto dela divergia do que o lead viveu
// (prova: conversa 20211, ela leu "Ricardo" como resposta à PRÓPRIA pergunta,
// quando era resposta à pergunta do n8n). O webhook de conta já entrega esse
// outgoing na mesma porta 3211 — só estava sendo descartado. Consumido pelo
// turno SEGUINTE (ver handleLead), nunca pelo mesmo turno que o gerou.
const _n8nReplyBuffer = new Map(); // convId -> [string]
function bufferN8nOutgoing(conversationId, text) {
  if (!conversationId || !text) return;
  const arr = _n8nReplyBuffer.get(conversationId) || [];
  arr.push(String(text));
  _n8nReplyBuffer.set(conversationId, arr);
}
function consumeN8nBuffer(conversationId) {
  const arr = _n8nReplyBuffer.get(conversationId) || [];
  _n8nReplyBuffer.delete(conversationId);
  return arr;
}

// inbox_id -> bot Hermes da unidade (id + token pra postar).
const UNIT_BOTS = {
  '147': { unit: 'Barra', hermesBotId: 309, token: process.env.HERMES_BOT_TOKEN_BARRA },
  '155': { unit: 'Campo Grande', hermesBotId: 310, token: process.env.HERMES_BOT_TOKEN_CG },
  '148': { unit: 'Recreio', hermesBotId: 311, token: process.env.HERMES_BOT_TOKEN_RECREIO },
};

// Secretaria por unidade (aluno-ativo redireciona pra ca).
const SECRETARIA = {
  'Campo Grande': 'https://wa.me/5521965529851',
  Barra: 'https://wa.me/5521969575619',
  Recreio: 'https://wa.me/552139551135',
};

// ── Cache do agent_bot atribuido por inbox (evita 1 chamada Chatwoot por msg) ──
const _botCache = new Map(); // inboxId -> { botId, ts }
async function assignedBotId(ctx, inboxId) {
  const now = Date.now();
  const c = _botCache.get(inboxId);
  if (c && now - c.ts < 60000) return c.botId;
  const { chatwootBase, chatwootToken, chatwootAccount } = ctx.helpers;
  try {
    const res = await fetch(
      `${String(chatwootBase).replace(/\/$/, '')}/api/v1/accounts/${chatwootAccount}/inboxes/${inboxId}/agent_bot`,
      { headers: { 'api_access_token': chatwootToken } }
    );
    const j = await res.json();
    const botId = j?.agent_bot?.id ?? null;
    _botCache.set(inboxId, { botId, ts: now });
    return botId;
  } catch (_) { return c ? c.botId : null; }
}

// Posta como o bot Hermes da unidade (identidade correta).
async function sendAsHermesBot(ctx, convId, content, token, forceDryRun = false) {
  if (DRY_RUN || forceDryRun) { ctx.helpers.log('DRY_RUN_send', { conversation_id: convId, content: String(content).slice(0, 300), shadow: !!forceDryRun }); return { id: 'dry' }; }
  const { chatwootBase, chatwootAccount } = ctx.helpers;
  const res = await fetch(
    `${String(chatwootBase).replace(/\/$/, '')}/api/v1/accounts/${chatwootAccount}/conversations/${convId}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api_access_token': token },
      body: JSON.stringify({ content, message_type: 'outgoing', private: false }),
    }
  );
  const raw = await res.text();
  if (!res.ok) throw new Error(`chatwoot_send_http_${res.status}: ${raw.slice(0, 200)}`);
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

async function chatwootLabels(ctx, contactId) {
  const { chatwootBase, chatwootToken, chatwootAccount } = ctx.helpers;
  if (!chatwootBase || !chatwootToken || !chatwootAccount || !contactId) return [];
  try {
    const res = await fetch(`${String(chatwootBase).replace(/\/$/, '')}/api/v1/accounts/${chatwootAccount}/contacts/${contactId}/labels`,
      { headers: { 'api_access_token': chatwootToken } });
    if (!res.ok) return [];
    const j = await res.json();
    return (j?.payload || []).map(s => String(s).toLowerCase());
  } catch (_) { return []; }
}

// ── Montagem do prompt por unidade (fonte unica: UNITS.md + ATENDIMENTO.md) ────
let _unitsCache = null, _atendimentoCache = null;
function readFileCached(path, which) {
  try {
    if (which === 'units' && _unitsCache) return _unitsCache;
    if (which === 'atend' && _atendimentoCache) return _atendimentoCache;
    const txt = fs.readFileSync(path, 'utf8');
    if (which === 'units') _unitsCache = txt; else _atendimentoCache = txt;
    return txt;
  } catch (_) { return ''; }
}

function extractUnitSection(unitsMd, unidade) {
  const lines = unitsMd.split(/\r?\n/);
  const startIdx = lines.findIndex(l => /^##\s+/.test(l) && l.toLowerCase().includes(unidade.toLowerCase()));
  if (startIdx === -1) return '';
  const out = [lines[startIdx]];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

function otherUnitsSummary(unitsMd, unidade) {
  const units = ['Campo Grande', 'Recreio', 'Barra'].filter(u => u.toLowerCase() !== unidade.toLowerCase());
  return units.map(u => extractUnitSection(unitsMd, u)).filter(Boolean).join('\n\n');
}

// -- Instrumentos da unidade, injetados a cada turno -------------------------
// Le o MESMO arquivo que a tool consultar_catalogo grava (TTL 6h). Leitura de
// disco: zero chamada ao Emusys por mensagem.
const CATALOGO_CACHE = '/home/mila/.openclaw/workspace/memory/catalogo-cursos.json';
const CATALOGO_VALIDADE_MS = 48 * 60 * 60 * 1000;

function catalogoBloco(unidade) {
  let cache;
  try { cache = JSON.parse(fs.readFileSync(CATALOGO_CACHE, 'utf8')); }
  catch (e) { return { bloco: '', motivo: 'cache_ilegivel' }; }
  const u = cache && cache[unidade];
  if (!u || !Array.isArray(u.instrumentos) || !u.instrumentos.length) {
    return { bloco: '', motivo: 'unidade_ausente' };
  }
  // Catalogo velho vale mais que nenhum: so recusa depois de 48h sem renovar,
  // quando a chance de a grade ter mudado deixa de ser desprezivel.
  if (Date.now() - (u.em || 0) > CATALOGO_VALIDADE_MS) {
    return { bloco: '', motivo: 'cache_vencido_48h' };
  }
  const bloco = `
## INSTRUMENTOS QUE A UNIDADE ${unidade.toUpperCase()} ENSINA (fonte: Emusys)
${u.instrumentos.join(', ')}

Esta lista e a UNICA fonte sobre o que a escola ensina. NUNCA afirme nem negue um
instrumento de memoria, e NUNCA ofereca o que nao esta aqui. Se o lead pedir algo
fora da lista, diga que a unidade nao oferece e transfira com situacao="Tratativa".
`;
  return { bloco, motivo: null };
}

// -- Base de conhecimento (diferenciais, formato de aula, faixas etarias, --------
// beneficios), injetada a cada turno. Fonte: mesma edge function do LAReport que
// o n8n usa (NAO o Help Center do Chatwoot -- URL velha, 1 artigo de set/2025 com
// so 3 instrumentos, ver TOOLS.md). Medido 29/08 nas 3 unidades do n8n: so 1 em
// 10 conversas reais chamava a tool equivalente -- mesmo padrao de baixa adesao
// do catalogo (FISC-2) -- por isso injecao no envelope, nao tool `auto` no MCP.
// Cache em MEMORIA (nao em disco, ao contrario do catalogo): o bridge e processo
// unico de longa vida, e o conteudo e quase estatico (medido: byte-a-byte igual
// nas 3 unidades) -- TTL generoso evita bater na edge function toda mensagem.
const BD_CONHECIMENTO_URL = process.env.BD_CONHECIMENTO_URL;
const BD_CONHECIMENTO_TOKEN = process.env.BD_CONHECIMENTO_TOKEN;
const BD_CONHECIMENTO_VALIDADE_MS = 24 * 60 * 60 * 1000;
const _bdConhecimentoCache = new Map(); // unidadeSlug -> { bloco, em }

function unidadeParaQuery(unidade) {
  return String(unidade || '').toLowerCase();
}

async function bdConhecimentoBloco(unidade) {
  const slug = unidadeParaQuery(unidade);
  const cached = _bdConhecimentoCache.get(slug);
  if (cached && Date.now() - cached.em < BD_CONHECIMENTO_VALIDADE_MS) return { bloco: cached.bloco, motivo: null };
  if (!BD_CONHECIMENTO_URL || !BD_CONHECIMENTO_TOKEN) {
    return { bloco: cached ? cached.bloco : '', motivo: cached ? 'sem_credencial_usando_cache_velho' : 'sem_credencial' };
  }
  try {
    const url = `${BD_CONHECIMENTO_URL}?unidade=${encodeURIComponent(slug)}&token=${BD_CONHECIMENTO_TOKEN}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const texto = (await res.text()).trim();
    if (!texto) throw new Error('vazio');
    const bloco = `
## BASE DE CONHECIMENTO OFICIAL DA LA MUSIC (fonte: LAReport)
${texto}

Use isto para responder sobre diferenciais, formato de aula, faixas etarias e
beneficios. Se a resposta nao estiver aqui, NAO invente: siga o atendimento
normalmente e conduza para a aula experimental.
`;
    _bdConhecimentoCache.set(slug, { bloco, em: Date.now() });
    return { bloco, motivo: null };
  } catch (e) {
    // Cache velho vale mais que nada -- mesmo principio do catalogo. Sem cache
    // nenhum, o silencio e o certo: ela ja tem o SOUL/UNITS pra nao inventar.
    return { bloco: cached ? cached.bloco : '', motivo: `fetch_falhou(${String(e?.message || e).slice(0, 60)})` };
  }
}

function buildLeadPrompt(unidade, contactName, phone, convId, content, persona, historico, catBloco, bdBloco) {
  const unitsMd = readFileCached(UNITS_MD, 'units');
  const atendMd = readFileCached(ATENDIMENTO_MD, 'atend');
  const secaoUnidade = extractUnitSection(unitsMd, unidade) || `(sem dados de ${unidade} em UNITS.md)`;
  const outras = otherUnitsSummary(unitsMd, unidade);
  const tom = persona ? `\n## AJUSTE DE TOM (pelo humor do lead)\n${persona}\n` : '';
  const histBloco = historico
    ? `\n## HISTÓRICO ANTERIOR (a conversa já vinha acontecendo — continue de onde parou, NÃO repita perguntas que o lead já respondeu)\n${historico}\n`
    : '';

  return `[ATENDIMENTO DE LEAD — WhatsApp]
Você está atendendo um lead novo da unidade **${unidade}**. Aplique SÓ as regras desta unidade.
${tom}
## UNIDADE DO LEAD (${unidade})
${secaoUnidade}

## OUTRAS UNIDADES (só para responder se o lead perguntar; NUNCA ofereça outra unidade)
${outras}

## FLUXO DE ATENDIMENTO
${atendMd}
${catBloco || ''}${bdBloco || ''}${histBloco}
## LEAD
- Nome: ${contactName}
- Telefone: ${phone}
- Conversa_ID: ${convId}

## MENSAGEM DO LEAD
${content}

Responda como Mila (persona no SOUL), curta e calorosa, seguindo o fluxo. Use as tools update_emusys/transferir quando o fluxo pedir. Se precisar mandar mais de uma mensagem, separe cada uma por uma linha em branco (\\n\\n).`;
}

// ── Prompt enxuto pra unidades com skill Hermes propria (so Barra por agora) ──
// Nao injeta ATENDIMENTO.md/UNITS.md — confia no Hermes carregar a skill
// mila-atendimento sozinho, pela description. Ver docs/specs/2026-07-30-mila-atendimento-skill-design.md.
function buildLeadPromptSkill(contactName, phone, convId, content, persona, historico, catBloco, bdBloco) {
  const tom = persona ? `\n## AJUSTE DE TOM (pelo humor do lead)\n${persona}\n` : '';
  const histBloco = historico
    ? `\n## HISTÓRICO ANTERIOR (a conversa já vinha acontecendo — continue de onde parou, NÃO repita perguntas que o lead já respondeu)\n${historico}\n`
    : '';
  return `[ATENDIMENTO DE LEAD — WhatsApp, unidade Barra]
${tom}${catBloco || ''}${bdBloco || ''}${histBloco}
## LEAD
- Nome: ${contactName}
- Telefone: ${phone}
- Conversa_ID: ${convId}

## MENSAGEM DO LEAD
${content}

Responda como Mila, seguindo o fluxo de atendimento da Barra. Se precisar mandar mais de uma mensagem, separe cada uma por uma linha em branco (\n\n).`;
}

// ── Handler principal ─────────────────────────────────────────────────────────
async function handleLead(ctx) {
  const { payload, inboxId, conversationId, messageId, senderPhone, contactId, helpers, shadow } = ctx;
  const isShadow = !!shadow;
  const startedAt = Date.now();
  const { log, runHermes, runHermesMeta, getChatwootConversation, setChatwootTypingStatus,
    markProcessed, extractContent, INBOX_UNIT, MILA_SDR_HOME } = helpers;

  const botCfg = UNIT_BOTS[inboxId];
  if (!botCfg) return { action: 'not_sent', reason: `inbox_sem_bot_hermes_${inboxId}` };
  if (!botCfg.token) return { action: 'not_sent', reason: `sem_token_bot_${botCfg.unit}` };

  // BYPASS DE TESTE: numeros em LEAD_TEST_PHONES pulam a trava (pra testar sem
  // cutover, sem expor lead real). Vazio em producao. So pra validacao controlada.
  const TEST_PHONES = new Set(
    (process.env.LEAD_TEST_PHONES || '').split(',').map(s => String(s).replace(/\D/g, '')).filter(Boolean)
  );
  const isTest = TEST_PHONES.has(String(senderPhone || '').replace(/\D/g, ''));

  // TRAVA: so responde se o bot Hermes desta unidade estiver atribuido a inbox.
  // Se for o bot do n8n (ou nenhum), fica quieto — o n8n cuida. Sem duplicidade.
  const assigned = await assignedBotId(ctx, inboxId);
  if (!isTest && !isShadow && assigned !== botCfg.hermesBotId) {
    return { action: 'not_sent', reason: `bot_hermes_nao_atribuido(assigned=${assigned},esperado=${botCfg.hermesBotId})` };
  }
  if (isTest) log('lead_test_bypass', { conversation_id: conversationId, phone: senderPhone });

  const unidade = INBOX_UNIT[inboxId] || botCfg.unit;
  let content = extractContent(payload);
  const chatwootToken = helpers.chatwootToken;

  // ── INCREMENTO: anexo (audio → transcreve; imagem → baixa pro --image) ──────
  // ANTES do debounce, por mensagem — pra rajada com áudio virar texto certo.
  let imagePath = null;
  let leadMandouAudio = false;
  try {
    const att = media.extractAttachment(payload);
    if (att && att.type === 'audio') {
      leadMandouAudio = true;
      const txt = await media.transcribeAudio(att.url, chatwootToken);
      if (txt) content = txt;
      log('lead_audio_transcrito', { conversation_id: conversationId, preview: String(content).slice(0, 120) });
    } else if (att && att.type === 'image') {
      imagePath = await media.downloadImage(att.url, chatwootToken);
      if (!content) content = '(o lead enviou uma imagem — veja em anexo)';
    }
  } catch (e) { log('lead_media_in_error', { conversation_id: conversationId, error: String(e?.message || e).slice(0, 200) }); }

  if (!content && !imagePath) {
    markProcessed(messageId, { conversation_id: conversationId, action: 'empty_content' });
    return { action: 'not_sent', reason: 'empty_content' };
  }

  // ── DEBOUNCE DE ENTRADA (como o n8n): junta mensagens picadas numa janela de ──
  // ~9s e responde UMA vez. Se chegar msg nova, este ciclo desiste; a última cuida
  // do buffer inteiro. Evita responder mensagem pela metade / responder em dobro.
  {
    const buf = _leadBuffer.get(conversationId) || [];
    buf.push({ messageId, content: content || '', imagePath, leadMandouAudio });
    _leadBuffer.set(conversationId, buf);
    _leadLastMsg.set(conversationId, messageId);
    await new Promise((r) => setTimeout(r, LEAD_DEBOUNCE_MS));
    if (_leadLastMsg.get(conversationId) !== messageId) {
      return { action: 'not_sent', reason: 'lead_debounced' };
    }
    const bundle = _leadBuffer.get(conversationId) || [];
    _leadBuffer.delete(conversationId);
    _leadLastMsg.delete(conversationId);
    const joined = bundle.map((b) => b.content).filter(Boolean).join('\n');
    if (joined) content = joined;
    imagePath = bundle.map((b) => b.imagePath).filter(Boolean).pop() || imagePath;
    leadMandouAudio = bundle.some((b) => b.leadMandouAudio);
    if (bundle.length > 1) log('lead_debounce_merged', { conversation_id: conversationId, msgs: bundle.length, preview: String(content).slice(0, 120) });
  }

  // GATE 1: aluno-ativo → redireciona pra secretaria, nao atende como SDR.
  const labels = await chatwootLabels(ctx, contactId);
  if (labels.includes('aluno-ativo')) {
    const link = SECRETARIA[unidade];
    if (link) {
      try { await sendAsHermesBot(ctx, conversationId, `Oi! Vi aqui que você já é aluno da LA Music 🎵 Para atendimento de alunos (aulas, horários, pagamentos), fala direto com a nossa secretaria: ${link}`, botCfg.token, isShadow); } catch (_) {}
    }
    markProcessed(messageId, { conversation_id: conversationId, action: 'aluno_ativo_redirect' });
    log('lead_aluno_ativo', { conversation_id: conversationId, unidade });
    return { action: 'not_sent', reason: 'aluno_ativo' };
  }

  let conversation = null;
  try { conversation = await getChatwootConversation(conversationId); } catch (_) {}

  // GATE 2: so responde conversa pending (se ja tem consultor/resolvida, nao intervem).
  const status = conversation?.status || payload?.conversation?.status;
  if (status && status !== 'pending') {
    markProcessed(messageId, { conversation_id: conversationId, action: 'status_not_pending' });
    return { action: 'not_sent', reason: `status_${status}` };
  }

  const sender = conversation?.meta?.sender || {};
  const contactName = sender.name || 'Lead';
  const phone = sender.phone_number || senderPhone || '';

  // ── INCREMENTO: persona por sentimento ──────────────────────────────────────
  let persona = '';
  try {
    const cat = await media.classifySentiment(content);
    persona = media.PERSONAS[cat] || '';
  } catch (_) {}

  // ── Sessao por pessoa+unidade + seed do historico do n8n no 1o turno ─────────
  const sessKey = (isShadow ? 'shadow-' : '') + sessionKeyFor(unidade, phone);
  const firstTurn = !loadSeeded().has(sessKey);
  let historico = '';
  if (firstTurn) {
    try {
      const hist = await media.fetchN8nHistory(phone, 20);
      if (hist.length) {
        historico = formatHistorico(hist);
        log('lead_seed_historico', { conversation_id: conversationId, sessKey, msgs: hist.length });
      }
    } catch (e) { log('lead_seed_error', { conversation_id: conversationId, error: String(e?.message || e).slice(0, 200) }); }
  }
  // A partir do 2o turno o seed acima nao roda mais -- e o buffer de saida do
  // n8n (ver FISC-4) que mantem ela alinhada com o que o lead realmente viu.
  // Sempre consome (nunca so no firstTurn): junta com o seed quando os dois
  // coexistem no mesmo turno.
  const n8nBuf = consumeN8nBuffer(conversationId);
  if (n8nBuf.length) {
    const linhas = n8nBuf.map((t) => `Mila: ${t.replace(/\s+/g, ' ').trim()}`).join('\n');
    historico = historico ? `${historico}\n${linhas}` : linhas;
    log('lead_n8n_buffer_consumido', { conversation_id: conversationId, sessKey, msgs: n8nBuf.length });
  }

  let typingOn = false;
  if (!isShadow) { try { await setChatwootTypingStatus(conversationId, 'on'); typingOn = true; } catch (_) {} }

  // Sem o bloco ela volta a afirmar de memoria -- que e o defeito. Nao pode
  // sumir em silencio: o motivo vai pro log.
  const cat = catalogoBloco(unidade);
  if (!cat.bloco) log('lead_catalogo_ausente', { conversation_id: conversationId, unidade, motivo: cat.motivo });
  const bd = await bdConhecimentoBloco(unidade);
  if (!bd.bloco) log('lead_bd_conhecimento_ausente', { conversation_id: conversationId, unidade, motivo: bd.motivo });
  try {
    const prompt = (unidade === 'Barra')
      ? buildLeadPromptSkill(contactName, phone, conversationId, content, persona, historico, cat.bloco, bd.bloco)
      : buildLeadPrompt(unidade, contactName, phone, conversationId, content, persona, historico, cat.bloco, bd.bloco);
    const toolcallsOffsetBefore = isShadow ? safeFileSize(SHADOW_TOOLCALLS_FILE) : 0;
    // No modo sombra usamos a variante que devolve o stderr, so pra registrar de
    // qual modelo veio a resposta (ver logShadowSimulation abaixo). Se o bridge
    // ainda nao expuser runHermesMeta, cai no runHermes de sempre.
    let hermesStderr = '';
    let reply;
    if (isShadow && typeof runHermesMeta === 'function') {
      const r = await runHermesMeta(sessKey, prompt, 180000, MILA_SDR_HOME, imagePath, { MILA_SDR_DRY_RUN: 'true', MILA_UNIDADE: unidade });
      reply = r.text;
      hermesStderr = r.stderr || '';
    } else {
      reply = await runHermes(sessKey, prompt, 180000, MILA_SDR_HOME, imagePath, isShadow ? { MILA_SDR_DRY_RUN: 'true', MILA_UNIDADE: unidade } : { MILA_UNIDADE: unidade });
    }
    // Sessao Hermes ja existe agora: nao semear de novo nas proximas msgs.
    markSeeded(sessKey);
    if (imagePath) { try { fs.unlinkSync(imagePath); } catch (_) {} }

    const cleaned = String(reply || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
    if (!cleaned) {
      markProcessed(messageId, { conversation_id: conversationId, action: 'empty_reply' });
      return { action: 'not_sent', reason: 'empty_reply' };
    }
    const partes = cleaned.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    let sentId = null;

    if (leadMandouAudio) {
      // ── INCREMENTO: audio out (TTS) — lead mandou audio, responde em audio. ──
      // Em modo sombra, NUNCA gasta TTS real (ElevenLabs) nem tenta upload real de
      // audio no Chatwoot: cai direto no mesmo caminho de fallback de texto (via
      // sendAsHermesBot com isShadow, que ja e gateado corretamente).
      if (isShadow) {
        for (let i = 0; i < partes.length; i++) {
          const sent = await sendAsHermesBot(ctx, conversationId, partes[i], botCfg.token, isShadow);
          sentId = sent?.id || sentId;
          if (i < partes.length - 1) await new Promise(r => setTimeout(r, 2500));
        }
      } else {
        try {
          const audioBuf = await media.synthesizeTTS(cleaned);
          const up = await media.uploadAudio(conversationId, audioBuf, botCfg.token, helpers.chatwootBase, helpers.chatwootAccount, isShadow);
          sentId = up?.id || sentId;
        } catch (e) {
          log('lead_tts_error_fallback_texto', { conversation_id: conversationId, error: String(e?.message || e).slice(0, 200) });
          for (let i = 0; i < partes.length; i++) {
            const sent = await sendAsHermesBot(ctx, conversationId, partes[i], botCfg.token, isShadow);
            sentId = sent?.id || sentId;
            if (i < partes.length - 1) await new Promise(r => setTimeout(r, 2500));
          }
        }
      }
    } else {
      for (let i = 0; i < partes.length; i++) {
        const sent = await sendAsHermesBot(ctx, conversationId, partes[i], botCfg.token, isShadow);
        sentId = sent?.id || sentId;
        if (i < partes.length - 1) await new Promise(r => setTimeout(r, 2500));
      }
    }

    if (isShadow) {
      // NUNCA espelha em n8n_chat_histories no modo sombra — essa tabela e a
      // memoria real que o n8n usa, nao pode receber registro fantasma.
      const toolCalls = readToolCallsSince(SHADOW_TOOLCALLS_FILE, toolcallsOffsetBefore);
      const transferCall = toolCalls.find((t) => t.tool === 'transferir');
      const cfgModelo = modeloConfigurado(MILA_SDR_HOME);
      await logShadowSimulation({
        inboxId, conversationId, contactId, unit: unidade,
        contactName, phone,
        leadMessage: content, simulatedReply: cleaned,
        transferReason: transferCall?.args?.situacao || null,
        toolCalls, latencyMs: Date.now() - startedAt, error: null,
        modelo: cfgModelo.model, provider: cfgModelo.provider,
        emFallback: detectaFallback(hermesStderr),
      });
      markProcessed(messageId, { conversation_id: conversationId, action: 'shadow_logged' });
      log('lead_shadow_logged', { conversation_id: conversationId, unidade, partes: partes.length, tool_calls: toolCalls.length });
      return { action: 'shadow_logged' };
    }

    // ── INCREMENTO: espelho em n8n_chat_histories (backup, 3 travas anti-dup) ──
    try { await media.mirrorToPostgres(phone, content, cleaned, messageId); }
    catch (e) { log('lead_mirror_error', { conversation_id: conversationId, error: String(e?.message || e).slice(0, 200) }); }

    markProcessed(messageId, { conversation_id: conversationId, action: 'sent', sent_id: sentId });
    log('lead_reply_sent', { conversation_id: conversationId, unidade, partes: partes.length, audio: leadMandouAudio, preview: cleaned.slice(0, 160) });
    return { action: 'sent', sent_id: sentId };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 500);
    if (isShadow) {
      await logShadowSimulation({
        inboxId, conversationId, contactId, unit: unidade,
        contactName, phone,
        leadMessage: content, simulatedReply: null,
        transferReason: null, toolCalls: [], latencyMs: Date.now() - startedAt, error: msg,
        // Aqui o stderr chega dentro da propria mensagem de erro
        // ("hermes_exit_N: <stderr>"), entao a deteccao roda sobre ela.
        modelo: modeloConfigurado(MILA_SDR_HOME).model,
        provider: modeloConfigurado(MILA_SDR_HOME).provider,
        emFallback: detectaFallback(msg),
      }).catch(() => {});
    }
    markProcessed(messageId, { conversation_id: conversationId, action: 'error', error: msg });
    log('lead_reply_error', { conversation_id: conversationId, error: msg, shadow: isShadow });
    return { action: 'error', error: msg };
  } finally {
    if (typingOn) { try { await setChatwootTypingStatus(conversationId, 'off'); } catch (_) {} }
  }
}

module.exports = { handleLead, buildLeadPrompt, buildLeadPromptSkill, extractUnitSection, assignedBotId, sessionKeyFor, formatHistorico, bufferN8nOutgoing, bdConhecimentoBloco };
