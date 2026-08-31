#!/usr/bin/env node
// bridge.js — gancho do roteador V4 em SHADOW: dispara SEM await depois do
// handle(), para toda mensagem de TEXTO do grupo financeiro. Zero impacto no
// fluxo (fire-and-forget), zero escrita — só log lado a lado com o legado.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-bridge-roteador-v4.cjs <bridge.js>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

trocar(
  `              const _r = await _fh.handle(event);
              _caixaLog({ step: 'result', r: _r });`,
  `              const _r = await _fh.handle(event);
              _caixaLog({ step: 'result', r: _r });
              // V4 SHADOW (31/08, go do Luciano): o roteador LLM observa a mesma
              // mensagem em paralelo e loga a decisao ao lado da acao do legado.
              // Fire-and-forget: nao atrasa nada, nao escreve nada.
              if (_fh.observarRoteadorV4) {
                _fh.observarRoteadorV4(event, _r && _r.acao)
                  .catch(function (e) { _caixaLog({ step: 'roteador_v4_shadow_erro', msg: e && e.message }); });
              }`,
  'gancho V4 shadow pos-handle');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
