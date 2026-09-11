#!/usr/bin/env node
'use strict';

// Reproduz o bug de 11/09: no canário textual, a condição antiga pulava o
// bloco financeiro inteiro. Assim o "pode" do preview de abertura criado pelo
// cron nunca alcançava tratarConfirmacao().
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '../..');
const patcher = path.join(root, 'vps/la-hq/sol/scripts/_patch-bridge-contexto-caixa-11set.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-bridge-abf-canario-'));
const bridge = path.join(tmp, 'bridge.js');

fs.writeFileSync(bridge, `
'use strict';
const chatId = 'canario@g.us';
const event = { chatId, senderId: 'operadora@s.whatsapp.net', senderPhone: '5521999999999', body: 'pode', hasMedia: process.env.MEDIA === '1' };
const SOL_CAIXA_LIVE = true;
const FINANCE_GROUPS = new Set(
  String(process.env.SOL_CAIXA_FINANCE_GROUPS || '')
    .split(';').map(function (x) { return (x.split('|')[0] || '').trim(); }).filter(Boolean)
);
const passos = [];
const _caixaLog = (x) => passos.push(x.step);
const typingStart = () => {};
const typingStop = () => {};
const financeGroupMap = () => ({ [chatId]: { unidade_id: 'u1', nome: 'Recreio' } });
const sendWithTimeout = async () => ({ key: { id: 'm1' } });
const recentlySentIds = new Set();
const abrirJanelaGrupo = () => {};
const financeHandler = async () => ({
  temPendencia: () => false,
  handle: async () => { passos.push('legado'); return { acao: 'tratado' }; },
});
const caixaAbf = async () => ({
  tratarPedidoDiretoFechamento: async () => false,
  tratarPedidoDiretoReabertura: async () => false,
  tratarConfirmacao: async () => {
    passos.push('abf_confirmacao');
    return process.env.ABF_TRATA === '1';
  },
});
const crachaDoSolicitante = () => 'cracha';

(async () => {
  for (const _msg of [1]) {
    try {
      if (SOL_CAIXA_LIVE && FINANCE_GROUPS.has(chatId)
            && !(SOL_CAIXA_TOOLS_GROUPS.has(chatId) && !event.hasMedia)) {
          try {
            _caixaLog({ step: 'msg', chatId: chatId, hasMedia: event.hasMedia, mediaType: event.mediaType });
            if (event.hasMedia) typingStart(chatId);
            const _abf = await caixaAbf();
            if (_abf) {
              const _sf = async (cid, txt) => {
                const s2 = await sendWithTimeout(cid, { text: txt });
                const id = s2 && s2.key && s2.key.id; if (id) recentlySentIds.add(id);
                abrirJanelaGrupo(cid, event.senderId, 'financeiro_abertura_fechamento');
                return id;
              };
              const _grupoCaixa = financeGroupMap()[chatId];
              const _direto = await _abf.tratarPedidoDiretoFechamento(event, { grupo: _grupoCaixa, sendFn: _sf, log: _caixaLog });
              if (_direto) { typingStop(chatId); _caixaLog({ step: 'abf_fechamento_direto' }); continue; }
              const _reab = _abf.tratarPedidoDiretoReabertura
                ? await _abf.tratarPedidoDiretoReabertura(event, { grupo: _grupoCaixa, sendFn: _sf, log: _caixaLog })
                : false;
              if (_reab) { typingStop(chatId); _caixaLog({ step: 'abf_reabertura_direta' }); continue; }
              const _fhPrio = await financeHandler();
              const _tratou = await _abf.tratarConfirmacao(event, { sendFn: _sf, log: _caixaLog,
                temComprovantePendente: (cid) => !!(_fhPrio && _fhPrio.temPendencia && _fhPrio.temPendencia(cid)) });
              if (_tratou) { _caixaLog({ step: 'abf_tratou' }); continue; }
            }
            const _fh = await financeHandler();
            let _tratouCaixa = true;
            if (_fh) {
              const _r = await _fh.handle(event);
              _tratouCaixa = !(_r && (_r.acao === 'nada' || _r.acao === 'ignorado_fora_grupo'));
            }
            if (_tratouCaixa) { typingStop(chatId); continue; }   // dinheiro e deterministico: nunca vai pro LLM
          } catch (e) {
            _caixaLog({ step: 'erro' });
            typingStop(chatId);
            continue;
          }
        }
      passos.push('llm');
      if (event.senderPhone) {
        try {
          const _cr = crachaDoSolicitante(event.senderPhone, chatId);
          if (_cr) event.body = \`[cracha: \${_cr}]\\n\${event.body || ''}\`;
        } catch (_) {}
      }
    } catch (e) { passos.push('fatal:' + e.message); }
  }
  process.stdout.write(JSON.stringify(passos));
})();
`, 'utf8');

cp.execFileSync(process.execPath, [patcher, bridge]);
cp.execFileSync(process.execPath, ['--check', bridge]);

function executar(env) {
  return JSON.parse(cp.execFileSync(process.execPath, [bridge], {
    env: { ...process.env, SOL_CAIXA_FINANCE_GROUPS: 'canario@g.us', ...env },
    encoding: 'utf8',
  }));
}

assert.deepStrictEqual(executar({ SOL_CAIXA_TOOLS_CANARIO: 'canario@g.us', ABF_TRATA: '1' }),
  ['msg', 'abf_confirmacao', 'abf_tratou']);
assert.deepStrictEqual(executar({ SOL_CAIXA_TOOLS_CANARIO: 'canario@g.us', ABF_TRATA: '0' }),
  ['msg', 'abf_confirmacao', 'agent_first_text_handoff_pos_abf', 'llm']);
assert.deepStrictEqual(executar({ SOL_CAIXA_TOOLS_CANARIO: '', ABF_TRATA: '0' }),
  ['msg', 'abf_confirmacao', 'legado']);
assert.deepStrictEqual(executar({ SOL_CAIXA_TOOLS_CANARIO: 'canario@g.us', ABF_TRATA: '0', MEDIA: '1' }),
  ['msg', 'abf_confirmacao', 'legado']);

console.log('bridge canário: ABF determinístico antes do handoff agent-first — OK');
