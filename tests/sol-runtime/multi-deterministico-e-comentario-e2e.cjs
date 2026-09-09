// Caso Jhon/CG (01/09 18:28-18:31): a legenda tinha a divisão COMPLETA no
// formato que a Sol ensina e mesmo assim caiu na parede "Manda cada aluno com
// seu valor" — o interpretador LLM estourou os 30s e o intent nasceu ausente.
// Minutos depois, o comentário "ai Jhon ta certo esse" (humano falando com
// humano) virou "nome de aluno" e mutilou o card do lote.
//  D1: formato ensinado é parseado DETERMINISTICAMENTE — LLM fora do caminho.
//  D2: pendência multi (lote/manual-review) não é alvo de correção de nome.
//  D3: token de comentário (ta/certo/esse/ai...) mata o nome LIVRE.
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const JHON = '5521933330001';

const CAPTION = 'Parcelas 08/2026\nAlunos:\n\nDavi Guilherme - R$ 1.290,00\n\nThuanny De Souza - R$ 432,00\n\nLA CG - R$1.722,00';

function novo(overrides = {}) {
  const enviadas = []; const logs = []; const lancadosLote = []; const resolverCalls = [];
  let seq = 0; let llmMultiCalls = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: 'Comprovante de transferência\nValor R$ 1.722,00\nPix\nDestino ESCOLA DE MUSICA L A', status: 'ok', file_bytes: 41987 }),
    visaoFn: async () => ({ valor: 1722, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: null, competencia: '08/2026', forma: 'pix' }),
    // A LLM multi SEMPRE estoura o tempo neste teste: o caminho ensinado não
    // pode depender dela (foi exatamente o que quebrou às 18:28).
    interpretarMultiFn: async () => { llmMultiCalls += 1; throw new Error('timeout simulado'); },
    resolverMultiFn: async (args) => {
      resolverCalls.push(args);
      return { ok: true, valor_total: 1722, soma_itens: 1722, itens: [
        { ordem: 1, aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', aluno_id: 1321, valor: 1290,
          categoria: 'parcela', canonical_fatura_id: null, sem_vinculo_fatura: true, declarado_pelo_humano: true, fatura: null },
        { ordem: 2, aluno_nome: 'Thuanny de Souza Chaves Ribeiro', aluno_id: 397, valor: 432,
          categoria: 'parcela', competencia: '08/2026', canonical_fatura_id: '3153ad70-2cb8-4f67-b41e-4bd3e688e0de',
          fatura: { status: 'paga', data_pagamento: '2026-09-01', forma_pagamento: { nome: 'Pix' } } },
      ] };
    },
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    classificarCorrecaoFn: async () => null,
    lancarLoteFn: async (p) => {
      lancadosLote.push(p);
      return { ok: true, lote_id: 'L1', movimentacoes: (p.itens || []).map((i) => ({ movimentacao_id: 'M' + i.ordem, aluno_nome: i.aluno_nome, valor: i.valor })) };
    },
    log: () => {},
    ...overrides,
  });
  return { h, enviadas, lancadosLote, resolverCalls, llm: () => llmMultiCalls };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── unidade: o extrator lê o formato ensinado sem LLM ───────────────────────
  if (typeof mod.extrairItensNomeValor !== 'function') {
    falhas.push('extrairItensNomeValor não exportado (patch não aplicado)');
  } else {
    const d = mod.extrairItensNomeValor(CAPTION);
    checar(d.itens.length === 2, `extrator: 2 itens (veio ${d.itens.length})`);
    checar(d.itens[0] && d.itens[0].valor === 1290 && /Davi/i.test(d.itens[0].aluno_nome), 'extrator: Davi 1290');
    checar(d.itens[1] && d.itens[1].valor === 432 && /Thuanny/i.test(d.itens[1].aluno_nome), 'extrator: Thuanny 432');
    checar(d.totalDeclarado === 1722, `extrator: linha da unidade vira TOTAL (veio ${d.totalDeclarado})`);
    const s = mod.extrairItensNomeValor('LA CG - R$447,00');
    checar(s.itens.length === 0, 'extrator: só linha de unidade não gera item');
  }

  // ── D1: mídia com a divisão completa NÃO depende da LLM ─────────────────────
  const A = novo();
  const rA = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D1',
    body: CAPTION, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://transf.jpg'] });
  console.log('mídia acao:', rA && rA.acao, '| chamadas LLM multi:', A.llm());
  const cardA = ultimo(A.enviadas);
  checar(rA && rA.acao === 'preview_multi_aluno_enviado',
    `divisão completa na legenda deveria virar o card do lote mesmo com a LLM morta; veio "${rA && rA.acao}"`);
  checar(A.llm() === 0, `LLM multi não pode estar no caminho do formato ensinado (foi chamada ${A.llm()}x)`);
  checar(/1\.722/.test(cardA) && /Thuanny/i.test(cardA), 'card do lote com total 1.722 e a Thuanny');
  const chamadaA = A.resolverCalls[A.resolverCalls.length - 1];
  checar(chamadaA && chamadaA.itens.every((i) => i.declarado_pelo_humano === true),
    'valores literais na legenda viajam como declarado_pelo_humano');

  // ── D2+D3: comentário humano não vira nome nem toca o lote ──────────────────
  const rB = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D2',
    body: 'ai Jhon ta certo esse', hasMedia: false });
  console.log('comentário acao:', rB && rB.acao);
  checar(!rB || !/preview_aluno_corrigido/.test(String(rB.acao)),
    `"ai Jhon ta certo esse" não pode virar correção de aluno; veio "${rB && rB.acao}"`);
  checar(!/ai Jhon ta certo esse/i.test(ultimo(A.enviadas)), 'nenhum card pode sair com o comentário como aluno');

  // ...e o "pode" lança o LOTE intacto
  await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D3', body: 'pode', hasMedia: false });
  checar(A.lancadosLote.length === 1, `"pode" deveria lançar o lote; lançou ${A.lancadosLote.length}`);
  if (A.lancadosLote[0]) {
    const nomes = (A.lancadosLote[0].itens || []).map((i) => i.aluno_nome).join(' | ');
    checar(/Davi/.test(nomes) && /Thuanny/.test(nomes) && !/ta certo/i.test(nomes),
      `lote com Davi e Thuanny, sem lixo de comentário (veio: ${nomes})`);
  }

  // ── D1: completação da revisão manual também é determinística ───────────────
  const B = novo();
  const rB1 = await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D4',
    body: 'Parcelas 08/2026 de dois alunos: Davi Guilherme e Thuanny De Souza',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://transf.jpg'] });
  checar(rB1 && rB1.acao === 'manual_review_multi_student',
    `sem divisão ainda pede revisão (fail-closed); veio "${rB1 && rB1.acao}"`);
  const llmAposMidia = B.llm();
  // conversa no meio não re-dispara nada
  const rB2 = await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D5', body: 'calma ai', hasMedia: false });
  checar(!rB2 || !/preview/.test(String(rB2.acao || '')), '"calma ai" com revisão aberta não manda card');
  // a divisão ditada fecha sem LLM
  const rB3 = await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D6',
    body: 'Davi Guilherme - R$ 1.290,00\n\nThuanny De Souza - R$ 432,00\n\nLA CG - R$1.722,00', hasMedia: false });
  console.log('completação acao:', rB3 && rB3.acao, '| chamadas LLM multi:', B.llm() - llmAposMidia);
  checar(rB3 && /preview_multi/.test(String(rB3.acao)),
    `divisão ditada deveria fechar o lote; veio "${rB3 && rB3.acao}"`);
  checar(B.llm() === llmAposMidia, 'completação no formato ensinado não chama a LLM');

  // ── D4: retorno da RPC é a verdade — lote parcial nunca vira "sucesso" ──────
  const E = novo({ lancarLoteFn: async (p) => ({ ok: true, lote_id: 'LX',
    movimentacoes: [{ movimentacao_id: 'M1', aluno_nome: (p.itens[0] || {}).aluno_nome, valor: (p.itens[0] || {}).valor }] }) });
  await E.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'E1',
    body: CAPTION, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://transf.jpg'] });
  const rE = await E.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'E2', body: 'pode', hasMedia: false });
  checar(rE && rE.acao === 'lote_multi_incompleto',
    `banco confirmando 1 de 2 itens tem de virar alerta, não sucesso; veio "${rE && rE.acao}"`);
  checar(/ATENÇÃO.*1 de 2/i.test(ultimo(E.enviadas)), 'alerta explícito de lote incompleto no grupo');

  // ── regressões ──────────────────────────────────────────────────────────────
  // rótulo explícito continua corrigindo card single sem aluno
  const C = novo({ interpretarFn: async () => ({ categoria: 'parcela', aluno: null, competencia: '08/2026', forma: 'pix' }),
    ocrFn: async () => ({ text: 'PIX R$ 100,00', status: 'ok', file_bytes: 999 }),
    visaoFn: async () => ({ valor: 100, forma: 'pix' }) });
  await C.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D7',
    body: 'segue comprovante', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rC1 = await C.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D8',
    body: 'ai Jhon ta certo esse', hasMedia: false });
  checar(!rC1 || !/preview_aluno_corrigido/.test(String(rC1.acao)),
    'comentário também não vira nome em card SINGLE');
  const rC2 = await C.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D9',
    body: 'aluno: Davi Guilherme', hasMedia: false });
  checar(rC2 && /preview_aluno_corrigido/.test(String(rC2.acao)),
    `REGRESSÃO: rótulo "aluno: Nome" segue corrigindo (veio "${rC2 && rC2.acao}")`);
  // nome livre limpo segue funcionando
  checar(mod._nomeHumanoTardio('Maria Clara Souza') === 'Maria Clara Souza'
    || /Maria Clara Souza/i.test(String(mod._nomeHumanoTardio('Maria Clara Souza'))),
    'REGRESSÃO: nome livre limpo continua aceito');
  checar(mod._nomeHumanoTardio('ai Jhon ta certo esse') === null, 'comentário morre no gate de tokens');
  checar(mod.ehConversaSemComando('um instante') === true, '"um instante" é conversa');
  checar(mod.ehConversaSemComando('pode') === false, 'REGRESSÃO: "pode" não é conversa');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — formato ensinado sem LLM; comentário não vira nome; lote intacto');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
