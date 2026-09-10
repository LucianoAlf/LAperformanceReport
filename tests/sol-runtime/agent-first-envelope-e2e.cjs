// AGENT-FIRST: conversa livre -> envelope estruturado -> Core -> preview.
//
// 🔴 O CASO QUE ORIGINOU A FRENTE (10/09, 10h18 BRT). Texto REAL, tirado do log
//    do shadow: uma aluna com dois cursos, tres valores na frase e o total no
//    fim. O caminho legado entregou ao banco `nome = "PG parcelas aluna Lis Dal
//    Mora Mello curso canto e curso de violao Kids CG"` e `valor = 357` — e o
//    artefato ANTERIOR fazia exatamente igual, entao nao houve regressao: essa
//    forma de legenda nunca funcionou. O que faltava era alguem LER a frase.
//
// ⚠️ Aqui o roteador e o Core sao injetados com o que eles DE FATO devolveram em
//    producao naquele instante (shadow: Lis / 657 / pix / 09-2026; Core, medido
//    por SELECT: 357,00 + 300,00 = 657,00, responsavel Gisele). Nao e mock de
//    conveniencia: e replay de valor observado.
// ⚠️ Nenhuma escrita e nenhum outbound real: lancarFn/lancarLoteFn EXPLODEM se
//    forem chamadas, e sendFn so acumula.
// ⚠️ O trilho V3 precisa estar ATIVO para o preview existir; sem isso o fluxo
//    responde "trilho seguro indisponivel" e o teste mediria outra coisa.
//    E `FAKE=1` e FORCADO, nunca opcional: rodar em modo producao sem ele ja
//    gravou 62% dos previews do ledger de uma semana como artefato de teste.
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = process.env.SOL_CAIXA_V3_LEDGER_STRICT || '0';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const ADM = '5521933330001';
const TEXTO_LIS = 'PG pix parcelas 09/2026 aluna Lis Dal Mora Mello curso canto (R$357,00) e curso de violão (R$300,00) - Kids CG R$657,00';

const DEC_LIS = { intencao: 'lancamento_por_texto', aluno_nome: 'Lis Dal Mora Mello',
  valor: 657, valor_total: 657, forma: 'pix', categoria: 'parcela', competencia: '09/2026',
  pagador: null, itens: [{ aluno: 'Lis Dal Mora Mello', categorias: ['parcela'], competencias: ['09/2026'] }],
  confianca: 0.95 };

const RES_LIS = { ok: true, valor_total: 657, soma_itens: 657, alunos: 1, via: 'itens',
  faturas_no_universo: 2, forma: 'pix', pagador: null,
  itens: [
    { ordem: 1, aluno_nome: 'Lis Dal Mora Mello', responsavel_financeiro: 'Gisele Dalmora da Silva',
      valor: 357, categoria: 'parcela', competencia: '09/2026',
      canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000001', sem_vinculo_fatura: false,
      declarado_pelo_humano: false, fatura: { status: 'paga', data_pagamento: '2026-09-09', forma_pagamento: { nome: 'Pix' } } },
    { ordem: 2, aluno_nome: 'Lis Dal Mora Mello', responsavel_financeiro: 'Gisele Dalmora da Silva',
      valor: 300, categoria: 'parcela', competencia: '09/2026',
      canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000002', sem_vinculo_fatura: false,
      declarado_pelo_humano: false, fatura: { status: 'paga', data_pagamento: '2026-09-09', forma_pagamento: { nome: 'Pix' } } },
  ] };

function novo(over = {}) {
  const enviadas = []; const logs = []; const pedidos = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'MSG' + (++seq); },
    rotearV4Fn: async () => DEC_LIS,
    resolverEnvelopeFn: async (p) => { pedidos.push(p); return RES_LIS; },
    ocrFn: async () => ({ text: '', status: 'ok', file_bytes: 10 }),
    visaoFn: async () => null,
    interpretarFn: async () => null, interpretarMultiFn: async () => null,
    classificarCorrecaoFn: async () => null,
    canonicaFn: async () => null, casarFn: async () => null,
    responsavelFn: async () => null, pagadorFn: async () => null, faturasMesFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    lancarFn: async () => { throw new Error('ESCRITA PROIBIDA'); },
    lancarLoteFn: async () => { throw new Error('ESCRITA PROIBIDA'); },
    lancarSaidaFn: async () => { throw new Error('ESCRITA PROIBIDA'); },
    registrarPreviewV3Fn: async () => ({ ok: true }), registrarApprovalV3Fn: async () => ({ ok: true }),
    log: (o) => logs.push(o),
    ...over,
  });
  return { h, enviadas, logs, pedidos };
}
const junta = (a) => a.join(' || ');

