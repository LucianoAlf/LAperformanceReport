#!/usr/bin/env node
// PROVA DO RESOLVEDOR DE ÁUDIO (08/09/2026).
//
// ⚠️ Roda o CÓDIGO REAL do bridge, não uma cópia: extrai as três funções do
//    arquivo já corrigido e as executa num `vm`. Reimplementar aqui provaria a
//    minha cópia, não o que roda em produção — foi exatamente o erro que fez o
//    patch das 15:24 passar: validei contra a API, não contra o que o webhook
//    entrega.
//
// Uso: prova-audio-transcricao-08set.js <arquivo-do-bridge> <conv>:<msg> [...]
const fs = require('fs');
const vm = require('vm');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/chatwoot-mila-bridge.js';
const casos = (process.argv.slice(3).length ? process.argv.slice(3) : [
  '8809:4552359',   // Krissya 16:56 — "os leads das três unidades..."
  '8809:4552684',   // Krissya 17:03 — "as meninas estão demorando..."
  '6308:4554242',   // Luciano 17:38 — "Oi Mila, tudo bem? Tá por aí?"
  '6308:999999999', // inexistente — tem de devolver vazio sem explodir
]).map((c) => c.split(':'));

const fonte = fs.readFileSync(alvo, 'utf8');
const inicio = fonte.indexOf('async function buscarMensagemChatwoot');
const fim = fonte.indexOf('async function processIncoming');
if (inicio < 0 || fim < 0 || fim < inicio) {
  console.error('nao achei o bloco do resolvedor no arquivo — o patch foi aplicado?');
  process.exit(1);
}
const bloco = fonte.slice(inicio, fim);

const registrado = [];
const contexto = {
  fetch, setTimeout, console, process,
  log: (evento, dados) => { registrado.push([evento, dados]); },
  module: {}, exports: {},
};
vm.createContext(contexto);
vm.runInContext(bloco + '\nglobalThis.__resolver = resolverTranscricaoDeAudio;', contexto);

(async () => {
  let falhou = false;
  for (const [conv, msg] of casos) {
    const t0 = Date.now();
    let texto = '';
    try { texto = await contexto.__resolver(conv, msg); }
    catch (e) { console.error(`  ${conv}/${msg} EXPLODIU: ${e.message}`); falhou = true; continue; }
    const ms = Date.now() - t0;
    const ok = msg.startsWith('9') ? texto === '' : Boolean(texto);
    if (!ok) falhou = true;
    console.log(`  ${ok ? 'ok ' : 'XX '} conv ${conv} msg ${msg} (${ms}ms) -> ${JSON.stringify(texto).slice(0, 90)}`);
  }
  console.log('\neventos registrados pelo codigo real:');
  for (const [e, d] of registrado) console.log('  ', e, JSON.stringify(d));
  console.log(falhou ? '\nRESULTADO: FALHOU' : '\nRESULTADO: PASSOU');
  process.exit(falhou ? 1 : 0);
})();
