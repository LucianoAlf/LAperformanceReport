#!/usr/bin/env node
// A guarda "não vaza pro LLM" (26/08) so responde quando a mensagem PLAUSIVELMENTE e' pra
// Sol -- menciona "Sol" ou cita um card pendente. Antes ela disparava em cima de QUALQUER
// mensagem nao reconhecida enquanto houvesse pendencia, inclusive assunto entre humanos
// (caso Luciano/Barra 26/08: "Vou ver o que aconteceu ok?" levou "Nao entendi essa...").
//
// A regra reaproveita `pareceChamarSol`, ja usada no gate de engajamento do grupo (mesmo
// criterio de "isso parece ser com a Sol" que decide se o LLM responde) -- nao inventa
// heuristica nova. `citaAlgumaPendencia` e' novo, exportado hoje em caixa-financeiro.cjs.
const fs = require('fs');

const alvo = process.argv[2] || '/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js';
let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

const de = `              if (!_tratouCaixa && _r && _r.acao === 'nada'
                  && _fh.temPendencia && _fh.temPendencia(chatId)) {`;

const para = `              // Com pendencia aberta, so intercepta quando a mensagem parece ser PRA
              // Sol -- menciona o nome dela ou cita um card pendente. Sem isto, uma
              // pendencia travada "envenena" a conversa inteira do grupo: qualquer
              // mensagem de qualquer pessoa, sobre qualquer assunto, levava "nao entendi".
              const _pareceProSol = !!(groupEngagement.pareceChamarSol && groupEngagement.pareceChamarSol(body));
              const _citouCard = !!(event.quotedMessageId && _fh.citaAlgumaPendencia
                && _fh.citaAlgumaPendencia(chatId, event.quotedMessageId));
              if (!_tratouCaixa && (_pareceProSol || _citouCard) && _r && _r.acao === 'nada'
                  && _fh.temPendencia && _fh.temPendencia(chatId)) {`;

const n = src.split(de).length - 1;
if (n !== 1) { console.error(`ancora da guarda: esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
if (src.includes('_pareceProSol')) { console.log('ja aplicado'); process.exit(0); }

src = src.split(de).join(para);
fs.writeFileSync(alvo, src, 'utf8');
console.log(`  ok  guarda restrita a mencao/citacao: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
