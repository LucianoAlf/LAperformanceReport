#!/usr/bin/env node
// Corrige a v1 do meu patch da descrição: eu pus a limpeza DEPOIS da lista que remove
// "da", e ela não funcionava por um motivo mais fundo.
//
// 🔴 `\b` em regex JS usa a definição ASCII de word char — e `í` NÃO é word char ali.
// Em "saída", isso cria uma fronteira falsa entre "saí" e "da", e o `\bda\b` da lista
// anterior arranca o "da" de dentro da palavra. Sobrava "saí" na descrição do caixa.
// Vale para QUALQUER palavra acentuada da lista, não só esta.
//
// Duas mudanças: a limpeza da frase-anúncio vem ANTES (para a palavra inteira sumir antes
// de ser mutilada) e usa lookaround Unicode em vez de `\b`.
const fs = require('fs');
const alvo = process.argv[2];
let src = fs.readFileSync(alvo, 'utf8');

// desfaz a v1 (que ficou depois e nao pegava)
const v1 = `
    // a frase que ANUNCIA a saida nao descreve a saida: sem isto a descricao no caixa
    // saia como "PG Semana Seguranca - teve uma sai - seguranca 25/08" (Mayra/CG 25/08)
    .replace(/\\b(teve|houve|tivemos|saida|saída|sai[íi]?da?|retirada|gasto|despesa|uma|um|hoje)\\b/ig, ' ')`;
if (src.includes(v1)) { src = src.split(v1).join(''); console.log('  ok  v1 removida'); }

const de = `    .replace(/r\\$\\s*[\\d.,]+/ig, ' ')
    .replace(/\\b(pagamento|pg|semanal|semana|comprovante|recibo|dinheiro|pix|cart[ãa]o|transfer[êe]ncia|foi|no|na|de|do|da|em)\\b/ig, ' ')`;
const para = `    .replace(/r\\$\\s*[\\d.,]+/ig, ' ')
    // ANTES da lista abaixo, e com lookaround Unicode em vez de \\b: "\\b" em JS e ASCII,
    // entao em "saida" acentuada ele ve fronteira entre "sai" e "da" e o "\\bda\\b" da
    // lista arranca o miolo da palavra. Sobrava "sai" na descricao (Mayra/CG 25/08).
    .replace(/(?<!\\p{L})(teve|houve|tivemos|sa[íi]da|retirada|gasto|despesa|uma?|hoje)(?!\\p{L})/giu, ' ')
    .replace(/\\b(pagamento|pg|semanal|semana|comprovante|recibo|dinheiro|pix|cart[ãa]o|transfer[êe]ncia|foi|no|na|de|do|da|em)\\b/ig, ' ')`;

const n = src.split(de).length - 1;
if (n !== 1) { console.error(`ancora: esperava 1, achei ${n}`); process.exit(1); }
src = src.split(de).join(para);
fs.writeFileSync(alvo, src, 'utf8');
console.log('  ok  limpeza antes da lista, com lookaround unicode');
