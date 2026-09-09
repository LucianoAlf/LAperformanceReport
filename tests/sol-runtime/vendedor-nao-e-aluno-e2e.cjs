// "Venda: Arthur" = quem VENDEU, não o aluno. (Arthur/Barra, 29/08 11:27)
//
// A legenda "Venda camisa LA Music Kids Preta 4 anos / Venda: Arthur" produziu um
// card com ALUNO = Arthur e "Resp. financeiro: Joice Pedro Palmerini Lomba" — uma
// família sem nenhuma relação com a compra. Arthur é o ADM que fez a venda e mandou
// a mensagem; o aluno era o Theo de Bem.
//
// ⚠️ Pior que card feio: lojinha lançada no aluno errado polui a carteira de outra
// família. E o nome veio do LLM — `_alunoRotulado` dá null nessa legenda (medido),
// então não havia regex a consertar: faltava uma REGRA.
//
// Três guardas, da mais forte para a mais fraca:
//   V1 quem ENVIA a mensagem não é o aluno do próprio lançamento
//   V2 rótulo de vendedor ("Venda:", "Vendedor:", "Vendido por:", "Atendente:")
//   V3 lojinha sem comprador PERGUNTA o nome (antes escondia a seção)
const mod = require('./_alvo.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const ARTHUR = '5521966660001';

const OCR_PAGBANK = 'PagBank\nVIA ESTABELECIMENTO\nLA MUSIC KIDS BARRA\nVENDA CREDITO MASTERCARD\nVALOR 65,00\nAUT 002783';

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_PAGBANK, status: 'ok', file_bytes: 122752 }),
    visaoFn: async () => ({ valor: 65, forma: 'cartao' }),
    // O LLM leu "Venda: Arthur" e devolveu Arthur como aluno — é o bug de origem.
    interpretarFn: async () => ({ categoria: 'lojinha', aluno: 'Arthur', competencia: null, forma: 'cartao' }),
    // ...e a canônica "confirmou" um Arthur qualquer, com responsável alheio.
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => ({ nome: 'Joice Pedro Palmerini Lomba' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    // quem ENVIA é o Arthur (ADM da Barra)
    identidadeFn: async () => ({ identificado: true, nome: 'Arthur Ferreira' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M1', valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── unitário: rótulo de vendedor e comparação de pessoa ────────────────────
  const casosVend = [
    ['Venda camisa LA Music Kids Preta 4 anos\n\nVenda: Arthur', 'Arthur'],
    ['Vendedor: Kailane Barbosa', 'Kailane Barbosa'],
    ['Vendido por: Ana Paula', 'Ana Paula'],
    ['Atendente: Eduarda', 'Eduarda'],
    ['Parcela do aluno Theo de Bem', null],
  ];
  for (const [txt, esperado] of casosVend) {
    const got = mod._vendedorRotulado ? mod._vendedorRotulado(txt) : undefined;
    if (got !== esperado) falhas.push(`_vendedorRotulado("${txt.replace(/\n/g, ' / ')}") = ${got}, esperava ${esperado}`);
  }
  checar(mod._mesmaPessoa('Arthur', 'Arthur Ferreira') === true, '"Arthur" deveria casar com "Arthur Ferreira"');
  checar(mod._mesmaPessoa('Arthur', 'Arthur Silva Costa') === true, 'primeiro nome igual e um só token deveria casar');
  checar(mod._mesmaPessoa('Theo de Bem', 'Arthur Ferreira') === false, 'pessoas diferentes não podem casar');
  checar(mod._mesmaPessoa('Maria Silva', 'Maria Souza') === false, 'mesmo 1º nome com sobrenomes distintos não casa');
  console.log('unitário: ok');

  // ── o caso real: card NÃO pode trazer Arthur nem a responsável alheia ──────
  const A = novo();
  const r = await A.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'V1',
    body: 'Venda camisa LA Music Kids Preta 4 anos\n\nVenda: Arthur',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://camisa.jpg'] });
  const card = ultimo(A.enviadas);
  console.log('acao:', r && r.acao);
  console.log('card:', card.split('\n').filter(Boolean).slice(0, 9).join(' | ').slice(0, 200));

  checar(!/•\s*Arthur/.test(card), 'card NÃO pode listar Arthur como aluno');
  checar(!/Joice/i.test(card), 'card NÃO pode trazer a responsável financeira alheia');
  checar(/N[aã]o sei para quem foi a venda/i.test(card), 'deveria PERGUNTAR de quem foi a venda');
  checar(/65/.test(card), 'card deveria manter o valor de R$ 65');
  checar(/lojinha/i.test(card), 'categoria deveria continuar lojinha');
  checar(A.logs.some(l => l.acao === 'aluno_descartado_nao_e_aluno'), 'deveria logar aluno_descartado_nao_e_aluno');

  // ── o nome certo chega depois e entra ─────────────────────────────────────
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'V2',
    body: 'Venda camisa LA Music Kids Preta 4 anos\n\nVenda: Arthur',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://camisa.jpg'] });
  const rNome = await B.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'V3',
    body: 'aluno: Theo de Bem', hasMedia: false });
  console.log('correção acao:', rNome && rNome.acao);
  checar(/Theo de Bem/i.test(ultimo(B.enviadas)), 'depois de informar, o card deveria trazer Theo de Bem');

  // ── REGRESSÃO: aluno de verdade continua aparecendo ───────────────────────
  const C = novo({
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Theo de Bem', competencia: null, forma: 'pix' }),
    responsavelFn: async () => ({ nome: 'Marcia de Bem' }),
  });
  await C.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'V4',
    body: 'Parcela do aluno Theo de Bem R$ 65', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const cardC = ultimo(C.enviadas);
  checar(/Theo de Bem/i.test(cardC), 'aluno legítimo tem de continuar no card');
  checar(!/N[aã]o sei para quem foi a venda/i.test(cardC), 'parcela com aluno não pode pedir comprador');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — vendedor e remetente não viram aluno, e a Sol pergunta de quem foi');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
