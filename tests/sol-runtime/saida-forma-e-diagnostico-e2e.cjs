// Auditoria de 02/09 no FINANCEIRO de CG — replay literal de dois casos reais.
//  S1: "Sol, pagamento semanal do segurança - R$100,00" → Sol pergunta a forma
//      e NÃO guardava estado; "Dinheiro" caía em nada e "Sol, foi dinheiro" ia
//      parar em correcao_forma_sem_alvo (2×). Agora a pergunta cria pendência e
//      a resposta reconstitui a frase — o que o Jhon teve de fazer na mão.
//  S2: fail-closed do multi dizia "confere aluno, competência e valor" quando o
//      motivo real era "a fatura ainda não aparece paga na cópia do Emusys".
//  S3: confirmação do lançamento único não dizia o aluno.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const JHON = '5521933330001';

function novo(overrides = {}) {
  const enviadas = []; const logs = []; const lancados = []; const saidas = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: '', status: 'ok', file_bytes: 0 }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: null, forma: 'pix' }),
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    classificarCorrecaoFn: async () => null,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M1', valor: p.valor, forma: p.forma }; },
    lancarSaidaFn: async (p) => { saidas.push(p); return { ok: true, movimentacao_id: 'S1', valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, logs, lancados, saidas };
}
const ultimo = (a) => String(a[a.length - 1] || '');
const juntou = (a) => a.join('\n---\n');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── S1: o replay do Jhon, resposta seca "Dinheiro" ──────────────────────────
  const A = novo();
  const r1 = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S1a',
    body: 'Sol, pagamento semanal do segurança - R$100,00', hasMedia: false });
  console.log('pergunta acao:', r1 && r1.acao);
  checar(r1 && r1.acao === 'saida_texto_sem_forma', `deveria perguntar a forma; veio "${r1 && r1.acao}"`);
  checar(/forma/i.test(ultimo(A.enviadas)) && /100/.test(ultimo(A.enviadas)),
    'a pergunta repete o valor (o humano confere sem rolar a conversa)');
  const logPend = A.logs.find((l) => l.acao === 'saida_texto_sem_forma');
  checar(logPend && logPend.pendencia === true, 'a pergunta tem de deixar PENDÊNCIA registrada');

  const r2 = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S1b',
    body: 'Dinheiro', hasMedia: false });
  console.log('resposta seca acao:', r2 && r2.acao);
  checar(r2 && r2.acao === 'saida_texto_preview_enviado',
    `"Dinheiro" deveria completar a saída; veio "${r2 && r2.acao}"`);
  const card = ultimo(A.enviadas);
  checar(/100,00/.test(card) && /dinheiro/i.test(card), 'card da saída com R$ 100,00 em dinheiro');
  checar(/seguran/i.test(card), 'card mantém a categoria segurança');

  const r3 = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S1c', body: 'pode', hasMedia: false });
  checar(r3 && r3.acao === 'saida_lancada', `"pode" deveria lançar a saída; veio "${r3 && r3.acao}"`);
  checar(A.saidas.length === 1 && Number(A.saidas[0].valor) === 100 && A.saidas[0].forma === 'dinheiro',
    'saída lançada: R$ 100 em dinheiro');
  checar(!A.logs.some((l) => l.acao === 'correcao_forma_sem_alvo'),
    'REGRESSÃO do dia: a resposta não pode cair no caminho de corrigir lançamento gravado');

  // ── S1: a variante que o Jhon tentou 2× ("Sol, foi dinheiro") ───────────────
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S1d',
    body: 'Sol, pagamento semanal do segurança - R$100,00', hasMedia: false });
  const r4 = await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S1e',
    body: 'Sol, foi no dinheiro', hasMedia: false });
  console.log('"Sol, foi no dinheiro" acao:', r4 && r4.acao);
  checar(r4 && r4.acao === 'saida_texto_preview_enviado',
    `"Sol, foi no dinheiro" também deveria completar; veio "${r4 && r4.acao}"`);
  checar(!B.logs.some((l) => l.acao === 'correcao_forma_sem_alvo'), 'nem essa variante vai para correção');

  // ── S1: sem pendência aberta, forma solta continua NÃO virando saída ────────
  const C = novo();
  const r5 = await C.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S1f', body: 'Dinheiro', hasMedia: false });
  checar(!r5 || r5.acao === 'nada' || !/preview/.test(String(r5.acao)),
    `REGRESSÃO: "Dinheiro" solto sem pendência não pode abrir nada; veio "${r5 && r5.acao}"`);
  checar(C.saidas.length === 0, 'REGRESSÃO: nada lançado sem pendência');

  // ── S2: motivo real do fail-closed (fatura ainda não paga no espelho) ───────
  const D = novo({
    ocrFn: async () => ({ text: 'Comprovante PIX 640,00', status: 'ok', file_bytes: 900 }),
    visaoFn: async () => ({ valor: 640, forma: 'pix' }),
    interpretarMultiFn: async () => ({ tipo_recebimento: 'multi_aluno', valor_total: 640, forma: 'pix', categoria: 'parcela',
      itens: [{ aluno_nome: 'Arthur Da Hora Marinho', valor: null }, { aluno_nome: 'Daniel Da Hora Marinho', valor: null }] }),
    resolverMultiFn: async () => ({ ok: false, motivo: 'alocacao_nao_derivavel', ordem: 1,
      aluno_nome: 'Arthur Da Hora Marinho', candidatas: 0 }),
  });
  const r6 = await D.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S2a',
    body: 'PG pix parcela 09/2026 de Arthur da Hora Marinho e de Daniel da Hora Marinho - Kids CG R$640,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const msg = ultimo(D.enviadas);
  console.log('fail-closed:', msg.replace(/\n/g, ' ').slice(0, 150));
  checar(r6 && r6.acao === 'manual_review_multi_student', 'segue fail-closed (não lança parcial)');
  checar(/cópia do Emusys|atualiza a cada 15/i.test(msg), 'diz o motivo REAL (espelho ainda não tem a fatura paga)');
  checar(/Arthur/i.test(msg), 'diz de QUAL aluno é a fatura que falta');
  checar(!/Confere aluno, competência e valor de cada um/i.test(msg),
    'não pode mais mandar conferir dados que estão certos');
  checar(/Não lanço parcialmente/i.test(msg), 'mantém a promessa de não lançar parcial');

  // ── S2: motivo ambíguo (2+ faturas pagas) tem texto próprio ─────────────────
  const E = novo({
    ocrFn: async () => ({ text: 'PIX 640,00', status: 'ok', file_bytes: 900 }),
    visaoFn: async () => ({ valor: 640, forma: 'pix' }),
    interpretarMultiFn: async () => ({ tipo_recebimento: 'multi_aluno', valor_total: 640, forma: 'pix', categoria: 'parcela',
      itens: [{ aluno_nome: 'Arthur Da Hora Marinho', valor: null }, { aluno_nome: 'Daniel Da Hora Marinho', valor: null }] }),
    resolverMultiFn: async () => ({ ok: false, motivo: 'alocacao_nao_derivavel', aluno_nome: 'Daniel Da Hora Marinho', candidatas: 3 }),
  });
  await E.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S2b',
    body: 'PG pix parcela 09/2026 de Arthur da Hora Marinho e de Daniel da Hora Marinho R$640,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(/mais de uma fatura paga/i.test(ultimo(E.enviadas)), 'ambiguidade tem mensagem própria');

  // ── S2: fonte fora do ar continua com texto próprio ─────────────────────────
  const F = novo({
    ocrFn: async () => ({ text: 'PIX 640,00', status: 'ok', file_bytes: 900 }),
    visaoFn: async () => ({ valor: 640, forma: 'pix' }),
    interpretarMultiFn: async () => ({ tipo_recebimento: 'multi_aluno', valor_total: 640, forma: 'pix', categoria: 'parcela',
      itens: [{ aluno_nome: 'Arthur Da Hora Marinho', valor: null }, { aluno_nome: 'Daniel Da Hora Marinho', valor: null }] }),
    resolverMultiFn: async () => ({ ok: false, motivo: 'fonte_indisponivel', status_fonte: 'stale' }),
  });
  await F.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S2c',
    body: 'PG pix parcela de Arthur da Hora Marinho e de Daniel da Hora Marinho R$640,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(/fora do ar/i.test(ultimo(F.enviadas)), 'fonte indisponível tem mensagem própria');

  // ── S3: confirmação do lançamento único diz o aluno ─────────────────────────
  const G = novo({
    ocrFn: async () => ({ text: 'PIX R$ 357,00', status: 'ok', file_bytes: 900 }),
    visaoFn: async () => ({ valor: 357, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Raul Fonseca Silva', competencia: '09/2026', forma: 'pix' }),
  });
  await G.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S3a',
    body: 'parcela 09/2026 aluno Raul Fonseca Silva', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  await G.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'S3b', body: 'pode', hasMedia: false });
  const conf = juntou(G.enviadas);
  checar(/Lancei no caixa/i.test(conf), 'confirmou o lançamento');
  checar(/Lancei no caixa[^\n]*Raul Fonseca Silva/i.test(conf),
    `a confirmação tem de dizer o aluno; saiu: "${(conf.split('\n').find((l) => /Lancei no caixa/.test(l)) || '').slice(0, 120)}"`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — pergunta guarda estado, fail-closed diz a verdade, confirmação diz de quem');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
