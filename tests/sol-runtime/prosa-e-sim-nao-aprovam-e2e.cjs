// Caso 31/08 16:12-16:13 (CG): o RESUMO DA AUDITORIA colado no grupo pelo
// Luciano virou "Saída de caixa — R$ 633,00 dinheiro / despesa" (a palavra
// "vale" de "vale confirmar" casou o SAIDA_TERMO_RE, o primeiro R$ da prosa
// virou valor e "dinheiro de evento" virou forma), e a resposta do Jhon a uma
// pergunta HUMANA — "Foi de propósito sim, Luciano" — aprovou o lançamento
// (token frouxo aceitava "sim" em QUALQUER posição quando citava a pendência).
//
// Raízes:
//  R-e: prosa/relato não é ditado de caixa — texto puro só vira lançamento se
//       for curto, com UM valor e sem vocabulário de auditoria/relato; e "vale"
//       só como substantivo com complemento.
//  R-f: token frouxo de aprovação exige mensagem curta E afirmação que ABRE a
//       mensagem.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const LUCIANO = '5521977770001';
const JHON = '5521933330001';

const PROSA = 'Os lançamentos de R$633 (StarLine) e R$300 (Pareidolia) foram apagados por alguém da equipe depois do "Lancei ✅" — a tela do caixa permite excluir com o dia aberto, e não havia rastro nenhum (por isso não sei quem). Não recriei: pode ter sido de propósito (dinheiro de evento talvez não pertença ao caixa da unidade). Agora todo DELETE deixa trilha no audit_log (trigger novo) — vale confirmar com a Ana Paula se foi intencional.';

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: '', status: 'ok', file_bytes: 0 }),
    visaoFn: async () => null,
    interpretarFn: async () => null,
    canonicaFn: async () => null,
    casarFn: async () => null,
    responsavelFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    buscarCorrecaoFn: async () => null,
    buscarMovimentosFn: async () => null,
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M1', valor: p.valor, forma: p.forma }; },
    lancarSaidaFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'S1', valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── unidades R-f: o "sim" no meio da frase não aprova mais ──────────────────
  checar(mod.casarPode('Foi de propósito sim, Luciano', { respondeuPreview: true }).pode === false,
    '"Foi de propósito sim, Luciano" NÃO pode aprovar (sim no meio da frase)');
  checar(mod.casarPode('sim', { respondeuPreview: true }).pode === true, 'REGRESSÃO: "sim" seco citando o card segue aprovando');
  checar(mod.casarPode('pode fazer', { respondeuPreview: true }).pode === true, 'REGRESSÃO: "pode fazer" segue aprovando');
  checar(mod.casarPode('isso mesmo', { respondeuPreview: true }).pode === true, 'REGRESSÃO: "isso mesmo" segue aprovando');
  checar(mod.casarPode('ok', { respondeuPreview: true }).pode === true, 'REGRESSÃO: "ok" citando o card segue aprovando');
  checar(mod.casarPode('acho que sim, mas espera a Rose confirmar', { respondeuPreview: true }).pode === false,
    '"acho que sim, mas espera" NÃO pode aprovar');

  // ── e2e R-e: a prosa não vira card ──────────────────────────────────────────
  const A = novo();
  const rA = await A.h.handle({ chatId: CHAT, senderPhone: LUCIANO, messageId: 'P1', body: PROSA, hasMedia: false });
  console.log('prosa acao:', rA && rA.acao);
  checar(!rA || rA.acao !== 'saida_texto_preview_enviado', `prosa não pode virar card de saída; veio "${rA && rA.acao}"`);
  checar(A.enviadas.length === 0, 'prosa não pode gerar mensagem de card');
  // com o "vale" corrigido, a prosa nem parece saida; o caminho que ela casa e o
  // de comando de movimento ("apagados"/"excluir") — o gate certo loga la.
  checar(A.logs.some((l) => l.acao === 'comando_movimento_ignorado_prosa' || l.acao === 'saida_texto_ignorada_prosa'),
    'deveria logar o gate de prosa (comando_movimento_ignorado_prosa)');

  // ── regressões R-e: ditados reais continuam funcionando ─────────────────────
  const B = novo();
  const rB = await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D1',
    body: 'Compra de dois refrigerantes, saiu R$9 do caixa em dinheiro', hasMedia: false });
  checar(rB && rB.acao === 'saida_texto_preview_enviado', `ditado do refrigerante segue virando card; veio "${rB && rB.acao}"`);

  const C = novo();
  const rC = await C.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D2',
    body: 'Sol, vale de R$50 pro instrutor, em dinheiro', hasMedia: false });
  checar(rC && rC.acao === 'saida_texto_preview_enviado', `"vale de R$50" (substantivo) segue virando card; veio "${rC && rC.acao}"`);

  const D = novo();
  const rD = await D.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D3',
    body: 'vale confirmar com a Ana Paula amanhã', hasMedia: false });
  checar(!rD || rD.acao === 'nada', `"vale confirmar" (verbo) não é saída; veio "${rD && rD.acao}"`);

  // ── e2e R-f: com card de saída aberto, a frase do Jhon não lança ────────────
  const E = novo();
  await E.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D4',
    body: 'Compra de material de limpeza, saiu R$30 do caixa em dinheiro', hasMedia: false });
  checar(E.enviadas.length === 1, 'setup: card de saída aberto');
  const cardId = E.ids[E.ids.length - 1];
  const rNao = await E.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D5',
    body: 'Foi de propósito sim, Luciano', hasMedia: false, quotedMessageId: cardId });
  checar(E.lancados.length === 0, `a frase do Jhon NÃO pode lançar; lançou ${E.lancados.length}`);
  await E.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'D6', body: 'pode', hasMedia: false });
  checar(E.lancados.length === 1, `"pode" explícito segue lançando; lançou ${E.lancados.length}`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — prosa não vira card, e dinheiro só com afirmação que abre a mensagem');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
