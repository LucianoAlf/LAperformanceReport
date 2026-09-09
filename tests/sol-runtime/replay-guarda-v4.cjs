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
// 🔴 A JANELA COMECA EM 08/09 E ISSO NAO E ESCOLHA — E LIMITE DO DADO.
// O campo `texto` so passou a ser gravado no shadow em 08/09/2026. Medido:
// 31/08 a 05/09 tem 366 decisoes e ZERO com texto; 08-09/09 tem 174, todas com.
// Rodar antes disso faz a guarda julgar mensagens que ela nao ve — e texto
// vazio nunca casa "pode", entao TODA aprovacao antiga aparecia como barrada.
// Foi o que aconteceu na minha primeira leitura: 19 `aprovacao_sem_pode`, dos
// quais 16 eram cegueira do log. Prova que roda sobre o vazio nao e prova.
const DESDE = process.argv[2] || '2026-09-08';

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
  let financeiras = 0, passaram = 0, total = 0, cegas = 0;
  const porMotivo = {};

  for await (const ln of rl) {
    let d;
    try { d = JSON.parse(ln); } catch { continue; }
    if (d.acao !== 'roteador_v4_shadow') continue;
    if ((d.ts || '') < DESDE) continue;
    total++;
    if (!FINANCEIRAS.has(d.intencao)) continue;
    // Sem o texto a guarda nao tem o que julgar. Contar como "barrada" seria
    // inventar um numero; o certo e' declarar a cegueira.
    if (!String(d.texto || '').trim()) { cegas++; continue; }
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
  if (cegas) console.log(`  (${cegas} descartadas: log sem o texto — nao julgo o que nao vejo)`);
  console.log(`  passariam ............... ${passaram}`);
  console.log(`  BARRADAS ................ ${barradas.length}`);
  for (const [m, n] of Object.entries(porMotivo)) console.log(`     ${n}  ${m}`);

  console.log('\n--- o que a guarda barra (conferir uma a uma) ---');
  for (const b of barradas) {
    console.log(`[${b.ts.slice(5, 16)}] ${b.motivo.padEnd(20)} ${b.intencao.padEnd(24)} c=${b.conf}`);
    console.log(`    ${b.texto.replace(/\n/g, ' | ')}`);
  }
})();
