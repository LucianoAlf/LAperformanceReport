#!/usr/bin/env node
// A 14a PORTA: registrar desfecho (07/09/2026 — Fatia 3).
//
// 🔴 E a UNICA porta que ESCREVE. Todas as outras 13 leem. A descricao carrega
//    isso explicitamente, e carrega os quatro valores aceitos — sem eles o
//    modelo tentaria inventar um quinto e levaria recusa.
//
// ⚠️ `falso_positivo` esta na lista de proposito e e o valor mais valioso dos
//    quatro: e ele que mede se a regra merece continuar. A descricao PEDE para
//    a Sol usa-lo sem constrangimento — agente que esconde o proprio erro nao
//    e auditavel.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-porta-desfecho-07set.mjs <sol-portas-mcp.mjs>'); process.exit(2); }
let s = fs.readFileSync(alvo, 'utf8');
if (s.includes("name: 'registrar_desfecho'")) { console.log('ja aplicado'); process.exit(0); }

const ANC = "  { name: 'agenda_do_dia', fn: 'sol_porta_agenda_do_dia_v1',";
const n = s.split(ANC).length - 1;
if (n !== 1) { console.error(`ANCORA: esperava 1, achei ${n}`); process.exit(1); }

const NOVA = `  { name: 'registrar_desfecho', fn: 'sol_porta_registrar_desfecho_v1',
    description: 'Fecha um item da pauta quando a pessoa conta o que aconteceu: "já liguei pra Catarina, ela vai ficar", "falei e vai sair mesmo", "esse aí não era nada". 🔴 É a ÚNICA porta que ESCREVE — todas as outras só leem. Quatro desfechos e só eles: \`reteve\` (falei e a família fica) · \`saiu\` (falei e vai sair mesmo) · \`falso_positivo\` (não era nada, já estava resolvido) · \`nao_aplicavel\` (não é da minha alçada). 🔴 Use \`falso_positivo\` sem constrangimento quando for o caso: é ele que mede quais regras merecem continuar, e esconder erro nosso é pior que admiti-lo. ⚠️ Só fecha item da unidade de quem falou, e só o que ainda está aberto. ⚠️ Dois alunos de mesmo primeiro nome fazem a porta RECUSAR e pedir o nome completo — ela nunca escolhe no chute (em 29/08 o casamento frouxo de nome pôs a responsável da Laura no card da Soraia).',
    schema: { ...Q,
      p_aluno: { type: 'string', description: 'Nome do aluno como a pessoa falou. Não invente sobrenome.' },
      p_desfecho: { type: 'string', description: 'reteve | saiu | falso_positivo | nao_aplicavel' },
      p_nota: { type: 'string', description: 'O que a pessoa contou, nas palavras dela. Opcional, mas é o que vale para aprender.' } } },

`;
s = s.replace(ANC, NOVA + ANC);
fs.writeFileSync(alvo, s);
const qtd = (s.match(/^  \{ name: '/gm) || []).length;
const peso = [...s.matchAll(/description: '([^']*)'/g)].reduce((a, m) => a + m[1].length, 0);
console.log(`porta registrar_desfecho acrescentada — ${qtd} portas, ${(peso/1024).toFixed(1)} KB de descricao`);
