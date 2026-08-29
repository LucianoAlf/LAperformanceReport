// Colisão de dois comprovantes — replay da manhã de 29/08 no Recreio.
//
// Fernanda mandou o comprovante da Lívia (R$100, legenda chegou ANTES do documento);
// Daiana mandou o do Vicente (R$400). Resultado real: 4 pendências, ZERO lançamentos.
//
// O teste reencena os quatro defeitos e prova as correções:
//  1. legenda-irmã com "R$100,00" → card completo (não "valor não identificado")
//  2. citar a mensagem "Beleza... Posso lançar? Responde pode" da Sol + "Pode" → lança
//  3. "Pode" seco com 2 cards → resolve pelo AUTOR (Daiana lança o dela, Fernanda o dela)
//  4. reenviar o MESMO arquivo substitui a pendência (não empilha)
//  + terceiro sem card próprio ganha a lista numerada, e após lançar a Sol avisa o que falta.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const FERNANDA = '5521977770001';
const DAIANA = '5521977770002';
const ROSE = '5521977770003';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OCR sem valor legível (o doc da Lívia real: 492 chars e nenhum R$ aproveitável)
const OCR_LIVIA = 'COMPROVANTE DE TRANSFERENCIA\nBANCO XPTO\nDe MARIA RODRIGUES\nPara L KIDS RECREIO\nDados da transacao\nAutenticacao 9BGF42067\nID da transacao E607011\nRealizado em Celular';
const OCR_VICENTE = 'REDE\nL KIDS RECREIO\nCNPJ 32134891000185\nVENDA CREDITO 2x\nVALOR TOTAL R$ 400,00\nAUT 123456';

