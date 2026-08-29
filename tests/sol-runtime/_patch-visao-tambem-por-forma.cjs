#!/usr/bin/env node
// A visao tem de rodar quando falta a FORMA, nao so quando falta o VALOR.
//
// CASO (Arthur/Barra, 29/08 12:08): cupom PagBank "VENDA CREDITO MASTERCARD"
// fotografado torto num sofa escuro. Card saiu "R$ 65,00 · ❓ forma nao
// identificada" e travou pedindo "pode, pix / pode, dinheiro / pode, cartao".
//
// CAUSA: o gate da visao era `if (media && (!valor || ocrText.trim().length < 20))`.
// Na foto ruim o OCR devolve 452 chars de RUIDO (medido: "DAR o ple ias CAE / th
// Es Pisa Eidos..."), com ZERO sinal de cartao — passa do limiar de 20 chars sem
// servir para nada. E como a legenda trazia "Valor: R$ 65,00", `!valor` era falso.
// Resultado: a visao — que LE a forma (linha `if (!forma && visao.forma)`) — nunca
// foi chamada.
//
// ⚠️ O PIOR DISSO E' O INCENTIVO INVERTIDO: as 11:27 a MESMA foto, com legenda SEM
// valor, disparou a visao e o card saiu "cartao credito" certinho. As 12:08 o
// Arthur caprichou e escreveu o valor na legenda — e a Sol soube MENOS. A equipe
// era punida por dar mais informacao.
//
// FIX: a visao passa a rodar tambem quando a forma esta faltando. Ela ja sabia
// preencher `forma`; so nunca era acionada por isso.
//
// ⚠️ CUSTO: a visao leva ~25s. Ela NAO passa a rodar sempre — so quando algo
// essencial falta (valor ou forma) e ha midia. No fluxo feliz (comprovante PIX
// legivel, OCR entrega os dois) nada muda. E o custo se compara com o que ja
// acontecia: card travado + ida e volta humana (90s neste episodio) e o risco de
// alguem responder "pode, pix" numa venda que foi no cartao.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-visao-tambem-por-forma.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

trocar(
  "      if (media && (!valor || ocrText.trim().length < 20)) {\n" +
  "        try {\n" +
  "          log({ acao: 'fallback_vision_attempt', chatId, motivo: ocrText.trim().length < 20 ? (ocrMeta.status || 'ocr_curto') : 'valor_ausente' });",
  "      // ⚠️ Tambem por FORMA ausente. A forma e' tao essencial quanto o valor: sem\n" +
  "      // ela o card trava e pede \"pode, pix / pode, dinheiro / pode, cartao\" — e\n" +
  "      // convidar a equipe a escolher a forma de cabeca num cupom de CARTAO e' como\n" +
  "      // dinheiro entra no caixa na linha errada.\n" +
  "      // Caso Arthur/Barra 29/08: foto torta de cupom PagBank num sofa escuro; o OCR\n" +
  "      // devolveu 452 chars de ruido (acima do limiar de 20, sem UM sinal de cartao)\n" +
  "      // e a legenda trazia o valor — entao nada disparava a visao. As 11:27 a MESMA\n" +
  "      // foto, com legenda SEM valor, saiu \"cartao credito\" certinho: dar mais\n" +
  "      // informacao fazia a Sol saber menos.\n" +
  "      if (media && (!valor || !forma || ocrText.trim().length < 20)) {\n" +
  "        try {\n" +
  "          log({ acao: 'fallback_vision_attempt', chatId,\n" +
  "                motivo: ocrText.trim().length < 20 ? (ocrMeta.status || 'ocr_curto')\n" +
  "                  : !valor ? 'valor_ausente' : 'forma_ausente' });",
  'visao dispara tambem por forma ausente');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
