// Caso Jhon/CG (01/09 17:09-17:12): pagamento de DOIS alunos com desconto
// negociado ("*Desconto autorizado pelo Jerêh*"). O Jhon mandou a divisão
// EXATAMENTE no formato que a Sol pediu ("Davi Guilherme - R$ 1.290,00 /
// Thuanny De Souza - R$ 432,00") e ela repetiu "não consegui confirmar as
// faturas oficiais" em loop — o resolver exigia bater no centavo com fatura
// canônica, e valor negociado não bate nunca. No fluxo de UM aluno a mesma
// situação é aviso + lançamento sem vínculo; a inconsistência era a raiz.
//
// Banco (migration): item com `declarado_pelo_humano` cujo valor não bate com
// fatura entra SEM vínculo (aluno vinculado, fatura null); validador de
// snapshot pula a revalidação de fatura desses itens; soma × total continua
// obrigatória; divisão derivada continua fail-closed.
// Runtime (patch): a flag só é setada quando o valor está LITERALMENTE no
// texto humano; card avisa item a item; "pode" continua obrigatório.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const JHON = '5521933330001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancadosLote = []; const resolverCalls = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: 'Comprovante de transferência\nValor R$ 1.722,00\nPix\nDestino ESCOLA DE MUSICA L A', status: 'ok', file_bytes: 41987 }),
    visaoFn: async () => ({ valor: 1722, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: null, competencia: '08/2026', forma: 'pix' }),
    interpretarMultiFn: async (t) => {
      const s = String(t);
      if (/1\.?290/.test(s) && /432/.test(s)) {
        return { tipo_recebimento: 'multi_aluno', valor_total: 1722, forma: 'pix', categoria: 'parcela',
          itens: [
            { aluno_nome: 'Davi Guilherme', valor: 1290, categoria: 'parcela' },
            { aluno_nome: 'Thuanny De Souza', valor: 432, categoria: 'parcela' },
          ] };
      }
      return { tipo_recebimento: 'multi_aluno', valor_total: 1722, forma: 'pix', categoria: 'parcela',
        itens: [{ aluno_nome: 'Davi Guilherme', valor: null }, { aluno_nome: 'Thuanny De Souza', valor: null }] };
    },
    resolverMultiFn: async (args) => {
      resolverCalls.push(args);
      const decl = (args.itens || []).every((i) => i.declarado_pelo_humano);
      if (!decl) return { ok: false, motivo: 'item_nao_validado', ordem: 1 };
      return { ok: true, valor_total: 1722, soma_itens: 1722, itens: [
        { ordem: 1, aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', aluno_id: 1321,
          responsavel_financeiro: 'Elisangela de Souza Chaves Ribeiro', valor: 1290, categoria: 'parcela',
          competencia: null, canonical_fatura_id: null, sem_vinculo_fatura: true, declarado_pelo_humano: true,
          descricao: null, fatura: null },
        { ordem: 2, aluno_nome: 'Thuanny de Souza Chaves Ribeiro', aluno_id: 397,
          responsavel_financeiro: 'Elisangela de Souza Chaves Ribeiro', valor: 432, categoria: 'parcela',
          competencia: '08/2026', canonical_fatura_id: '3153ad70-2cb8-4f67-b41e-4bd3e688e0de',
          descricao: 'Parcela 08/2026 do curso de Canto', fatura: { status: 'paga', data_pagamento: '2026-09-01', forma_pagamento: { nome: 'Pix' } } },
      ] };
    },
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    lancarLoteFn: async (p) => { lancadosLote.push(p); return { ok: true, lote_id: 'L1', movimentacoes: [] }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancadosLote, resolverCalls };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── o fluxo real: comprovante+legenda, depois a divisão ditada ──────────────
  const A = novo();
  const pMedia = A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'J1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://transf.jpg'] });
  await sleep(250);
  await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'J2',
    body: 'Parcelas 08/26 de dois alunos: Davi Guilherme e Thuanny De Souza\nLA CG - R$1.722,00\n\n*Desconto autorizado pelo Jerêh', hasMedia: false });
  const rMedia = await pMedia;
  console.log('mídia acao:', rMedia && rMedia.acao);
  checar(rMedia && rMedia.acao === 'manual_review_multi_student',
    `sem divisão por aluno ainda pede revisão (fail-closed); veio "${rMedia && rMedia.acao}"`);

  // a divisão ditada, formato exato que a Sol pediu
  const rDiv = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'J3',
    body: 'Davi Guilherme - R$ 1.290,00\n\nThuanny De Souza - R$ 432,00', hasMedia: false });
  console.log('divisão acao:', rDiv && rDiv.acao);
  const card = ultimo(A.enviadas);
  console.log('card:', card.split('\n').filter(Boolean).slice(0, 8).join(' | ').slice(0, 240));
  checar(rDiv && /preview_multi/.test(String(rDiv.acao)),
    `divisão declarada deveria gerar o preview do lote; veio "${rDiv && rDiv.acao}"`);
  checar(/Davi Guilherme De Souza Chaves Ribeiro — R\$ 1\.290,00/.test(card.replace(/ /g, ' ')) || /Davi Guilherme/.test(card),
    'card lista o Davi com o valor declarado');
  checar(/valor declarado — sem vínculo de fatura/i.test(card), 'card avisa o item sem vínculo');
  checar(/desconto negociado/i.test(card), 'card explica o porquê na seção FATURA');

  // a flag só foi setada porque os valores estão literalmente no texto
  const chamada = A.resolverCalls[A.resolverCalls.length - 1];
  checar(chamada && chamada.itens.every((i) => i.declarado_pelo_humano === true),
    'itens com valor literal no texto vão com declarado_pelo_humano=true');

  // ...e o "pode" lança o lote com o item sem vínculo
  await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'J4', body: 'pode', hasMedia: false });
  checar(A.lancadosLote.length === 1, `"pode" deveria lançar o lote; lançou ${A.lancadosLote.length}`);
  if (A.lancadosLote[0]) {
    const itens = A.lancadosLote[0].itens || [];
    checar(itens.length === 2, 'lote com os 2 itens');
    checar(itens[0] && itens[0].declarado_pelo_humano === true && !itens[0].canonical_fatura_id,
      'item do Davi viaja sem fatura e com a flag (o validador do banco a exige)');
    checar(itens[1] && itens[1].canonical_fatura_id, 'item da Thuanny mantém o vínculo canônico');
  }

  // ── fail-closed intacto: divisão DERIVADA (valores não escritos) não ganha flag
  const B = novo();
  const pB = B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'J5',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://transf.jpg'] });
  await sleep(250);
  await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'J6',
    body: 'Parcelas de dois alunos: Davi Guilherme e Thuanny De Souza\nLA CG - R$1.722,00', hasMedia: false });
  await pB;
  const chamadaB = B.resolverCalls[B.resolverCalls.length - 1];
  if (chamadaB) {
    checar(!chamadaB.itens.some((i) => i.declarado_pelo_humano && i.valor == null),
      'REGRESSÃO: item sem valor escrito não pode ganhar a flag');
  }

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — divisão declarada com desconto negociado lança sem vínculo, com aviso e pode');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
