#!/usr/bin/env node
// A TRANSCRIÇÃO DO ÁUDIO VEM DA API, NÃO DO WEBHOOK (08/09/2026).
//
// 🔴 O CASO: a Anne Krissya mandou dois áudios (16:56 e 17:03) e o Luciano um
//    (17:38). A Mila ficou muda nos três. No log: `reply_reason: empty_content`.
//
// 🔴 ESTE PATCH CORRIGE UM CONSERTO MEU DE HOJE QUE ESTAVA ERRADO. Às 15:24 eu
//    fiz `extractContent` cair para `attachments[].transcribed_text`, e escrevi
//    que "o Chatwoot já transcreveu, a frase estava lá, pronta". **Estava — mas
//    no GET da API, não no webhook.** Eu validei lendo a mensagem 4548773 pela
//    API, horas depois de ela chegar; nunca conferi o que o webhook entrega.
//    Testar no artefato errado é o mesmo erro de "código no disco não é código
//    rodando".
//
// 🔴 A MEDIÇÃO QUE FECHA O DIAGNÓSTICO:
//
//      msg 4552359 criada em          16:56:19 UTC
//      ponte logou `empty_content` em 16:56:21 UTC   (2s depois)
//      GET da API, agora              → "Mila, os leads das três unidades
//                                        estão há muito tempo sem atendimento?"
//
//      varredura de 14 conversas: **12 áudios, 12 transcritos, ZERO sem** —
//      inclusive conversas de lead de agosto que ninguém da equipe abre. Ou
//      seja, a transcrição é automática na conta; o que não a carrega é o
//      PAYLOAD DO WEBHOOK (o `push_event_data` do anexo não tem o campo — dá
//      para ver pela diferença de chaves: o GET traz `content_type` e
//      `transcribed_text`, o webhook não).
//
// ⚠️ NÃO É PERMISSÃO — foi a primeira hipótese e ela caiu. O `CHATWOOT_BOT_TOKEN`
//    que a ponte usa lê a transcrição (HTTP 200) e é aceito pelo endpoint de
//    transcrever (que respondeu 422 "não tem áudio pendente", ou seja: token
//    válido, áudio já transcrito).
//
// ⚠️ NÃO DÁ PARA MANDAR O ÁUDIO AO HERMES por esta via: `hermes chat` tem
//    `--image` e **não tem** `--audio` (conferido no `--help`). E, mesmo que
//    tivesse, transcrever de novo criaria uma SEGUNDA fonte para a mesma frase —
//    a equipe leria um texto no Chatwoot e a Mila responderia a outro. A
//    transcrição do Chatwoot é a que o humano vê; é ela que vale.
//
// ── COMO FICA ──────────────────────────────────────────────────────────────
// Quando a mensagem de entrada chega SEM texto, a ponte vai buscar na API o que
// aquela mensagem realmente é, e **completa o payload** (`payload.content`).
// Completar o payload, e não só a variável local, é o que faz a correção valer
// para TODO mundo que lê depois — `buildMilaPrompt`, o caminho de lead, o
// buffer — sem reimplementar a regra em cada um. Uma fonte, um lugar.
//
// ⚠️ Custo: `empty_content` aconteceu **8 vezes em 3 meses** (4 delas hoje, os
//    áudios). Não é caminho quente; a chamada extra é irrelevante.
//
// ⚠️ Espera limitada (0 / 1,5s / 3s). A transcrição é um trabalho assíncrono e o
//    webhook chega ~2s depois da criação — pode ser que ainda não esteja pronta.
//    Se depois disso continuar sem texto, o comportamento é **o mesmo de hoje**:
//    silêncio. Não invento marcador tipo "[áudio recebido]" — fazer a Mila
//    responder a uma frase que ela não leu é pior que não responder.
//
// ⚠️ Na 2ª tentativa ela PEDE a transcrição (`POST .../audio_transcription`),
//    que é exatamente o que a interface do Chatwoot faz. Não é fonte nova: é o
//    mesmo motor, acionado sob demanda quando o automático ainda não chegou.
const fs = require('fs');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/chatwoot-mila-bridge.js';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('resolverTranscricaoDeAudio')) { console.log('ja aplicado'); process.exit(0); }

