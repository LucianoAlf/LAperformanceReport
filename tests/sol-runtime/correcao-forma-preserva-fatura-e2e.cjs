// INCIDENTE RECREIO 10/09 15:22-15:27 — cinco rodadas para lancar R$ 385.
//
// 🔴 O QUE ACONTECEU. A Vitoria mandou o comprovante (Canto, 09/2026, pix). A
//    Sol montou o card com a fatura errada; a Vitoria corrigiu a competencia e
//    a Sol acertou. Ai ela disse "sol, pagamento foi pix" — e o card VOLTOU
//    para a fatura errada, perdendo a correcao anterior. Ela corrigiu de novo.
//    Depois explicou ao Luciano "essa aluna faz dois cursos, 1 foi pago no
//    cartao de credito e outro no pix" — e a Sol tratou a EXPLICACAO como
//    correcao de forma, voltando tudo pela terceira vez.
//
// 🔴 DUAS CAUSAS, as duas deterministicas:
//    (1) o rebuild da correcao de forma passava `canonica: null` fixo, entao a
//        fatura que a humana tinha acabado de fixar sumia da renderizacao;
//    (2) `extrairCorrecaoForma` escolhia a PRIMEIRA forma citada, entao uma
//        frase com "cartao" E "pix" virava "corrige para cartao".
//
// ⚠️ NAO E REGRESSAO DA V4: o bloco e byte-identico ao artefato anterior a
//    promocao de 10/09, e o canario estava vazio (o log so tem shadow).
// ⚠️ O roteador V4 tambem NAO salvaria este caso — placar do shadow no
//    incidente: 1 acerto em 4 (`corrigir_competencia` 0.95 ok; depois `nada`,
//    `conversa` e, na frase da Vitoria, `corrigir_forma`, que e o mesmo erro).
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = process.env.SOL_CAIXA_V3_LEDGER_STRICT || '0';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const mod = require('./_alvo.cjs');

const CHAT = '5521999990000-1600000000@g.us';
const UNIDADE = '3ec861f6-023f-4d7b-9927-3960ad8c2a93';
const ADM = '5521933330002';

// as duas faturas reais da aluna (medidas em producao, sanitizadas)
const FAT_CANTO_SET = { canonical_fatura_id: 'f-canto-09', descricao: 'Parcela 09/2026 do curso de Canto',
  competencia: '2026-09-01', numero_parcela: 5, total_parcelas_contrato: 12, status: 'paga',
  data_pagamento: '2026-09-10', forma_pagamento: { nome: 'Pix' }, valor_pago: '385.00',
  valor_da_parcela: '385.00', data_vencimento: '2026-09-05' };

function novo(over = {}) {
  const enviadas = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'MSG' + (++seq); },
    rotearV4Fn: async () => null,
    // em producao quem entendeu 'a parcela e do mes 09/2026' foi o fallback
    // LLM de dialogo (log: fallback_llm_classificou -> corrigir_competencia).
    // O harness espelha isso; desligar o fallback mediria outro fluxo.
    classificarCorrecaoFn: async (txt) => (/09.2026|setembro/i.test(String(txt))
      ? { intencao: 'corrigir_competencia', competencia: '09/2026' } : null),
    ocrFn: async () => ({ text: 'Comprovante do Pix\nR$ 385,00', status: 'ok', file_bytes: 37075 }),
    visaoFn: async () => ({ valor: 385, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Elis Tineli Gomes Cotta',
      competencia: '09/2026', forma: 'pix' }),
    interpretarMultiFn: async () => null,
    canonicaFn: async () => ({ ok: true, motivo_escolha: 'ja_consta_paga',
      aluno_nome: 'Elis Tineli Gomes Cotta', responsavel_nome: 'Ariane Tineli Gomes Cotta',
      fatura: FAT_CANTO_SET }),
    // em producao o preview inicial saiu do CASADOR (o log tem casar_result e
    // nenhuma chamada a canonica) — e ele trouxe a parcela de OUTUBRO.
    casarFn: async () => ({ ok: true, aluno_nome: 'Elis Tineli Gomes Cotta',
      parcela: { competencia: '2026-10-01', valor: 385, descricao: 'Parcela 10/2026 do curso de Canto',
                 data_vencimento: '2026-10-05' }, multiplas: true }),
    responsavelFn: async () => ({ ok: true, aluno_nome: 'Elis Tineli Gomes Cotta',
      responsavel_nome: 'Ariane Tineli Gomes Cotta' }),
    pagadorFn: async () => null, faturasMesFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Vitoria' }),
    lancarFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    lancarLoteFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    // o preview V3 precisa de `preview_id`: sem ele o fluxo responde
    // "preview seguro nao foi registrado" e nem chega a montar o card.
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'fake-prev-' + (++seq) }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'fake-appr' }),
    log: (o) => logs.push(o),
    ...over,
  });
  return { h, enviadas, logs };
}
const ultimo = (a) => String(a[a.length - 1] || '');
// legenda real do incidente, sanitizada. Montada com fromCharCode porque a
// quebra de linha escrita como escape nao sobrevive as camadas ate aqui.
const LEGENDA = 'parcela de setembro, curso canto aluna Elis Tineli Gomes Cotta'
  + String.fromCharCode(10) + 'R$385,00 - pix';

