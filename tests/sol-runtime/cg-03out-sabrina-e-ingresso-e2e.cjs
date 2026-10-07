// Campo Grande, 03/10/2026 — duas confusões da Sol na mesma manhã.
//
// 1. SABRINA (Mayra, Pix R$ 357, legenda "PG pix parcela 10/2026 aluna Sabrina
//    Maria Gomes Santos - LA CG R$357,00"). O leitor de período não tinha
//    fronteira de palavra: "sABRin(A) MARia" virou "abr a mar" e o card saiu como
//    QUITAÇÃO 04/2026 a 03/2027, sem vínculo de fatura. A correção "Sol, é parcela
//    10/2026" trocou a competência, mas o card continuou dizendo quitação.
// 2. INGRESSO (Jereh, R$ 40, LA Session). O card de ingresso nascia sem AUTOR;
//    com o card da Sabrina aberto, o "pode" do próprio Jereh virou "tem mais de um
//    comprovante aguardando", em vez de valer para o card dele.
// Handler real, E/S fake: nada vai ao WhatsApp nem ao caixa.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_V4_CANARIO = '';
const path = require('path');
const mod = require('./_alvo.cjs');
const ing = require(path.join(path.dirname(require.resolve('./_alvo.cjs')), '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-ingressos.cjs'));

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const MAYRA = '5521900000011';
const JEREH = '5521900000022';
const LEGENDA = 'PG pix parcela 10/2026 aluna Sabrina Maria Gomes Santos - LA CG R$357,00';
const FATURA_10 = { canonical_fatura_id: '00000000-0000-4000-8000-000000000910', aluno_id: 501,
  tipo_fatura: 'parcela', descricao: 'Parcela 10/2026 do curso de Teclado', competencia: '2026-10-01',
  status: 'aberta', valor_da_parcela: 357, numero_parcela: 7, total_parcelas_contrato: 12 };
const CONFIG = ing.validarConfigIngressos({ schema_version: 1, eventos: [
  { id: 'la-session-felipe-alves', nome: 'LA Session – Felipe Alves',
    aliases: ['la session', 'l.a session'], lotes: [{ nome: '1º lote', preco: 40 }] },
] });

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

function fixture() {
  const enviadas = []; const lancados = []; const logs = []; const quitacoes = []; let seq = 0;
  let ocr = 'Comprovante Pix\nValor R$ 357,00\nPara L A MUSIC';
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: ocr, status: 'ok', file_bytes: 19000 }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Sabrina Maria Gomes Santos', forma: 'pix', competencia: '10/2026' }),
    identidadeFn: async (tel) => (tel === MAYRA ? { identificado: true, nome: 'Mayra' } : { identificado: false }),
    duplicataFn: async () => ({ ja_lancado: false }),
    responsavelFn: async () => null,
    canonicaFn: async () => ({ ok: true, aluno_nome: 'Sabrina Maria Gomes Santos', motivo: 'do_mes_a_vencer', fatura: FATURA_10 }),
    casarFn: async () => null, pagadorFn: async () => ({ ok: false }), faturasMesFn: async () => null,
    faturasQuitacaoFn: async (_u, _a, q) => { quitacoes.push(q); return { ok: false, motivo: 'faturas_ja_vinculadas', n: 12 }; },
    listarPreviewsAbertosFn: async () => [], rotearV4Fn: async () => null, chequesFn: null,
    ingressosConfigFn: () => CONFIG,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV-' + lancados.length, valor: Number(p.valor), forma: p.forma }; },
    log: (o) => logs.push(o),
  });
  return { h, enviadas, lancados, logs, quitacoes, setOcr: (t) => { ocr = t; } };
}
let _id = 0;
const foto = (body, quem, extra = {}) => ({ chatId: CHAT, senderPhone: quem, senderId: quem + '@c.us',
  messageId: 'F' + (++_id), body, hasMedia: true, mediaType: 'document', mediaUrls: ['fake://c.pdf'], ...extra });
const txt = (body, quem, extra = {}) => ({ chatId: CHAT, senderPhone: quem, senderId: quem + '@c.us',
  messageId: 'T' + (++_id), body, hasMedia: false, ...extra });

