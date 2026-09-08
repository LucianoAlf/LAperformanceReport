#!/usr/bin/env node
// 🔴 SUPERADO NO MESMO DIA — ESTE PATCH NÃO RESOLVE SOZINHO. Ver
//    `_patch-audio-transcricao-vem-da-api-08set.js`.
//
//    A premissa abaixo ("o Chatwoot já transcreveu, a frase estava lá, pronta")
//    é VERDADEIRA no GET da API e FALSA no webhook: o `push_event_data` do anexo
//    não carrega `transcribed_text`. Eu validei lendo a mensagem 4548773 pela
//    API, horas depois de ela chegar, e nunca conferi o que o evento entrega.
//    Resultado: o patch subiu às 15:24 e os áudios das 16:56, 17:03 e 17:38
//    continuaram dando `empty_content`.
//
//    A queda que ele acrescenta continua no código e é inofensiva — vale se um
//    dia o Chatwoot passar a mandar o campo no evento. Mas o caminho que
//    funciona é buscar na API.
//
//    Lição: testar no artefato errado. Mesma família de "código no disco não é
//    código rodando".
// ─────────────────────────────────────────────────────────────────────────────
// A MILA PASSA A OUVIR ÁUDIO (08/09/2026).
//
// 🔴 O CASO: o Luciano mandou um áudio de 7s para a Mila às 12:19 e ela não
//    respondeu nada. Nem apareceu turno no log do agente.
//
//    Fui ver a mensagem no Chatwoot (id 4548773, conversa 6308):
//
//      content: ""                            ← vazio
//      attachments[0].file_type: "audio"
//      attachments[0].transcribed_text:
//        "Nilo, o que que você sabe do LA Talent? E como é que a gente pode
//         utilizar isso nessa campanha de indicação?"
//
//    **O Chatwoot JÁ TRANSCREVEU.** A frase estava lá, pronta. A ponte lê só
//    `p.content`, que em mensagem de áudio vem vazio, e descarta com
//    `reply_reason: 'empty_content'` — a Mila nunca ficou sabendo que ele
//    falou com ela.
//
// ⚠️ É a MESMA família do defeito da legenda irmã da Sol, hoje de manhã: o
//    texto existe, chega junto, e o código não olha para ele. Ali era um
//    `return` antes da costura; aqui é um `extractContent` que só conhece um
//    campo. Vale a pena registrar o padrão: **quando um agente "não responde",
//    procurar primeiro o texto que chegou e ninguém leu.**
//
// ⚠️ NÃO transcrevo nada aqui. O Chatwoot já faz e entrega pronto; chamar
//    Whisper de novo seria pagar duas vezes pela mesma frase e criar uma
//    segunda fonte para o mesmo texto — que é como nascem as divergências.
//
// ⚠️ Se NÃO houver transcrição (áudio que o Chatwoot não conseguiu ler), o
//    comportamento fica exatamente como está: `empty_content` e silêncio. Não
//    invento marcador tipo "[áudio recebido]" — isso faria a Mila responder a
//    uma mensagem cujo conteúdo ela não conhece, que é pior que não responder.
const fs = require('fs');

const alvo = process.argv[2] ||
  '/home/mila/.openclaw/workspace/scripts/chatwoot-mila-bridge.js';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('transcribed_text')) { console.log('ja aplicado'); process.exit(0); }

const VELHO = "function extractContent(p) { return String(p.content || p.message?.content || '').trim(); }";

const NOVO = [
  '// ⚠️ Mensagem de AUDIO chega com `content` vazio e a frase em',
  '//    `attachments[].transcribed_text` — o Chatwoot ja transcreveu. Sem esta',
  '//    queda, audio virava `empty_content` e a Mila nem sabia que falaram com',
  '//    ela (caso Luciano, 08/09 12:19: "o que voce sabe do LA Talent?").',
  '//    NAO transcrevo aqui: o texto ja vem pronto, e uma segunda fonte para a',
  '//    mesma frase e como nascem as divergencias.',
  'function extractTranscricao(p) {',
  '  const anexos = p.attachments || p.message?.attachments || [];',
  '  if (!Array.isArray(anexos)) return \'\';',
  '  for (const a of anexos) {',
  '    const t = String((a && a.transcribed_text) || \'\').trim();',
  '    if (t) return t;',
  '  }',
  '  return \'\';',
  '}',
  'function extractContent(p) {',
  '  const direto = String(p.content || p.message?.content || \'\').trim();',
  '  if (direto) return direto;',
  '  // sem transcricao disponivel segue vazio de proposito: responder a um audio',
  '  // que ninguem leu e pior que nao responder.',
  '  return extractTranscricao(p);',
  '}',
].join('\n');

const n = s.split(VELHO).length - 1;
if (n !== 1) { console.error('ANCORA extractContent: esperava 1, achei ' + n); process.exit(1); }

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-before-audio');
fs.writeFileSync(alvo, s.split(VELHO).join(NOVO));
console.log('ponte da Mila passa a ler a transcricao do audio');
console.log('⚠️ a ponte precisa reiniciar (o watch-chatwoot-mila-bridge.sh respawna)');