function novo() {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async (p) => (String(p).includes('vicente')
      ? { text: OCR_VICENTE, status: 'ok', file_bytes: 16040 }
      : { text: OCR_LIVIA, status: 'ok', file_bytes: 50720 }),
    visaoFn: async () => null,
    interpretarFn: async (t) => (String(t).toLowerCase().includes('vicente')
      ? { categoria: 'passaporte', aluno: 'Vicente Balizelos de Borborema', competencia: null, forma: 'cartao' }
      : { categoria: 'lojinha', aluno: 'Livia Mesquita Rodrigues', competencia: null, forma: 'pix' }),
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async (fone) => ({ identificado: true, nome: fone === FERNANDA ? 'Fernanda' : fone === DAIANA ? 'Daiana' : 'Rose' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M' + lancados.length, valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
  });
  return { h, enviadas, ids, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── CENA 1: legenda-irmã chega ANTES do documento e carrega o valor ─────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'T1',
    body: 'comprovante pagamento caderno teclas, aluna Lívia Mesquita - R$100,00', hasMedia: false });
  await A.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'D1',
    body: '', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://livia.jpg'] });
  const card1 = ultimo(A.enviadas);
  console.log('CENA 1 card:', card1.split('\n').filter(l => /R\$|valor/i.test(l)).join(' | ').slice(0, 140));
  checar(/100,00/.test(card1), 'card da Lívia deveria trazer R$ 100,00 (da legenda-irmã)');
  checar(!/valor n[aã]o identificado/i.test(card1), 'não pode dizer "valor não identificado" com o valor na legenda');
  checar(!/Me manda o valor/i.test(card1), 'não pode pedir o valor que já foi dado');

  // ── CENA 2: card da Daiana entra; "Pode" seco resolve pelo AUTOR ────────────
  await A.h.handle({ chatId: CHAT, senderPhone: DAIANA, messageId: 'D2',
    body: 'Passaporte promocional do aluno Vicente Balizelos - R$400,00 em 2x sem juros',
    hasMedia: true, mediaType: 'document', mediaUrls: ['fake://vicente.pdf'] });
  checar((A.h._pendentes.get(CHAT) || []).length === 2, 'deveriam existir 2 pendências');

  // "Pode" seco da DAIANA → o dela (Vicente, 400)
  await A.h.handle({ chatId: CHAT, senderPhone: DAIANA, messageId: 'P1', body: 'Pode', hasMedia: false });
  checar(A.lancados.length === 1, `Daiana "pode" seco deveria lançar 1; lançou ${A.lancados.length}`);
  if (A.lancados[0]) checar(Number(A.lancados[0].valor) === 400, `o lançado da Daiana deveria ser 400, veio ${A.lancados[0].valor}`);
  checar(/Ainda aguardando/i.test(ultimo(A.enviadas)) || A.enviadas.some(t => /Ainda aguardando/i.test(t)),
    'após lançar com card restante, a Sol deve avisar o que falta');

  // "Pode" seco da FERNANDA → o dela (Lívia, 100)
  await A.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'P2', body: 'Pode', hasMedia: false });
  checar(A.lancados.length === 2, `Fernanda "pode" seco deveria lançar o dela; total ${A.lancados.length}`);
  if (A.lancados[1]) checar(Number(A.lancados[1].valor) === 100, `o lançado da Fernanda deveria ser 100, veio ${A.lancados[1].valor}`);

  // ── CENA 3: citar a resposta "Beleza... Responde pode" da Sol vale ──────────
  const B = novo();
  // documento SEM legenda → incompleto (falta valor)
  await B.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'D3',
    body: '', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://livia.jpg'] });
  checar(/Me manda o valor|valor/i.test(ultimo(B.enviadas)), 'sem legenda o card fica aguardando valor');
  // um segundo card no grupo, para a ambiguidade existir de verdade
  await B.h.handle({ chatId: CHAT, senderPhone: DAIANA, messageId: 'D4',
    body: 'Passaporte do aluno Vicente Balizelos - R$400,00',
    hasMedia: true, mediaType: 'document', mediaUrls: ['fake://vicente.pdf'] });
  // Fernanda completa o valor → Sol responde "Beleza... Posso lançar? Responde pode"
  await B.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'C1',
    body: 'Sol, o valor foi R$100,00', hasMedia: false });
  const belezaIdx = B.enviadas.findIndex(t => /Beleza,/.test(t));
  checar(belezaIdx >= 0, 'deveria ter respondido "Beleza..." ao complemento');
  const belezaId = B.ids[belezaIdx];
  // ...e citar exatamente ESSA mensagem com "Pode" tem de lançar (o bug de 08:42)
  await B.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'P3',
    body: 'Pode', hasMedia: false, quotedMessageId: belezaId });
  checar(B.lancados.length === 1, `citar o "Beleza" + Pode deveria lançar; lançou ${B.lancados.length}`);
  if (B.lancados[0]) checar(Number(B.lancados[0].valor) === 100, `deveria lançar os 100 da Lívia, veio ${B.lancados[0].valor}`);

  // ── CENA 4: quem NÃO tem card próprio ganha a lista, não o enigma ───────────
  const C = novo();
  await C.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'D5',
    body: 'lojinha caderno aluna Lívia Mesquita R$100,00', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://livia.jpg'] });
  await C.h.handle({ chatId: CHAT, senderPhone: DAIANA, messageId: 'D6',
    body: 'Passaporte do aluno Vicente Balizelos - R$400,00', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://vicente.pdf'] });
  await C.h.handle({ chatId: CHAT, senderPhone: ROSE, messageId: 'P4', body: 'Pode', hasMedia: false });
  checar(C.lancados.length === 0, 'Rose sem card próprio não pode disparar lançamento de ninguém');
  checar(/1\)/.test(ultimo(C.enviadas)) && /2\)/.test(ultimo(C.enviadas)),
    'a guarda deve listar os cards numerados: ' + ultimo(C.enviadas).slice(0, 120));

  // ── CENA 5: reenviar o MESMO arquivo substitui a pendência ──────────────────
  const D = novo();
  await D.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'D7',
    body: 'lojinha caderno aluna Lívia Mesquita R$100,00', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://livia.jpg'] });
  await D.h.handle({ chatId: CHAT, senderPhone: FERNANDA, messageId: 'D8',
    body: 'Sol, o valor foi R$100,00 — lojinha da Lívia Mesquita', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://livia.jpg'] });
  const pendD = D.h._pendentes.get(CHAT) || [];
  checar(pendD.length === 1, `reenvio do mesmo arquivo deveria substituir (1 pendência), há ${pendD.length}`);
  checar(D.logs.some(l => l.acao === 'pendencia_substituida_reenvio'), 'deveria logar pendencia_substituida_reenvio');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — cada "pode" acha seu dono, citação ampla vale, reenvio substitui');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
