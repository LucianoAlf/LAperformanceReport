// A3 + fallback LLM (31/08, OK do Luciano — "vamos resolver essas pendências").
//
// A3 — REIDRATAÇÃO: pendências viviam só na memória do bridge; restart (deploy,
// crash, reconexão) engolia previews abertos. Caso real: a correção V3 do
// capotraste aberta pelo Arthur às 17:58 morreu no restart do deploy, e o
// "pode" dele cairia em pode_sem_pendencia EM SILÊNCIO. O ledger V3 já guarda a
// pendência inteira (preview_json.pending) — reidratar no boot.
//
// FALLBACK LLM — mensagem com pendência aberta que a gramática não entendeu vai
// a um classificador de saída RESTRITA ({intencao, campos}); a intenção vira uma
// frase CANÔNICA da gramática existente e re-passa pelo handle(). O LLM nunca
// escreve, nunca escolhe fatura e NUNCA aprova dinheiro ("aprovar" vira pedido
// de *pode* explícito). Falha em qualquer ponto => null => "Não entendi" atual.
const crypto = require('crypto');
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const MAYRA = '5521955550001';
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: 'PIX R$ 450,00', status: 'ok', file_bytes: 12345 }),
    visaoFn: async () => ({ valor: 450, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Beatriz Ramos Costa', competencia: '08/2026', forma: 'pix' }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
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
  return { h, enviadas, ids, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── A3: reidrata do ledger e o "pode" volta a funcionar ─────────────────────
  const pendLedger = {
    previewId: 'WPP-CARD-1', unidade_id: UNIDADE, nome: 'Campo Grande',
    valor: 380, forma: 'pix', categoria: 'parcela', aluno: 'Caio Ferreira Lima',
    competencia: '08/2026', descricao: 'Parcela 08/2026 - Caio Ferreira Lima',
    parcela: null, responsavelFinanceiro: null, formaIncerta: false,
    multiplas: false, composto: null, bloqueiaLancamento: false,
    faturaIndisponivel: false, bloqueiaFonteIndisponivel: false,
    enviadoPor: 'Mayra', idemKey: CHAT + ':WPP-ORIG-1', origem: 'WPP-ORIG-1',
    ts: Date.now() - 5 * 60 * 1000,
  };
  const A = novo({
    listarPreviewsAbertosFn: async () => ([{
      id: 'prev-uuid-1', preview_hash: 'hash-1', criado_em: new Date().toISOString(),
      operacao: 'entrada', chat_id_hash: md5(CHAT),
      pending: JSON.parse(JSON.stringify(pendLedger)), preview_message_id: 'WPP-CARD-1',
    }]),
  });
  checar(typeof A.h.reidratarPendencias === 'function', 'handler exporta reidratarPendencias');
  const r1 = await A.h.reidratarPendencias();
  console.log('reidratação:', JSON.stringify(r1));
  checar(r1 && r1.ok && r1.total === 1, `deveria reidratar 1 pendência; veio ${JSON.stringify(r1)}`);
  // reidratar de novo não duplica
  const r2 = await A.h.reidratarPendencias();
  checar(r2 && r2.total === 0, 'reidratar duas vezes não duplica pendência');
  // e o "pode" citando o card antigo LANÇA
  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'N1',
    body: 'pode', hasMedia: false, quotedMessageId: 'WPP-CARD-1' });
  checar(A.lancados.length === 1, `"pode" após restart deveria lançar; lançou ${A.lancados.length}`);
  if (A.lancados[0]) checar(Number(A.lancados[0].valor) === 380, 'valor da pendência reidratada preservado');

  // chat desconhecido no mapa → ignorado sem erro
  const B = novo({
    listarPreviewsAbertosFn: async () => ([{ id: 'x', preview_hash: 'h', criado_em: new Date().toISOString(),
      operacao: 'entrada', chat_id_hash: md5('outro@g.us'), pending: { origem: 'O1', ts: Date.now() }, preview_message_id: 'M' }]),
  });
  const rB = await B.h.reidratarPendencias();
  checar(rB && rB.ok && rB.total === 0, 'preview de chat fora do mapa é ignorado');

  // ── FALLBACK LLM ────────────────────────────────────────────────────────────
  // sem pendência: nem chama o classificador
  let chamouSemPend = false;
  const C = novo({ classificarCorrecaoFn: async () => { chamouSemPend = true; return { intencao: 'descartar' }; } });
  const rC = await C.h.tratarNaoEntendida({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F0', body: 'qualquer coisa' });
  checar(rC === null && !chamouSemPend, 'sem pendência o classificador nem é chamado');

  // sem_aluno via LLM: frase livre vira a gramática canônica e remonta o card
  const D = novo({
    classificarCorrecaoFn: async () => ({ intencao: 'sem_aluno', entidade: 'Starline', aluno_nome: null, categoria: null, valor: null, forma: null }),
  });
  await D.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F1',
    body: 'PG evento R$450', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(D.enviadas.length === 1, 'setup: card aberto');
  const rD = await D.h.tratarNaoEntendida({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F2',
    body: 'essa grana é do evento das bandas, não é de nenhum aluno da casa viu' });
  console.log('fallback sem_aluno:', JSON.stringify(rD));
  checar(rD && rD.tratou === true, `fallback deveria tratar; veio ${JSON.stringify(rD)}`);
  checar(/Banda Starline/i.test(ultimo(D.enviadas)), 'card remontado com a entidade');
  checar(D.logs.some((l) => l.acao === 'fallback_llm_classificou'), 'log do classificador');

  // corrigir_categoria via LLM
  const E = novo({
    classificarCorrecaoFn: async () => ({ intencao: 'corrigir_categoria', categoria: 'venda', aluno_nome: null, valor: null, forma: null, entidade: null }),
  });
  await E.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F3',
    body: 'PG evento R$450', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rE = await E.h.tratarNaoEntendida({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F4',
    body: 'isso ai entra como venda entendeu' });
  checar(rE && rE.tratou === true, 'categoria via fallback trata');
  checar(/venda/i.test(ultimo(E.enviadas)), 'card remontado com a categoria');

  // aprovar via LLM NUNCA lança — pede o pode explícito
  const F = novo({
    classificarCorrecaoFn: async () => ({ intencao: 'aprovar', aluno_nome: null, categoria: null, valor: null, forma: null, entidade: null }),
  });
  await F.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F5',
    body: 'PG evento R$450', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rF = await F.h.tratarNaoEntendida({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F6',
    body: 'ta certinho isso ai manda bala' });
  checar(rF && rF.tratou === true && rF.acao === 'fallback_llm_pede_pode', 'aprovar vira pedido de pode');
  checar(F.lancados.length === 0, 'o LLM NUNCA lança dinheiro');
  checar(/responde \*pode\*/i.test(ultimo(F.enviadas)), 'mensagem pede o pode explícito');

  // intencao nada / classificador quebrado → null (cai no "Não entendi" do bridge)
  const G = novo({ classificarCorrecaoFn: async () => { throw new Error('llm fora'); } });
  await G.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F7',
    body: 'PG evento R$450', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rG = await G.h.tratarNaoEntendida({ chatId: CHAT, senderPhone: MAYRA, messageId: 'F8', body: 'blz então' });
  checar(rG === null, 'classificador quebrado → null (fail-safe para o Não entendi)');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — restart não engole pendência, e o fallback entende sem nunca escrever');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
