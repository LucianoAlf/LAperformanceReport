#!/usr/bin/env node
// A descrição da saída ia para o caixa com lixo da frase original.
// Caso Mayra/CG 25/08: "PG Semana Seguranca - teve uma saí - segurança 25/08".
// O "teve uma saí" é a própria frase dela ("teve uma saída") mal recortada — o limpador
// remove acento no fim da palavra e não conhece os verbos de saída.
const fs = require('fs');
const alvo = process.argv[2];
let src = fs.readFileSync(alvo, 'utf8');

const de = `    .replace(/\\b(pagamento|pg|semanal|semana|comprovante|recibo|dinheiro|pix|cart[ãa]o|transfer[êe]ncia|foi|no|na|de|do|da|em)\\b/ig, ' ')`;
const para = `    .replace(/\\b(pagamento|pg|semanal|semana|comprovante|recibo|dinheiro|pix|cart[ãa]o|transfer[êe]ncia|foi|no|na|de|do|da|em)\\b/ig, ' ')
    // a frase que ANUNCIA a saida nao descreve a saida: sem isto a descricao no caixa
    // saia como "PG Semana Seguranca - teve uma sai - seguranca 25/08" (Mayra/CG 25/08)
    .replace(/\\b(teve|houve|tivemos|saida|saída|sai[íi]?da?|retirada|gasto|despesa|uma|um|hoje)\\b/ig, ' ')`;

const n = src.split(de).length - 1;
if (n !== 1) { console.error(`ancora: esperava 1, achei ${n}`); process.exit(1); }
src = src.split(de).join(para);
fs.writeFileSync(alvo, src, 'utf8');
console.log('  ok  descricao da saida limpa');
