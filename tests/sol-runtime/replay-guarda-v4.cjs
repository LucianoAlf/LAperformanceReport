#!/usr/bin/env node
/**
 * Replay: passa TODO o corpus do shadow pela guarda financeira e mede o efeito.
 *
 * 🔴 POR QUE EXISTE. Guarda que barra o falso positivo mas também barra o caso
 *    bom não serve — é a lição de 31/08 e do `\bparcela\b` solto. Teste unitário
 *    prova o que eu imaginei; replay prova o que aconteceu de verdade.
 *
 * Lê o `caixa.log` da la-hq (produção, SOMENTE LEITURA) e responde:
 *   · quantas decisões financeiras a guarda barraria;
 *   · quais, com o texto, para conferência humana;
 *   · e o que ela deixa passar, que é onde mora o risco residual.
 *
 * Uso (na la-hq):  node replay-guarda-v4.cjs [desde-iso]
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const vm = require('vm');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
const LOG = process.env.SOL_CAIXA_LOG
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa.log';
const DESDE = process.argv[2] || '2026-09-01';

const mod = { exports: {} };
const ctx = {
  module: mod, exports: mod.exports, require, console, process,
  __filename: ALVO, __dirname: path.dirname(ALVO),
  Buffer, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ALVO, 'utf8'), ctx, { filename: ALVO });
const guarda = vm.runInContext('guardaFinanceiraV4', ctx);

const FINANCEIRAS = new Set([
  'lancamento_por_texto', 'lancamento_multi_aluno', 'saida_dinheiro',
  'saida_caixa', 'corrigir_lancamento_gravado', 'aprovar',
]);

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(LOG), crlfDelay: Infinity });
  const barradas = [];
  let financeiras = 0, passaram = 0, total = 0;
  const porMotivo = {};

  for await (const ln of rl) {
    let d;
    try { d = JSON.parse(ln); } catch { continue; }
    if (d.acao !== 'roteador_v4_shadow') continue;
    if ((d.ts || '') < DESDE) continue;
    total++;
    if (!FINANCEIRAS.has(d.intencao)) continue;
    financeiras++;
    const r = guarda({ intencao: d.intencao, texto: d.texto || '', confianca: d.confianca });
    if (r.permitido) { passaram++; continue; }
    porMotivo[r.motivo] = (porMotivo[r.motivo] || 0) + 1;
    barradas.push({ ts: d.ts, intencao: d.intencao, conf: d.confianca,
                    motivo: r.motivo, texto: String(d.texto || '').slice(0, 88) });
  }

  console.log(`REPLAY DA GUARDA — desde ${DESDE}\n`);
  console.log(`decisoes do shadow ........ ${total}`);
  console.log(`intencoes FINANCEIRAS ..... ${financeiras}`);
  console.log(`  passariam ............... ${passaram}`);
  console.log(`  BARRADAS ................ ${barradas.length}`);
  for (const [m, n] of Object.entries(porMotivo)) console.log(`     ${n}  ${m}`);

  console.log('\n--- o que a guarda barra (conferir uma a uma) ---');
  for (const b of barradas) {
    console.log(`[${b.ts.slice(5, 16)}] ${b.motivo.padEnd(20)} ${b.intencao.padEnd(24)} c=${b.conf}`);
    console.log(`    ${b.texto.replace(/\n/g, ' | ')}`);
  }
})();
