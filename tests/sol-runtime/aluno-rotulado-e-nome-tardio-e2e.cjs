// Caso Arthur/Barra (31/08 14:02-14:05): legenda "Venda capotraste para o aluno
// Arthur Vargas" com o REMETENTE Arthur (ADM homônimo). A guarda V1 descartou o
// aluno declarado (log: aluno_descartado_nao_e_aluno motivo e_quem_enviou) e o
// card perguntou "Não sei para quem foi a venda". A correção "Aluno foi Arthur
// Vargas Caldas" extraiu "foi Arthur Vargas Caldas" (prefixo grudado), a guarda
// de nome-diverge rejeitou a canônica que tinha casado a pessoa CERTA
// (canonica_tardia_rejeitada_nome_diverge ditado="foi Arthur Vargas Caldas"
// casado="Arthur Vargas Caldas") e o lançamento saiu sem vínculo, com descrição
// "Lojinha - foi Arthur Vargas Caldas".
//
// Duas raízes:
//  R-a: rótulo humano explícito de ALUNO na legenda vence a heurística de
//       remetente (a heurística existe para nome INFERIDO; contra declaração,
//       ela mente — homônimo é caso real).
//  R-b: o extrator de nome tira o lixo verbal do início ("foi", "nome do
//       aluno", "é") — sem isso a guarda de nome-diverge derruba o
//       enriquecimento certo por causa do prefixo.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const ARTHUR = '5521966660001';

const LEGENDA = 'Venda capotraste para o aluno Arthur Vargas\n\nValor: R$ 40,00\nForma de pagamento: crédito';
const OCR_PAGBANK = 'PagBank\nVIA ESTABELECIMENTO\nLA MUSIC KIDS BARRA\nVENDA CREDITO MASTERCARD\nVALOR 40,00\nAUT 002784';

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_PAGBANK, status: 'ok', file_bytes: 81021 }),
    visaoFn: async () => ({ valor: 40, forma: 'cartao' }),
    interpretarFn: async () => ({ categoria: 'lojinha', aluno: 'Arthur Vargas', competencia: null, forma: 'cartao' }),
    // canônica responde como a real: só encontra pelo nome completo do cadastro
    canonicaFn: async (_u, nome) => (/caldas/i.test(String(nome || ''))
      ? { ok: true, aluno_nome: 'Arthur Vargas Caldas', parcela: null }
      : { ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => null,
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Arthur' }),
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

  // ── unidades: o extrator tira o lixo verbal ─────────────────────────────────
  checar(mod._nomeHumanoTardio('Aluno foi Arthur Vargas Caldas') === 'Arthur Vargas Caldas',
    `"Aluno foi X" deveria extrair só o nome; veio "${mod._nomeHumanoTardio('Aluno foi Arthur Vargas Caldas')}"`);
  checar(mod._nomeHumanoTardio('Nome do aluno : Starline') === 'Starline',
    `"Nome do aluno : Starline" deveria extrair "Starline"; veio "${mod._nomeHumanoTardio('Nome do aluno : Starline')}"`);
  checar(mod._nomeHumanoTardio('aluno: Maria Clara Souza') === 'Maria Clara Souza',
    'rótulo com dois-pontos segue extraindo nome composto');
  // sem rótulo explícito, um token só continua NÃO sendo nome (guarda antiga)
  checar(mod._nomeHumanoTardio('Starline') === null, 'token solto sem rótulo não vira nome');

  // ── R-a: aluno declarado na legenda NÃO é descartado pelo remetente homônimo ─
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C1',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://capotraste.jpg'] });
  const cardA = ultimo(A.enviadas);
  console.log('card A:', cardA.split('\n').filter(Boolean).slice(0, 6).join(' | ').slice(0, 160));
  checar(!A.logs.some((l) => l.acao === 'aluno_descartado_nao_e_aluno'),
    'aluno declarado ("para o aluno X") não pode ser descartado por ser homônimo do remetente');
  checar(/Arthur Vargas/i.test(cardA), 'card deveria manter o Arthur Vargas do rótulo');
  checar(!/Não sei para quem foi a venda/i.test(cardA), 'card não pode perguntar para quem foi a venda');

  // regressão: vendedor rotulado continua descartado (camisa 29/08)
  const B = novo({ interpretarFn: async () => ({ categoria: 'lojinha', aluno: 'Arthur', competencia: null, forma: 'cartao' }) });
  await B.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C2',
    body: 'Venda camisa LA Music Kids Preta 4 anos\n\nVenda: Arthur',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://camisa.jpg'] });
  checar(B.logs.some((l) => l.acao === 'aluno_descartado_nao_e_aluno' && l.motivo === 'rotulo_de_venda'),
    'REGRESSÃO: "Venda: Arthur" tem que continuar descartando o vendedor');

  // ── R-b: correção tardia limpa o "foi" e o enriquecimento certo passa ───────
  const C = novo({ canonicaFn: async (_u, nome) => (/caldas/i.test(String(nome || ''))
    ? { ok: true, aluno_nome: 'Arthur Vargas Caldas', parcela: null }
    : { ok: false, motivo: 'aluno_nao_encontrado' }) });
  await C.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C3',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://capotraste.jpg'] });
  const rCorr = await C.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C4',
    body: 'Aluno foi Arthur Vargas Caldas', hasMedia: false });
  console.log('correção acao:', rCorr && rCorr.acao);
  const cardC = ultimo(C.enviadas);
  console.log('card C:', cardC.split('\n').filter(Boolean).slice(0, 6).join(' | ').slice(0, 160));
  checar(!C.logs.some((l) => l.acao === 'canonica_tardia_rejeitada_nome_diverge'),
    'a canônica que casou a MESMA pessoa não pode ser rejeitada por prefixo grudado');
  checar(/Arthur Vargas Caldas/i.test(cardC), 'card corrigido deveria trazer Arthur Vargas Caldas');
  checar(!/\bfoi Arthur/i.test(cardC), 'card não pode trazer o "foi" grudado no nome');
  checar(!/Não tenho certeza/i.test(cardC), 'com a canônica confirmando, some o "não tenho certeza"');

  // ...e o "pode" lança com o nome limpo
  await C.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C5', body: 'pode', hasMedia: false });
  checar(C.lancados.length === 1, `"pode" deveria lançar; lançou ${C.lancados.length}`);
  if (C.lancados[0]) {
    checar(/Arthur Vargas Caldas/.test(String(C.lancados[0].aluno || '')), 'lançamento com o aluno limpo');
    checar(!/\bfoi\b/i.test(String(C.lancados[0].descricao || '')), 'descrição sem o "foi" grudado');
  }

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — rótulo de aluno vence o homônimo, e o nome chega limpo');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
