// Incidente Arthur/Barra (15/09): o humano escreveu 365+365+365; duas faturas
// ainda não tinham chegado na cópia do Emusys e o runtime transformou a mera
// divisão numérica em "desconto negociado". A regra é global: valor digitado
// não prova desconto. Sem autorização explícita não existe card aprovável.
const mod = require('./_alvo.cjs');

const UNIDADES = [
  { nome: 'Barra', chat: '120363263030561835@g.us', id: '368d47f5-2d88-4475-bc14-ba084a9a348e' },
  { nome: 'Campo Grande', chat: '5521981278047-1544204225@g.us', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92' },
  { nome: 'Recreio', chat: '5521973870998-1583848991@g.us', id: '95553e96-971b-4590-a6eb-0201d013c14d' },
];
const CAPTION = 'Parcela dos alunos Athos, Thais e João Ferreira\nAthos - R$ 365,00\nThais - R$ 365,00\nJoão - R$ 365,00\nValor: R$ 1.095,00';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fatura = (ordem, nome, id) => ({
  ordem, aluno_nome: nome, aluno_id: 100 + ordem, valor: 365,
  categoria: 'parcela', competencia: '09/2026', canonical_fatura_id: id,
  descricao: `Parcela 09/2026 do curso ${ordem}`,
  sem_vinculo_fatura: false, declarado_pelo_humano: false,
  fatura: { canonical_fatura_id: id, status: 'paga', data_pagamento: '2026-09-15',
    forma_pagamento: { nome: 'Pix' } },
});
const VINCULADO = {
  ok: true, valor_total: 1095, soma_itens: 1095,
  itens: [
    fatura(1, 'Athos Ferreira', '11111111-1111-4111-8111-111111111111'),
    fatura(2, 'Thais Ferreira', '22222222-2222-4222-8222-222222222222'),
    fatura(3, 'João Ferreira', '33333333-3333-4333-8333-333333333333'),
  ],
};
const PARCIAL_ANTIGO = {
  ok: true, valor_total: 1095, soma_itens: 1095,
  itens: [
    VINCULADO.itens[0],
    { ordem: 2, aluno_nome: 'Thais Ferreira', aluno_id: 102, valor: 365,
      categoria: 'parcela', sem_vinculo_fatura: true, declarado_pelo_humano: true, fatura: null },
    { ordem: 3, aluno_nome: 'João Ferreira', aluno_id: 103, valor: 365,
      categoria: 'parcela', sem_vinculo_fatura: true, declarado_pelo_humano: true, fatura: null },
  ],
};

function novo(unidade, resolverMultiFn) {
  const enviadas = []; const resolverCalls = []; const lancados = []; const logs = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [unidade.chat]: { grupo_jid: unidade.chat, unidade_id: unidade.id, nome: unidade.nome } },
    sendFn: async (_c, texto) => { enviadas.push(String(texto)); return `MSG-${++seq}`; },
    ocrFn: async () => ({ text: 'Comprovante Pix R$ 1.095,00', status: 'ok', file_bytes: 5000 }),
    visaoFn: async () => ({ valor: 1095, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: null, competencia: '09/2026', forma: 'pix' }),
    interpretarMultiFn: async () => ({
      tipo_recebimento: 'multi_aluno', valor_total: 1095, forma: 'pix', categoria: 'parcela',
      itens: [
        { aluno_nome: 'Athos Ferreira', valor: 365, categoria: 'parcela' },
        { aluno_nome: 'Thais Ferreira', valor: 365, categoria: 'parcela' },
        { aluno_nome: 'João Ferreira', valor: 365, categoria: 'parcela' },
      ],
    }),
    resolverMultiFn: async (args) => { resolverCalls.push(args); return resolverMultiFn(args); },
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'ADM' }),
    lancarLoteFn: async (payload) => { lancados.push(payload); return { ok: true, lote_id: 'L1', movimentacoes: [] }; },
    log: (item) => logs.push(item),
  });
  return { h, enviadas, resolverCalls, lancados, logs };
}

