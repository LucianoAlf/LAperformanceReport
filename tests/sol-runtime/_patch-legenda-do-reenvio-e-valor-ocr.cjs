#!/usr/bin/env node
// Tres bugs encadeados do caso dos 2 refrigerantes, round 2 (Recreio, 28/08 16:48-16:50).
//
// A sequencia real, lida do caixa.log:
//   16:48:53  foto SEM legenda -> OCR -> preview incompleto com R$ 5,01 (!) falta forma
//   16:49:44  foto reenviada COM legenda; a bridge entrega IMAGEM e TEXTO como DOIS
//             eventos separados (260ms de distancia)
//   16:49:46  a correcao-de-tipo (patch de hoje) SEQUESTROU a legenda: viu "Despesa
//             (saida)" + pendencia aberta e converteu a pendencia VELHA de 5,01 —
//             ignorando que a propria legenda dizia R$34 e dinheiro. A imagem
//             reenviada, orfa da legenda, foi recusada (sem_sinal_de_comprovante).
//
// BUG 1 — R$ 5,01. `extrairValorOcr` delega primeiro a `extrairValor`, que pega o
// primeiro "R$ <numero>" do texto. No OCR real do cupom: "Subtotal R$ y 34,00" tem
// um "y" de ruido entre o R$ e o numero (não casa), "Valor Total R$" veio SEM numero
// (quebra de linha), e o primeiro R$ limpo e "Tributos aproximados: Federal R$ 5,01"
// — a linha da Lei da Transparencia, presente em TODO cupom fiscal do pais. Medido
// com tesseract na imagem real do episodio: extrairValor(ocr) = 5.01.
//
// BUG 2 — o sequestro. O anexo de texto ao lote de midia (`anexarTextoAoLote`) e o
// ULTIMO recurso do handler (linha ~3717); a correcao-de-tipo roda antes. Com uma
// midia do MESMO remetente consolidando naquele instante, o texto e a LEGENDA dela
// — nao correcao de pendencia velha.
//
// BUG 3 — mesmo quando a correcao e legitima, ela mantinha valor/forma velhos da
// pendencia. Se a frase de correcao traz "R$34" e "dinheiro", a evidencia explicita
// do humano vence o que a pendencia herdou de OCR ruim.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-legenda-do-reenvio-e-valor-ocr.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── BUG 1: extrairValorOcr ciente de contexto ────────────────────────────────
trocar(
  `function extrairValorOcr(text) {
  const t = String(text || '');
  const comRotulo = extrairValor(t);
  if (comRotulo) return comRotulo;
  const re = /(?<![\\d.,:\\/-])(\\d{1,3}(?:\\.\\d{3})+,\\d{2}|\\d{1,6},\\d{2})(?![\\d.,:\\/-])/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const v = parseBRMoney(m[1]);
    if (v && v < 1000000) return v;
  }
  return null;
}`,
  `function extrairValorOcr(text) {
  const t = String(text || '');
  // A Lei da Transparencia poe "Tributos aproximados: Federal R$ 5,01 ..." em TODO
  // cupom fiscal — e quando o R$ do total sai sujo do OCR ("Subtotal R$ y 34,00",
  // "Valor Total R$" sem numero por quebra de linha), o primeiro R$ LIMPO do texto
  // e o do tributo. Caso real: card dos 2 refrigerantes nasceu com R$ 5,01
  // (Recreio, 28/08/2026). Linhas de tributo saem ANTES de qualquer extracao.
  const semTributos = t.split('\\n')
    .filter((l) => !/trib|ibpt|federal|estadual|municipal/i.test(l))
    .join('\\n');
  // 1) total rotulado, tolerante a ruido de OCR entre o rotulo e o numero
  //    ("Subtotal R$ y 34,00" — o [^\\d\\n]{0,12} atravessa o " R$ y ").
  //    Total antes de subtotal: com desconto, subtotal > pago.
  const RE_NUM = '(\\\\d{1,3}(?:\\\\.\\\\d{3})*,\\\\d{2}|\\\\d{1,6}[.,]\\\\d{2})';
  for (const rotulo of ['(?:valor\\\\s+total|total\\\\s+a\\\\s+pagar|valor\\\\s+pago|valor\\\\s+a\\\\s+pagar|vl\\\\.?\\\\s*total)', 'subtotal']) {
    const m0 = new RegExp(rotulo + '[^\\\\d\\\\n]{0,12}' + RE_NUM, 'i').exec(semTributos);
    if (m0) {
      const bruto = m0[1].includes(',') ? m0[1] : m0[1].replace('.', ',');
      const v = parseBRMoney(bruto);
      if (v && v < 1000000) return v;
    }
  }
  const comRotulo = extrairValor(semTributos);
  if (comRotulo) return comRotulo;
  const re = /(?<![\\d.,:\\/-])(\\d{1,3}(?:\\.\\d{3})+,\\d{2}|\\d{1,6},\\d{2})(?![\\d.,:\\/-])/g;
  let m;
  while ((m = re.exec(semTributos)) !== null) {
    const v = parseBRMoney(m[1]);
    if (v && v < 1000000) return v;
  }
  return null;
}`,
  'extrairValorOcr ignora tributos e tolera ruido no rotulo do total');

// ── BUG 2: correcao-de-tipo nao sequestra legenda de midia em consolidacao ───
trocar(
  `        const _catSaidaCorr = _saidaExplicitaFromCaption(txt);
        if (_catSaidaCorr) {`,
  `        const _catSaidaCorr = _saidaExplicitaFromCaption(txt);
        // ⚠️ Se ha MIDIA deste remetente consolidando AGORA (lote aberto), este texto
        // e a LEGENDA dela — deixa chegar ao anexarTextoAoLote no fim do handler.
        // Sem esta guarda, a legenda do reenvio era sequestrada e convertia uma
        // pendencia velha (caso refrigerantes 28/08: card saiu R$ 5,01).
        const _loteVivo = (() => {
          const l = lotesMidia.get(textoIrmaoKey(event));
          return !!(l && (agora - l.ts) <= 5000);
        })();
        if (_catSaidaCorr && !_loteVivo) {`,
  'correcao de tipo respeita lote de midia aberto');

// ── BUG 3: a frase de correcao atualiza valor e forma quando os traz ─────────
trocar(
  `          if (alvoS && !categoriaEhSaida(alvoS.categoria)) {
            alvoS.categoria = _catSaidaCorr;
            alvoS.aluno = null;              // saida nao tem aluno`,
  `          if (alvoS && !categoriaEhSaida(alvoS.categoria)) {
            alvoS.categoria = _catSaidaCorr;
            // Evidencia explicita do humano vence o que a pendencia herdou de OCR
            // ruim: "2 refrigerantes R$34 ... dinheiro" corrige valor E forma.
            const _vCorr = extrairValor(txt);
            if (_vCorr) alvoS.valor = _vCorr;
            const _fCorr = extrairForma(txt, null);
            if (_fCorr) { alvoS.forma = _fCorr; alvoS.formaIncerta = false; }
            alvoS.aluno = null;              // saida nao tem aluno`,
  'correcao reaproveita valor/forma da propria frase');

// ── export para o teste ──────────────────────────────────────────────────────
trocar(
  `  _saidaExplicitaFromCaption, _nomeHumanoTardio,`,
  `  _saidaExplicitaFromCaption, _nomeHumanoTardio, extrairValorOcr,`,
  'exporta extrairValorOcr');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
