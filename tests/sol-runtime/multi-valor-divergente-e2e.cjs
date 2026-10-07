#!/usr/bin/env node
'use strict';

// Recreio, 07/10/2026: Pix de dois irmãos com a legenda "parcela de outubro,
// A - R$ 431,60 / B - R$ 431,60 / Pix". As duas faturas de outubro estavam ABERTAS
// com R$ 489,92 (venceu 05/10, pagou 07/10: perdeu o desconto de pontualidade e
// entrou juros). A escola autorizou sem juros. O resolver devolveu
// `valor_declarado_nao_bate`, a Sol recusou o lote inteiro ("não lanço
// parcialmente") e ainda inventou "cópia do Emusys atrasada".
//
// Agora, igual ao caminho de UM aluno: card com fatura × pago × diferença e o
// motivo provável calculado em código; a equipe explica o motivo em conversa (o
// agente chama `caixa_explicar_divergencia` com o texto exato); o card é
// republicado com o motivo e só o "pode" nele lança o valor que ENTROU,
// vinculado a cada fatura. Valores que batem seguem idênticos.
//
// Nomes FICTÍCIOS. Handler real, sendFn/lancarLoteFn fakes, ledger V3 fake:
// nada vai ao WhatsApp, ao caixa nem ao banco.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
delete process.env.SOL_CAIXA_V4_CANARIO;
delete process.env.SOL_CAIXA_TOOLS_CANARIO;
const mod = require('./_alvo.cjs');
const path = require('path');
const exec = require(path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-tool-executor.cjs'));

const CHAT = '5521900000000-1500000000@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const AUTORA = '5521933330101';
const COLEGA = '5521933330102';
const A = 'Lara Quintela Prado';
const B = 'Caio Quintela Prado';
const CAPTION = `Parcela de outubro\n${A} - R$431,60\n${B} - R$431,60\nPix`;
const MOTIVO = 'a escola autorizou cobrar sem juros, é a última parcela (aviso prévio)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const faturaOut = (id) => ({ canonical_fatura_id: id, descricao: 'Parcela 10/2026', tipo_fatura: 'parcela',
  competencia: '2026-10-01', status: 'aberta', data_vencimento: '2026-10-05', vencida: true, dias_atraso: 2,
  valor_hoje: '489.92', valor_com_desconto: '431.44', valor_sem_desconto_condicional: '479.84' });
const F1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const F2 = 'aaaaaaaa-0000-4000-8000-000000000002';

// O que a RPC (20261007150000) devolve no caso real: os dois casados, valor divergente.
function respostaDivergente(itens, { valor = 431.6 } = {}) {
  return { ok: false, motivo: 'valor_divergente', divergencias: 2, soma_itens: Number((valor * 2).toFixed(2)), valor_total: 863.2,
    itens: itens.map((it, i) => ({ ordem: i + 1, aluno_nome: it.aluno_nome, responsavel_financeiro: 'Responsável Prado',
      valor, categoria: 'parcela', competencia: '10/2026', canonical_fatura_id: i ? F2 : F1, descricao: 'Parcela 10/2026',
      sem_vinculo_fatura: false, declarado_pelo_humano: false, divergencia_valor: true, valor_fatura: 489.92,
      fatura: faturaOut(i ? F2 : F1) })) };
}
function respostaBate(itens) {
  return { ok: true, soma_itens: 979.84, valor_total: 979.84,
    itens: itens.map((it, i) => ({ ordem: i + 1, aluno_nome: it.aluno_nome, valor: 489.92, categoria: 'parcela',
      competencia: '10/2026', canonical_fatura_id: i ? F2 : F1, descricao: 'Parcela 10/2026',
      sem_vinculo_fatura: false, declarado_pelo_humano: false, fatura: { ...faturaOut(i ? F2 : F1) } })) };
}

