// Caso Jhon/CG (01/09 17:51): a legenda no FORMATO QUE A SOL ENSINA ("Nome -
// R$ valor" em linhas) caía no fluxo SINGLE — o card saiu com R$ 1.290 (só o
// Davi, composto de 4 parcelas) "conferindo" contra um PIX de R$ 1.722, com a
// Thuanny ignorada. Se o "pode" viesse, sumiam R$ 432.
//  F1: 2+ linhas "Nome — R$ valor" disparam multi (linha da unidade não conta).
//  F2: valor MAIOR na própria legenda que o valor do card → aviso de parcial.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const JHON = '5521933330001';

const CAPTION = 'Parcelas 08/2026\n alunos:\n\nDavi Guilherme - R$ 1.290,00\n\nThuanny De Souza - R$ 432,00\n\nLA CG - R$1.722,00';

function novo(overrides = {}) {
  const enviadas = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: 'Comprovante de transferência\nValor R$ 1.722,00\nPix\nDestino ESCOLA DE MUSICA L A', status: 'ok', file_bytes: 41987 }),
    visaoFn: async () => ({ valor: 1722, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Davi Guilherme', competencia: '08/2026', forma: 'pix' }),
    interpretarMultiFn: async () => ({ tipo_recebimento: 'multi_aluno', valor_total: 1722, forma: 'pix', categoria: 'parcela',
      itens: [
        { aluno_nome: 'Davi Guilherme', valor: 1290, categoria: 'parcela' },
        { aluno_nome: 'Thuanny De Souza', valor: 432, categoria: 'parcela' },
      ] }),
    resolverMultiFn: async () => ({ ok: true, valor_total: 1722, soma_itens: 1722, itens: [
      { ordem: 1, aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', aluno_id: 1321, valor: 1290,
        categoria: 'parcela', canonical_fatura_id: null, sem_vinculo_fatura: true, declarado_pelo_humano: true, fatura: null },
      { ordem: 2, aluno_nome: 'Thuanny de Souza Chaves Ribeiro', aluno_id: 397, valor: 432,
        categoria: 'parcela', competencia: '08/2026', canonical_fatura_id: '3153ad70-2cb8-4f67-b41e-4bd3e688e0de',
        fatura: { status: 'paga', data_pagamento: '2026-09-01', forma_pagamento: { nome: 'Pix' } } },
    ] }),
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => ({ ok: true, aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro',
      partes: [{ v: 380 }, { v: 367 }, { v: 149 }, { v: 394 }], competencia: '08/2026' }),
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M1', valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── F1: a caption do Jhon vai para o MULTI, nunca mais single de 1.290 ──────
  const A = novo();
  const rA = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'F1',
    body: CAPTION, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://transf.jpg'] });
  console.log('acao:', rA && rA.acao);
  const card = ultimo(A.enviadas);
  console.log('card:', card.split('\n').filter(Boolean).slice(0, 6).join(' | ').slice(0, 200));
  checar(rA && /multi/.test(String(rA.acao)), `a caption ensinada deveria ir para o multi; veio "${rA && rA.acao}"`);
  checar(/1\.722/.test(card), 'card do lote com o TOTAL do PIX (1.722)');
  checar(/Thuanny/i.test(card), 'a Thuanny está no card');
  checar(!/Pagamento composto — 4 parcelas/.test(card), 'não pode ser o card single do composto');

  // ── F2: single com valor maior na legenda ganha o aviso de parcial ──────────
  const B = novo({ interpretarMultiFn: async () => ({ itens: [] }) });
  await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'F2',
    body: 'Parcela 08/2026 aluno Davi Guilherme R$ 1.290,00 total LA CG R$1.722,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://transf.jpg'] });
  const cardB = ultimo(B.enviadas);
  if (!/multi|mais de um aluno/i.test(cardB)) {
    checar(/cita R\$ 1\.722,00 — este card cobre só R\$ 1\.290,00/.test(cardB.replace(/ /g, ' ')) || /cita.*1\.722.*cobre só.*1\.290/.test(cardB),
      'card single com valor menor avisa o parcial');
  }

  // ── regressões do detector ──────────────────────────────────────────────────
  checar(mod.detectarContextoMultiAluno('Davi Guilherme - R$ 447,00\nLA CG - R$447,00') === false,
    'linha de unidade não conta como pessoa');
  checar(mod.detectarContextoMultiAluno('PASSAPORTE R$399,00 pix\n\nAluna Luiza Silva') === false,
    'single normal segue single');
  checar(mod.detectarContextoMultiAluno('Passaporte Thiago Fernandes e Matheus Fernandes 350,00 cada') === true,
    'REGRESSÃO: "e" + cada segue multi');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — o formato que a Sol ensina agora é o formato que ela entende');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
