#!/usr/bin/env node
// "não" passa a descartar de verdade, e a guarda para de falar em cima de conversa.
//
// 🔴 ERRO DE ORIGEM MEU (25/08): na guarda que criei horas antes, escrevi "Responde *pode*
// para lançar como está, *não* para descartar". **O runtime nunca tratou "não"** — só
// existe `casarPode`. Prometi uma opção inexistente, e isso encadeou a tarde inteira:
//
//   20:17  Jhon responde "Não" no card errado -> ninguem trata -> PENDENCIA FICA ORFA
//   20:17  a guarda dispara, usando justo a palavra que EU sugeri
//   20:19  Jhon manda o comprovante da Aurora com legenda; o fluxo de nome-tardio
//          encontra a pendencia orfa (R$300, aluno nao confirmado) e "remonta" com o
//          nome novo -> card com R$ 300,00 + Aurora Paixao (valor de OUTRO comprovante)
//   20:20  ele corrige o valor -> guarda de novo -> so entao o card certo
//
// Nenhum lancamento saiu errado (R$300 Rafael e R$457,06 Aurora entraram certos), mas a
// conversa virou um festival de "nao entendi" — e a causa foi eu prometer um comando que
// nao existia.
//
// SEGUNDO DEFEITO: a guarda respondia "não entendi" a "Certinho" — elogio, nao comando.
// Guarda que fala em cima de conversa normal vira ruido, e ruido ensina a equipe a
// ignorar o aviso justamente quando ele importa.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-descarte-e-guarda-silenciosa.cjs <arquivo>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── 1. as duas funções que faltavam ──────────────────────────────────────────────────
trocar(
  `function fmtBRL(v) {`,
  `// O par que faltava de casarPode. A guarda de 25/08 ja oferecia "nao para descartar"
// sem que ninguem tratasse, e a pendencia ficava viva — depois qualquer legenda nova era
// lida como correcao dela (caso Aurora/CG: card saiu com o valor do comprovante anterior).
// Exigente de proposito: so mensagem CURTA e inequivoca descarta dinheiro.
// ⚠️ "nao e a parcela" / "nao foi esse aluno" NAO sao descarte — sao correcao, e quem
// trata correcao e o fluxo de nome/valor. Descarte e' a frase inteira.
function casarNao(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40) return false;
  const n = t.toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  if (!n) return false;
  return /^(nao|nao pode|nao lanca|nao lancar|nao e|cancela|cancelar|descarta|descartar|ignora|ignorar|deixa|deixa pra la|esquece|esquecer)$/.test(n);
}

// Elogio/agradecimento nao e comando. A guarda de pendencia respondia "nao entendi" a
// "Certinho" (Jhon/CG 25/08).
function ehConversaSemComando(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40) return false;
  const n = t.toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  if (!n) return true;   // so emoji/pontuacao
  return /^(certinho|certo|ok|okay|blz|beleza|show|otimo|perfeito|isso|isso ai|top|valeu|vlw|obrigad[oa]|obg|brigad[oa]|maravilha|boa|massa|legal|entendi|ta bom|tudo certo|feito|combinado|bom dia|boa tarde|boa noite)( .{0,12})?$/.test(n);
}

function fmtBRL(v) {`,
  'casarNao + ehConversaSemComando');

// ── 2. o descarte, antes do nome-tardio ──────────────────────────────────────────────
trocar(
  `      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        const nomeTardio = _nomeHumanoTardio(txt);`,
  `      // DESCARTE: some com a pendencia citada (ou a unica recente). Antes do
      // nome-tardio de proposito — "nao" nunca pode ser lido como nome de aluno.
      if (!event.hasMedia && txt && casarNao(txt)) {
        const arrD = limparVelhos(chatId, agora);
        let alvoD = null;
        if (event.quotedMessageId) alvoD = arrD.find((p) => p.previewId === event.quotedMessageId) || null;
        if (!alvoD && arrD.length === 1) alvoD = arrD[0];
        if (alvoD) {
          pendentes.set(chatId, arrD.filter((p) => p !== alvoD));
          await sendFn(chatId, \`👍 Descartei\${alvoD.valor ? ' o lançamento de ' + fmtBRL(alvoD.valor) : ''}. Nada foi gravado no caixa.\`);
          log({ acao: 'preview_descartado', chatId, previewId: alvoD.previewId, valor: alvoD.valor });
          return { acao: 'preview_descartado' };
        }
      }
      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        const nomeTardio = _nomeHumanoTardio(txt);`,
  'descarte trata "nao"');

// ── 3. exporta para a bridge e para os testes ────────────────────────────────────────
trocar(
  `  parseBRMoney, extrairValor, extrairForma, detectarComprovante, casarPode,`,
  `  parseBRMoney, extrairValor, extrairForma, detectarComprovante, casarPode,
  casarNao, ehConversaSemComando,`,
  'exporta os dois helpers');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
