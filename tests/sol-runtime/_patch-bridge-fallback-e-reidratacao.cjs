#!/usr/bin/env node
// bridge.js — os dois ganchos das pendencias aprovadas pelo Luciano (31/08):
//
// B1  REIDRATACAO NO BOOT (A3): logo apos criar o handler, reconstruir as
//     pendencias a partir do ledger V3. Restart de deploy nao engole mais
//     preview aberto (caso Arthur 17:58 — a correcao dele morreu no restart e
//     o "pode" cairia em pode_sem_pendencia EM SILENCIO).
//
// B2  FALLBACK LLM ANTES DO "NAO ENTENDI": mensagem para a Sol (ou citando um
//     card) que o parser nao entendeu, com pendencia aberta, passa primeiro
//     pelo classificador de intencao. Se ele mapear para a gramatica, o caso
//     se resolve; senao, o "Nao entendi" de sempre.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-bridge-fallback-e-reidratacao.cjs <bridge.js>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── B1: reidratacao no boot ──────────────────────────────────────────────────
trocar(
  `    _caixaLog({ step: 'init', grupos: Object.keys(grupos) });`,
  `    _caixaLog({ step: 'init', grupos: Object.keys(grupos) });
    // A3 (31/08): restart nao engole pendencia — reconstruir do ledger V3.
    // ⚠️ AWAIT, nao .then(): o handler e' LAZY (nasce na 1a mensagem do grupo
    // financeiro), entao com .then() a propria mensagem que criou o handler
    // seria processada em paralelo com a reidratacao — e se ela fosse o "pode",
    // cairia em pode_sem_pendencia mesmo com a pendencia no ledger. Custa 3 GETs
    // uma unica vez por vida do processo, e a funcao ja e' fail-safe por dentro.
    if (_caixaHandler && _caixaHandler.reidratarPendencias) {
      try {
        const _rr = await _caixaHandler.reidratarPendencias();
        _caixaLog({ step: 'reidratacao_boot', total: _rr && _rr.total });
      } catch (e) { _caixaLog({ step: 'reidratacao_boot_erro', msg: e && e.message }); }
    }`,
  'B1 reidratacao no boot');

// ── B2: fallback LLM antes do "Nao entendi" ──────────────────────────────────
trocar(
  `              if (!_tratouCaixa && (_pareceProSol || _citouCard) && _r && _r.acao === 'nada'
                  && _fh.temPendencia && _fh.temPendencia(chatId)) {
                try {
                  const _s = await sendWithTimeout(chatId, { text:`,
  `              if (!_tratouCaixa && (_pareceProSol || _citouCard) && _r && _r.acao === 'nada'
                  && _fh.temPendencia && _fh.temPendencia(chatId)) {
                // Fallback de dialogo (31/08, OK do Luciano): antes do "nao
                // entendi", o classificador LLM de saida restrita tenta mapear
                // a mensagem para a gramatica canonica. Nunca escreve, nunca
                // aprova dinheiro; falha => segue para o "nao entendi".
                let _llmTratou = null;
                try { _llmTratou = _fh.tratarNaoEntendida ? await _fh.tratarNaoEntendida(event) : null; }
                catch (e) { _caixaLog({ step: 'fallback_llm_erro', msg: e.message }); }
                if (_llmTratou && _llmTratou.tratou) {
                  _caixaLog({ step: 'fallback_llm_tratou', acao: _llmTratou.acao, intencao: _llmTratou.intencao });
                  _tratouCaixa = true;
                } else {
                try {
                  const _s = await sendWithTimeout(chatId, { text:`,
  'B2 fallback antes do nao-entendi (abre)');

trocar(
  `                } catch (e) { _caixaLog({ step: 'guarda_pendencia_erro', msg: e.message }); }
                _caixaLog({ step: 'guarda_pendencia_nao_vaza_llm', chatId: chatId });
                _tratouCaixa = true;
              }`,
  `                } catch (e) { _caixaLog({ step: 'guarda_pendencia_erro', msg: e.message }); }
                _caixaLog({ step: 'guarda_pendencia_nao_vaza_llm', chatId: chatId });
                _tratouCaixa = true;
                }
              }`,
  'B2 fallback antes do nao-entendi (fecha)');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