const Q = String.fromCharCode(39);

function trocar(velho, novo, rotulo) {
  const n = s.split(velho).length - 1;
  if (n !== 1) { console.error('ANCORA ' + rotulo + ': esperava 1, achei ' + n); process.exit(1); }
  s = s.split(velho).join(novo);
}

// ── 1. o buscador ──────────────────────────────────────────────────────────
const HELPER = [
  '// 🔴 O WEBHOOK DO CHATWOOT NAO CARREGA `transcribed_text` — so o GET da API.',
  '//    Medido em 08/09: audio criado 16:56:19, webhook processado 16:56:21 com',
  '//    content vazio, e o GET devolvendo a frase inteira. Varredura de 14',
  '//    conversas: 12 audios, 12 transcritos, ZERO sem — a transcricao e',
  '//    automatica na conta; o que falta e o campo no payload do evento.',
  '// ⚠️ Nao e permissao: o CHATWOOT_BOT_TOKEN le (200) e e aceito pelo endpoint',
  '//    de transcrever (422 "nao tem audio pendente" = token ok, audio ja feito).',
  'async function buscarMensagemChatwoot(conversationId, messageId) {',
  '  const base = process.env.CHATWOOT_BASE_URL;',
  '  const token = process.env.CHATWOOT_BOT_TOKEN;',
  '  const accountId = process.env.CHATWOOT_ACCOUNT_ID;',
  '  if (!base || !token || !accountId) return null;',
  '  const r = await fetch(',
  '    `${base.replace(/\\/$/, ' + Q + Q + ')}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages?limit=20`,',
  '    // ⚠️ User-Agent explicito: o proxy do Chatwoot ja devolveu 403 sem ele',
  '    { headers: { api_access_token: token, ' + Q + 'User-Agent' + Q + ': ' + Q + 'la-mila-bridge' + Q + ' } });',
  '  if (!r.ok) throw new Error(`chatwoot_msgs_http_${r.status}`);',
  '  const d = await r.json();',
  '  const lista = Array.isArray(d) ? d : (d && d.payload) || [];',
  '  return lista.find((m) => String(m && m.id) === String(messageId)) || null;',
  '}',
  '',
  '// Pede a transcricao — o MESMO botao que a interface do Chatwoot usa. Nao e',
  '// uma segunda fonte: e o mesmo motor, sob demanda, quando o automatico ainda',
  '// nao chegou. 422 significa "ja transcrito" e nao e erro.',
  'async function pedirTranscricao(conversationId, messageId) {',
  '  const base = process.env.CHATWOOT_BASE_URL;',
  '  const token = process.env.CHATWOOT_BOT_TOKEN;',
  '  const accountId = process.env.CHATWOOT_ACCOUNT_ID;',
  '  if (!base || !token || !accountId) return;',
  '  try {',
  '    await fetch(',
  '      `${base.replace(/\\/$/, ' + Q + Q + ')}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages/${messageId}/audio_transcription`,',
  '      { method: ' + Q + 'POST' + Q + ',',
  '        headers: { api_access_token: token, ' + Q + 'User-Agent' + Q + ': ' + Q + 'la-mila-bridge' + Q + ',',
  '                   ' + Q + 'content-type' + Q + ': ' + Q + 'application/json' + Q + ' } });',
  '  } catch (_) { /* pedir e' + Q.replace(Q, '') + ' melhoria, nunca requisito */ }',
  '}',
  '',
  '// Devolve o texto do audio, ou string vazia. NUNCA inventa marcador: fazer a',
  '// Mila responder a uma frase que ela nao leu e pior que nao responder.',
  'async function resolverTranscricaoDeAudio(conversationId, messageId) {',
  '  const esperas = [0, 1500, 3000];   // a transcricao e assincrona; o webhook',
  '                                     // chega ~2s depois da criacao da mensagem',
  '  let temAudio = false;',
  '  for (let i = 0; i < esperas.length; i++) {',
  '    if (esperas[i]) await new Promise((ok) => setTimeout(ok, esperas[i]));',
  '    let m;',
  '    try { m = await buscarMensagemChatwoot(conversationId, messageId); }',
  '    catch (e) {',
  '      log(' + Q + 'audio_busca_falhou' + Q + ', { conversation_id: conversationId, message_id: messageId,',
  '                                  tentativa: i + 1, error: String(e && e.message).slice(0, 200) });',
  '      return ' + Q + Q + ';',
  '    }',
  '    if (!m) return ' + Q + Q + ';',
  '    const anexos = m.attachments || [];',
  '    temAudio = anexos.some((a) => a && a.file_type === ' + Q + 'audio' + Q + ');',
  '    if (!temAudio) return ' + Q + Q + ';   // sem audio nao ha o que resolver',
  '    for (const a of anexos) {',
  '      const t = String((a && a.transcribed_text) || ' + Q + Q + ').trim();',
  '      if (t) {',
  '        log(' + Q + 'audio_transcricao_resolvida' + Q + ', { conversation_id: conversationId,',
  '              message_id: messageId, tentativa: i + 1, chars: t.length });',
  '        return t;',
  '      }',
  '    }',
  '    // ainda sem texto: na 2a volta, PEDE (e o que a interface faz)',
  '    if (i === 0) await pedirTranscricao(conversationId, messageId);',
  '  }',
  '  log(' + Q + 'audio_sem_transcricao' + Q + ', { conversation_id: conversationId, message_id: messageId,',
  '        tem_audio: temAudio, nota: ' + Q + 'segue em silencio, como antes' + Q + ' });',
  '  return ' + Q + Q + ';',
  '}',
  '',
  'async function processIncoming(payload, state) {',
].join('\n');

