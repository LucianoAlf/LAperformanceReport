// Caso Arthur/Barra (29/08 10:33-10:39): venda de UMA camisa (R$65, cartão) virou
// "comprovante de mais de um aluno", e a explicação dele ("venda de camisa para o
// aluno Theo de bem, 65 reais") bateu em "manda os dois" para sempre. O log mostra
// o interpretador acertando lojinha — e nada disso importando.
//
// Cobre as três correções:
//  E1: multi-aluno só nasce da LEGENDA — OCR de recibo (pagador/estabelecimento/"e")
//      nunca decide multi. Terceiro falso positivo do OCR em dois dias.
//  E2: correção que declara UM aluno converte a revisão multi em lançamento single.
//  E3: "camisa" é produto de lojinha (só havia "camiseta").
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const ARTHUR = '5521966660001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OCR PagBank com a armadilha típica: nomes ligados por "e" (pagador/portador),
// que era o que fazia o detector acusar multi.
const OCR_PAGBANK = 'PagBank\nVIA ESTABELECIMENTO\nLA MUSIC KIDS BARRA\nCNPJ 40.353.410/0001-95\nVENDA CREDITO MASTERCARD\nPORTADOR JOAO CARLOS e MARIA JOSE SILVA\nVALOR 65,00\nAUT 002783';

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    // ⚠️ Sensível à URL: a cena dos irmãos é um comprovante de R$700 — reusar o OCR
    // da camisa (65) faria a validação de soma (350+350 != 65) recusar CORRETAMENTE
    // e o teste acusaria regressão falsa. Artefato de mock, aprendido na 1ª rodada.
    ocrFn: async (p) => (String(p).includes('irmaos')
      ? { text: 'PIX RECEBIDO R$ 700,00', status: 'ok', file_bytes: 40000 }
      : { text: OCR_PAGBANK, status: 'ok', file_bytes: 93988 }),
    visaoFn: async () => ({ valor: 65, forma: 'cartao' }),
    interpretarFn: async () => ({ categoria: 'lojinha', aluno: null, competencia: null, forma: 'cartao' }),
    interpretarMultiFn: async (t) => {
      const s = String(t).toLowerCase();
      // correção real do Arthur: UM aluno declarado
      if (s.includes('theo')) return { itens: [{ aluno_nome: 'Theo de Bem', valor: 65, categoria: 'lojinha' }], valor_total: 65 };
      // divisão real de dois irmãos
      if (s.includes('thiago') && s.includes('matheus')) {
        return { itens: [
          { aluno_nome: 'Thiago Fernandes', valor: 350, categoria: 'passaporte' },
          { aluno_nome: 'Matheus Fernandes', valor: 350, categoria: 'passaporte' },
        ], valor_total: 700 };
      }
      return { itens: [], valor_total: null };
    },
    resolverMultiFn: async (u, itens, total) => ({
      ok: true,
      itens: (itens || []).map((it, i) => ({ ...it, aluno_id: 100 + i, canonical_fatura_id: 200 + i })),
      valor_total: total,
    }),
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
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

  // ── E1: a legenda da camisa NUNCA vira multi, mesmo com "e" no OCR ──────────
  checar(mod.detectarContextoMultiAluno(OCR_PAGBANK) === true,
    'o OCR sozinho deveria acusar multi (prova que o gatilho existe)');
  checar(mod.detectarContextoMultiAluno('Venda camisa LA Music Kids Preta 4 anos\n\nVenda: Arthur') === false,
    'a legenda da camisa não pode acusar multi');

  const A = novo();
  const rA = await A.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C1',
    body: 'Venda camisa LA Music Kids Preta 4 anos\n\nVenda: Arthur',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://camisa.jpg'] });
  console.log('E1 acao:', rA && rA.acao);
  console.log('E1 card:', ultimo(A.enviadas).split('\n').slice(0, 6).join(' | ').slice(0, 150));
  checar(rA && rA.acao !== 'manual_review_multi_student', `camisa não podia virar multi; veio "${rA && rA.acao}"`);
  checar(!/mais de um aluno/i.test(ultimo(A.enviadas)), 'card não pode dizer "mais de um aluno"');
  checar(/65/.test(ultimo(A.enviadas)), 'card deveria mostrar os R$ 65');
  checar(/lojinha/i.test(ultimo(A.enviadas)), 'categoria deveria ser lojinha (E3: camisa é produto)');

  // ...e o "pode" lança
  await A.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'P1', body: 'pode', hasMedia: false });
  checar(A.lancados.length === 1, `"pode" deveria lançar a camisa; lançou ${A.lancados.length}`);
  if (A.lancados[0]) checar(Number(A.lancados[0].valor) === 65, `valor deveria ser 65, veio ${A.lancados[0].valor}`);

  // ── E2: preso na revisão multi, "é um aluno só" converte para single ────────
  const B = novo({
    // legenda que LEGITIMAMENTE dispara multi (dois nomes ligados por "e"), mas o
    // interpretador não consegue itens → cai na revisão manual
    interpretarMultiFn: async (t) => {
      const s = String(t).toLowerCase();
      if (s.includes('theo')) return { itens: [{ aluno_nome: 'Theo de Bem', valor: 65, categoria: 'lojinha' }], valor_total: 65 };
      return { itens: [], valor_total: null };
    },
  });
  const rB1 = await B.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C2',
    body: 'Pagamento de Joao Pedro Almeida e Marcos Vinicius Souza',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://camisa.jpg'] });
  checar(rB1 && rB1.acao === 'manual_review_multi_student',
    `legenda com dois nomes deveria cair na revisão; veio "${rB1 && rB1.acao}"`);

  // a correção do Arthur: UM aluno declarado → converte
  const rB2 = await B.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C3',
    body: 'Foi uma venda de camisa para o aluno Theo de bem\nValor:65 reais\nEntendeu sol?', hasMedia: false });
  console.log('E2 acao:', rB2 && rB2.acao);
  console.log('E2 card:', ultimo(B.enviadas).split('\n').slice(0, 5).join(' | ').slice(0, 150));
  checar(rB2 && rB2.acao === 'multi_convertido_para_single',
    `um aluno declarado deveria converter; veio "${rB2 && rB2.acao}"`);
  checar(/Theo de Bem/i.test(ultimo(B.enviadas)), 'card convertido deveria trazer o Theo');
  checar(!/Ainda falta uma divis/i.test(ultimo(B.enviadas)), 'não pode repetir "ainda falta divisão"');

  // e o "pode" do convertido lança os 65
  await B.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'P2', body: 'pode', hasMedia: false });
  checar(B.lancados.length === 1, `convertido deveria lançar com "pode"; lançou ${B.lancados.length}`);
  if (B.lancados[0]) checar(Number(B.lancados[0].valor) === 65, `valor do convertido deveria ser 65, veio ${B.lancados[0].valor}`);

  // ── REGRESSÃO: divisão real de dois irmãos continua no fluxo multi ──────────
  const C = novo();
  const rC = await C.h.handle({ chatId: CHAT, senderPhone: ARTHUR, messageId: 'C4',
    body: 'Passaporte Thiago Fernandes e Matheus Fernandes 350,00 cada',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://irmaos.jpg'] });
  console.log('REG acao:', rC && rC.acao);
  checar(rC && String(rC.acao).startsWith('preview_multi'),
    `dois irmãos com valores deveria seguir multi; veio "${rC && rC.acao}"`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — OCR não decide multi, e "é um aluno só" tem saída');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
