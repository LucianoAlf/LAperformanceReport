#!/usr/bin/env node
// A LEGENDA IRMÃ PASSA A SER VISTA ANTES DE A SOL DESISTIR (08/09/2026).
//
// 🔴 O CASO REAL, Campo Grande, hoje 11:30:
//
//    11:30:32  Mayra encaminha um PDF (comprovante, 68 KB)
//    11:30:33  OCR tenta
//    11:30:34  OCR falha (`tesseract_error`, exit 1)
//    11:30     Mayra manda, no MESMO segundo, em bolha separada:
//              "PG pix parcela 09/2026 aluno Lucca Gabriel de Almeida Bispo -
//               LA CG R$347,00"
//    11:30     Sol: "👀 Recebi, mas não consegui ler. Se for comprovante, manda
//              com a legenda (ex.: comprovante pix R$ 300 - Fulano)."
//
//    Ela pediu exatamente o que a Mayra tinha acabado de mandar. O lançamento
//    nunca saiu: o caixa de CG não tem entrada de R$ 347 do Lucca.
//
// 🔴 O DEFEITO NÃO É O OCR — É UM `return` NO LUGAR ERRADO. A costura da
//    mensagem irmã JÁ EXISTE neste arquivo, com janela de 150s, e o comentário
//    dela diz: *"Igual a Maria: o texto adjacente NÃO se perde"*. Só que ela
//    mora ~10 linhas ABAIXO do `return { acao: 'midia_recusada' }`. Quando o
//    OCR falha, o fluxo devolve antes de chegar lá.
//
//    É a mesma forma do bug do `sync-matriculas-emusys` documentado no
//    CLAUDE.md: um `return` inserido no meio do handler deixou tudo abaixo dele
//    inalcançável, e nada acusou porque a função seguia respondendo "ok".
//
// ⚠️ A correção NÃO duplica a costura: só ANTECIPA a leitura da irmã para
//    dentro da classificação. O bloco original continua onde está e segue
//    fazendo o backfill de valor/forma — reimplementar a costura em dois
//    lugares é como nasceram as duplicatas de renovação.
//
// ⚠️ NÃO consome a irmã aqui (`textosRecentes.delete` fica de fora): quem
//    consome é o bloco de baixo. Deletar na espiada quebraria o backfill.
//
// ⚠️ Isto NÃO faz a Sol lançar sozinha: ela volta a montar o CARD e continua
//    pedindo "pode". O que muda é ela parar de pedir o que já recebeu.
const fs = require('fs');

const alvo = process.argv[2] ||
  '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('legenda_irma_espiada')) { console.log('ja aplicado'); process.exit(0); }

const VELHO = [
  '      // PORTA 2: print de tela / orçamento NÃO viram recebimento.',
  '      let cls = classificarMidia(ocrText, event.body);',
].join('\n');

const NOVO = [
  '      // 🔴 ESPIADA NA IRMÃ ANTES DE CLASSIFICAR. A costura da mensagem irmã',
  '      //    existe ~10 linhas abaixo, mas fica DEPOIS do `return` de mídia',
  '      //    recusada: com o OCR falhando, o fluxo devolvia "não consegui ler"',
  '      //    sem nunca olhar o texto que a pessoa mandou no mesmo segundo.',
  '      //    Caso Mayra/Lucca, CG 08/09 11:30 — ela pediu a legenda que tinha',
  '      //    acabado de receber, e o lançamento de R$ 347 nunca saiu.',
  '      // ⚠️ Só ESPIA: não consome (`textosRecentes.delete` é do bloco de baixo,',
  '      //    que ainda faz o backfill de valor/forma). Deletar aqui quebraria ele.',
  '      let _bodyComIrma = event.body;',
  '      try {',
  '        const _kEsp = textoIrmaoKey(event);',
  '        const _bufEsp = textosRecentes.get(_kEsp);',
  '        const _frescoEsp = _bufEsp && _bufEsp.ts >= agora - 150000 && _bufEsp.ts <= agora + 60000;',
  '        if (_frescoEsp && bodyLimpo(_bufEsp.texto)',
  '            && bodyLimpo(_bufEsp.texto) !== bodyLimpo(event.body)) {',
  "          _bodyComIrma = (bodyLimpo(event.body) ? bodyLimpo(event.body) + ' \\u00b7 ' : '')",
  '                         + bodyLimpo(_bufEsp.texto);',
  "          log({ acao: 'legenda_irma_espiada', chatId, tinha_ocr: Boolean(ocrText) });",
  '        }',
  '      } catch (_) { _bodyComIrma = event.body; }',
  '',
  '      // PORTA 2: print de tela / orçamento NÃO viram recebimento.',
  '      let cls = classificarMidia(ocrText, _bodyComIrma);',
].join('\n');

const n = s.split(VELHO).length - 1;
if (n !== 1) { console.error(`ANCORA da classificacao: esperava 1, achei ${n}`); process.exit(1); }

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, `${alvo}.bak-${carimbo}-before-legenda-irma`);
fs.writeFileSync(alvo, s.split(VELHO).join(NOVO));
console.log('a legenda irma passa a ser vista ANTES de desistir');
console.log('⚠️ REINICIE A BRIDGE — require no start');