(async () => {
  const falhas = [];
  const checar = (c, m) => { if (!c) falhas.push(m); };

  // ── F1: FATURA FIXADA SOBREVIVE A CORRECAO DE FORMA ───────────────────────
  //    Este e o defeito, isolado: o rebuild da correcao de forma passava
  //    `canonica: null` fixo. Com uma fatura ja fixada na pendencia — que e o
  //    que as correcoes de aluno/competencia gravam —, trocar a FORMA fazia o
  //    card voltar para a fatura anterior. Em Recreio isso aconteceu DUAS vezes.
  // ⚠️ A pendencia e montada direto em vez de encenar os tres turnos: o 1o
  //    turno depende do fallback LLM e o 2o de internals do classificador, e um
  //    teste que precisa simular tudo isso mede o harness, nao o runtime. O que
  //    esta em julgamento e uma coisa so — se o rebuild preserva a fatura.
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'C1', body: LEGENDA,
    hasMedia: true, mediaType: 'document', downloadMedia: async () => Buffer.from('x') });
  const pend = (A.h._pendentes.get(CHAT) || [])[0];
  checar(!!pend, 'F1: nenhuma pendencia criada pelo comprovante');
  checar(ultimo(A.enviadas).includes('10/2026'),
    'F1: o card inicial deveria trazer a fatura ERRADA (outubro), como em producao');

  // estado apos a humana corrigir a competencia: a fatura certa fixada
  pend.competencia = '09/2026';
  pend.canonica = { ok: true, motivo_escolha: 'ja_consta_paga',
    aluno_nome: 'Elis Tineli Gomes Cotta', responsavel_nome: 'Ariane Tineli Gomes Cotta',
    fatura: FAT_CANTO_SET };
  pend.parcela = null; pend.multiplas = false;

  await A.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'C3', body: 'sol, pagamento foi pix' });
  const cardPos = ultimo(A.enviadas);
  checar(cardPos.includes('Remontei o preview'), 'F1: nao remontou -> ' + JSON.stringify(cardPos.slice(0, 120)));
  checar(/pix/i.test(cardPos), 'F1: a forma nao virou pix');
  checar(!cardPos.includes('10/2026'),
    'F1: o card VOLTOU para a fatura de outubro — era o defeito -> ' + JSON.stringify(cardPos.slice(0, 300)));
  checar(cardPos.includes('09/2026'),
    'F1: a fatura 09/2026 sumiu depois de corrigir a forma -> ' + JSON.stringify(cardPos.slice(0, 300)));
  checar(cardPos.includes('Emusys'), 'F1: o bloco da fatura canonica sumiu do card remontado');
  const pend2 = (A.h._pendentes.get(CHAT) || [])[0];
  checar(!!(pend2 && pend2.canonica), 'F1: a pendencia perdeu a canonica');

  // ── F2: frase que cita DUAS formas nao corrige nada — pergunta ────────────
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'D1',
    body: 'parcela de setembro, curso canto aluna Elis Tineli Gomes Cotta\nR$385,00 - pix',
    hasMedia: true, mediaType: 'document', downloadMedia: async () => Buffer.from('x') });
  const formaAntes = ((B.h._pendentes.get(CHAT) || [])[0] || {}).forma;
  const rB = await B.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'D2',
    body: '@Luciano Alf, essa aluna ela faz dois cursos, 1 foi pago no cartão de crédito e outro no pix' });
  const respB = ultimo(B.enviadas);
  checar(!/Você tem razão: a forma é/.test(respB),
    'F2: tratou a EXPLICACAO como correcao de forma -> ' + JSON.stringify(respB.slice(0, 140)));
  checar(rB && rB.acao === 'correcao_forma_ambigua',
    'F2: acao=' + JSON.stringify(rB && rB.acao) + ', esperava correcao_forma_ambigua');
  checar(/cartao|cartão/i.test(respB) && /pix/i.test(respB),
    'F2: a pergunta nao lista as duas formas citadas');
  const formaDepois = ((B.h._pendentes.get(CHAT) || [])[0] || {}).forma;
  checar(formaAntes === formaDepois,
    'F2: a forma da pendencia mudou (' + formaAntes + ' -> ' + formaDepois + ') sem a humana mandar');

  // ── F3: correcao de UMA forma so continua funcionando ─────────────────────
  const C = novo();
  await C.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'E1',
    body: 'parcela de setembro, curso canto aluna Elis Tineli Gomes Cotta\nR$385,00 - pix',
    hasMedia: true, mediaType: 'document', downloadMedia: async () => Buffer.from('x') });
  const rC = await C.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'E2',
    body: 'sol, foi no dinheiro' });
  checar(/Remontei o preview/.test(ultimo(C.enviadas)) && /dinheiro/i.test(ultimo(C.enviadas)),
    'F3: correcao simples de forma parou de funcionar -> ' + JSON.stringify(ultimo(C.enviadas).slice(0, 140)));

  // ── F4: o extrator, direto ────────────────────────────────────────────────
  const e = mod.extrairCorrecaoForma;
  checar(e('sol, pagamento foi pix').forma === 'pix', 'F4: nao extrai pix simples');
  checar(e('sol, foi no cartão de crédito').forma === 'cartao', 'F4: nao extrai cartao simples');
  const amb = e('essa aluna faz dois cursos, 1 foi pago no cartão de crédito e outro no pix');
  checar(amb && amb.ambigua === true && amb.forma === null,
    'F4: frase com DUAS formas nao foi marcada como ambigua -> ' + JSON.stringify(amb));

  if (falhas.length) { console.error('FALHOU:'); falhas.forEach((f) => console.error('  - ' + f)); process.exit(1); }
  console.log('ok correcao de forma: preserva a fatura fixada, e frase com duas formas pergunta em vez de escolher');
})();
