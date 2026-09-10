// Caso Mayra/CG (31/08 17:45, o REENVIO): a reidratação ressuscitou a pendência
// velha (valor 38.700 do OCR sem vírgula) e, quando a Mayra reenviou o
// comprovante com a legenda completa, a legenda chegou como MENSAGEM SEPARADA e
// foi sequestrada pelo caminho de correção de nome ("Atualizei a pendencia com
// o aluno informado") — a mídia processou SEM legenda e o card repetiu os
// R$ 38.700,00. De quebra: "O valor bate com 100 parcelas — parece quitação".
//
// Três raízes (nenhuma é regex nova):
//  L1: texto do MESMO remetente com mídia consolidando (lote aberto) é a
//      LEGENDA dela — vai para o lote ANTES de qualquer caminho de correção.
//      A guarda já existia só no bloco de saída (caso refrigerante 28/08).
//  L2: correção de nome que traz VALOR explícito no mesmo texto aplica o valor
//      também (evidência humana vence OCR ruim) — antes o R$387,00 do texto era
//      ignorado e a canônica rodava com 38.700.
//  L3: "parece quitação" tem teto de plausibilidade (2..13 parcelas) — razão de
//      100× é sinal de VALOR ERRADO, não de quitação.
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const MAYRA = '5521955550001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LEGENDA = 'PG pix parcela 09/2026 aluno Sérgio Gabriel Soares Costa - LA CG R$387,00';
const OCR_SEM_VIRGULA = 'R$ 38700\nRealizado em 31/08/2026\nDe\nSERGIO GABRIEL SOARES COSTA\nPara\nESCOLA DE MUSICA L A\nChave Pix 19672908000170\nPix';

const FATURA_09 = {
  ok: true, aluno_nome: 'Sergio Gabriel Soares Costa', responsavel_nome: null,
  fatura: { tipo_fatura: 'parcela', descricao: 'Parcela 09/2026 do curso de Bateria',
    competencia: '2026-09-01', data_vencimento: '2026-09-05', numero_parcela: 2,
    total_parcelas_contrato: 12, status: 'aberta', vencida: false, dias_atraso: 0,
    valor_da_parcela: 387, valor_hoje: 387 },
};

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; const canonicaChamadas = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_SEM_VIRGULA, status: 'ok', file_bytes: 235450 }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Sérgio Gabriel Soares Costa', competencia: '09/2026', forma: 'pix' }),
    canonicaFn: async (_u, nome, valor) => { canonicaChamadas.push({ nome, valor }); return FATURA_09; },
    casarFn: async () => null,
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M' + lancados.length, valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancados, canonicaChamadas };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── L1: o reenvio real — pendência velha viva + mídia e legenda separadas ───
  const A = novo();
  // pendência velha (o card errado de mais cedo, como a reidratação devolve)
  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix-velho.jpg'] });
  checar(/38\.700|38700/.test(ultimo(A.enviadas)), 'setup: pendência velha com o valor errado');

  // REENVIO: mídia primeiro (sem await — fica consolidando no lote), legenda 250ms depois
  const pMedia = A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V2',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix-reenvio.jpg'] });
  await sleep(250);
  const rTexto = await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V3',
    body: LEGENDA, hasMedia: false });
  console.log('texto do reenvio acao:', rTexto && rTexto.acao);
  checar(rTexto && rTexto.acao === 'lote_texto_anexado',
    `a legenda do reenvio deveria ir para o LOTE, não virar correção; veio "${rTexto && rTexto.acao}"`);
  checar(!(rTexto && /aluno_corrigido/.test(String(rTexto.acao))),
    'a legenda NÃO pode ser sequestrada como correção de nome');
  const rMedia = await pMedia;
  console.log('mídia do reenvio acao:', rMedia && rMedia.acao);
  const cardA = ultimo(A.enviadas);
  console.log('card A:', cardA.split('\n').filter(Boolean).slice(0, 6).join(' | ').slice(0, 170));
  checar(/R\$\s*387,00/.test(cardA), 'card do reenvio com R$ 387,00 (legenda venceu o OCR)');
  checar(!/38\.700/.test(cardA), 'card do reenvio sem o 38.700');
  checar(!/parece quita/i.test(cardA), 'sem "parece quitação" com o valor certo');

  // ── L2: sequestro tardio (sem lote) fica INOFENSIVO — nome+valor aplicados ──
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V4',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix-velho.jpg'] });
  B.canonicaChamadas.length = 0;
  const rB = await B.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V5',
    body: LEGENDA, hasMedia: false });
  console.log('correção tardia acao:', rB && rB.acao);
  const cardB = ultimo(B.enviadas);
  checar(rB && /aluno_corrigido/.test(String(rB.acao)), `sem lote aberto, segue como correção; veio "${rB && rB.acao}"`);
  checar(/R\$\s*387,00/.test(cardB), 'L2: o R$387,00 do texto entra no card da correção');
  checar(!/38\.700/.test(cardB), 'L2: o 38.700 herdado do OCR sai do card');
  checar(B.canonicaChamadas.some((c) => Math.abs(c.valor - 387) < 0.01),
    'L2: a canônica roda com o valor do texto (387), não com o do OCR');
  checar(B.logs.some((l) => l.acao === 'valor_do_texto_na_correcao'), 'log da colheita de valor');

  // ── L3: teto da quitação ────────────────────────────────────────────────────
  const C = novo({ interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Sérgio Gabriel Soares Costa', competencia: null, forma: 'pix' }) });
  await C.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V6',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix-velho.jpg'] });
  const cardC = ultimo(C.enviadas);
  checar(!/parece quita/i.test(cardC), 'L3: 38.700 ÷ 387 = 100 parcelas NÃO parece quitação — é valor errado');
  checar(/difere do valor/i.test(cardC), 'L3: com razão implausível, o aviso certo é a divergência');

  // quitação REAL (2×) continua sendo apontada
  const D = novo({ ocrFn: async () => ({ text: OCR_SEM_VIRGULA.replace('R$ 38700', 'R$ 774,00'), status: 'ok', file_bytes: 999 }) });
  await D.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V7',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix2.jpg'] });
  checar(/parece quita/i.test(ultimo(D.enviadas)), 'REGRESSÃO: 774 = 2×387 continua parecendo quitação');

  // ── regressão L1: "pode" durante lote aberto NÃO vira legenda ───────────────
  const E = novo();
  await E.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V8',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix-a.jpg'] });
  const pE = E.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V9',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix-b.jpg'] });
  await sleep(200);
  const rPode = await E.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'V10', body: 'pode', hasMedia: false });
  await pE;
  checar(!(rPode && rPode.acao === 'lote_texto_anexado'), '"pode" com lote aberto continua sendo aprovação, nunca legenda');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — a legenda do reenvio pertence à mídia, e valor humano vence OCR em todo caminho');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