function novo({ resolver, ocrValor = 863.2 } = {}) {
  const enviadas = []; const ids = []; const logs = []; const lotes = []; const resolverCalls = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { exec.registrarEnvio(t); enviadas.push(String(t)); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: `Comprovante Pix\nValor R$ ${String(ocrValor.toFixed(2)).replace('.', ',')}\nDestino ESCOLA DE MUSICA L A`, status: 'ok', file_bytes: 40000 }),
    visaoFn: async () => ({ valor: ocrValor, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: null, aluno: null, competencia: '10/2026', forma: 'pix' }),
    interpretarMultiFn: async () => null,
    resolverMultiFn: async (args) => { resolverCalls.push(JSON.parse(JSON.stringify(args))); return resolver(args.itens || [], args); },
    sugerirAlunoFn: async () => ({ ok: true, candidatos: [] }),
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async (tel) => ({ identificado: true, nome: tel === COLEGA ? 'Colega Recreio' : 'Equipe Recreio' }),
    lancarFn: async () => { throw new Error('lancamento single nao deveria acontecer'); },
    lancarLoteFn: async (p) => { lotes.push(JSON.parse(JSON.stringify(p)));
      return { ok: true, lote_id: 'L1', movimentacoes: p.itens.map((it, i) => ({ movimentacao_id: 'M' + (i + 1), aluno_nome: it.aluno_nome, valor: it.valor })) }; },
    log: (o) => { exec.registrarEvento(o); logs.push(o); },
  });
  return { h, enviadas, ids, logs, lotes, resolverCalls };
}

const falhas = [];
const ok = (c, m) => { if (!c) falhas.push(m); };
const ev = (o) => ({ chatId: CHAT, senderPhone: AUTORA, senderId: AUTORA + '@lid', hasMedia: false, ...o });
const comprovante = (T, id = 'IMG1', caption = CAPTION) => T.h.handle(ev({ messageId: id, body: caption, hasMedia: true,
  mediaType: 'image', mediaUrls: ['fake://pix.jpg'] }));
const ultimo = (a) => String(a[a.length - 1] || '');
const lote = (T) => (T.h._pendentes.get(CHAT) || []).filter((p) => p.tipoOperacao === 'lancar_recebimento_lote');

function executor(T) {
  return exec.criarExecutorCaixaTool({
    obterHandler: async () => T.h, obterAbf: async () => ({}), obterGovernanca: async () => null,
    enviar: async () => 'ABF', grupos: { [CHAT]: { unidade_id: UNIDADE, nome: 'Recreio' } }, log: () => {},
  });
}
const pedir = (T, args, ator = AUTORA) => executor(T).executar({
  tool: { name: 'caixa_explicar_divergencia', action: 'explicar_divergencia' },
  ctx: { ok: true, _chat: CHAT, _ator_numero: ator, unidade_id: UNIDADE, quem: 'Equipe' }, args });