(async () => {
  // ── unidade: leitor de período ────────────────────────────────────────────
  const per = mod.extrairPeriodoMeses;
  ok(per(LEGENDA) === null, `legenda da Sabrina não declara período; veio ${JSON.stringify(per(LEGENDA))}`);
  ok(per('aluno Marcelo Abreu a Maria') === null, 'nomes com "mar"/"abr" dentro não são meses');
  for (const [t, ini, fim] of [['de setembro a agosto', '09/2026', '08/2027'], ['set/26 a ago/27', '09/2026', '08/2027'],
    ['de 09/2026 a 08/2027', '09/2026', '08/2027'], ['09/2026-08/2027', '09/2026', '08/2027'],
    ['setembro de 2026 a agosto de 2027', '09/2026', '08/2027'], ['abril - junho', '04/2026', '06/2026']]) {
    const r = per(t);
    ok(r && r.inicio === ini && r.fim === fim, `REGRESSÃO período "${t}" -> ${JSON.stringify(r)}`);
  }

  // ── 1. Sabrina: parcela única, sem quitação ────────────────────────────────
  const A = fixture();
  const r1 = await A.h.handle(foto(LEGENDA, MAYRA));
  const card = A.enviadas.at(-1) || '';
  ok(r1 && r1.acao === 'preview_enviado', `deveria abrir card; veio ${JSON.stringify(r1)}`);
  ok(!/várias parcelas/i.test(card), `card da Sabrina não pode ser quitação: ${card.replace(/\n/g, ' | ')}`);
  ok(!/04\/2026 a 03\/2027/.test(card), 'card não pode inventar meses 04/2026 a 03/2027');
  ok(A.quitacoes.length === 0, 'não deveria nem procurar faturas de quitação');
  ok(/10\/2026/.test(card), 'card deveria trazer a parcela 10/2026');

  // ── 1b. card que já nasceu como quitação: "é parcela 10/2026" desfaz ───────
  const B = fixture();
  await B.h.handle(foto('PG pix quitação aluna Sabrina Maria Gomes Santos R$357,00', MAYRA));
  const cardQ = B.enviadas.at(-1) || '';
  ok(/várias parcelas/i.test(cardQ), 'controle: com "quitação" na legenda o card é de quitação');
  const pendB = B.h._pendentes.get(CHAT)[0];
  await B.h.handle(txt('Sol, é parcela 10/2026', MAYRA, { quotedMessageId: pendB.previewId }));
  const cardC = B.enviadas.at(-1) || '';
  ok(/Corrigi a competência para \*10\/2026\*/.test(cardC), `deveria corrigir a competência: ${cardC.slice(0, 120)}`);
  ok(!/várias parcelas/i.test(cardC), `depois da correção não pode continuar quitação: ${cardC.replace(/\n/g, ' | ')}`);
  const pendC = B.h._pendentes.get(CHAT)[0];
  ok(pendC && pendC.multiplas === false && pendC.quitacao == null, 'pendência corrigida sem multiplas/quitação');

  // ── 2. ingresso do Jereh com o card da Mayra aberto ────────────────────────
  const C = fixture();
  await C.h.handle(foto(LEGENDA, MAYRA));
  C.setOcr('COMPROVANTE PIX\nVALOR PAGO R$ 40,00\n03/10/2026');
  const ri = await C.h.handle(foto('1 ingresso LA Session Felipe Alves Total: R$40', JEREH));
  ok(ri && ri.acao === 'preview_venda_ingresso', `deveria abrir card de ingresso; veio ${JSON.stringify(ri)}`);
  const pendI = C.h._pendentes.get(CHAT).find((p) => p.ingresso);
  ok(pendI && pendI.autorPhone === JEREH, `card de ingresso deveria guardar o autor; veio ${pendI && pendI.autorPhone}`);
  const rp = await C.h.handle(txt('Pode', JEREH));
  ok(rp && rp.acao === 'lancado', `"Pode" do Jereh deveria lançar o card DELE; veio ${JSON.stringify(rp)}`);
  ok(C.lancados.length === 1 && Number(C.lancados[0].valor) === 40, 'lançou só o ingresso de R$ 40');
  ok(C.logs.some((l) => l.acao === 'pode_resolvido_por_autor'), 'resolvido pelo autor');
  ok(C.h._pendentes.get(CHAT).some((p) => Number(p.valor) === 357), 'card da Sabrina continua aberto, intacto');

  // controle: quem não tem card próprio continua recebendo a lista
  const D = fixture();
  await D.h.handle(foto(LEGENDA, MAYRA));
  D.setOcr('COMPROVANTE PIX\nVALOR PAGO R$ 40,00\n03/10/2026');
  await D.h.handle(foto('1 ingresso LA Session Felipe Alves Total: R$40', JEREH));
  const rq = await D.h.handle(txt('pode', '5521900000033'));
  ok(rq && rq.acao === 'ambiguo', `terceiro sem card próprio deveria receber a lista; veio ${JSON.stringify(rq)}`);
  ok(D.lancados.length === 0, 'nada lançado no pode ambíguo');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — parcela única não vira quitação, e o "pode" do autor acha o card dele');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
