// Round 2 do caso dos refrigerantes (Recreio, 28/08 16:48-16:50) — três bugs encadeados.
//
// Sequência real (caixa.log):
//   16:48:53  foto SEM legenda → preview incompleto com R$ 5,01 (!) · falta forma
//   16:49:44  foto reenviada COM legenda; a bridge entrega imagem e texto como DOIS
//             eventos separados (260ms)
//   16:49:46  a correção-de-tipo sequestrou a legenda e converteu a pendência VELHA
//             de 5,01 — ignorando o "R$34" e o "dinheiro" da própria legenda. A
//             imagem, órfã, foi recusada.
//
// ⚠️ Este teste reproduz a ENTREGA REAL da bridge (media e texto como dois handle()
// concorrentes, 250ms de distância) — o teste anterior mandava um evento só fundido,
// e foi exatamente por isso que não pegou.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Réplica fiel do OCR real (tesseract psm4 na imagem do episódio):
// - "Subtotal R$ y 34,00"  ← ruído "y" entre R$ e o número
// - "Valor Total R$"       ← número perdido na quebra de linha
// - "Federal R$ 5,01"      ← 1º R$ LIMPO do texto = a linha de TRIBUTOS
const OCR_CUPOM = [
  'AUTO POSTO NOVO AMERICAS LTDA CNPJ 39.335.616/0001-70',
  'AVENIDA DAS AMERICAS 15551 RECREIO DOS BANDEIRANTES',
  'Documento Auxiliar da Nota Fiscal de Consumidor Eletronica',
  'CoaisA pes Qtde UM Vi Unit, Total Fae a3',
  '7894900011517 REFRI COCA COLA PET 2L 1 UN 18,00 18,00',
  '891991001342 REFRI GUARANA ANTARCTI 1 UN 16,00 16,00',
  'tde, total de itens 2',
  'Subtotal R$ y 34,00',
  'Valor Total R$',
  'Forma pagamento Valor pago',
  'Tributos aproxinados: Federal R$ 5,01 (14,14%) a',
  '(18,002) / Municipal R$ 0,00 (0,00%) - Fonte: IBPT - RJ (ALLA',
].join('\n');

const LEGENDA = '2 refrigerantes R$34 - Despesa (saída)\nPagamento em dinheiro';

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const saidas = []; const lancados = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_CUPOM, status: 'ok' }),
    visaoFn: async () => ({ valor: null, forma: null }),
    interpretarFn: async () => ({ categoria: 'outro', aluno: null, competencia: null, forma: null }),
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Vitoria ADM' }),
    lancarFn: async (p) => { lancados.push(p); return { movimentacao_id: 1, valor: p.valor }; },
    lancarSaidaFn: async (p) => { saidas.push(p); return { movimentacao_id: 2, valor: p.valor }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, saidas, lancados };
}

