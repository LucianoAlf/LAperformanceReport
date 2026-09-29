#!/usr/bin/env node
'use strict';

// Malote de cheques V3 — consertos da auditoria de 29/09/2026 (dados INVENTADOS).
// Handler REAL do caixa + módulo REAL de cheques; E/S falsa (_cheques-fakes.cjs),
// com um "banco" que enxerga o que o próprio handler lançou.
//   D1. lote em dobro: mesmo arquivo / mesmos cheques / cheque já no caixa;
//       o "pode" barra número + banco já lançado.
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_LOTE_MS = '0';
process.env.SOL_CHEQUES_MODO = 'grupo';
delete process.env.SOL_CAIXA_V4_CANARIO;
delete process.env.SOL_CAIXA_TOOLS_CANARIO;
const assert = require('assert');
const fs = require('fs');
const mod = require('./_alvo.cjs');
const F = require('./_cheques-fakes.cjs');
const { U, chequeLido, criarBancoFalso, arquivoTemp, chq } = F;

const CHAT = 'grupo-cg@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const AGORA = Date.parse('2026-09-29T15:00:00Z');

function montar({ leituras, banco = {}, lerDelayMs = 0 } = {}) {
  const db = criarBancoFalso(banco);
  const enviadas = []; const lotes = []; const singulares = []; let seq = 0; let led = 0; let leitura = 0;
  const send = async (c, t) => { const id = 'MSG' + (++seq); enviadas.push({ c, t, id }); return id; };
  const modCheques = chq.criarCheques({
    carregarEnv: () => ({ url: 'https://x', key: 'k' }), sendFn: send, agoraFn: () => AGORA,
    lerLoteFn: async () => {
      const cheques = Array.isArray(leituras[0]) ? leituras[Math.min(leitura, leituras.length - 1)] : leituras;
      leitura += 1;
      if (lerDelayMs) await new Promise((r) => setTimeout(r, lerDelayMs));
      return { ok: true, cheques: JSON.parse(JSON.stringify(cheques)) };
    },
    rpcFn: db.rpcFn, consultaFn: db.consultaFn,
  });
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: send, chequesFn: modCheques,
    identidadeFn: async () => ({ identificado: true, nome: 'Rose' }),
    duplicataFn: async () => ({ ok: true, ja_lancado: false, itens: [] }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'LED-' + (++led) }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'AP-' + led, approval_event_hash: 'EH', actor_id_hash: 'AH' }),
    lancarFn: async (p) => { singulares.push(p); db.gravar(p, [{ ...p, canonical_fatura_id: p.fatura_id }]); return { ok: true, movimentacao_id: 'MOV-S' + singulares.length, valor: Number(p.valor), forma: p.forma }; },
    lancarLoteFn: async (p) => { lotes.push(p); db.gravar(p, p.itens); return { ok: true, lote_id: 'LOTE-' + lotes.length, movimentacoes: p.itens.map((i, n) => ({ aluno_nome: i.aluno_nome, valor: i.valor, movimentacao_id: 'MOV-' + n })) }; },
    buscarMovimentosFn: async () => ({ ok: true, items: [] }),
    log: () => {},
  });
  const pendCheque = () => (h._pendentes.get(CHAT) || []).filter((p) => p.forma === 'cheque');
  return { h, db, enviadas, lotes, singulares, pendCheque };
}
const ev = (o) => ({ chatId: CHAT, senderPhone: '5521900000011', senderId: '5521900000011@lid', hasMedia: false, ...o });
const midia = (id, arq, extra = {}) => ev({ messageId: id, body: '', hasMedia: true, mediaType: 'document', mediaUrls: [arq], ...extra });
const tres = [chequeLido(1), chequeLido(2), chequeLido(3)];

