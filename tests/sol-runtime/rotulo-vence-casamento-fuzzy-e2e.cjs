// "Aluna Soraia da Silveira Duarte" não pode virar card da Laura Sobreira da Silveira.
// (Mayra/CG, 29/08 14:38-14:40)
//
// A legenda rotulava a aluna com todas as letras. O casador fuzzy (word_similarity)
// casou Silveira~Sobreira~Silveira e o card saiu com OUTRA pessoa — nome, fatura
// (09/2026, R$377, Musicalização Infantil) e responsável financeiro de outra
// família. E a correção da Mayra ("Sol, a aluna é Soraia da Silveira Duarte e o
// valor é R$976,00") levou "Não entendi essa" porque o nome-tardio sem citação só
// aceitava card com aluno vazio/suspeito.
const mod = require('./_alvo.cjs');
require('./_alvo.cjs').exigeCredenciais('rotulo-vence-casamento-fuzzy');  // usa as RPCs reais

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const MAYRA = '5521955550001';

const LEGENDA = 'PG Parcelas 02/2026 e 05/2026 - Aluna Soraia da Silveira Duarte - LA CG - R$976,00';
const OCR_PIX = 'Destino\nNome ESCOLA DE MUSICA L A\nCNPJ 19672908000170\nInstituicao BCO SANTANDER\nChave Pix 19672908000170\nOrigem\nNome Soraia da Silveira Duarte\nInstituicao NU PAGAMENTOS - IP\nR$ 976,00';

// O casador fuzzy devolvendo OUTRA pessoa — é a reprodução do word_similarity real.
const CASAMENTO_LAURA = {
  ok: true, aluno_nome: 'Laura Sobreira da Silveira',
  parcela: { competencia: '09/2026', curso: 'Musicalização Infantil', valor: 377, valor_da_parcela: 377, data_vencimento: '2026-09-20' },
};

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_PIX, status: 'ok', file_bytes: 52421 }),
    visaoFn: async () => ({ valor: 976, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Soraia da Silveira Duarte', competencia: '02/2026', forma: 'pix' }),
    canonicaFn: async () => CASAMENTO_LAURA,
    casarFn: async () => CASAMENTO_LAURA,
    responsavelFn: async (u, nome) => (/laura/i.test(String(nome))
      ? { nome: 'Rayanne do Nascimento Sobreira' } : null),
    faturasMesFn: async () => null,
    pagadorFn: async () => ({ ok: true, ambiguo: true, alunos: [{ aluno_nome: 'Aline X' }, { aluno_nome: 'Alice Y' }] }),
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
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

  // ── 1. o caso real: rótulo vence o fuzzy ────────────────────────────────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'S1',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const card = ultimo(A.enviadas);
  console.log('card:', card.split('\n').filter(Boolean).slice(0, 7).join(' | ').slice(0, 190));

  checar(/Soraia da Silveira Duarte/i.test(card), 'card deveria manter a Soraia do rótulo');
  checar(!/Laura Sobreira/i.test(card), 'card NÃO pode trazer a Laura do fuzzy');
  checar(!/Rayanne/i.test(card), 'card NÃO pode trazer a responsável da outra família');
  checar(!/Musicalização Infantil/i.test(card), 'card NÃO pode trazer a fatura da outra família');
  checar(/976/.test(card), 'card mantém os R$ 976');
  checar(A.logs.some(l => /rejeitad[ao]_nome_diverge/.test(String(l.acao))),
    'deveria logar a rejeição do casamento por nome divergente');
  checar(!/N[aã]o identifiquei/i.test(card), 'pagador ambíguo não pode apagar o rótulo (R6)');
  checar(!/qual aluno [eé]/i.test(card), 'com rótulo não se pergunta de qual aluno é');

  // ── 2. enriquecimento LEGÍTIMO continua: canônica devolve a MESMA pessoa ────
  const B = novo({
    // shape real da canônica: o preview lê canonica.fatura (não .parcela) — o mock
    // errado fez a 1ª rodada acusar falha falsa nesta cena.
    canonicaFn: async () => ({ ok: true, aluno_nome: 'Soraia da Silveira Duarte',
      parcela: { competencia: '02/2026', curso: 'Canto', valor: 488, valor_da_parcela: 488 },
      fatura: { competencia: '02/2026', curso_nome: 'Canto', valor_da_parcela: 488, data_vencimento: '2026-02-20' } }),
    casarFn: async () => null,
  });
  await B.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'S2',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(/Soraia/i.test(ultimo(B.enviadas)), 'mesma pessoa na canônica: card mantém Soraia');
  checar(!/rejeitad/i.test(B.logs.map(l => l.acao).join(' ')), 'mesma pessoa não pode ser rejeitada');

  // ── 3. a correção da Mayra: rótulo explícito + card único, SEM citação ──────
  const C = novo();
  await C.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'S3',
    body: 'PG Parcelas 02/2026 e 05/2026 - LA CG - R$976,00',  // sem rótulo → fuzzy vence → card da Laura
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(/Laura Sobreira/i.test(ultimo(C.enviadas)), 'setup: sem rótulo o fuzzy ainda nomeia (é o card de hoje)');
  const rCorr = await C.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'S4',
    body: 'Sol, a aluna é Soraia da Silveira Duarte e o valor é R$976,00', hasMedia: false });
  console.log('correção acao:', rCorr && rCorr.acao);
  checar(rCorr && rCorr.acao !== 'nada', `a correção com rótulo não pode cair em "nada"; veio "${rCorr && rCorr.acao}"`);
  checar(/Soraia da Silveira Duarte/i.test(ultimo(C.enviadas)),
    'depois da correção o card deveria trazer a Soraia');

  // ── 4. REGRESSÃO: nome solto SEM rótulo, card com aluno plausível → exige citação ─
  const D = novo();
  await D.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'S5',
    body: 'PG Parcelas 02/2026 e 05/2026 - LA CG - R$976,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rSolto = await D.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'S6',
    body: 'Soraia da Silveira Duarte', hasMedia: false });
  checar(!rSolto || rSolto.acao === 'nada' || !/preview_aluno_corrigido/.test(String(rSolto.acao)),
    `nome solto sem rótulo continua exigindo citação; veio "${rSolto && rSolto.acao}"`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — o rótulo humano vence o fuzzy, e a correção rotulada tem voz');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
