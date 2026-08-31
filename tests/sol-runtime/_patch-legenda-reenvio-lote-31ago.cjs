#!/usr/bin/env node
// Caso Mayra/CG 31/08 17:45 (o REENVIO) — o card repetiu R$ 38.700,00 MESMO com
// os fixes R-j/R-k no ar, porque a legenda nunca chegou aos caminhos que eles
// cobrem. Cadeia real (log 20:45 UTC): a reidratação ressuscitou a pendência
// velha (correto) -> a legenda do reenvio, chegando como mensagem separada, foi
// SEQUESTRADA pelo caminho de correção de nome ("Atualizei a pendencia com o
// aluno informado") -> a mídia processou SEM legenda -> valor do OCR de novo.
//
// L1  TEXTO COM MÍDIA CONSOLIDANDO É LEGENDA. A guarda de lote-aberto já
//     existia no bloco de saída (caso refrigerante 28/08); agora cobre TODAS as
//     correções: texto do mesmo remetente com lote vivo vai para o lote ANTES
//     de qualquer caminho de correção. "pode"/"não" seguem passando.
//
// L2  CORREÇÃO DE NOME COLHE O VALOR DO MESMO TEXTO. Sem isso, o sequestro
//     tardio (fora da janela do lote) mantinha o 38.700 herdado do OCR e a
//     canônica rodava com ele. Evidência humana explícita vence OCR ruim — a
//     mesma doutrina do refrigerante, aplicada ao caminho do nome.
//     (extrairValor já existe; nenhuma regex nova.)
//
// L3  "PARECE QUITAÇÃO" TEM TETO. 38.700 ÷ 387 = "100 parcelas" não é
//     quitação, é valor errado. Plausível: 2..13 (12 do contrato + margem).
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-legenda-reenvio-lote-31ago.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── L1: lote aberto captura o texto antes de QUALQUER correção ───────────────
trocar(
  `    // 1.5) resposta curta que COMPLETA o que ela pediu (valor e/ou forma).
    // Nao lanca: so preenche a lacuna e repergunta -- o gate do "pode" continua valendo.
    {
      const arrP = limparVelhos(chatId, agora);
      const txt = String(event.body || '').trim();`,
  `    // 1.5) resposta curta que COMPLETA o que ela pediu (valor e/ou forma).
    // Nao lanca: so preenche a lacuna e repergunta -- o gate do "pode" continua valendo.
    {
      const arrP = limparVelhos(chatId, agora);
      const txt = String(event.body || '').trim();

      // ⚠️ MIDIA DESTE REMETENTE CONSOLIDANDO AGORA (lote aberto): este texto e
      // a LEGENDA dela — vai para o lote ANTES de qualquer caminho de correcao.
      // Em 31/08 17:45 a pendencia REIDRATADA sequestrou a legenda do reenvio
      // como "correcao de nome" e a midia processou SEM legenda: o card repetiu
      // o R$ 38.700 do OCR mesmo com "R$387,00" escrito pela Mayra. A guarda ja
      // existia so no bloco de saida (refrigerante 28/08); agora cobre todas.
      // Aprovacao/descarte ("pode"/"nao") seguem passando para o gate.
      if (!event.hasMedia && txt && !casarPode(txt).pode && !casarNao(txt)) {
        const _loteLegenda = lotesMidia.get(textoIrmaoKey(event));
        if (_loteLegenda && (agora - _loteLegenda.ts) <= 5000 && anexarTextoAoLote(event, txt, agora)) {
          return { acao: 'lote_texto_anexado' };
        }
      }`,
  'L1 lote aberto captura o texto antes das correcoes');

// ── L2: correcao de nome colhe o valor do mesmo texto ────────────────────────
trocar(
  `        if (nomeTardio && alvoP) {
          let alunoConfirmado = false;`,
  `        if (nomeTardio && alvoP) {
          // Evidencia explicita do humano no MESMO texto vence o que a pendencia
          // herdou de OCR ruim (31/08: a correcao trazia "R$387,00" e o card
          // manteve os 38.700 do OCR — e a canonica rodou com o valor errado).
          // Colher ANTES da canonica: com 387 ela casa a fatura por valor exato.
          {
            const _vTexto = extrairValor(txt);
            if (_vTexto && Math.abs((alvoP.valor || 0) - _vTexto) >= 0.01) {
              log({ acao: 'valor_do_texto_na_correcao', chatId, de: alvoP.valor || null, para: _vTexto });
              alvoP.valor = _vTexto;
            }
          }
          let alunoConfirmado = false;`,
  'L2 correcao de nome colhe valor');

// ── L3a: teto da quitacao no render da fatura ────────────────────────────────
trocar(
  `  const quitacao = (valorComprovante && vp) ? (Number(valorComprovante) % vp < 0.01 && Number(valorComprovante) / vp >= 2) : false;`,
  `  // Teto de plausibilidade: quitacao real e' ate ~12 parcelas + margem. Razao
  // de 100x (31/08: OCR sem virgula fez 38.700 "bater com 100 parcelas") e'
  // sinal de VALOR ERRADO — o aviso certo e' a divergencia, nao a quitacao.
  const _razaoParcelas = (valorComprovante && vp) ? Number(valorComprovante) / vp : 0;
  const quitacao = (valorComprovante && vp) ? (Number(valorComprovante) % vp < 0.01 && _razaoParcelas >= 2 && _razaoParcelas <= 13) : false;`,
  'L3a teto da quitacao no render');

// ── L3b: teto no bloco de quitacao declarada (multiplas) ─────────────────────
trocar(
  `        if (!n || n < 2) n = (cartaoParcelas && cartaoParcelas > 1) ? cartaoParcelas : null;`,
  `        if (!n || n < 2) n = (cartaoParcelas && cartaoParcelas > 1) ? cartaoParcelas : null;
        if (n && n > 13) { log({ acao: 'quitacao_razao_implausivel', chatId, n }); n = null; }`,
  'L3b teto no bloco de quitacao declarada');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