(async () => {
  // ------------------------------------------------------------ D1
  {
    // D1a. mesmo PDF duas vezes com o card aberto → um card; dois "pode" → um lote.
    const t = montar({ leituras: tres });
    const r1 = await t.h.handle(midia('L1', arquivoTemp('MALOTE-A')));
    assert.strictEqual(r1.acao, 'preview_multi_aluno_enviado', JSON.stringify(r1));
    const r2 = await t.h.handle(midia('L2', arquivoTemp('MALOTE-A')));
    assert.strictEqual(r2.acao, 'cheques_lote_repetido', JSON.stringify(r2));
    assert.ok(/já está no card aberto das 12:00/.test(t.enviadas[t.enviadas.length - 1].t), t.enviadas[t.enviadas.length - 1].t);
    assert.strictEqual(t.pendCheque().length, 1, 'um card só');
    const card = t.pendCheque()[0].previewId;
    const p1 = await t.h.handle(ev({ messageId: 'P1', body: 'pode', quotedMessageId: card }));
    assert.strictEqual(p1.acao, 'lote_multi_lancado', JSON.stringify(p1));
    const p2 = await t.h.handle(ev({ messageId: 'P2', body: 'pode', quotedMessageId: card }));
    assert.notStrictEqual(p2.acao, 'lote_multi_lancado');
    assert.strictEqual(t.lotes.length, 1);
    // Card fechado e o mesmo PDF de novo: agora os cheques estão NO CAIXA → sem card.
    const r3 = await t.h.handle(midia('L3', arquivoTemp('MALOTE-A')));
    assert.strictEqual(r3.acao, 'cheques_lote_sem_lancavel', JSON.stringify(r3));
    assert.ok(/Esse cheque já está no caixa \(lançado em 29\/09\)/.test(t.enviadas[t.enviadas.length - 1].t));
    assert.strictEqual(t.pendCheque().length, 0);
    assert.strictEqual(t.lotes.length + t.singulares.length, 1);
    console.log('D1a. mesmo PDF 2x → 1 card, 1 lote; 3º envio vê o caixa — OK');
  }
  {
    // D1b. outro arquivo (re-scan), mesmos cheques → não abre card.
    const t = montar({ leituras: tres });
    await t.h.handle(midia('L1', arquivoTemp('SCAN-1')));
    const r2 = await t.h.handle(midia('L2', arquivoTemp('SCAN-2 diferente')));
    assert.strictEqual(r2.acao, 'cheques_lote_repetido', JSON.stringify(r2));
    assert.ok(/Esses 3 cheques já estão no card aberto/.test(t.enviadas[t.enviadas.length - 1].t));
    assert.strictEqual(t.pendCheque().length, 1);
    console.log('D1b. mesmos cheques em outro arquivo → sem 2º card — OK');
  }
  {
    // D1c. sobreposição parcial: 2 já no card aberto + 1 novo → card só do novo.
    const t = montar({ leituras: [tres, [chequeLido(2), chequeLido(3), chequeLido(4)]] });
    await t.h.handle(midia('L1', arquivoTemp('A')));
    const r2 = await t.h.handle(midia('L2', arquivoTemp('B')));
    assert.strictEqual(r2.acao, 'preview_cheque_enviado', JSON.stringify(r2));
    const msg = t.enviadas[t.enviadas.length - 1].t;
    assert.ok(/✅ 1 vai para o caixa — R\$ 367,00/.test(msg) && (msg.match(/já está no card aberto/g) || []).length === 2, msg);
    const cards = t.pendCheque();
    assert.strictEqual(cards.length, 2);
    for (const c of cards) await t.h.handle(ev({ messageId: 'P' + c.previewId, body: 'pode', quotedMessageId: c.previewId }));
    const nums = [...t.lotes.flatMap((l) => l.itens.map((i) => i.cheque_numero)), ...t.singulares.map((s) => s.cheque_numero)];
    assert.deepStrictEqual(nums.slice().sort(), ['100001', '100002', '100003', '100004'], 'cada cheque uma vez: ' + nums);
    console.log('D1c. sobreposição parcial → só o cheque novo no 2º card — OK');
  }
  {
    // D1d. dois envios AO MESMO TEMPO (leitura lenta): o segundo vê "lendo".
    const t = montar({ leituras: tres, lerDelayMs: 60 });
    const [a, b] = await Promise.all([
      t.h.handle(midia('L1', arquivoTemp('SIMULT'))),
      new Promise((r) => setTimeout(r, 10)).then(() => t.h.handle(midia('L2', arquivoTemp('SIMULT')))),
    ]);
    assert.strictEqual(a.acao, 'preview_multi_aluno_enviado', JSON.stringify(a));
    assert.strictEqual(b.acao, 'cheques_lote_repetido', JSON.stringify(b));
    assert.ok(t.enviadas.some((m) => /já está sendo lido/.test(m.t)));
    // E dois arquivos DIFERENTES com os mesmos cheques, ao mesmo tempo:
    const t2 = montar({ leituras: tres, lerDelayMs: 40 });
    const [c, d] = await Promise.all([
      t2.h.handle(midia('L1', arquivoTemp('X1'))),
      new Promise((r) => setTimeout(r, 10)).then(() => t2.h.handle(midia('L2', arquivoTemp('X2')))),
    ]);
    const acoes = [c.acao, d.acao].sort();
    assert.deepStrictEqual(acoes, ['cheques_lote_repetido', 'preview_multi_aluno_enviado'], JSON.stringify(acoes));
    assert.strictEqual(t2.pendCheque().length, 1);
    console.log('D1d. envios simultâneos → 1 card — OK');
  }
  {
    // D1e. o "pode" barra cheque já no caixa (lote e simples), com mensagem clara.
    const t = montar({ leituras: tres });
    await t.h.handle(midia('L1', arquivoTemp('Z')));
    const card = t.pendCheque()[0].previewId;
    // Enquanto o card esperava, o cheque 2 entrou no caixa por outro caminho.
    t.db.movimentos.push({ id: U(777), tipo: 'entrada', cheque_numero: '100002', cheque_banco: '237', data_movimento: '2026-09-29', valor: 367 });
    const p = await t.h.handle(ev({ messageId: 'P1', body: 'pode', quotedMessageId: card }));
    assert.strictEqual(p.acao, 'pode_bloqueado_cheque_duplicado', JSON.stringify(p));
    const txt = t.enviadas[t.enviadas.length - 1].t;
    assert.ok(/Não lancei: este cheque já está no caixa:\n• Bradesco nº 100002 — lançado em 29\/09/.test(txt), txt);
    assert.strictEqual(t.lotes.length, 0, 'nada gravado');
    // Estornado não conta: o mesmo "pode" passa depois do estorno.
    t.db.estornos.push(U(777));
    const p2 = await t.h.handle(ev({ messageId: 'P2', body: 'pode', quotedMessageId: card }));
    assert.strictEqual(p2.acao, 'lote_multi_lancado', JSON.stringify(p2));
    // Simples (1 cheque).
    const s = montar({ leituras: [chequeLido(5)] });
    await s.h.handle(midia('L1', arquivoTemp('S')));
    const cs = s.pendCheque()[0];
    assert.strictEqual(cs.cheque_numero, '100005');
    s.db.movimentos.push({ id: U(778), tipo: 'entrada', cheque_numero: '100005', cheque_banco: '237', data_movimento: '2026-09-28', valor: 367 });
    const ps = await s.h.handle(ev({ messageId: 'P1', body: 'pode', quotedMessageId: cs.previewId }));
    assert.strictEqual(ps.acao, 'pode_bloqueado_cheque_duplicado', JSON.stringify(ps));
    assert.strictEqual(s.singulares.length, 0);
    // Sem conseguir conferir o caixa, não lança (fail-closed).
    const f = montar({ leituras: tres });
    await f.h.handle(midia('L1', arquivoTemp('F')));
    const cf = f.pendCheque()[0].previewId;
    f.db.consultaFn = null;
    const origem = f.db;
    origem.movimentos = null; // consulta vai quebrar → null
    const pf = await f.h.handle(ev({ messageId: 'P1', body: 'pode', quotedMessageId: cf }));
    assert.strictEqual(pf.acao, 'pode_cheque_conferencia_indisponivel', JSON.stringify(pf));
    assert.strictEqual(f.lotes.length, 0);
    console.log('D1e. "pode" barra cheque já no caixa (lote/simples), estorno libera, fonte fora = não lança — OK');
  }
  {
    // D1f. mesmo cheque duas vezes no MESMO arquivo → conta uma.
    const t = montar({ leituras: [chequeLido(1), chequeLido(2), chequeLido(1)] });
    const r = await t.h.handle(midia('L1', arquivoTemp('R')));
    assert.strictEqual(r.acao, 'preview_multi_aluno_enviado');
    assert.strictEqual(t.pendCheque()[0].itens.length, 2);
    assert.ok(/apareceu duas vezes neste arquivo/.test(t.enviadas[0].t));
    console.log('D1f. cheque repetido no arquivo → uma vez — OK');
  }

  // ------------------------------------------------------------ D2
  {
    // 1 ✅ + 1 ❓ (emitente desconhecido): decisão citando o card nunca vira nome.
    const umMaisUm = [chequeLido(1), chequeLido(2, { emitente: 'DESCONHECIDO DA SILVA' })];
    const banco = { resolver: { 'Fulana Teste': { fatura: 9 } } };
    for (const [resposta, espera] of [['não', 'descarta'], ['Não.', 'descarta'], ['cancela', 'pergunta'], ['descarta esse', 'pergunta'],
      ['sim', 'lanca'], ['ok, pode', 'lanca'], ['Ok, pode', 'lanca'], ['pode', 'lanca']]) {
      const t = montar({ leituras: umMaisUm, banco });
      const r = await t.h.handle(midia('L1', arquivoTemp('D2-' + resposta)));
      assert.strictEqual(r.acao, 'preview_cheque_enviado', JSON.stringify(r));
      const card = t.pendCheque()[0].previewId;
      const antes = t.db.resolvidos.length;
      const rr = await t.h.handle(ev({ messageId: 'R1', body: resposta, quotedMessageId: card }));
      assert.strictEqual(t.db.resolvidos.length, antes, `"${resposta}" não pode ir ao resolver como nome`);
      assert.ok(!t.enviadas.some((m) => /Não achei uma parcela única/.test(m.t)), `"${resposta}" virou nome`);
      if (espera === 'pergunta') {
        assert.strictEqual(rr.acao, 'cheques_cancelar_pergunta', JSON.stringify(rr));
        assert.strictEqual(t.pendCheque().length, 1, 'card intacto até o não');
        const rn = await t.h.handle(ev({ messageId: 'R2', body: 'não', quotedMessageId: card }));
        assert.strictEqual(t.pendCheque().length, 0, 'não descarta: ' + JSON.stringify(rn));
        assert.strictEqual(t.singulares.length, 0);
      } else if (espera === 'descarta') {
        assert.strictEqual(t.pendCheque().length, 0, `"${resposta}" tem de descartar o card: ${JSON.stringify(rr)}`);
        const p = await t.h.handle(ev({ messageId: 'P1', body: 'pode', quotedMessageId: card }));
        assert.notStrictEqual(p.acao, 'lancado', 'pode depois do não não lança');
        assert.strictEqual(t.singulares.length, 0);
      } else {
        assert.strictEqual(rr.acao, 'lancado', `"${resposta}" citando o card aprova: ${JSON.stringify(rr)}`);
        assert.strictEqual(t.singulares.length, 1);
        assert.strictEqual(t.singulares[0].cheque_numero, '100001', 'só o ✅ entra');
      }
    }
    // A identificação continua funcionando: com rótulo, com índice e nome solto (2 palavras).
    for (const resposta of ['é da Fulana Teste', '2 é da Fulana Teste', 'Fulana Teste', 'cheque 2 - Fulana Teste']) {
      const t = montar({ leituras: umMaisUm, banco });
      await t.h.handle(midia('L1', arquivoTemp('D2id-' + resposta)));
      const card = t.pendCheque()[0].previewId;
      const ri = await t.h.handle(ev({ messageId: 'I1', body: resposta, quotedMessageId: card }));
      assert.strictEqual(ri.acao, 'preview_cheque_enviado', `"${resposta}": ${JSON.stringify(ri)}`);
      assert.ok(/Cheque 2 identificado/.test(t.enviadas[t.enviadas.length - 1].t));
    }
    // Palavra solta sem rótulo nem índice não vai ao resolver.
    {
      const t = montar({ leituras: umMaisUm, banco });
      await t.h.handle(midia('L1', arquivoTemp('D2solta')));
      const card = t.pendCheque()[0].previewId;
      const antes = t.db.resolvidos.length;
      await t.h.handle(ev({ messageId: 'I1', body: 'beleza', quotedMessageId: card }));
      await t.h.handle(ev({ messageId: 'I2', body: 'Fulana', quotedMessageId: card }));
      assert.strictEqual(t.db.resolvidos.length, antes);
    }
    // Índice de cheque que não espera nome: resposta honesta, card intacto.
    {
      const t = montar({ leituras: umMaisUm, banco });
      await t.h.handle(midia('L1', arquivoTemp('D2idx')));
      const card = t.pendCheque()[0].previewId;
      const ri = await t.h.handle(ev({ messageId: 'I1', body: '1 é da Fulana Teste', quotedMessageId: card }));
      assert.strictEqual(ri.acao, 'cheques_identificacao_indice_invalido', JSON.stringify(ri));
      assert.strictEqual(t.pendCheque().length, 1);
      assert.strictEqual(t.pendCheque()[0].aluno, 'Aluno Teste 1', 'o card não foi corrigido');
    }
    // 2 ❓ sem card (nenhum ✅): "não"/"pode" citando a lista → o módulo responde; nada lançado.
    {
      const soDuvida = [chequeLido(1, { emitente: 'DESCONHECIDO UM' }), chequeLido(2, { emitente: 'DESCONHECIDO DOIS' })];
      const t = montar({ leituras: soDuvida, banco });
      const r = await t.h.handle(midia('L1', arquivoTemp('D2semcard')));
      assert.strictEqual(r.acao, 'cheques_lote_sem_lancavel');
      const lista = t.enviadas[0].id;
      const rn = await t.h.handle(ev({ messageId: 'N1', body: 'sim', quotedMessageId: lista }));
      assert.strictEqual(rn.acao, 'cheques_pode_sem_card', JSON.stringify(rn));
      const rc = await t.h.handle(ev({ messageId: 'N2', body: 'não', quotedMessageId: lista }));
      assert.strictEqual(rc.acao, 'cheques_lote_descartado_sem_card', JSON.stringify(rc));
      assert.strictEqual(t.singulares.length + t.lotes.length, 0);
    }
    console.log('D2. não descarta, cancela pergunta, sim/ok pode aprovam só o ✅, nada vira nome — OK');
  }

  // ------------------------------------------------------------ D3
  {
    // Paridade com calcular_valores_fatura_financeiro_v1 (valores conferidos por
    // SELECT em 29/09/2026: original 447, sem desconto fixo, hoje 29/09).
    for (const [cond, venc, esperado] of [[407, '2026-09-20', 457.28], [257, '2026-08-20', 461.90], [140, '2026-06-05', 473.22],
      [130, '2026-06-20', 470.99], [130, '2026-07-20', 466.52], [127, '2026-08-05', 464.14], [127, '2026-08-31', 460.26]]) {
      const r = chq.valorDoBanco({ status: 'aberta', valor_original: '447.00', desconto_fixo: '0.00', desconto_condicional: String(cond), data_vencimento: venc }, '2026-09-29');
      assert.strictEqual(r.valor, esperado, `vencida ${venc} cond ${cond}`);
      assert.strictEqual(r.vencida, true);
    }
    assert.strictEqual(chq.valorDoBanco({ status: 'aberta', valor_original: 447, desconto_condicional: 80, data_vencimento: '2026-10-10' }, '2026-09-29').valor, 367, 'em dia: com desconto');
    assert.strictEqual(chq.valorDoBanco({ status: 'aberta', valor_original: 447, desconto_fixo: 20, desconto_condicional: 80, data_vencimento: '2026-09-29' }, '2026-09-29').valor, 347, 'vence hoje: ainda em dia');
    assert.strictEqual(chq.valorDoBanco({ status: 'paga', valor_pago: '350.00', valor_original: 447, desconto_condicional: 80 }, '2026-09-29').valor, 350, 'paga: valor pago');

    // Cheque do valor COM desconto numa parcela aberta e VENCIDA → ❓ com a diferença, sem card.
    const VENC = U(31);
    const t = montar({ leituras: [chequeLido(31, { valor: 367 })],
      banco: { faturas: { [VENC]: F.faturaPadrao(VENC, { status: 'aberta', forma: null, valor_pago: null, valor_original: '447.00',
        desconto_condicional: '80.00', data_vencimento: '2026-09-20', data_pagamento: null }) } } });
    const r = await t.h.handle(midia('L1', arquivoTemp('D3')));
    assert.strictEqual(r.acao, 'cheques_lote_sem_lancavel', JSON.stringify(r));
    const txt = t.enviadas[0].t;
    // 447 × 1,02 + 447 × 0,01 × 9/30 = 455,94 + 1,34 = 457,28
    assert.ok(/Parcela \*vencida\* em 20\/09: hoje ela vale R\$ 457,28 no Emusys \(R\$ 447,00 sem o desconto de pontualidade \+ R\$ 10,28 de multa\/juros\)/.test(txt), txt);
    assert.ok(/O cheque é de R\$ 367,00 — diferença de R\$ 90,28 a menos no cheque \(é o valor com desconto, de antes do vencimento\)/.test(txt), txt);
    assert.ok(!/✅ .* vai para o caixa/.test(txt), 'não diz ✅');
    assert.strictEqual(t.pendCheque().length, 0, 'sem card aprovável');
    // Cheque do valor de HOJE → ✅ e o card diz que é o valor com multa.
    const t2 = montar({ leituras: [chequeLido(31, { valor: 457.28 }), chequeLido(32)],
      banco: { faturas: { [VENC]: F.faturaPadrao(VENC, { status: 'aberta', forma: null, valor_pago: null, valor_original: '447.00',
        desconto_condicional: '80.00', data_vencimento: '2026-09-20', data_pagamento: null }) } } });
    const r2 = await t2.h.handle(midia('L1', arquivoTemp('D3b')));
    assert.strictEqual(r2.acao, 'preview_multi_aluno_enviado', JSON.stringify(r2));
    assert.ok(/vencida em 20\/09 — valor de hoje R\$ 457,28 \(com multa\/juros\) — ✅ confere/.test(t2.enviadas[0].t), t2.enviadas[0].t);
    assert.deepStrictEqual(t2.pendCheque()[0].itens.map((i) => i.valor), [457.28, 367]);
    console.log('D3. parcela vencida: card usa o valor de hoje do banco e mostra a diferença — OK');
  }

  console.log('\nRESULTADO: OK');
})().catch((e) => { console.error('FALHOU:', e && e.stack || e); process.exit(1); });
