#!/usr/bin/env node
// O BRIDGE VIVO PASSA A EMITIR O CRACHÁ (08/09/2026).
//
// 🔴 ERRO QUE ESTE PATCH CORRIGE, E FOI MEU. A 1ª versão foi aplicada em
//    `chatwoot-sol-bridge.js`, ancorada na linha `- Participante que enviou:`.
//    Esse arquivo está **PAUSADO DESDE 27/07** ("legado Chatwoot/WAHA pausado
//    de forma reversível antes do QR", no crontab) e **ninguém faz `require`
//    dele**. Eu patchei código morto — e, pior, tinha escrito as descrições
//    das 14 portas mandando o modelo copiar de um envelope que **não existe**:
//    as 9 ocorrências de "Participante que enviou" no log são todas de 07/09 e
//    todas `platform=cli`, ou seja, os meus próprios testes.
//
//    O envelope REAL, lido de um turno `platform=whatsapp` de verdade:
//
//      [telefone_remetente: 5521981278047]
//      Ok
//
//    Escrito em `whatsapp-bridge/bridge.js:1129`. É aqui que o crachá entra.
//
// 🔴 A LIÇÃO: testar contra a própria invenção não é teste. O envelope tinha de
//    ter vindo de um turno real desde o começo — e vir de um turno real é o que
//    finalmente mostrou o erro.
//
// ⚠️ O bridge só CALCULA um HMAC (`telefone|chat|janela de 30min`) com segredo
//    lido de arquivo. Nada é gravado — o `BEGIN READ ONLY` continua intacto.
//    Paridade com `sol_cracha_emitir_v1` verificada byte a byte antes de subir.
//
// ⚠️ Sem o segredo no disco, NÃO inventa crachá: o envelope segue só com o
//    telefone e as portas continuam funcionando, com a auditoria marcando
//    `via: telefone_declarado`. Degradar é aceitável; mentir sobre identidade
//    não seria.
//
// ⚠️ Depois de aplicar, REINICIAR a bridge — ela faz `require` no start.
const fs = require('fs');

const alvo = process.argv[2] ||
  '/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('crachaDoSolicitante')) { console.log('ja aplicado'); process.exit(0); }

const EOL = s.includes('\r\n') ? '\r\n' : '\n';

// ── 1. o emissor, logo antes do ponto de injeção ───────────────────────────
const ANC1 = '      if (event.senderPhone) {';
if ((s.split(ANC1).length - 1) !== 1) { console.error('ANCORA senderPhone: esperava 1'); process.exit(1); }

const EMISSOR = [
  '      // Crachá do solicitante: assina "telefone|chat|janela de 30min" com um',
  '      // segredo compartilhado com o banco (`sol_cracha_verificar_v1`). O modelo',
  '      // carrega o valor e NÃO sabe produzi-lo para outro telefone — é o que',
  '      // impede a Sol de ver o escopo de um colega informando o número dele.',
  '      // Só cálculo: nada é gravado, a bridge segue read-only.',
  '      if (event.senderPhone) {',
  '        try {',
  '          const _cr = crachaDoSolicitante(event.senderPhone, chatId);',
  '          if (_cr) event.body = `[cracha: ${_cr}]\\n${event.body || \'\'}`;',
  '        } catch (_) { /* crachá é reforço; falhar nele não pode derrubar a mensagem */ }',
  '      }',
  ANC1,
].join(EOL);
s = s.replace(ANC1, EMISSOR);

// ── 2. a função, no topo do módulo ─────────────────────────────────────────
const ANC2 = "const MAX_QUEUE_SIZE";
if ((s.split(ANC2).length - 1) < 1) { console.error('ANCORA MAX_QUEUE_SIZE: nao achei'); process.exit(1); }

const FUNCAO = [
  '// ── crachá do solicitante (08/09/2026) ────────────────────────────────────',
  'let _crachaSegredo;',
  'function crachaSegredo() {',
  '  if (_crachaSegredo !== undefined) return _crachaSegredo;',
  '  _crachaSegredo = null;',
  '  try {',
  "    const t = require('fs').readFileSync('/home/sol/.openclaw/secrets/sol-cracha.env', 'utf8');",
  '    const m = t.match(/^\\s*SOL_CRACHA_HMAC\\s*=\\s*(.+)\\s*$/m);',
  "    if (m) _crachaSegredo = m[1].trim().replace(/^[\"']|[\"']$/g, '');",
  '  } catch (_) { /* sem segredo: segue sem crachá, de propósito */ }',
  '  return _crachaSegredo;',
  '}',
  'function crachaDoSolicitante(telefone, chatId) {',
  '  const seg = crachaSegredo();',
  "  const tel = String(telefone || '').replace(/\\D/g, '');",
  '  if (!seg || !tel) return null;',
  '  // ⚠️ A janela de 30 min e o corte em 32 hex TÊM de bater com',
  '  //    `sol_cracha_emitir_v1` no banco. Divergir aqui faz TODA porta recusar.',
  '  const janela = Math.floor(Date.now() / 1000 / 1800);',
  "  const assin = require('crypto').createHmac('sha256', seg)",
  "    .update(tel + '|' + String(chatId || '') + '|' + janela).digest('hex');",
  "  return 'SOL1.' + tel + '.' + assin.slice(0, 32);",
  '}',
  '',
  ANC2,
].join(EOL);
s = s.replace(ANC2, FUNCAO);

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, `${alvo}.bak-${carimbo}-before-cracha`);
fs.writeFileSync(alvo, s);
console.log('bridge VIVA passa a emitir [cracha: SOL1....] antes do telefone');
console.log('⚠️ REINICIE — require no start');
