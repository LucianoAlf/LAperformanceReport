// Comprovante de UM aluno não pode virar "multi-aluno" por causa do nome do pagador.
//
// CASO (Mayra/CG, 28/08/2026 16:43): PIX de R$ 380,00, legenda
//   "PG pix parcela 08/2026 aluno Arthur de Jesus Lindo Braga - Kids CG R$380,00"
// UM aluno, rotulado com todas as letras. A Sol respondeu "Entendi que este
// comprovante é de mais de um aluno... Manda cada aluno com seu valor" e ficou
// presa repetindo o pedido. O lançamento não saiu.
//
// CAUSA: `detectarContextoMultiAluno` roda sobre legenda + OCR. A regra NOMES_LIGADOS
// procura dois grupos de nomes próprios unidos por "e"/"+"/"&" — e TODO comprovante
// PIX traz o nome do PAGADOR (aqui "SELMA DE MATTOS LINDO BRAGA"), que quase nunca é
// o do aluno. Basta uma linha do recibo casar para o comprovante inteiro virar multi.
//
// ⚠️ NÃO é regressão das mudanças de 28/08: `detectarContextoMultiAluno` está byte a
// byte idêntico antes e depois (md5 conferido). Defeito antigo, exposto agora.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

// OCR de PIX real: o pagador aparece, e o par de nomes ligados por "e" e' o gatilho.
const OCR_PIX = [
  'R$ 380,00',
  'Realizado em 28/08/2026 as 16:30:54',
  'De SELMA DE MATTOS LINDO BRAGA e LA MUSIK KIDS',
  'CPF ***.196.087.**',
  'Instituicao ITAU UNIBANCO S.A',
  'Chave Pix 26707112000170',
].join('\n');

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_PIX, status: 'ok' }),
    visaoFn: async () => ({ valor: 380, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Arthur de Jesus Lindo Braga', competencia: '2026-08', forma: 'pix' }),
    // Se o fluxo multi for acionado, o interpretador devolve 1 item so -> a Sol
    // responde "manda cada aluno com seu valor", que e' exatamente o bug.
    interpretarMultiFn: async () => ({ itens: [{ aluno_nome: 'Arthur de Jesus Lindo Braga' }], valor_total: 380 }),
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra ADM' }),
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs };
}

const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  const LEGENDA = 'PG pix parcela 08/2026 aluno Arthur de Jesus Lindo Braga - Kids CG R$380,00';

  // ── 1. o gatilho existe mesmo: o OCR sozinho acusa multi ───────────────────
  checar(mod.detectarContextoMultiAluno(OCR_PIX) === true,
    'o OCR do PIX deveria acusar multi (prova que o risco e real)');
  checar(mod.detectarContextoMultiAluno(LEGENDA) === false,
    'a legenda sozinha NAO acusa multi');
  checar(mod._alunoRotulado(LEGENDA) === 'Arthur de Jesus Lindo Braga',
    'a legenda rotula um aluno unico: ' + mod._alunoRotulado(LEGENDA));

  // ── 2. o caso real: card normal, sem pedir divisao ─────────────────────────
  const A = novo();
  const r = await A.h.handle({
    chatId: CHAT, senderPhone: '5521988887777', messageId: 'P1',
    body: LEGENDA, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'],
  });
  console.log('acao:', r && r.acao);
  console.log('card:', ultimo(A.enviadas).split('\n').slice(0, 5).join(' | ').slice(0, 170));

  checar(r && r.acao !== 'manual_review_multi_student',
    `NAO podia rotear para multi-aluno; veio acao="${r && r.acao}"`);
  checar(!/mais de um aluno/i.test(ultimo(A.enviadas)),
    'card NAO pode dizer "mais de um aluno"');
  checar(!/cada aluno com seu valor/i.test(ultimo(A.enviadas)),
    'card NAO pode pedir divisao por aluno');
  checar(/380/.test(ultimo(A.enviadas)), 'card deveria mostrar o valor de 380');

  // ── 3. REGRESSAO: legenda com multi de verdade continua protegida ──────────
  const casosMulti = [
    'Passaporte aluno Thiago Fernandes E Matheus Fernandes 350,00 cada',
    'Parcela de Joao Victor e Pedro Victor',
    'pagamento de 2 alunos, Daniel e Arthur',
  ];
  for (const c of casosMulti) {
    checar(mod.detectarContextoMultiAluno(c) === true, `legenda multi deveria continuar acusando: "${c}"`);
  }

  // ── 4. sem legenda util, o OCR NAO decide multi (revisado em 29/08) ─────────
  // A versao de 28/08 deste teste esperava manual_review aqui. Caiu de proposito:
  // o OCR carrega pagador/estabelecimento/conectivos e produziu MAIS um multi falso
  // no dia seguinte (camisa PagBank, Arthur/Barra). Sem legenda util o fluxo single
  // cuida — card sem aluno pergunta o nome, sem armadilha de "manda os dois".
  const B = novo();
  const rB = await B.h.handle({
    chatId: CHAT, senderPhone: '5521988887777', messageId: 'P2',
    body: 'segue o comprovante', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'],
  });
  checar(rB && rB.acao !== 'manual_review_multi_student',
    `OCR sozinho nao pode decidir multi; veio "${rB && rB.acao}"`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — rótulo humano de um aluno vence o nome do pagador no recibo');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
