#!/usr/bin/env node
// Inventário das tools da Mila de gestão: nome, grupo de visibilidade e a RPC
// que cada uma chama. Lido do próprio MCP, não de memória.
const fs = require('fs');
const s = fs.readFileSync(process.argv[2] || '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs', 'utf8');

const Q = String.fromCharCode(39);
const grupos = {};
for (const g of ['LEITURA', 'BASE_COMERCIAL', 'TRAFEGO', 'ESCRITA']) {
  const ini = s.indexOf('const ' + g + ' = [');
  if (ini < 0) continue;
  const fim = s.indexOf('\n];', ini);
  const bloco = s.slice(ini, fim);
  grupos[g] = [...bloco.matchAll(new RegExp('name: ' + Q + '([a-z_]+)' + Q, 'g'))].map((m) => m[1]);
}

const rpcs = {};
const reCase = new RegExp('case ' + Q + '([a-z_]+)' + Q + ':', 'g');
const posicoes = [...s.matchAll(reCase)].map((m) => ({ nome: m[1], at: m.index }));
for (let i = 0; i < posicoes.length; i++) {
  const ini = posicoes[i].at;
  const fim = i + 1 < posicoes.length ? posicoes[i + 1].at : s.indexOf('\n    default', ini);
  const corpo = s.slice(ini, fim > 0 ? fim : undefined);
  const calls = [...corpo.matchAll(new RegExp('rpc\\(' + Q + '([a-z_0-9]+)' + Q, 'g'))].map((m) => m[1]);
  const esc = [...corpo.matchAll(new RegExp('escrita\\(' + Q + '([a-z_0-9]+)' + Q, 'g'))].map((m) => m[1]);
  const cw = /\bcw\(/.test(corpo) ? ['<chatwoot>'] : [];
  rpcs[posicoes[i].nome] = [...new Set([...calls, ...esc, ...cw])];
}

const saida = [];
for (const [g, nomes] of Object.entries(grupos)) {
  for (const n of nomes) saida.push({ grupo: g, tool: n, rpcs: rpcs[n] || [] });
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(saida, null, 1)); process.exit(0); }
for (const [g, nomes] of Object.entries(grupos)) {
  console.log('## ' + g + ' (' + nomes.length + ')');
  for (const n of nomes) console.log('  ' + n.padEnd(28) + ' -> ' + (rpcs[n] || []).join(', '));
}
