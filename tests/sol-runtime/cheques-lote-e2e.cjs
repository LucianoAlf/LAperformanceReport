#!/usr/bin/env node
'use strict';

// Lote de cheques para depósito → CAIXA DA SOL (26-27/09/2026, decisão do Alf:
// "entra no caixa do LA Report, o Super Folha já puxa o caixa da Sol").
// Dados INVENTADOS — nenhum cheque, nome ou documento real entra no repositório.
// Prova, com o handler REAL do caixa e fakes de E/S:
//   A. regras puras: CMC-7 (3 DVs), extenso, data do lote, reconhecimento,
//      escolha da parcela e a DECISÃO por cheque (lançar / retirar / já no caixa /
//      valor / de quem é / leitura);
//   B. 2 cheques ✅ → UM card de lote (forma cheque) e o "pode" grava pelo lote,
//      com o número do cheque no complemento da descrição e a fatura de cada um;
//      os ⚠️/❓ ficam FORA do card;
//   C. 1 cheque ✅ → lançamento simples, descrição com o nº, fatura vinculada;
//      "1 é da Fulana" citando a lista resolve um ❓ e abre o card dele;
//   D. sombra: resultado só no DM, nenhum card, nada no caixa;
//   E. off: o módulo não intercepta.
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_LOTE_MS = '0';
delete process.env.SOL_CAIXA_V4_CANARIO;
delete process.env.SOL_CAIXA_TOOLS_CANARIO;
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mod = require('./_alvo.cjs');
const chq = require(path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-cheques.cjs'));

// ---------------------------------------------------------------- A. puras
// CMC-7 sintético montado à mão com os 3 DVs: banco 237, ag 1234, comp 018,
// nº 000123, tipif 5, conta 0000056789 → DV1=2, DV2=1, DV3=1.
const CMC7 = '23712341' + '0180001235' + '200000567891';
assert.strictEqual(chq.lerCmc7(CMC7).ok, true);
assert.strictEqual(chq.lerCmc7(CMC7).numero, '000123');
assert.strictEqual(chq.lerCmc7(CMC7.replace('0001235', '0001245')).ok, false, 'dígito trocado no número tem de reprovar');
assert.strictEqual(chq.lerCmc7(CMC7.slice(0, 29)).ok, false);
assert.strictEqual(chq.lerCmc7(null).motivo, 'cmc7_ausente');
// Segundo CMC-7 sintético (nº 000456) para lotes com 2 cheques distintos.
function cmc7(banco, ag, comp, num, tip, conta) {
  const c1 = banco + ag; const c2 = comp + num + tip;
  return c1 + chq.dvMod10(c2) + c2 + chq.dvMod10(c1) + conta + chq.dvMod10(conta);
}
assert.strictEqual(cmc7('237', '1234', '018', '000123', '5', '0000056789'), CMC7, 'montador bate com o CMC-7 feito à mão');
const CMC7_B = cmc7('341', '9999', '018', '000456', '5', '0000011112');

assert.strictEqual(chq.extensoParaNumero('trezentos e sessenta e sete reais'), 367);
assert.strictEqual(chq.extensoParaNumero('# Mil e duzentos e cinquenta reais e trinta centavos #'), 1250.3);
assert.strictEqual(chq.extensoParaNumero('sei la'), null);

const NOV2026 = Date.parse('2026-11-05T15:00:00Z');
assert.strictEqual(chq.dataDoLote('2 CH - 20SETEMBRO206 - C.GRANDE', NOV2026), '2026-09-20', 'ano digitado errado cai no ano corrente');
assert.strictEqual(chq.dataDoLote('4 cheques para depósito do dia 20AGO2026', NOV2026), '2026-08-20');
assert.strictEqual(chq.dataDoLote('sem data', NOV2026), '2026-11-05');

assert.strictEqual(chq.pareceLoteCheques({ body: '', mediaUrls: ['/x/doc_0123456789ab_2_CH_-_20SETEMBRO2026_-_C.GRANDE_.pdf'] }), true);
assert.strictEqual(chq.pareceLoteCheques({ body: '4 cheques para depósito do dia 20AGO2026', mediaUrls: ['/x/doc_0123456789ab_scan.pdf'] }), true);
assert.strictEqual(chq.pareceLoteCheques({ body: 'pagamento em cheque do João', mediaUrls: ['/x/doc_0123456789ab_recibo.pdf'] }), false);
assert.strictEqual(chq.pareceLoteCheques({ body: 'Parcela setembro', mediaUrls: ['/x/doc_0123456789ab_comprovante.pdf'] }), false);

const bom = chq.normalizarCheque({ banco: '237', agencia: '1234', numero: '000123', cmc7: CMC7, valor: 367,
  valor_extenso: 'trezentos e sessenta e sete reais', emitente_nome: 'FULANO DE TAL TESTE', emitente_documento: '11144477735' });
assert.strictEqual(bom.confiavel, true, JSON.stringify(bom.problemas));
assert.strictEqual(chq.normalizarCheque({ banco: '237', agencia: '1234', numero: '000124', cmc7: CMC7, valor: 367 }).confiavel, false);
assert.strictEqual(chq.normalizarCheque({ banco: '237', agencia: '1234', numero: '000123', cmc7: CMC7, valor: 364,
  valor_extenso: 'trezentos e sessenta e sete reais' }).confiavel, false, 'extenso 367 × numérico 364 tem de virar ❓');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cand = (id, score, extra = {}) => ({ emusys_fatura_id: id, la_report_fatura_id: U(id), score, status: 'paga',
  valor_original: 367, valor_pago: 367, data_pagamento: '2026-09-20', data_vencimento: '2026-09-20',
  aluno_nome: 'Aluno ' + id, responsavel_nome: 'Resp ' + id, ...extra });
assert.strictEqual(chq.escolherFatura({ ok: true, emitente: { resolvido: true }, candidatas: [cand(1, 0.9), cand(2, 0.5)] }, bom, '2026-09-20').fatura.emusys_fatura_id, 1);
assert.strictEqual(chq.escolherFatura({ ok: true, emitente: { resolvido: true },
  candidatas: [cand(1, 0.7), cand(2, 0.7)] }, bom, '2026-09-20').fatura, null, 'empate total: sem fatura');
const desc = chq.escolherFatura({ ok: true, emitente: { resolvido: false },
  candidatas: [cand(1, 0.3, { responsavel_nome: 'Outra Pessoa' }), cand(2, 0.3, { responsavel_nome: 'Maria Tal Teste' })] }, bom, '2026-09-20');
assert.ok(/Maria Tal Teste/.test(desc.suspeitos[0].rotulo), 'sobrenome em comum com o emitente vem primeiro');

const itemBom = { cheque: bom, escolha: { fatura: cand(1, 0.9) } };
const fat = (extra = {}) => ({ id: U(1), status: 'paga', forma: 'Cheque Pré Datado', valor_pago: '367.00', valor_original: '447.00',
  desconto_condicional: '80.00', descricao: 'Parcela 09/2026 do curso de Violão', competencia: '2026-09-01', ...extra });
assert.strictEqual(chq.decidirCheque(itemBom, fat(), false), 'lancar');
assert.strictEqual(chq.decidirCheque(itemBom, fat({ status: 'aberta', valor_pago: null }), false), 'lancar', 'aberta com valor líquido batendo');
assert.strictEqual(chq.decidirCheque(itemBom, fat({ forma: 'Pix' }), false), 'retirar', 'paga por Pix: cheque volta ao cliente');
assert.strictEqual(chq.decidirCheque(itemBom, fat({ status: 'cancelada' }), false), 'retirar');
assert.strictEqual(chq.decidirCheque(itemBom, fat(), true), 'ja_no_caixa', 'fatura já no caixa não entra de novo');
assert.strictEqual(chq.decidirCheque(itemBom, fat({ valor_pago: '400.00' }), false), 'valor');
assert.strictEqual(chq.decidirCheque({ cheque: bom, escolha: { fatura: null } }, null, false), 'sem_parcela');
assert.strictEqual(chq.categoriaDaFatura('Parcela 09/2026 do curso de Violão'), 'parcela');
assert.strictEqual(chq.categoriaDaFatura('Taxa de Matrícula do curso de Canto'), 'passaporte');
const itemCx = chq.itemDoCaixa({ cheque: bom, escolha: { fatura: cand(1, 0.9) }, fatura: fat() });
assert.strictEqual(itemCx.competencia, '09/2026');
assert.strictEqual(itemCx.canonical_fatura_id, U(1));
assert.strictEqual(itemCx.complemento_descricao, 'cheque Bradesco nº 000123');
assert.strictEqual(itemCx.cheque_numero, '000123');
assert.strictEqual(itemCx.cheque_banco, '237');
assert.strictEqual(itemCx.cheque_bom_para, null, 'sem "bom para" escrito → null');
console.log('A. regras puras — OK');

// ---------------------------------------------------------------- B–E. handler real
const CHAT = 'grupo-cg@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const DM = '5521900000099@s.whatsapp.net';

// Espelho de faturas inventado: 1 e 2 pagas em cheque, 3 paga por Pix, 4 já no caixa.
const FATURAS = {
  [U(1)]: fat({ id: U(1) }),
  [U(2)]: fat({ id: U(2), descricao: 'Parcela 09/2026 do curso de Piano' }),
  [U(3)]: fat({ id: U(3), forma: 'Pix' }),
  [U(4)]: fat({ id: U(4) }),
};
const NA_CAIXA = new Set([U(4)]);

function montar(cheques) {
  const enviadas = []; const lotes = []; const singulares = []; let seq = 0; let led = 0;
  const modCheques = chq.criarCheques({
    carregarEnv: () => ({ url: 'https://x', key: 'k' }),
    sendFn: async (c, t) => { enviadas.push({ c, t }); return 'MSG' + (++seq); },
    agoraFn: () => Date.parse('2026-09-26T15:00:00Z'),
    lerLoteFn: async () => ({ ok: true, cheques }),
    rpcFn: async (nome, args) => {
      if (nome === 'sol_cheque_documento_hash_v1') return 'a'.repeat(64);
      const n = String(args.p_emitente_nome || '');
      const porNome = { 'EMITENTE UM': 1, 'EMITENTE DOIS': 2, 'EMITENTE PIX': 3, 'EMITENTE DUPLO': 4, 'Fulana Teste': 1 };
      const grande = n.match(/^LOTE GRANDE (\d+)$/);
      const id = porNome[n] || (grande ? 100 + Number(grande[1]) : null);
      if (id) return { ok: true, emitente: { resolvido: true }, candidatas: [cand(id, 0.9, { aluno_nome: 'Aluno Teste ' + id })] };
      return { ok: true, emitente: { resolvido: false }, candidatas: [cand(1, 0.3, { responsavel_nome: 'Fulana Teste' })] };
    },
    consultaFn: async (caminho) => {
      const ids = (caminho.match(/in\.\(([^)]*)\)/) || [])[1].split(',');
      if (caminho.startsWith('emusys_faturas')) return ids.map((id) => FATURAS[id] || fat({ id }));
      if (caminho.startsWith('vw_caixa_movimentacao_fatura_links')) return ids.filter((id) => NA_CAIXA.has(id)).map((id) => ({ fatura_id: id }));
      if (caminho.startsWith('caixa_movimentacoes')) return []; // nenhum cheque já no caixa (D1: cheques-malote-v3-e2e)
      return null;
    },
  });
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (c, t) => { enviadas.push({ c, t }); return 'MSG' + (++seq); },
    chequesFn: modCheques,
    identidadeFn: async () => ({ identificado: true, nome: 'Rose' }),
    duplicataFn: async () => ({ ok: true, ja_lancado: false, itens: [] }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'LED-' + (++led) }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'AP-' + led, approval_event_hash: 'EH', actor_id_hash: 'AH' }),
    lancarFn: async (p) => { singulares.push(p); return { ok: true, movimentacao_id: 'MOV-S', valor: Number(p.valor), forma: p.forma }; },
    lancarLoteFn: async (p) => { lotes.push(p); return { ok: true, lote_id: 'LOTE-1', movimentacoes: p.itens.map((i, n) => ({ aluno_nome: i.aluno_nome, valor: i.valor, movimentacao_id: 'MOV-' + n })) }; },
    buscarMovimentosFn: async () => ({ ok: true, items: [] }),
    log: () => {},
  });
  return { h, enviadas, lotes, singulares };
}
function pdfTemp() {
  const p = path.join(os.tmpdir(), `doc_0123456789ab_4_CH_-_20SETEMBRO2026_-_C.GRANDE_${Date.now()}_${Math.random().toString(16).slice(2)}.pdf`);
  fs.writeFileSync(p, 'x'); return p;
}
const ev = (o) => ({ chatId: CHAT, senderPhone: '5521900000011', senderId: '5521900000011@lid', hasMedia: false, ...o });
const raw = (numero, c, emitente, extra = {}) => ({ banco: c.slice(0, 3), agencia: c.slice(3, 7), numero, cmc7: c, valor: 367,
  valor_extenso: 'trezentos e sessenta e sete reais', emitente_nome: emitente, emitente_documento: '11144477735', ...extra });

