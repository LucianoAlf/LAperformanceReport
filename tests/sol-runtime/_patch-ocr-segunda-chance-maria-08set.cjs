#!/usr/bin/env node
// SEGUNDA CHANCE DE OCR, NO PADRÃO DA MARIA (08/09/2026).
//
// 🔴 A ORDEM ERA: "ela tem que ler o OCR porque a Maria lê. A Maria não erra
//    nunca. Tem que ver qual ferramenta está lá na Maria... está tratando de
//    dinheiro." Fui ver, e NÃO É OUTRA FERRAMENTA — é o mesmo tesseract, com
//    upscale 3x + cinza + sharpen + binarização antes, dois PSMs escolhidos por
//    score, confiança medida e QR do PIX lido com `zbarimg`.
//
// 🔴 MAS MEDI ANTES DE TROCAR, E OS NÚMEROS DISSERAM OUTRA COISA:
//
//      texto extraído (6 comprovantes reais) : 3 melhoraram 3-7%, 3 PIORARAM
//                                              3-4%. Nenhum ganho claro.
//      tempo (PDF que precisa de OCR real)   : velho ~2,2s · Maria ~6,0s
//                                              → 2,7x MAIS LENTO
//
//    E o defeito nº 1 do OCR da Sol é TIMEOUT: 50 de 242 leituras, 1 em 5.
//    Trocar o motor por um 2,7x mais lento pioraria justamente o que mais
//    quebra. O pré-processamento da Maria é feito para FOTO DE TELA — e foto
//    não fica em cache aqui, então esse caso eu não pude medir. Adotar sem
//    medir seria repetir o erro que eu já cometi hoje de manhã.
//
// 🔴 ENTÃO NÃO TROQUEI O MOTOR: ESCALEI. O caminho rápido segue igual e atende
//    o caso comum. Quando ele falha — exatamente o caso da Mayra hoje
//    (`tesseract_error`, texto vazio) — a Sol chama o pipeline da Maria como
//    SEGUNDA CHANCE. Custo zero no caminho feliz; tratamento pesado só onde ela
//    já tinha desistido e mandado "não consegui ler".
//
// ⚠️ A segunda chance traz `ocr_confidence` e `needs_human_confirmation`, que a
//    Sol NUNCA teve. É a parte que mais importa no dinheiro, e não é sobre
//    acertar mais: é sobre SABER que não leu. Sem isso ela trata leitura ruim
//    como boa e monta card com valor errado.
//
// ⚠️ Traz também o QR (`zbarimg`, instalado hoje). Comprovante PIX tem BR Code
//    `000201...`, lido byte a byte — onde houver, vale mais que qualquer pixel.
//
// ⚠️ A âncora é `ocrFn`, NÃO `ocrLocal`: o runtime injeta a função
//    (`ocrFn = ocrLocal` em `criarHandlerFinanceiro`), e `ocrLocal` só aparece
//    na definição e no export. Ancorar no nome da definição não casaria nada.
//
// ⚠️ Timeout próprio de 90s: ela só roda depois de o rápido desistir, então
//    esperar mais é melhor que não ler. Falha dela NÃO derruba nada.
const fs = require('fs');

const alvo = process.argv[2] ||
  '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('ocrSegundaChance')) { console.log('ja aplicado'); process.exit(0); }

const Q = String.fromCharCode(39);   // aspa simples montada: escrevê-la solta
                                     // dentro de string aninhada já embolou 3x

// ── 1. a função da segunda chance ──────────────────────────────────────────
const ANC1 = 'function ocrLocal(imagePath, { timeout = 45000, detailed = false } = {}) {';
if ((s.split(ANC1).length - 1) !== 1) { console.error('ANCORA ocrLocal: esperava 1'); process.exit(1); }

const FUNCAO = [
  '// Segunda chance no padrao da Maria: upscale + binarizacao + 2 PSMs por score',
  '// + confianca medida + QR do PIX. Roda SO quando o caminho rapido falhou —',
  '// medido 2,7x mais lento (2,2s -> 6,0s), e timeout ja e o defeito nº1',
  '// (50 de 242). Rapido no comum, pesado onde ja tinha desistido.',
  'function ocrSegundaChance(caminho) {',
  '  try {',
  '    const cp = require(' + Q + 'child_process' + Q + ');',
  '    const r = cp.spawnSync(' + Q + '/usr/bin/python3' + Q + ',',
  '      [' + Q + '/home/sol/.openclaw/workspace/scripts/ocr-comprovante.py' + Q + ', caminho],',
  '      { timeout: 90000, encoding: ' + Q + 'utf8' + Q + ', maxBuffer: 4 * 1024 * 1024 });',
  '    if (r.status !== 0 || !r.stdout) return null;',
  '    const j = JSON.parse(r.stdout);',
  '    return (j && j.ok && j.text) ? j : null;',
  '  } catch (_) { return null; }   // segunda chance nunca derruba nada',
  '}',
  '',
  ANC1,
].join('\n');
s = s.replace(ANC1, FUNCAO);

// ── 2. o chamador escala quando o rápido não leu ───────────────────────────
const ANC2 = '          const rawOcr = await ocrFn(media, { detailed: true });';
const n2 = s.split(ANC2).length - 1;
if (n2 !== 1) { console.error('ANCORA ocrFn: esperava 1, achei ' + n2); process.exit(1); }

const VAZIO = '!String((rawOcr && rawOcr.text) || rawOcr || ' + Q + Q + ').trim()';

const NOVO2 = [
  ANC2,
  '          // 🔴 SEGUNDA CHANCE: o rapido desistiu (vazio, erro ou timeout). E o',
  '          //    caso da Mayra hoje: PDF com tesseract_error cujo valor a Sol',
  '          //    nunca leu, e ela pediu a legenda que acabara de receber.',
  '          if (' + VAZIO + ') {',
  '            const _alt = ocrSegundaChance(media);',
  '            if (_alt) {',
  '              // ⚠️ confianca e QR: a Sol NUNCA teve. Saber que NAO leu vale',
  '              //    mais que ler mais — sem isso ela trata leitura ruim como boa.',
  '              ocrText = String(_alt.text || ' + Q + Q + ');',
  '              ocrMeta = Object.assign({}, ocrMeta, {',
  '                status: ' + Q + 'ok_segunda_chance' + Q + ',',
  '                ocr_confidence: _alt.ocr_confidence,',
  '                needs_human_confirmation: _alt.needs_human_confirmation,',
  '                qr: _alt.qr || [], pix_payloads: _alt.pix_payloads || [] });',
  '              log({ acao: ' + Q + 'ocr_segunda_chance' + Q + ', chatId, engine: _alt.engine,',
  '                    conf: _alt.ocr_confidence, chars: ocrText.length,',
  '                    qr: (_alt.qr || []).length });',
  '            }',
  '          }',
].join('\n');
s = s.replace(ANC2, NOVO2);

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-before-ocr-segunda-chance');
fs.writeFileSync(alvo, s);
console.log('segunda chance de OCR (padrao Maria) ligada no caminho de falha');
console.log('⚠️ REINICIE A BRIDGE — require no start');
