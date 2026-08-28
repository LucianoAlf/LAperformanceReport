#!/usr/bin/env node
// `nsu` e `visa` sem fronteira de palavra faziam cupom fiscal virar cartao.
//
// SINAL_CARTAO tinha `nsu` solto na alternancia. "Nota Fiscal de CoNSUmidor
// Eletronica" -- que esta em TODO cupom de NFC-e -- casava, e `extrairCartao`
// SOBRESCREVE a forma: `if (cc) { forma = 'cartao'; ... }`. Ou seja, o cupom
// dizia "FORMA DE PAGAMENTO DINHEIRO" e a Sol registrava cartao credito.
// "consumo" tambem casava; `visa` idem dentro de "reVISAo".
//
// Impacto alem do caso relatado: qualquer compra paga em dinheiro entrava como
// cartao -- e saida de cofre exige dinheiro, entao o lancamento ia para a forma
// errada justamente onde a regra e mais rigida.
//
// Descoberto ao testar a compra de 2 refrigerantes (Recreio, 28/08/2026): o card
// saia "R$ 34,00 - cartao credito" com pagamento em especie.
//
// ⚠️ A ancora e montada por CODIGO (String.fromCharCode) e o alvo e localizado
// pelo PREFIXO da linha, sem depender de caracteres acentuados: a linha do
// SINAL_CARTAO tem "credito"/"debito" com acento, e tentar ancorar no texto
// acentuado atravessa mal shell/heredoc e falha em silencio.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-sinal-cartao-fronteira.cjs <caixa-financeiro.cjs>'); process.exit(2); }

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);   // barra invertida

const linhas = fs.readFileSync(alvo, 'utf8').split(NL);
const i = linhas.findIndex((l) => l.indexOf('const SINAL_CARTAO = ') === 0);
if (i < 0) { console.error('ANCORA: linha "const SINAL_CARTAO = " nao encontrada'); process.exit(1); }

const antes = linhas[i];
const trocas = [
  ['/(visa|', '/(' + BS + 'bvisa' + BS + 'b|'],
  ['|nsu|', '|' + BS + 'bnsu' + BS + 'b|'],
];

let nova = antes;
for (const [de, para] of trocas) {
  const n = nova.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${de}": esperava 1 na linha, achei ${n}`); process.exit(1); }
  nova = nova.split(de).join(para);
  console.log(`  ok  ${de}  ->  ${para}`);
}

if (nova === antes) { console.error('nada mudou'); process.exit(1); }

linhas[i] = nova;
fs.writeFileSync(alvo, linhas.join(NL), 'utf8');
console.log(`\nlinha ${i + 1} atualizada (${antes.length} -> ${nova.length} bytes)`);