async function enviar(h, unidade, body, messageId) {
  return h.handle({ chatId: unidade.chat, senderPhone: '5521999990000', messageId,
    body, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
}

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  checar(mod.extrairAutorizacaoDescontoProtocolada('Desconto autorizado por: Jerêh').ok,
    'protocolo: campo explícito com autorizador');
  checar(!mod.extrairAutorizacaoDescontoProtocolada('Desconto autorizado pelo Jerêh').ok,
    'protocolo: conversa livre não autoriza exceção financeira');
  checar(!mod.extrairAutorizacaoDescontoProtocolada('desconto de R$ 50').ok,
    'protocolo: desconto sem autorização continua bloqueado');
  checar(!mod.extrairAutorizacaoDescontoProtocolada(CAPTION).ok,
    'protocolo: soma e valores não viram desconto');

  for (const unidade of UNIDADES) {
    // Defesa em profundidade: até um retorno antigo `ok:true`/sem vínculo é
    // recusado pelo Core comum quando o humano não declarou desconto autorizado.
    const A = novo(unidade, async () => PARCIAL_ANTIGO);
    const rA = await enviar(A.h, unidade, CAPTION, `${unidade.nome}-A1`);
    const msgA = A.enviadas.join('\n');
    checar(rA && rA.acao === 'manual_review_multi_student', `${unidade.nome}: parcial sem desconto recusa`);
    checar(/Não criei card aprovável/i.test(msgA), `${unidade.nome}: explica que não há card aprovável`);
    checar(/não vou tratar valor digitado como desconto/i.test(msgA), `${unidade.nome}: não infere desconto`);
    checar(!/Posso lançar o lote/i.test(msgA), `${unidade.nome}: não emite pergunta de aprovação`);
    checar(A.resolverCalls[0] && A.resolverCalls[0].itens.every((i) => i.declarado_pelo_humano === false),
      `${unidade.nome}: valores literais sem autorização chegam fail-closed à RPC`);
    await A.h.handle({ chatId: unidade.chat, senderPhone: '5521999990000',
      messageId: `${unidade.nome}-A2`, body: 'pode', hasMedia: false });
    checar(A.lancados.length === 0, `${unidade.nome}: "pode" não lança revisão sem card`);

    // Corrida resolvida: quando todas as faturas aparecem, nasce um preview
    // novo totalmente vinculado, sem reutilizar a autorização anterior.
    const B = novo(unidade, async () => VINCULADO);
    const rB = await enviar(B.h, unidade, CAPTION, `${unidade.nome}-B1`);
    const cardB = B.enviadas.join('\n');
    checar(rB && /preview_multi/.test(String(rB.acao)), `${unidade.nome}: sync resolvida gera preview novo`);
    checar(/Já pago no Emusys|Faturas validadas individualmente/i.test(cardB),
      `${unidade.nome}: todas vinculadas podem afirmar validação`);
    checar(!/sem vínculo de fatura/i.test(cardB), `${unidade.nome}: preview novo não carrega a lacuna antiga`);
    checar(B.lancados.length === 0, `${unidade.nome}: preview novo ainda exige novo "pode"`);

    // Exceção legítima preservada: só o protocolo explícito permite ao
    // resolver e ao renderer assumirem item sem fatura.
    const C = novo(unidade, async (args) => {
      const autorizado = args.itens.every((i) => i.declarado_pelo_humano === true
        && i.desconto_negociado_explicito === true);
      return autorizado ? PARCIAL_ANTIGO : { ok: false, motivo: 'item_nao_validado' };
    });
    const rC = await enviar(C.h, unidade, CAPTION + '\nDesconto autorizado por: Jerêh', `${unidade.nome}-C1`);
    const cardC = C.enviadas.join('\n');
    checar(rC && /preview_multi/.test(String(rC.acao)), `${unidade.nome}: desconto explicitamente autorizado preservado`);
    checar(/1 de 3 item\(ns\) com fatura validada/i.test(cardC), `${unidade.nome}: renderer não exagera a validação`);
    checar(/desconto explicitamente autorizado/i.test(cardC), `${unidade.nome}: renderer nomeia a exceção real`);
    checar(!/Faturas validadas individualmente/i.test(cardC), `${unidade.nome}: parcial não finge validação total`);
  }

  // Pequena espera garante que nenhuma promessa de mídia ficou solta.
  await sleep(20);
  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s):`);
    falhas.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('desconto inferido + sync global: Barra, Campo Grande e Recreio protegidos');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
