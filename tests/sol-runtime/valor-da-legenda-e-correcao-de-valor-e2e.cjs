// Caso Mayra/CG (31/08 17:23-17:25): PIX de R$ 387,00 com legenda-irmã "PG pix
// parcela 09/2026 aluno Sérgio Gabriel Soares Costa - LA CG R$387,00". O card
// saiu "RECEBIMENTO R$ 38.700,00" — o tesseract perdeu a vírgula ("387,00" →
// "38700"), e o backfill da legenda-irmã era `if (!valor)`: como o OCR já tinha
// preenchido errado, o R$387,00 ESCRITO PELA MAYRA não venceu. E quando ela
// corrigiu ("Sol, o valor foi R$387,00", citando o card), levou "Não entendi
// essa" — correção de valor não era gramática (e o fallback LLM classificou
// sem_intencao).
//
// Raízes:
//  R-j: a legenda humana com R$ explícito VENCE o valor do OCR — é a doutrina
//       "rótulo humano vence OCR ruim" aplicada ao valor.
//  R-k: correção ditada de VALOR ("o valor foi R$387,00" / "valor: 387")
//       atualiza a pendência, recalcula o valor_bate e remonta o card.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const MAYRA = '5521955550001';

const LEGENDA = 'PG pix parcela 09/2026 aluno Sérgio Gabriel Soares Costa - LA CG R$387,00';
// OCR real do tesseract com a vírgula perdida
const OCR_SEM_VIRGULA = 'R$ 38700\nRealizado em 31/08/2026 as 16:57:08\nDe\nSERGIO GABRIEL SOARES COSTA\nInstituicao ITAU UNIBANCO S.A\nPara\nESCOLA DE MUSICA L A\nChave Pix 19672908000170\nPix';

const CANONICA_387 = {
  ok: true, aluno_nome: 'Sergio Gabriel Soares Costa', responsavel_nome: null,
  fatura: { tipo_fatura: 'parcela', descricao: 'Parcela 09/2026 do curso de Bateria',
    competencia: '2026-09-01', data_vencimento: '2026-09-05', numero_parcela: 2,
    total_parcelas_contrato: 12, status: 'aberta', vencida: false, dias_atraso: 0,
    valor_da_parcela: 387, valor_hoje: 387 },
};

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_SEM_VIRGULA, status: 'ok', file_bytes: 235450 }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Sérgio Gabriel Soares Costa', competencia: '09/2026', forma: 'pix' }),
    canonicaFn: async () => CANONICA_387,
    casarFn: async () => CANONICA_387,
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M' + lancados.length, valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── R-j: legenda-irmã com R$ explícito vence o OCR sem vírgula ──────────────
  const A = novo();
  // a legenda chega em bolha separada (é o caso real — legenda_irma_anexada)
  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'T1', body: LEGENDA, hasMedia: false });
  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'M1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const cardA = ultimo(A.enviadas);
  console.log('card A:', cardA.split('\n').filter(Boolean).slice(0, 5).join(' | ').slice(0, 150));
  checar(/R\$\s*387,00/.test(cardA), 'card deveria mostrar R$ 387,00 (da legenda humana)');
  checar(!/38\.700/.test(cardA), 'card NÃO pode mostrar R$ 38.700,00 (vírgula perdida do OCR)');
  checar(A.logs.some((l) => l.acao === 'valor_da_legenda_vence_ocr'), 'deveria logar valor_da_legenda_vence_ocr');
  checar(!/difere do valor/i.test(cardA), 'com o valor certo, some o aviso de divergência');

  // legenda NA PRÓPRIA mídia também vence
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'M2',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(/R\$\s*387,00/.test(ultimo(B.enviadas)), 'legenda inline também vence o OCR');

  // OCR só (sem legenda): não tem o que vencer — mantém o comportamento antigo
  const C = novo();
  await C.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'M3',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(/38\.700|38700/.test(ultimo(C.enviadas)), 'sem legenda, o valor do OCR fica (para o humano corrigir)');

  // ── R-k: correção ditada de valor ───────────────────────────────────────────
  const rK = await C.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'T2',
    body: 'Sol, o valor foi R$387,00', hasMedia: false, quotedMessageId: C.ids[C.ids.length - 1] });
  console.log('correção de valor acao:', rK && rK.acao);
  const cardC = ultimo(C.enviadas);
  console.log('card C:', cardC.split('\n').filter(Boolean).slice(0, 5).join(' | ').slice(0, 150));
  checar(rK && rK.acao === 'preview_valor_corrigido',
    `"o valor foi R$387,00" deveria corrigir; veio "${rK && rK.acao}"`);
  checar(/R\$\s*387,00/.test(cardC), 'card remontado com R$ 387,00');
  checar(!/38\.700/.test(cardC), 'card remontado sem o valor errado');
  checar(!/difere do valor/i.test(cardC), 'aviso de divergência some quando o valor bate');

  // ...e o "pode" lança o valor corrigido
  await C.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'T3', body: 'pode', hasMedia: false });
  checar(C.lancados.length === 1, `"pode" deveria lançar; lançou ${C.lancados.length}`);
  if (C.lancados[0]) checar(String(C.lancados[0].valor) === '387', `valor lançado 387; veio ${C.lancados[0].valor}`);

  // ── regressões ──────────────────────────────────────────────────────────────
  // "pode, R$ 430" continua sendo aprovação com valor (não cai na correção)
  const p = mod.casarPode('pode, R$ 430');
  checar(p.pode === true && p.valor === 430, 'REGRESSÃO: "pode, R$ 430" segue aprovando com valor');
  // nome + valor juntos continuam no caminho do nome (rotulo-vence-casamento-fuzzy)
  const D = novo({ canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }), casarFn: async () => null });
  await D.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'M4',
    body: 'PG parcela sem nome R$976,00', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rD = await D.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'T4',
    body: 'Sol, a aluna é Soraia da Silveira Duarte e o valor é R$976,00', hasMedia: false,
    quotedMessageId: D.ids[D.ids.length - 1] });
  checar(rD && /aluno_corrigido/.test(String(rD.acao)),
    `REGRESSÃO: nome+valor juntos seguem no caminho do nome; veio "${rD && rD.acao}"`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — o valor escrito pelo humano vence o OCR, e a correção de valor tem voz');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
