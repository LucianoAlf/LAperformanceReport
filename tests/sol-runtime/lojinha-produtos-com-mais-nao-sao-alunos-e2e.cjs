// Lojinha: produtos ligados por "+" não são alunos (Barra 06/10/2026).
//
// Legenda real (nomes inventados aqui): "venda para o aluno <Aluno>\nCaderno
// cordas + chaveiro porta palhetas + mini caixa de som bluetooth\n\nR$ 190,00".
// O detector de texto livre (NOMES_LIGADOS: duas palavras + "+" + duas palavras)
// leu os PRODUTOS como duas pessoas e a Sol respondeu "Entendi que este
// comprovante é de mais de um aluno… manda cada aluno com seu valor" para UMA
// venda. Em lojinha, quem diz que há mais de uma pessoa é o modelo (pagamentos)
// ou o formato "Nome — R$ valor" em 2+ linhas.
const mod = require('./_alvo.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const OCR = 'LA MUSIC KIDS BARRA\nVENDA DEBITO MASTERCARD\nVALOR R$ 190,00\nNSU 000111';

function novo(interpretar) {
  const enviadas = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: OCR, status: 'ok', file_bytes: 1000 }),
    visaoFn: async () => ({ valor: 190, forma: 'cartao' }),
    interpretarFn: async () => interpretar,
    interpretarMultiFn: async () => null,
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Fulana Equipe' }),
    lancarFn: async (p) => ({ ok: true, movimentacao_id: 'M1', valor: p.valor, forma: p.forma }),
    rotearV4Fn: async () => null, listarPreviewsAbertosFn: async () => [], chequesFn: null,
    log: (o) => logs.push(o),
  });
  return { h, enviadas, logs };
}

(async () => {
  const falhas = [];
  const checar = (c, m) => { if (!c) falhas.push(m); };
  const MULTI = /mais de um aluno/i;

  // A. o caso real: uma venda, produtos com "+" → card simples, sem pedir divisão
  const A = novo({ categoria: 'lojinha', aluno: 'Bento Carvalho', forma: 'cartao', competencia: null,
    pagamentos: [{ aluno: 'Bento Carvalho', valor: 190 }] });
  const rA = await A.h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'L1',
    body: 'venda para o aluno Bento Carvalho\nCaderno cordas + chaveiro porta palhetas + mini caixa de som bluetooth\n\nR$ 190,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://recibo.jpg'] });
  const tA = A.enviadas.join('\n---\n');
  console.log('A acao:', rA && rA.acao);
  checar(!MULTI.test(tA), 'A: venda de lojinha com produtos ligados por "+" NÃO pode virar "mais de um aluno"');
  checar(!(rA && rA.acao === 'manual_review_multi_student'), 'A: não pode abrir revisão multi-aluno');
  checar(A.logs.some((l) => l.acao === 'lojinha_multi_texto_ignorado'), 'A: o detector de texto deveria ter sido ignorado (log)');
  checar(/Bento/.test(tA), 'A: o card deve trazer o aluno');

  // A2. o modelo não devolveu comprador, mas a legenda rotula "para o aluno X"
  const A2 = novo({ categoria: 'lojinha', aluno: null, forma: 'cartao', competencia: null });
  const rA2 = await A2.h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'L1b',
    body: 'venda para o aluno Bento Carvalho\nCaderno cordas + chaveiro porta palhetas + mini caixa de som bluetooth\n\nR$ 190,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://recibo.jpg'] });
  console.log('A2 acao:', rA2 && rA2.acao);
  checar(!MULTI.test(A2.enviadas.join('\n')), 'A2: comprador rotulado na legenda + produtos com "+" NÃO pode virar multi');

  // B. lojinha de 2 alunos no formato que a Sol ensina continua multi
  const B = novo({ categoria: 'lojinha', aluno: null, forma: 'cartao', competencia: null });
  const rB = await B.h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'L2',
    body: 'Camisas lojinha\nBento Carvalho — R$ 95,00\nCaio Carvalho — R$ 95,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://recibo2.jpg'] });
  console.log('B acao:', rB && rB.acao);
  checar(!B.logs.some((l) => l.acao === 'lojinha_multi_texto_ignorado'), 'B: formato "Nome — R$" não pode ser ignorado');
  checar(B.logs.some((l) => /multi/.test(String(l.acao || ''))) || /aluno/i.test(B.enviadas.join('\n')),
    'B: duas linhas "Nome — R$" em lojinha seguem para o fluxo de vários alunos');

  // C. parcela (não lojinha) com dois nomes ligados por "e" continua multi (regra antiga intacta)
  const C = novo({ categoria: 'parcela', aluno: null, forma: 'pix', competencia: '10/2026' });
  const rC = await C.h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'L3',
    body: 'Parcela de Bento Carvalho e Caio Carvalho',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  console.log('C acao:', rC && rC.acao);
  checar(rC && rC.acao === 'manual_review_multi_student' || MULTI.test(C.enviadas.join('\n')),
    'C: parcela com dois nomes ligados por "e" deve continuar no fluxo de vários alunos');

  if (falhas.length) { console.error('FALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log('OK lojinha-produtos-com-mais-nao-sao-alunos');
})().catch((e) => { console.error(e); process.exit(1); });