(async () => {
  const falhas = [];
  const checar = (c, m) => { if (!c) falhas.push(m); };
  const CAN = process.env.SOL_CAIXA_V4_CANARIO;

  // ── F0: o portao nasce DESLIGADO, e e por LISTA, nunca booleano ────────────
  delete process.env.SOL_CAIXA_V4_CANARIO;
  checar(mod._v4CanarioLigado(CHAT) === false, 'F0: canario ligado sem env — deveria nascer desligado');
  process.env.SOL_CAIXA_V4_CANARIO = 'outro-grupo@g.us';
  checar(mod._v4CanarioLigado(CHAT) === false, 'F0: canario ligou para grupo fora da lista');
  process.env.SOL_CAIXA_V4_CANARIO = CHAT;
  checar(mod._v4CanarioLigado(CHAT) === true, 'F0: canario nao ligou para o grupo da lista');

  // ── F1: com o canario DESLIGADO, o agent-first nao roda (comportamento de hoje)
  delete process.env.SOL_CAIXA_V4_CANARIO;
  const D = novo();
  await D.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'OFF', body: TEXTO_LIS });
  checar(D.pedidos.length === 0, 'F1: com canario desligado o Core do envelope foi chamado');
  checar(!D.logs.some((l) => String(l.acao).startsWith('agent_first')),
    'F1: com canario desligado houve log de agent_first');

  // ── F2: LIS/MAYRA pelo caminho que RESPONDE — 657, duas linhas, nome limpo ──
  process.env.SOL_CAIXA_V4_CANARIO = CHAT;
  const A = novo();
  const rA = await A.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'LIS', body: TEXTO_LIS });
  checar(A.pedidos.length === 1, 'F2: o Core do envelope nao foi chamado');
  const env = A.pedidos[0] && A.pedidos[0].envelope;
  checar(env && Number(env.valor_total) === 657,
    'F2: valor_total enviado ao Core = ' + (env && env.valor_total) + ', esperava 657 (o legado mandava 357)');
  checar(env && env.itens.length === 1 && env.itens[0].aluno === 'Lis Dal Mora Mello',
    'F2: aluno enviado ao Core = ' + JSON.stringify(env && env.itens) + ' (o legado mandava a frase inteira)');
  const card = A.enviadas.find((x) => /R\$/.test(x)) || '';
  checar(/657/.test(card), 'F2: card sem 657 -> ' + JSON.stringify(card.slice(0, 160)));
  checar(!/357,00\*/.test(card.split('TOTAL')[0] || ''), 'F2: card lideranca com 357 (defeito antigo)');
  checar(String(rA && rA.acao) !== 'nada', 'F2: acao=nada, o agent-first nao assumiu');

  // ── F3: FAIL-SAFE — sem decisao, sem envelope, erro no Core: cai para o legado
  for (const [rot, res, nome] of [
    [async () => null, async () => RES_LIS, 'sem_decisao'],
    [async () => ({ intencao: 'conversa', confianca: 0.9 }), async () => RES_LIS, 'intencao_nao_lanca'],
    [async () => DEC_LIS, async () => { throw new Error('boom'); }, 'erro_resolver'],
    [async () => DEC_LIS, async () => ({ ok: false, motivo: 'nenhuma_combinacao_fecha' }), 'nao_resolveu'],
  ]) {
    const T = novo({ rotearV4Fn: rot, resolverEnvelopeFn: res });
    const r = await T.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'FS-' + nome, body: TEXTO_LIS });
    checar(!(r && String(r.acao).startsWith('agent_first')),
      'F3/' + nome + ': agent-first respondeu quando deveria ceder ao legado');
  }

  // ── F4: AMBIGUIDADE -> PERGUNTA, nunca escolhe ─────────────────────────────
  const AMB = novo({ resolverEnvelopeFn: async () => ({
    ok: false, motivo: 'combinacao_ambigua', combinacoes: 2, valor_total: 400,
    alternativas: [
      [{ aluno_nome: 'Gemea Ambigua', categoria: 'parcela', competencia: '09/2026', valor: 400 }],
      [{ aluno_nome: 'Gemea Ambigua', categoria: 'parcela', competencia: '09/2026', valor: 400 }],
    ] }) });
  const rAmb = await AMB.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'AMB', body: TEXTO_LIS });
  checar(rAmb && rAmb.motivo === 'combinacao_ambigua', 'F4: nao perguntou na ambiguidade -> ' + JSON.stringify(rAmb));
  checar(/mais de uma/i.test(junta(AMB.enviadas)), 'F4: pergunta sem explicar que ha mais de uma combinacao');

  // ── F5: HOMONIMO -> pergunta COM a lista (o `candidatos: null` de 10/09) ────
  const HOM = novo({ resolverEnvelopeFn: async () => ({
    ok: false, motivo: 'nome_ambiguo',
    candidatos: [{ aluno_nome: 'Alice Souza' }, { aluno_nome: 'Alice Prado' }] }) });
  const rHom = await HOM.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'HOM', body: TEXTO_LIS });
  checar(rHom && rHom.motivo === 'nome_ambiguo', 'F5: nao perguntou no homonimo');
  checar(/Alice Souza/.test(junta(HOM.enviadas)) && /2/.test(junta(HOM.enviadas)),
    'F5: pergunta sem os candidatos -> ' + JSON.stringify(junta(HOM.enviadas).slice(0, 160)));

  // ── F6: montarEnvelopeV4 — funcao PURA, os casos que o contrato singular nao cobria
  const m = mod.montarEnvelopeV4;
  const e1 = m(DEC_LIS);
  checar(e1.ok && e1.envelope.itens.length === 1, 'F6/dois-cursos: ' + JSON.stringify(e1));

  const e2 = m({ intencao: 'lancamento_multi_aluno', valor_total: 1200, forma: 'pix',
    itens: [{ aluno: 'Irmao A', categorias: [], competencias: [] },
            { aluno: 'Irma B', categorias: [], competencias: [] }] });
  checar(e2.ok && e2.envelope.itens.length === 2, 'F6/irmaos: ' + JSON.stringify(e2));

  const e3 = m({ intencao: 'lancamento_por_texto', valor_total: 1239.76, forma: 'pix',
    itens: [{ aluno: 'Pablo', categorias: ['parcela'], competencias: ['07/2026', '08/2026', '09/2026'] }] });
  checar(e3.ok && e3.envelope.itens[0].competencias.length === 3,
    'F6/varios-meses: competencias[] nao sobreviveu -> ' + JSON.stringify(e3));

  const e4 = m({ intencao: 'lancamento_por_texto', valor_total: 900, forma: 'pix',
    itens: [{ aluno: 'Fulano', categorias: ['passaporte', 'matricula', 'parcela'], competencias: [] }] });
  checar(e4.ok && e4.envelope.itens[0].categorias.length === 3,
    'F6/trio: categorias[] nao sobreviveu -> ' + JSON.stringify(e4));

  const e5 = m({ intencao: 'lancamento_por_texto', pagador: 'Gisele Dalmora da Silva',
    valor_total: 657, forma: 'pix', itens: [] });
  checar(e5.ok && e5.envelope.pagador === 'Gisele Dalmora da Silva' && e5.envelope.itens.length === 0,
    'F6/pagador-sozinho: ' + JSON.stringify(e5));

  checar(m({ intencao: 'lancamento_por_texto', valor_total: 100, forma: 'pix', itens: [] }).motivo === 'sem_identidade',
    'F6: aceitou envelope sem identidade nenhuma');
  checar(m({ intencao: 'lancamento_por_texto', forma: 'pix', itens: [{ aluno: 'X' }] }).motivo === 'sem_valor_total',
    'F6: aceitou envelope sem total');
  checar(m({ intencao: 'aprovar', valor_total: 100 }).motivo === 'intencao_nao_lanca',
    'F6: montou envelope para intencao que nao lanca');

  // ── F7: a guarda de valor vale no caminho principal (o R$ 2.034,90 -> 20.349)
  const g = mod.valorConfereComTexto;
  checar(g(2034.90, 'recebi R$ 2.034,90 hoje').ok === true, 'F7: guarda recusou valor que ESTA no texto');
  checar(g(20349, 'recebi R$ 2.034,90 hoje').ok === false, 'F7: guarda aceitou valor por fator de 10');
  // ⚠️ inteiro pequeno SEM `R$` nao conta de proposito ("3x", "12/09", numero
  //    de sala fariam qualquer valor bater e a guarda viraria enfeite).
  checar(g(435.50, 'foi R$ 200 + 235,50').ok === true, 'F7: guarda recusou soma de partes marcadas');
  checar(g(435.50, 'foi 200 + 235,50').ok === false, 'F7: guarda somou inteiro solto sem R$');


  // ── F8: O EVENTO REAL — MIDIA COM LEGENDA. O comprovante da Lis chegou assim,
  //    e o gate anterior (`!event.hasMedia`) deixava justamente ele de fora: meu
  //    teste, de texto puro, nao representava o caso que originou a frente.
  process.env.SOL_CAIXA_V4_CANARIO = CHAT;
  const M = novo();
  const rM = await M.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'LIS-MIDIA',
    body: TEXTO_LIS, hasMedia: true, mediaType: 'image', downloadMedia: async () => Buffer.from('x') });
  checar(M.pedidos.length === 1, 'F8: com hasMedia o Core do envelope NAO foi chamado');
  const envM = M.pedidos[0] && M.pedidos[0].envelope;
  checar(envM && Number(envM.valor_total) === 657,
    'F8: valor_total = ' + (envM && envM.valor_total) + ', esperava 657 (o legado manda 357)');
  checar(envM && envM.itens.length === 1 && envM.itens[0].aluno === 'Lis Dal Mora Mello',
    'F8: aluno = ' + JSON.stringify(envM && envM.itens) + ' (o legado manda a frase inteira)');
  const cardM = M.enviadas.find((x) => /R\$/.test(x)) || '';
  checar(/657/.test(cardM), 'F8: card sem 657 -> ' + JSON.stringify(cardM.slice(0, 160)));
  checar(!/357,00\*/.test(cardM.split('TOTAL')[0] || ''), 'F8: card liderado por 357 (defeito antigo)');
  checar(M.logs.some((l) => l.acao === 'agent_first_resolveu'), 'F8: agent-first nao assumiu na midia');

  // ── F9: MIDIA SEM LEGENDA -> agent-first sai de fininho, OCR intacto ───────
  const SL = novo();
  await SL.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'SEM-LEGENDA',
    body: '', hasMedia: true, mediaType: 'image', downloadMedia: async () => Buffer.from('x') });
  checar(SL.pedidos.length === 0, 'F9: agent-first chamou o Core sem legenda nenhuma');

  // ── F10: CORRECAO NO SEGUNDO TURNO, PELO handle() DE VERDADE ──────────────
  //    O 2o turno tem de mudar o ENVELOPE guardado e re-resolver. Se em vez
  //    disso a intencao virasse frase canonica e voltasse ao parser legado
  //    (que e o que o fallback de dialogo de 31/08 faz), o defeito voltaria
  //    inteiro: quem montaria a pergunta ao banco seria de novo a gramatica.
  const DEC_CORR = { intencao: 'corrigir_competencia', competencia: '08/2026', confianca: 0.9 };
  let turno = 0;
  const C = novo({ rotearV4Fn: async () => (++turno === 1 ? DEC_LIS : DEC_CORR) });
  await C.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'T1', body: TEXTO_LIS,
    hasMedia: true, mediaType: 'image', downloadMedia: async () => Buffer.from('x') });
  checar(C.pedidos.length === 1, 'F10: 1o turno nao chamou o Core');
  checar(C.pedidos[0].envelope.itens[0].competencias[0] === '09/2026',
    'F10: 1o turno com competencia errada -> ' + JSON.stringify(C.pedidos[0].envelope.itens));

  const r2 = await C.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'T2',
    body: 'na verdade essa parcela é de agosto, 08/2026' });
  checar(C.pedidos.length === 2, 'F10: 2o turno NAO re-resolveu pelo Core -> ' + C.pedidos.length);
  const env2 = C.pedidos[1] && C.pedidos[1].envelope;
  checar(env2 && env2.itens[0].competencias[0] === '08/2026',
    'F10: correcao nao entrou no envelope -> ' + JSON.stringify(env2 && env2.itens));
  checar(env2 && env2.itens[0].aluno === 'Lis Dal Mora Mello' && Number(env2.valor_total) === 657,
    'F10: 2o turno perdeu aluno/total do 1o -> ' + JSON.stringify(env2));
  checar(C.logs.some((l) => l.acao === 'agent_first_correcao'),
    'F10: nao registrou que foi correcao de envelope');
  checar(r2 && String(r2.acao) !== 'nada', 'F10: 2o turno caiu no vazio');

  // e as guardas da correcao, como funcao pura
  const corrVr = mod.aplicarCorrecaoEnvelope(
    { valor_total: 657, forma: 'pix', itens: [{ aluno: 'X', categorias: [], competencias: [] }] },
    { intencao: 'corrigir_valor', valor: 20349, valor_recusado: { valor: 20349, motivo: 'nao_esta_no_texto' } });
  checar(corrVr.motivo === 'correcao_sem_valor', 'F10: aceitou correcao com valor que a guarda recusou');
  const corrA = mod.aplicarCorrecaoEnvelope(
    { valor_total: 900, forma: 'pix', itens: [{ aluno: 'A', categorias: [], competencias: [] },
                                              { aluno: 'B', categorias: [], competencias: [] }] },
    { intencao: 'corrigir_aluno', aluno_nome: 'C' });
  checar(corrA.motivo === 'correcao_aluno_ambigua', 'F10: trocou aluno sem saber QUAL de dois');

  // ── F11: MUTANTE 357 + 300 + 657 — total recusado NAO pode virar parcial ───
  const decMut = { intencao: 'lancamento_por_texto', aluno_nome: 'Lis Dal Mora Mello',
    valor: 357, valor_total: null,
    valor_total_recusado: { valor: 657000, motivo: 'nao_esta_no_texto' },
    forma: 'pix', competencia: '09/2026',
    itens: [{ aluno: 'Lis Dal Mora Mello', categorias: ['parcela'], competencias: ['09/2026'] }] };
  const envMut = mod.montarEnvelopeV4(decMut);
  checar(envMut.ok === false && envMut.motivo === 'valor_total_recusado',
    'F11: com total recusado caiu para o valor PARCIAL -> ' + JSON.stringify(envMut));
  const MUT = novo({ rotearV4Fn: async () => decMut });
  const rMut = await MUT.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'MUT',
    body: TEXTO_LIS, hasMedia: true, mediaType: 'image', downloadMedia: async () => Buffer.from('x') });
  checar(MUT.pedidos.length === 0, 'F11: chamou o Core com total recusado');
  checar(!(rMut && String(rMut.acao).startsWith('agent_first')),
    'F11: agent-first respondeu com total recusado');

  if (CAN === undefined) delete process.env.SOL_CAIXA_V4_CANARIO; else process.env.SOL_CAIXA_V4_CANARIO = CAN;
  if (falhas.length) { console.error('FALHOU:'); falhas.forEach((f) => console.error('  - ' + f)); process.exit(1); }
  console.log('ok agent-first: portao por lista, replay Lis/Mayra em TEXTO e em MIDIA COM LEGENDA, '
    + 'midia sem legenda cede o OCR, fail-safe em 4 ramos, ambiguidade pergunta, homonimo com lista, '
    + 'contrato plural, correcao no 2o turno pelo handle(), mutante 357+300+657 com total recusado');
})();
