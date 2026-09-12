#!/usr/bin/env node
// Incidente Sarah/CG 12/09/2026: a legenda humana chegou em bolha irma com
// "PG PIX", mas o OCR da imagem trouxe sinal forte de cartao e o preview saiu
// como credito. A correcao posterior evitou dano financeiro, porem a primeira
// resposta estava errada.
//
// Contrato: legenda humana explicita > OCR/visao. Duas formas humanas => nao
// chuta; sem forma humana, cupom forte de maquininha continua sendo cartao.
process.env.SOL_CAIXA_LOTE_MS = '0';
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '0';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V4_SHADOW = '0';
process.env.SOL_CAIXA_EVIDENCE_SHADOW = '5521981278047-1544204225@g.us';

const mod = require('./_alvo.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const ADM = '5521995507831';
const LEGENDA = 'PG PIX parcela 09/2026 aluna Sarah Ferreira dos Santos R$190,00';
const OCR_CARTAO = [
  'COMPROVANTE DE PAGAMENTO',
  'PAGBANK',
  'VISA',
  'CREDITO A VISTA',
  'NSU 998877',
  'VALOR R$ 190,00',
].join('\n');

function novo({ atrasoOcr = 0, interpretarForma = 'cartao' } = {}) {
  const enviadas = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, texto) => { enviadas.push(String(texto)); return 'MSG' + (++seq); },
    ocrFn: async () => { if (atrasoOcr) await sleep(atrasoOcr); return { text: OCR_CARTAO, status: 'ok' }; },
    visaoFn: async () => ({ valor: 190, forma: 'cartao' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Sarah Ferreira dos Santos',
      competencia: '09/2026', forma: interpretarForma }),
    interpretarMultiFn: async () => null,
    canonicaFn: async () => ({
      ok: true,
      aluno_nome: 'Sarah Ferreira dos Santos',
      responsavel_nome: 'Matheus dos Santos Silva de Oliveira',
      fatura: {
        canonical_fatura_id: 'b25fe5b7-07cf-488f-bbb8-4cdf4f930357',
        aluno_id: 1474,
        descricao: 'Parcela 09/2026 do curso de Canto',
        competencia: '2026-09-01',
        valor_da_parcela: '190.00',
        data_vencimento: '2026-09-20',
      },
    }),
    casarFn: async () => null,
    responsavelFn: async () => ({ ok: true, aluno_nome: 'Sarah Ferreira dos Santos',
      responsavel_nome: 'Matheus dos Santos Silva de Oliveira' }),
    pagadorFn: async () => null,
    faturasMesFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    lancarFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    lancarLoteFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'prev-' + (++seq) }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'appr-' + (++seq) }),
    log: (o) => logs.push(o),
  });
  return { h, enviadas, logs };
}

const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // 1) Caminho real: midia inicia; 30ms depois a bridge entrega a legenda como
  // bolha irma. O OCR forte de cartao nao pode vencer "PG PIX".
  const A = novo({ atrasoOcr: 120 });
  const pMidia = A.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'MIDIA-1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://comprovante.jpg'] });
  await sleep(30);
  const rTexto = await A.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'TEXTO-1',
    body: LEGENDA, hasMedia: false });
  const rMidia = await pMidia;
  const pendA = (A.h._pendentes.get(CHAT) || [])[0];
  const cardA = ultimo(A.enviadas);
  checar(rTexto && rTexto.acao === 'nada', 'a legenda irma deveria ficar no buffer curto');
  checar(rMidia && rMidia.acao === 'preview_enviado', 'a midia deveria gerar preview');
  checar(pendA && pendA.forma === 'pix', 'a pendencia ficou ' + JSON.stringify(pendA && pendA.forma));
  checar(pendA && pendA.cartaoModalidade === null && pendA.cartaoParcelas === null,
    'metadados de cartao vazaram para Pix');
  checar(pendA && pendA.evidenceEnvelope && pendA.evidenceEnvelope.fields.forma
    && pendA.evidenceEnvelope.fields.forma.fonte === 'texto_humano_explicito',
    'o preview legado nao persistiu a proveniencia da forma');
  checar(/R\$\s*190,00\*?\s*·\s*pix/i.test(cardA), 'o card nao mostra R$190 Pix');
  checar(!/cart[aã]o\s+cr[eé]dito/i.test(cardA), 'o card ainda inventou cartao de credito');
  checar(A.logs.some((x) => x.acao === 'forma_humana_vence_inferencia'
    && x.inferida === 'cartao' && x.humana === 'pix'),
    'faltou evidencia auditavel de que a legenda venceu o OCR');
  checar(A.logs.some((x) => x.acao === 'evidence_resolver_shadow'
    && x.trilho === 'legado_midia'),
    'o resolvedor unico nao observou o trilho legado de midia');

  // 2) Legenda na propria midia tem a mesma precedencia.
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'MIDIA-2',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://comprovante.jpg'] });
  const pendB = (B.h._pendentes.get(CHAT) || [])[0];
  checar(pendB && pendB.forma === 'pix', 'legenda propria nao venceu OCR de cartao');

  // 3) Sem legenda humana, o cupom forte continua cartao credito.
  const C = novo();
  await C.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'MIDIA-3',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://comprovante.jpg'] });
  const pendC = (C.h._pendentes.get(CHAT) || [])[0];
  checar(pendC && pendC.forma === 'cartao' && pendC.cartaoModalidade === 'credito',
    'cupom sem legenda deixou de ser cartao credito: ' + JSON.stringify(pendC && {
      forma: pendC.forma, modalidade: pendC.cartaoModalidade }));

  // 4) Duas formas declaradas pela pessoa nao viram palpite do OCR/LLM.
  const D = novo();
  await D.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'MIDIA-4',
    body: 'Pagamento pix ou cartão de crédito? R$190,00 — Sarah Ferreira',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://comprovante.jpg'] });
  const pendD = (D.h._pendentes.get(CHAT) || [])[0];
  checar(pendD && pendD.forma === null && pendD.formaIncerta === true,
    'conflito humano deveria pedir forma, nao escolher: ' + JSON.stringify(pendD && pendD.forma));
  checar(D.logs.some((x) => x.acao === 'forma_humana_ambigua'),
    'conflito humano nao ficou auditado');

  // 5) Unidade do extrator: transferencia Pix e Pix; cartao 2x preserva dados.
  checar(mod.extrairFormaHumana('Transferência Pix realizada').forma === 'pix',
    'transferencia Pix nao foi normalizada como Pix');
  const cred = mod.extrairFormaHumana('Pagamento no cartão de crédito 2x');
  checar(cred.forma === 'cartao' && cred.cartaoModalidade === 'credito' && cred.cartaoParcelas === 2,
    'cartao credito 2x perdeu modalidade/parcelas: ' + JSON.stringify(cred));

  if (falhas.length) {
    console.error('FALHOU:'); falhas.forEach((f) => console.error('  - ' + f)); process.exit(1);
  }
  console.log('ok: legenda humana vence OCR para forma; conflito trava; cupom sem legenda continua cartao');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