const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── 1. unitário do valor: o coração do bug ─────────────────────────────────
  checar(mod.extrairValor(OCR_CUPOM) === 5.01,
    `a armadilha tem de existir: extrairValor(ocr) deveria dar 5.01, deu ${mod.extrairValor(OCR_CUPOM)}`);
  checar(mod.extrairValorOcr(OCR_CUPOM) === 34,
    `extrairValorOcr(ocr real) deveria dar 34, deu ${mod.extrairValorOcr(OCR_CUPOM)}`);
  checar(mod.extrairValorOcr('Tributos aproximados: Federal R$ 5,01') === null,
    'texto só de tributos não pode virar valor');
  checar(mod.extrairValorOcr('Valor Total R$ 34.00') === 34,
    `total com PONTO decimal (psm6) deveria dar 34, deu ${mod.extrairValorOcr('Valor Total R$ 34.00')}`);
  checar(mod.extrairValorOcr('Subtotal R$ 100,00\nValor Total R$ 90,00') === 90,
    'com desconto, o TOTAL vence o subtotal');
  checar(mod.extrairValorOcr('PIX recebido R$ 380,00') === 380,
    'comprovante normal continua funcionando');
  console.log('unitário valor: ok');

  // ── 2. foto sozinha agora nasce com o valor CERTO ──────────────────────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: '5521970000001', messageId: 'F1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'] });
  const cardSolo = ultimo(A.enviadas);
  console.log('card foto-sozinha:', cardSolo.split('\n').filter(l => /R\$|forma/i.test(l)).join(' | ').slice(0, 120));
  checar(/34/.test(cardSolo), 'card da foto sozinha deveria mostrar 34');
  checar(!/5,01/.test(cardSolo), 'card NÃO pode mostrar 5,01');

  // ── 3. A CORRIDA REAL: pendência velha + reenvio (media + legenda separados) ─
  const B = novo();
  // pendência velha (foto sozinha, 1º envio)
  await B.h.handle({ chatId: CHAT, senderPhone: '5521970000001', messageId: 'R1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'] });
  const cardVelho = ultimo(B.enviadas);

  // reenvio: media chega, legenda chega 250ms depois — DOIS handle() concorrentes
  const pMedia = B.h.handle({ chatId: CHAT, senderPhone: '5521970000001', messageId: 'R2',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'] });
  await sleep(250);
  const rTexto = await B.h.handle({ chatId: CHAT, senderPhone: '5521970000001', messageId: 'R3',
    body: LEGENDA, hasMedia: false });
  const rMedia = await pMedia;

  console.log('texto  ->', rTexto && rTexto.acao);
  console.log('media  ->', rMedia && rMedia.acao);
  const cardFinal = ultimo(B.enviadas);
  console.log('card final:', cardFinal.split('\n').slice(0, 6).join(' | ').slice(0, 170));

  checar(rTexto && rTexto.acao === 'lote_texto_anexado',
    `a legenda tinha de ir pro lote da mídia; foi "${rTexto && rTexto.acao}"`);
  checar(!/5,01/.test(cardFinal), 'card final NÃO pode carregar o 5,01 da pendência velha');
  checar(/Sa[ií]da de caixa/i.test(cardFinal), 'card final deveria ser Saída de caixa');
  checar(/34/.test(cardFinal), 'card final deveria mostrar R$ 34');
  checar(/dinheiro/i.test(cardFinal), 'card final deveria mostrar dinheiro');
  checar(!/n[aã]o consegui preparar o preview seguro/i.test(cardFinal),
    'não pode terminar em "preview inseguro"');

  // o "pode" citando o card final lança a SAÍDA com 34
  await B.h.handle({ chatId: CHAT, senderPhone: '5521970000001', messageId: 'R4',
    body: 'pode', hasMedia: false, quotedMessageId: B.ids[B.ids.length - 1] });
  checar(B.saidas.length === 1, `esperava 1 saída lançada, veio ${B.saidas.length}`);
  checar(B.lancados.length === 0, `nada podia virar recebimento, foram ${B.lancados.length}`);
  if (B.saidas[0]) checar(Number(B.saidas[0].valor) === 34, `saída deveria ser 34, veio ${B.saidas[0].valor}`);

  // ── 4. correção legítima (SEM lote aberto) continua funcionando e agora
  //      aproveita valor/forma da própria frase ──────────────────────────────
  const C = novo();
  await C.h.handle({ chatId: CHAT, senderPhone: '5521970000001', messageId: 'L1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'] });
  await sleep(1100);   // fora da janela do lote
  const rCorr = await C.h.handle({ chatId: CHAT, senderPhone: '5521970000001', messageId: 'L2',
    body: 'Sol, foi saída de dinheiro e a categoria e despesa', hasMedia: false });
  console.log('correção ->', rCorr && rCorr.acao);
  const cardCorr = ultimo(C.enviadas);
  checar(rCorr && String(rCorr.acao).startsWith('preview_tipo_corrigido'),
    `correção legítima deveria converter; veio "${rCorr && rCorr.acao}"`);
  checar(/dinheiro/i.test(cardCorr), 'correção deveria fixar a forma dinheiro (estava na frase)');
  checar(/34/.test(cardCorr), 'correção mantém o valor 34 da pendência');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — legenda do reenvio casa com a mídia e o valor sai do total, não do tributo');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