trocar('async function processIncoming(payload, state) {', HELPER, 'inicio de processIncoming');

// ── 2. content deixa de ser const ──────────────────────────────────────────
trocar(
  '  const content = extractContent(payload);\n  const inboxId = extractInboxId(payload);',
  '  // `let`: mensagem de audio chega sem texto e o conteudo e completado abaixo.\n'
  + '  let content = extractContent(payload);\n  const inboxId = extractInboxId(payload);',
  'declaracao de content');

// ── 3. completar o PAYLOAD, não só a variável ──────────────────────────────
trocar(
  '  if (!isIncomingMessage(payload)) return { action: ' + Q + 'not_sent' + Q + ', reason: ' + Q + 'not_incoming_message' + Q + ' };',
  [
    '  if (!isIncomingMessage(payload)) return { action: ' + Q + 'not_sent' + Q + ', reason: ' + Q + 'not_incoming_message' + Q + ' };',
    '',
    '  // 🔴 AUDIO: mensagem de entrada sem texto. O webhook nao traz a transcricao,',
    '  //    entao vamos perguntar a API o que essa mensagem realmente e.',
    '  // ⚠️ COMPLETO O PAYLOAD, nao so a variavel local: `buildMilaPrompt`, o',
    '  //    caminho de lead e o buffer chamam `extractContent(payload)` por conta',
    '  //    propria. Corrigir num lugar so deixaria os outros lendo vazio — e',
    '  //    reimplementar a busca em cada um e como nascem as divergencias.',
    '  // ⚠️ `empty_content` deu 8 vezes em 3 meses; nao e caminho quente.',
    '  if (!content && conversationId && messageId) {',
    '    const falado = await resolverTranscricaoDeAudio(conversationId, messageId);',
    '    if (falado) {',
    '      content = falado;',
    '      payload.content = falado;',
    '      if (payload.message && typeof payload.message === ' + Q + 'object' + Q + ') payload.message.content = falado;',
    '    }',
    '  }',
  ].join('\n'),
  'gate de mensagem de entrada');

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-antes-audio-pela-api');
fs.writeFileSync(alvo, s);
console.log('ok: audio sem texto passa a ser resolvido pela API do Chatwoot');