(async () => {
  // B. grupo, 2 ✅ + 1 retirar + 1 já no caixa + 1 leitura ruim
  process.env.SOL_CHEQUES_MODO = 'grupo';
  {
    const { h, enviadas, lotes, singulares } = montar([
      raw('000123', CMC7, 'EMITENTE UM', { bom_para: '2026-10-20' }),
      raw('000456', CMC7_B, 'EMITENTE DOIS'),
      raw('000123', cmc7('001', '0001', '018', '000777', '5', '0000000001'), 'EMITENTE PIX', { numero: '000777' }),
      raw('000888', cmc7('001', '0001', '018', '000888', '5', '0000000002'), 'EMITENTE DUPLO'),
      raw('000999', CMC7, 'CICRANO'),
    ]);
    const arq = pdfTemp();
    const r = await h.handle(ev({ messageId: 'LOTE1', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [arq] }));
    assert.strictEqual(r.acao, 'preview_multi_aluno_enviado', JSON.stringify(r));
    assert.strictEqual(fs.existsSync(arq), false, 'o PDF tem de ser apagado depois da leitura');
    assert.strictEqual(enviadas.length, 1, 'UMA mensagem: a lista organizada É o card');
    const lista = enviadas[0].t;
    assert.ok(/🧾 \*Lote de cheques — Campo Grande\*/.test(lista), lista);
    assert.ok(/📅 Depósito de 20\/09 · 5 cheques · R\$ 1\.835,00/.test(lista), lista);
    assert.ok(/✅ 2 vão para o caixa — R\$ 734,00/.test(lista) && /⚠️ 1 para retirar do malote/.test(lista) && /❓ 2 precisam de você/.test(lista), lista);
    // seções na ordem, cada cheque no seu bloco
    const iCaixa = lista.indexOf('✅ *VAI PARA O CAIXA*'); const iMalote = lista.indexOf('⚠️ *RETIRAR DO MALOTE*'); const iVoce = lista.indexOf('❓ *PRECISA DE VOCÊ*');
    assert.ok(iCaixa > 0 && iMalote > iCaixa && iVoce > iMalote, 'seções na ordem caixa → malote → você');
    const blocoCaixa = lista.slice(iCaixa, iMalote);
    assert.ok(/\*Cheque 1\* — R\$ 367,00\n🏦 Bradesco · nº 000123 · bom para 20\/10\n✍️ Emitente: Emitente Um\n🎓 Aluno: Aluno Teste 1\n👤 Resp\. financeiro: Resp 1\n📄 Parcela 09\/2026 do curso de Violão\n💳 Paga no Emusys/.test(blocoCaixa), blocoCaixa);
    assert.ok(/\*Cheque 2\*/.test(blocoCaixa) && !/\*Cheque 3\*/.test(blocoCaixa));
    assert.ok(/\*Cheque 3\*/.test(lista.slice(iMalote, iVoce)) && /já foi paga por \*Pix\*/.test(lista), 'paga por Pix → retirar do malote');
    assert.ok(/já está lançada no caixa/.test(lista), 'fatura já no caixa não entra de novo');
    assert.ok(/Não consegui confirmar a leitura/.test(lista), 'nº diverge do CMC-7 → ❓');
    assert.ok(/👉 \*Posso lançar R\$ 734,00 \(2 cheques\) no caixa de hoje\?\* Responde \*pode\* citando esta mensagem\./.test(lista), lista);
    assert.ok(!JSON.stringify(enviadas).includes('11144477735'), 'documento em claro nunca sai');
    const pend = h._pendentes.get(CHAT)[0];
    assert.strictEqual(pend.previewId, 'MSG1', 'o card é a própria mensagem do lote');
    assert.strictEqual(pend.tipoOperacao, 'lancar_recebimento_lote');
    assert.strictEqual(pend.forma, 'cheque');
    assert.strictEqual(pend.valor, 734);
    assert.deepStrictEqual(pend.itens.map((i) => i.canonical_fatura_id), [U(1), U(2)]);
    assert.strictEqual(lotes.length + singulares.length, 0, 'nada escrito antes do pode');

    const rp = await h.handle(ev({ messageId: 'PODE1', body: 'pode', quotedMessageId: pend.previewId }));
    assert.strictEqual(rp.acao, 'lote_multi_lancado', JSON.stringify(rp));
    assert.strictEqual(lotes.length, 1); assert.strictEqual(singulares.length, 0);
    assert.strictEqual(lotes[0].forma, 'cheque');
    assert.deepStrictEqual(lotes[0].itens.map((i) => i.complemento_descricao), ['cheque Bradesco nº 000123', 'cheque Itaú nº 000456']);
    // Campos estruturados (pedido SF): chegam no item do lote, na ordem do PDF.
    assert.deepStrictEqual(lotes[0].itens.map((i) => i.cheque_numero), ['000123', '000456']);
    assert.strictEqual(lotes[0].itens[0].cheque_banco, '237');
    assert.strictEqual(lotes[0].itens[0].cheque_bom_para, '2026-10-20');
    assert.strictEqual(lotes[0].itens[1].cheque_bom_para, null);
    console.log('B. 2 cheques → lote no caixa — OK');
  }

  // C. 1 cheque ✅ + 1 ❓ → lançamento simples; depois "2 é da Fulana Teste" abre o card do ❓
  {
    const { h, enviadas, lotes, singulares } = montar([
      raw('000456', CMC7_B, 'EMITENTE DOIS'),
      raw('000123', CMC7, 'DESCONHECIDO DA SILVA'),
    ]);
    const r = await h.handle(ev({ messageId: 'LOTE2', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [pdfTemp()] }));
    assert.strictEqual(r.acao, 'preview_cheque_enviado', JSON.stringify(r));
    const listaId = 'MSG1';
    assert.ok(/Não achei esse emitente no cadastro/.test(enviadas[0].t) && /• Fulana Teste/.test(enviadas[0].t), enviadas[0].t);
    assert.ok(/❓ Para os demais, responde citando esta mensagem: \*2 é da Fulana\*/.test(enviadas[0].t), enviadas[0].t);
    const pend = h._pendentes.get(CHAT).find((p) => p.forma === 'cheque');
    const rp = await h.handle(ev({ messageId: 'PODE2', body: 'pode', quotedMessageId: pend.previewId }));
    assert.strictEqual(rp.acao, 'lancado', JSON.stringify(rp));
    assert.strictEqual(singulares.length, 1);
    assert.strictEqual(singulares[0].forma, 'cheque');
    assert.strictEqual(singulares[0].fatura_id, U(2), 'o cheque vai vinculado à fatura');
    assert.ok(/cheque Itaú nº 000456/.test(singulares[0].descricao), singulares[0].descricao);
    assert.strictEqual(singulares[0].cheque_numero, '000456');
    assert.strictEqual(singulares[0].cheque_banco, '341');
    assert.strictEqual(singulares[0].cheque_bom_para, null);

    const ri = await h.handle(ev({ messageId: 'ID1', body: '2 é da Fulana Teste', quotedMessageId: listaId }));
    assert.strictEqual(ri.acao, 'preview_cheque_enviado', JSON.stringify(ri));
    const cardId = enviadas[enviadas.length - 1].t;
    assert.ok(/Cheque 2 identificado/.test(cardId) && /\*Cheque 2\* — R\$ 367,00/.test(cardId) && /Posso lançar R\$ 367,00 \(1 cheque\)/.test(cardId), cardId);
    // "pode" de novo no card já lançado não lança outra vez
    const rpl = await h.handle(ev({ messageId: 'PODELISTA', body: 'pode', quotedMessageId: listaId }));
    assert.notStrictEqual(rpl.acao, 'lancado', '"pode" num card já lançado não lança de novo: ' + JSON.stringify(rpl));
    assert.strictEqual(singulares.length, 1);
    assert.strictEqual(lotes.length, 0);
    console.log('C. 1 cheque → lançamento simples + identificação — OK');
  }

  // B2. lote REAL de 15 cheques: um card só (sem o teto de 12 do resolver), 15 blocos numerados
  {
    const quinze = Array.from({ length: 15 }, (_, k) => {
      const num = String(500 + k).padStart(6, '0');
      return raw(num, cmc7('237', '1234', '018', num, '5', String(9000 + k).padStart(10, '0')), `LOTE GRANDE ${k + 1}`);
    });
    const { h, enviadas, lotes } = montar(quinze);
    const r = await h.handle(ev({ messageId: 'LOTE15', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [pdfTemp()] }));
    assert.strictEqual(r.acao, 'preview_multi_aluno_enviado', JSON.stringify(r));
    const t = enviadas[0].t;
    for (let k = 1; k <= 15; k += 1) assert.ok(t.includes(`*Cheque ${k}* — R$ 367,00`), 'falta o bloco do cheque ' + k);
    assert.ok(/✅ 15 vão para o caixa — R\$ 5\.505,00/.test(t), t.slice(0, 300));
    assert.ok(t.length < 6000, 'mensagem de 15 cheques cabe no WhatsApp: ' + t.length);
    const pend = h._pendentes.get(CHAT)[0];
    assert.strictEqual(pend.itens.length, 15);
    await h.handle(ev({ messageId: 'PODE15', body: 'pode', quotedMessageId: pend.previewId }));
    assert.strictEqual(lotes.length, 1); assert.strictEqual(lotes[0].itens.length, 15);
    console.log('B2. 15 cheques → um card, um lote — OK (' + t.length + ' caracteres)');
  }

  // D. sombra
  process.env.SOL_CHEQUES_MODO = 'sombra';
  process.env.SOL_CHEQUES_SOMBRA_JID = DM;
  {
    const { h, enviadas, lotes, singulares } = montar([raw('000123', CMC7, 'EMITENTE UM'), raw('000456', CMC7_B, 'EMITENTE DOIS')]);
    const r = await h.handle(ev({ messageId: 'LOTE3', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [pdfTemp()] }));
    assert.strictEqual(r.acao, 'cheques_lote_sombra');
    assert.ok(enviadas.every((m) => m.c === DM), 'sombra não fala no grupo');
    assert.ok(/SOMBRA/.test(enviadas[0].t) && /No grupo eu perguntaria: \*Posso lançar R\$ 734,00 \(2 cheques\)/.test(enviadas[0].t), enviadas[0].t);
    assert.strictEqual((h._pendentes.get(CHAT) || []).length, 0, 'sombra não abre card');
    assert.strictEqual(lotes.length + singulares.length, 0);
    console.log('D. sombra — OK');
  }

  // E. off
  process.env.SOL_CHEQUES_MODO = 'off';
  {
    const { h } = montar([raw('000123', CMC7, 'EMITENTE UM')]);
    const r = await h.handle(ev({ messageId: 'LOTE4', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [pdfTemp()] }));
    assert.ok(!/^cheques_|preview_cheque/.test(String(r && r.acao)), 'off não intercepta: ' + JSON.stringify(r));
    console.log('E. off — OK');
  }
  console.log('\nRESULTADO: OK');
})().catch((e) => { console.error('FALHOU:', e && e.message); process.exit(1); });
