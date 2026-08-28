// Saída de caixa por COMPRA (despesa) — caso Rose/Vitória, Recreio, 28/08/2026.
//
// 🔴 CAUSA-RAIZ: nenhuma categoria de saída além de `seguranca` era alcançável a
// partir da legenda. `_categoriaFromCaption` e `_categoriaExplicitaFromCaption`
// não tinham UMA regra que devolvesse 'despesa'/'retirada'/'troco' — e a primeira
// ainda cai em 'parcela' por padrão. Ou seja: comprar refrigerante, material,
// lanche ou pagar um Uber era IMPOSSÍVEL de lançar. A equipe não tinha palavra
// nenhuma que resolvesse, porque não existia palavra.
//
// O episódio real, em 3 tentativas:
//   15:36 "Compra de 2 refrigerantes para aniversariante do mês R$34,00"
//         -> card RECEBIMENTO, categoria lojinha, pedindo aluno
//   15:39 "Sol, foi saída de dinheiro e a categoria e despesa"
//         -> "Não entendi essa 🤔"
//   15:40 "2 refrigerantes R$34 - Despesa (saída) / Pagamento em dinheiro"
//         -> card RECEBIMENTO de novo, categoria "outro", e o nome tardio engoliu
//            a frase seguinte: aluno virou "descrição é refrigerantes Pode"
//
// ⚠️ A detecção tem de sair da LEGENDA, nunca do OCR: o cupom fiscal da compra
// contém "COMPRA", "PAGAMENTO" e "TROCO" no próprio corpo. Ler dali transformaria
// todo comprovante em saída — é a mesma armadilha do "Chave de segurança" no
// rodapé do PDF do Santander (caso Valentina/Recreio 24/08).
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';

// OCR real de um cupom fiscal de posto — repare em COMPRA/PAGAMENTO/TROCO.
const OCR_CUPOM = [
  'AUTO POSTO NOVO AMERICAS LTDA CNPJ 39.335.616/0001-70',
  'AVENIDA DAS AMERICAS 15551 RECREIO DOS BANDEIRANTES RIO DE JANEIRO',
  'Documento Auxiliar da Nota Fiscal de Consumidor Eletronica',
  'REFRIGERANTE COCA COLA PET 2L 2 UN 17,00 34,00',
  'Valor Total R$ 34,00',
  'FORMA DE PAGAMENTO DINHEIRO 34,00',
  'TROCO R$ 0,00',
  'COMPRA EFETUADA',
].join('\n');

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; const saidas = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: OCR_CUPOM, status: 'ok' }),
    visaoFn: async () => ({ valor: 34, forma: 'dinheiro' }),
    // O LLM chutava 'lojinha' (viu produto) ou 'outro'. O humano é quem manda.
    interpretarFn: async () => ({ categoria: 'outro', aluno: null, competencia: null, forma: 'dinheiro' }),
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Rose Gerente' }),
    lancarFn: async (p) => { lancados.push(p); return { movimentacao_id: 1, valor: p.valor }; },
    lancarSaidaFn: async (p) => { saidas.push(p); return { movimentacao_id: 2, valor: p.valor }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancados, saidas };
}

