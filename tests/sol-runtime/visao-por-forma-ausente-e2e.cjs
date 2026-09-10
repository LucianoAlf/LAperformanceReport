// A visão tem de rodar quando falta a FORMA, não só quando falta o VALOR.
//
// CASO (Arthur/Barra, 29/08 12:08): cupom PagBank "VENDA CREDITO MASTERCARD"
// fotografado torto num sofá escuro. Card: "R$ 65,00 · ❓ forma não identificada",
// travado pedindo "pode, pix / pode, dinheiro / pode, cartão".
//
// CAUSA: o gate era `!valor || ocrText.length < 20`. O OCR da foto ruim devolve 452
// chars de RUÍDO (medido no runtime: "DAR o ple ias CAE / th És Pisa Eidos...") —
// passa do limiar de 20 sem ter UM sinal de cartão. E a legenda trazia "Valor:
// R$ 65,00", então `!valor` era falso. A visão, que sabe ler a forma, nunca rodou.
//
// ⚠️ INCENTIVO INVERTIDO: às 11:27 a MESMA foto, com legenda SEM valor, disparou a
// visão e saiu "cartão crédito" certinho. Às 12:08 o Arthur caprichou e escreveu o
// valor — e a Sol soube MENOS. Este teste trava exatamente esse par.
const mod = require('./_alvo.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const ARTHUR = '5521966660001';

// Réplica do OCR real da foto ruim: 452 chars de ruído, zero sinal de cartão.
const OCR_RUIDO = [
  'DAR o ple ias CAE',
  'th És Pisa Eidos É Tis AS AE x3',
  '0 LY AP A DES',
  'PRC S Vit a th ees ea',
  'EB Sol o res nS phage',
  'sf WAL sa . ai rádio TER ED',
  'IRD A RSS',
  '7 Uh E RAE DES km) ups ee',
  'e tj Í ¥- f. 7 a é” % /',
  'Wi Any ; E rae i e”',
  'se :',
  'fj PRA fs ff ; -',
].join('\n');

function novo(overrides = {}) {
  const enviadas = []; const logs = []; let visaoChamadas = 0; let seq = 0; const ids = [];
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_RUIDO, status: 'ok_parcial', file_bytes: 122752 }),
    // a visão LÊ a forma na imagem — é o que o OCR não conseguiu
    visaoFn: async () => { visaoChamadas++; return { valor: 65, forma: 'cartao' }; },
    interpretarFn: async () => ({ categoria: 'lojinha', aluno: 'Theo de Bem', competencia: null, forma: null }),
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => ({ nome: 'Monique de Bem Felgueiras Ferreira' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Arthur Ferreira' }),
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, visao: () => visaoChamadas };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── a armadilha existe: o OCR da foto ruim não tem sinal de cartão ─────────
  checar(OCR_RUIDO.trim().length > 20, 'o ruído passa do limiar de 20 chars (é por isso que enganava)');
  checar(mod.extrairForma(OCR_RUIDO, null) === null, 'o OCR de ruído não dá forma');
  checar(mod.extrairCartao(OCR_RUIDO) === null, 'o OCR de ruído não acusa cartão');

  // ── o caso real: legenda COM valor e SEM forma ────────────────────────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'F1',
    body: 'Venda camiseta preta la music Kids para o aluno Theo de bem\nVenda: Arthur\nValor: R$ 65,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'] });
  const card = ultimo(A.enviadas);
  console.log('card:', card.split('\n').filter(Boolean).slice(0, 5).join(' | ').slice(0, 160));
  console.log('visão chamada:', A.visao(), 'vez(es)');

  checar(A.visao() === 1, `a visão deveria rodar por forma ausente; rodou ${A.visao()}x`);
  checar(A.logs.some(l => l.acao === 'fallback_vision_attempt' && l.motivo === 'forma_ausente'),
    'deveria logar motivo forma_ausente');
  checar(!/forma n[aã]o identificada/i.test(card), 'card NÃO pode dizer "forma não identificada"');
  checar(/cart[aã]o/i.test(card), 'card deveria trazer cartão');
  checar(/65/.test(card), 'card deveria manter R$ 65');
  checar(!/Me confirma a forma/i.test(card), 'não pode pedir a forma que estava no comprovante');

  // ── o par do incentivo: MESMA foto, legenda SEM valor, continua funcionando ─
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'F2',
    body: 'Venda camiseta preta la music Kids para o aluno Theo de bem\nVenda: Arthur',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'] });
  checar(B.visao() === 1, 'sem valor na legenda a visão continua rodando');
  checar(/cart[aã]o/i.test(ultimo(B.enviadas)), 'o caso das 11:27 tem de seguir funcionando');
  // dar MAIS informação não pode produzir MENOS resultado
  checar(/forma n[aã]o identificada/i.test(ultimo(A.enviadas)) === /forma n[aã]o identificada/i.test(ultimo(B.enviadas)),
    'escrever o valor na legenda não pode piorar o resultado');

  // ── ECONOMIA: OCR bom com valor E forma não chama a visão ──────────────────
  const C = novo({
    ocrFn: async () => ({ text: 'PagBank VIA ESTABELECIMENTO\nVENDA CREDITO MASTERCARD\nR$ 65,00\nLA MUSIC KIDS BARRA', status: 'ok', file_bytes: 40000 }),
  });
  await C.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'F3',
    body: 'Venda camiseta para o aluno Theo de Bem', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://bom.jpg'] });
  console.log('OCR bom → visão chamada:', C.visao(), 'vez(es)');
  checar(C.visao() === 0, `OCR completo não pode gastar visão; gastou ${C.visao()}x`);
  checar(/cart[aã]o/i.test(ultimo(C.enviadas)), 'OCR bom deveria dar cartão sozinho');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — forma ausente aciona a visão, e OCR completo não gasta chamada');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