(async () => {
  // ── 1. caso real: não recusa; card com fatura × pago × diferença e pergunta ──
  const T = novo({ resolver: (itens) => respostaDivergente(itens) });
  const r1 = await comprovante(T);
  const card1 = ultimo(T.enviadas);
  console.log('1. caso real:', r1 && r1.acao);
  ok(r1 && r1.acao === 'preview_multi_aluno_enviado', '1: esperava card do lote; veio ' + (r1 && r1.acao));
  ok(!/Não lanço parcialmente|card aprovável|cópia do Emusys|atrasad[ao] \(ela atualiza/.test(T.enviadas.join('\n')),
    '1: não pode recusar nem inventar "cópia atrasada"');
  ok(card1.includes(`${A} — fatura R$ 489,92 · pago *R$ 431,60* · diferença -R$ 58,32`)
    && card1.includes(`${B} — fatura R$ 489,92 · pago *R$ 431,60* · diferença -R$ 58,32`),
    '1: card deveria mostrar fatura, pago e diferença por aluno');
  ok(/provável: pago depois do vencimento \(05\/10\): a fatura de hoje soma perda do desconto de pontualidade \(R\$ 48,40\) e juros\/multa \(R\$ 10,08\)/.test(card1),
    '1: motivo provável deveria vir das datas/valores da fatura');
  ok(/Qual o motivo da diferença\?/.test(card1) && !/Responde \*pode\*$/.test(card1), '1: card deveria perguntar o motivo, não pedir pode');
  ok(/Valor: R\$ 863,20 ✅ confere/.test(card1), '1: total do comprovante confere com a soma dos itens');
  ok(/a baixa no Emusys fica com a equipe/i.test(card1), '1: card deveria dizer que a baixa no Emusys fica com a equipe');
  const c = T.resolverCalls[0] || {};
  ok(c.itens && c.itens.length === 2 && c.itens.every((i) => i.competencia === '10/2026' && i.valor === 431.6),
    '1: resolver deveria receber os dois itens com competência e valor declarados');
  ok(lote(T).length === 1 && lote(T)[0].itens.every((i) => i.divergencia_valor === true && i.valor_fatura === 489.92 && !i.divergencia_aceita),
    '1: pendência do lote deveria carregar a divergência sem motivo');
  ok(!T.logs.some((l) => JSON.stringify(l).includes(A)), '1: log não deveria carregar nome de aluno');
  const card1Id = lote(T)[0] && lote(T)[0].previewId;

  // ── 2. "pode" antes do motivo: não lança, card continua ──────────────────
  const r2 = await T.h.handle(ev({ messageId: 'PODE0', body: 'pode', quotedMessageId: card1Id }));
  console.log('2. pode sem motivo:', r2 && r2.acao);
  ok(r2 && r2.acao === 'lote_divergencia_sem_motivo', '2: pode sem motivo deveria ser barrado; veio ' + (r2 && r2.acao));
  ok(T.lotes.length === 0 && lote(T).length === 1, '2: nada lançado e card continua aberto');
  ok(/falta o \*motivo da diferença\*/.test(ultimo(T.enviadas)), '2: deveria pedir o motivo');

  // ── 3. rota: a explicação vai ao agente; pode/não e valor novo não ─────────
  const rotaAutora = T.h.divergenciaConversa(ev({ messageId: 'X1', body: MOTIVO }));
  ok(rotaAutora && /AGUARDANDO O MOTIVO/.test(rotaAutora.resumo) && /caixa_explicar_divergencia/.test(rotaAutora.resumo),
    '3: explicação da autora deveria ir ao agente com o resumo do card');
  ok(T.h.divergenciaConversa(ev({ messageId: 'X2', senderPhone: COLEGA, senderId: COLEGA + '@lid', body: MOTIVO })) === null,
    '3: conversa da colega sem citar não é do card');
  ok(!!T.h.divergenciaConversa(ev({ messageId: 'X3', senderPhone: COLEGA, senderId: COLEGA + '@lid', body: MOTIVO, quotedMessageId: card1Id })),
    '3: colega citando o card vai ao agente');
  ok(T.h.divergenciaConversa(ev({ messageId: 'X4', body: 'pode', quotedMessageId: card1Id })) === null, '3: "pode" fica no determinístico');
  ok(T.h.divergenciaConversa(ev({ messageId: 'X5', body: 'não' })) === null, '3: "não" fica no determinístico');
  ok(T.h.divergenciaConversa(ev({ messageId: 'X6', body: 'PG pix parcela Otavio Reis R$ 390,00' })) === null,
    '3: texto com valor novo sem citar é outro pagamento');

  // ── 4. ferramenta do agente: motivo exato, card republicado (substitui) ────
  const nEnv = T.enviadas.length;
  const d4 = await pedir(T, { p_texto_original: 'Sol, ' + MOTIVO, p_preview_message_id: card1Id });
  const card2 = ultimo(T.enviadas);
  console.log('4. explicar_divergencia:', d4.estado, d4.acao);
  ok(d4.ok && d4.estado === 'card_publicado' && d4.gravou_no_caixa === false, '4: esperava card republicado sem gravar; veio ' + JSON.stringify(d4).slice(0, 200));
  ok(T.enviadas.length === nEnv + 1, '4: uma mensagem só (o card novo)');
  ok(card2.split(`Motivo (equipe): "${MOTIVO}"`).length === 3, '4: card novo mostra o motivo EXATO em cada item divergente');
  ok(/Posso lançar o lote completo no caixa de hoje\?\* Responde \*pode\*/.test(card2) && !/Qual o motivo/.test(card2),
    '4: com motivo, o card pede pode');
  const abertos = lote(T);
  ok(abertos.length === 1 && abertos[0].previewId !== card1Id, '4: o card antigo foi substituído (um card aberto só)');
  ok(abertos[0] && abertos[0].itens.every((i) => i.divergencia_aceita === true && i.divergencia_motivo === MOTIVO && i.divergencia_por === 'Equipe Recreio'),
    '4: itens com motivo exato (sem o vocativo) e quem explicou');
  ok(abertos[0] && abertos[0].autorPhone === AUTORA, '4: autora original continua dona do card');
  const card2Id = abertos[0] && abertos[0].previewId;

  // ── 5. "pode" no card antigo não lança ───────────────────────────────────
  await T.h.handle(ev({ messageId: 'PODE-VELHO', body: 'pode', quotedMessageId: card1Id }));
  ok(T.lotes.length === 0, '5: "pode" citando o card substituído lançou');

  // ── 6. "pode" no card novo: lança o valor que ENTROU, vinculado à fatura ───
  const r6 = await T.h.handle(ev({ messageId: 'PODE1', body: 'pode', quotedMessageId: card2Id }));
  const recibo = ultimo(T.enviadas);
  console.log('6. pode no card novo:', r6 && r6.acao, '| lotes =', T.lotes.length);
  ok(r6 && r6.acao === 'lote_multi_lancado' && T.lotes.length === 1, '6: pode deveria lançar o lote');
  const p = T.lotes[0] || { itens: [] };
  ok(Number(p.valor) === 863.2 && p.itens.length === 2, '6: total do comprovante, dois itens');
  ok(p.itens.every((i) => i.valor === 431.6 && i.valor_fatura === 489.92 && [F1, F2].includes(i.canonical_fatura_id)
    && i.divergencia_valor === true && i.divergencia_aceita === true && i.divergencia_motivo === MOTIVO),
    '6: cada item com o valor pago, a fatura e o motivo (o validador do banco grava a observação)');
  ok(/\(fatura R\$ 489,92 · motivo: a escola autorizou/.test(recibo) && /baixa no Emusys fica com a equipe/.test(recibo),
    '6: recibo deveria citar fatura, motivo e que a baixa fica com a equipe');

  // ── 7. ferramenta sem card esperando motivo: nada acontece ────────────────
  const d7 = await pedir(T, { p_texto_original: MOTIVO });
  console.log('7. explicar sem card:', d7.estado, d7.motivo);
  ok(!d7.ok && d7.estado === 'nada_aconteceu' && d7.motivo === 'divergencia_sem_card', '7: sem card deveria recusar sem publicar');

  // ── 8. valores que batem: igual a antes ───────────────────────────────────
  {
    const T8 = novo({ ocrValor: 979.84, resolver: (itens) => respostaBate(itens) });
    const cap8 = `Parcela de outubro\n${A} - R$489,92\n${B} - R$489,92\nPix`;
    const r8 = await comprovante(T8, 'IMG8', cap8);
    const card8 = ultimo(T8.enviadas);
    console.log('8. valores batem:', r8 && r8.acao);
    ok(r8 && r8.acao === 'preview_multi_aluno_enviado', '8: card normal');
    ok(!/diferença|Qual o motivo|provável/.test(card8) && /Responde \*pode\*/.test(card8), '8: card sem nada de divergência');
    ok(!T8.h.divergenciaConversa(ev({ messageId: 'Y', body: MOTIVO })), '8: sem divergência, conversa não é desviada');
    await T8.h.handle(ev({ messageId: 'PODE8', body: 'pode' }));
    ok(T8.lotes.length === 1 && T8.lotes[0].itens.every((i) => !('divergencia_valor' in i) && !('valor_fatura' in i) && i.valor === 489.92),
      '8: lote sem chaves de divergência (payload igual ao de antes)');
  }

  // ── 9. soma que não fecha com o comprovante: recusa, sem card ─────────────
  {
    const T9 = novo({ resolver: (itens) => respostaDivergente(itens, { valor: 400 }) });
    const r9 = await comprovante(T9, 'IMG9');
    console.log('9. soma não fecha:', r9 && r9.acao);
    ok(r9 && r9.acao === 'manual_review_multi_student' && lote(T9).length === 0, '9: soma que não fecha não pode virar card');
    ok(!/cópia do Emusys/.test(ultimo(T9.enviadas)), '9: recusa não inventa cópia atrasada');
  }

  // ── 10. recusa remanescente com fatura achada usa o motivo real ────────────
  {
    const T10 = novo({ resolver: () => ({ ok: false, motivo: 'valor_declarado_nao_bate', ordem: '1', aluno_nome: A,
      valor_declarado: 431.6, valor_encontrado: 979.84 }) });
    const r10 = await comprovante(T10, 'IMG10');
    const msg = ultimo(T10.enviadas);
    console.log('10. recusa remanescente:', r10 && r10.acao, '|', msg.slice(0, 140).replace(/\n/g, ' '));
    ok(r10 && r10.acao === 'manual_review_multi_student', '10: continua recusando (fatura composta)');
    ok(/não bate com a fatura do Lara Quintela Prado \(R\$ 979,84\)/.test(msg) && !/cópia do Emusys/.test(msg),
      '10: recusa diz que o valor difere da fatura, sem "cópia atrasada"');
  }

  // ── 11. aluno não encontrado continua recusando ───────────────────────────
  {
    const T11 = novo({ resolver: () => ({ ok: false, motivo: 'aluno_nao_encontrado', ordem: '2', aluno_nome: B }) });
    const r11 = await comprovante(T11, 'IMG11');
    console.log('11. aluno não encontrado:', r11 && r11.acao);
    ok(r11 && r11.acao === 'manual_review_multi_student' && lote(T11).length === 0, '11: aluno não encontrado recusa');
  }

  // ── 12. motivo provável: pago a maior / fatura paga, sem inventar ─────────
  {
    const m = mod.motivoProvavelDivergencia;
    ok(m({ valor: 500, valor_fatura: 480, fatura: { status: 'aberta', data_vencimento: '2026-10-10' } }, { hoje: '2026-10-07' })
      === 'pago a maior que a fatura, sem explicação no sistema', '12: pago a maior');
    ok(m({ valor: 400, valor_fatura: 480, fatura: { status: 'aberta', data_vencimento: '2026-10-10' } }, { hoje: '2026-10-07' })
      === 'pago a menor que a fatura, sem explicação no sistema', '12: pago a menor antes do vencimento');
    ok(/o Emusys registra R\$ 480,00 pago/.test(m({ valor: 400, valor_fatura: 480, fatura: { status: 'paga' } })), '12: fatura paga');
    ok(/o valor pago é o da parcela com desconto \(R\$ 431,44\)/.test(m({ valor: 431.44, valor_fatura: 489.92, fatura: faturaOut(F1) }, { hoje: '2026-10-07' })),
      '12: pago exatamente o valor com desconto');
  }

  await sleep(10);
  if (falhas.length) { console.log('\nRESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('\nRESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