const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── 1. unitário do detector: é aqui que a regra mora ────────────────────────
  const casos = [
    ['Compra de 2 refrigerantes para aniversariante do mês R$34,00', 'despesa'],
    ['2 refrigerantes R$34 - Despesa (saída)', 'despesa'],
    ['Sol, foi saída de dinheiro e a categoria e despesa', 'despesa'],
    ['Comprei material de limpeza R$ 50', 'despesa'],
    ['Paguei o uber do professor R$ 32', 'despesa'],
    ['Retirada de R$ 200 do cofre', 'retirada'],
    ['Troco para o caixa R$ 100', 'troco'],
    // ⚠️ Recebimento NUNCA pode virar saída, mesmo com verbo de compra:
    ['Parcela do aluno Joao, o responsavel pagou hoje', null],
    ['Passaporte da Giovanna R$ 350', null],
    ['Comprovante PIX mensalidade setembro', null],
    ['Pagamento em dinheiro', null],   // fala da FORMA, não de despesa
  ];
  for (const [texto, esperado] of casos) {
    const got = mod._saidaExplicitaFromCaption ? mod._saidaExplicitaFromCaption(texto) : undefined;
    if (got !== esperado) falhas.push(`_saidaExplicitaFromCaption("${texto}") = ${got}, esperava ${esperado}`);
  }
  console.log(`unitário detector: ${casos.length - falhas.length}/${casos.length}`);

  // ── 2. o OCR do cupom NÃO pode criar saída sozinho ──────────────────────────
  // O cupom tem COMPRA/PAGAMENTO/TROCO. Se a legenda fala de parcela, é entrada.
  if (mod._saidaExplicitaFromCaption) {
    const doOcr = mod._saidaExplicitaFromCaption(OCR_CUPOM);
    // Dá 'troco' (o cupom tem "TROCO R$ 0,00"). O valor exato nao importa — o que
    // importa e' que o cupom SOZINHO classificaria como saida, provando por que a
    // deteccao tem de sair da legenda humana e nunca do OCR.
    checar(!!doOcr, 'o texto do cupom isolado deveria casar (prova que o risco existe)');
  }

  // ── 3. o caso real: legenda de compra + imagem do cupom ─────────────────────
  const A = novo();
  await A.h.handle({
    chatId: CHAT, senderPhone: '5521999999999', messageId: 'R1',
    body: 'Compra de 2 refrigerantes para aniversariante do mês R$34,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'],
  });
  const card = ultimo(A.enviadas);
  console.log('\ncard:', card.split('\n').slice(0, 6).join(' | ').slice(0, 160));
  checar(/Sa[ií]da de caixa/i.test(card), 'card deveria dizer "Saída de caixa"');
  checar(/PAGAMENTO \(sa[ií]da\)/i.test(card), 'card deveria dizer "PAGAMENTO (saída)"');
  checar(!/RECEBIMENTO/i.test(card), 'card NÃO pode dizer RECEBIMENTO');
  checar(!/\*ALUNO\*/i.test(card) && !/qual aluno/i.test(card), 'saída não pode pedir/mostrar ALUNO');

  // ── 4. o "pode" tem de cair em lancarSaidaFn, nunca em lancarFn ─────────────
  await A.h.handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'R2',
    body: 'pode', hasMedia: false, quotedMessageId: A.ids[A.ids.length - 1] });
  checar(A.saidas.length === 1, `esperava 1 saída lançada, veio ${A.saidas.length}`);
  checar(A.lancados.length === 0, `nada podia ir para lancarFn (recebimento), foram ${A.lancados.length}`);
  if (A.saidas[0]) {
    checar(Number(A.saidas[0].valor) === 34, `valor deveria ser 34, veio ${A.saidas[0].valor}`);
    console.log('lançamento:', JSON.stringify({ valor: A.saidas[0].valor, categoria: A.saidas[0].categoria || A.saidas[0].p_categoria }));
  }

  // ── 5. a 2ª legenda do episódio real também tem de virar saída ──────────────
  const B = novo();
  await B.h.handle({
    chatId: CHAT, senderPhone: '5521999999999', messageId: 'R3',
    body: '2 refrigerantes R$34 - Despesa (saída)\nPagamento em dinheiro',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://cupom.jpg'],
  });
  checar(/Sa[ií]da de caixa/i.test(ultimo(B.enviadas)), '2ª legenda real deveria virar saída');

  // ── 6. REGRESSÃO: parcela normal continua recebimento ──────────────────────
  const C = novo({
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Maria Silva', competencia: null, forma: 'pix' }),
    ocrFn: async () => ({ text: 'PIX RECEBIDO MARIA SILVA R$ 400,00', status: 'ok' }),
    visaoFn: async () => ({ valor: 400, forma: 'pix' }),
  });
  await C.h.handle({
    chatId: CHAT, senderPhone: '5521999999999', messageId: 'R4',
    body: 'Parcela da aluna Maria Silva R$400',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'],
  });
  checar(/RECEBIMENTO/i.test(ultimo(C.enviadas)), 'parcela deveria continuar RECEBIMENTO');
  checar(!/Sa[ií]da de caixa/i.test(ultimo(C.enviadas)), 'parcela não pode virar saída');

  // ── 7. o nome tardio não pode engolir frase de comando/correção ─────────────
  const naoSaoNomes = [
    'descrição é refrigerantes Pode',
    'Sol, foi saída de dinheiro e a categoria e despesa',
    'descrição é: 2 refrigerantes',
    'a categoria é despesa',
    'a forma foi dinheiro',
  ];
  for (const frase of naoSaoNomes) {
    const n = mod._nomeHumanoTardio ? mod._nomeHumanoTardio(frase) : null;
    if (n) falhas.push(`_nomeHumanoTardio("${frase}") devolveu "${n}" — não é nome de aluno`);
  }
  // ...mas nome de verdade continua passando
  if (mod._nomeHumanoTardio) {
    const ok = mod._nomeHumanoTardio('Rafael Magalhaes Barbosa');
    checar(!!ok, 'nome real deveria continuar sendo aceito, veio ' + ok);
  }

  // ── 8. cupom de NFC-e nao pode virar cartao ────────────────────────────────
  // SINAL_CARTAO tinha `nsu` sem fronteira: "CoNSUmidor" (que esta em TODO cupom
  // fiscal) casava, e extrairCartao SOBRESCREVE a forma. Compra em dinheiro virava
  // "cartao credito" — e saida de cofre exige dinheiro.
  if (mod.extrairCartao) {
    const naoSaoCartao = ['Nota Fiscal de Consumidor Eletronica', 'total de consumo', 'revisao do instrumento'];
    for (const s of naoSaoCartao) {
      if (mod.extrairCartao(s)) falhas.push(`extrairCartao("${s}") acusou cartao — falso positivo`);
    }
    for (const s of ['NSU 123456', 'CARTAO VISA DEBITO', 'PAGBANK CREDITO']) {
      if (!mod.extrairCartao(s)) falhas.push(`extrairCartao("${s}") deveria acusar cartao`);
    }
  }
  checar(/dinheiro/i.test(card), 'card da compra deveria dizer dinheiro, nao cartao');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — compra vira saída de caixa e lança pela RPC de saída');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
