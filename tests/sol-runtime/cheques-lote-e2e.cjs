#!/usr/bin/env node
'use strict';

// Lote de cheques para depósito (26/09/2026). Dados INVENTADOS — nenhum cheque,
// nome ou documento real entra no repositório (regra do contrato com o Super Folha).
// Prova, com o handler REAL do caixa e fakes de E/S:
//   A. regras puras: CMC-7 (3 DVs), extenso, data do lote, reconhecimento, escolha;
//   B. modo grupo: o PDF vira mensagem cheque a cheque, NADA vai para o caixa,
//      a resposta ao ❓ confere de novo só aquele cheque, e "pode" citando registra;
//   C. modo sombra: resultado só no DM de sombra, nada no grupo, nada gravado;
//   D. modo off: o módulo não intercepta.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_LOTE_MS = '0';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mod = require('./_alvo.cjs');
const chq = require(path.join(path.dirname(require.resolve('./_alvo.cjs')), '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-cheques.cjs'));

// ---------------------------------------------------------------- A. puras
// CMC-7 sintético montado à mão com os 3 DVs: banco 237, ag 1234, comp 018,
// nº 000123, tipif 5, conta 0000056789 → DV1=2, DV2=1, DV3=1.
const CMC7 = '23712341' + '0180001235' + '200000567891';
assert.strictEqual(chq.lerCmc7(CMC7).ok, true);
assert.strictEqual(chq.lerCmc7(CMC7).numero, '000123');
assert.strictEqual(chq.lerCmc7(CMC7).conta, '0000056789');
assert.strictEqual(chq.lerCmc7(CMC7.replace('0001235', '0001245')).ok, false, 'dígito trocado no número tem de reprovar');
assert.strictEqual(chq.lerCmc7(CMC7.slice(0, 29)).ok, false);
assert.strictEqual(chq.lerCmc7(null).motivo, 'cmc7_ausente');

assert.strictEqual(chq.extensoParaNumero('trezentos e sessenta e sete reais'), 367);
assert.strictEqual(chq.extensoParaNumero('# Mil e duzentos e cinquenta reais e trinta centavos #'), 1250.3);
assert.strictEqual(chq.extensoParaNumero('quatrocentos reais'), 400);
assert.strictEqual(chq.extensoParaNumero('sei la'), null);

const NOV2026 = Date.parse('2026-11-05T15:00:00Z');
assert.strictEqual(chq.dataDoLote('2 CH - 20SETEMBRO206 - C.GRANDE', NOV2026), '2026-09-20', 'ano digitado errado cai no ano corrente');
assert.strictEqual(chq.dataDoLote('4 cheques para depósito do dia 20AGO2026 - C.GRANDE', NOV2026), '2026-08-20');
assert.strictEqual(chq.dataDoLote('cheques do dia 03/10', NOV2026), '2026-10-03');
assert.strictEqual(chq.dataDoLote('sem data', NOV2026), '2026-11-05');

assert.strictEqual(chq.pareceLoteCheques({ body: '', mediaUrls: ['/x/doc_0123456789ab_2_CH_-_20SETEMBRO2026_-_C.GRANDE_.pdf'] }), true);
assert.strictEqual(chq.pareceLoteCheques({ body: '4 cheques para depósito do dia 20AGO2026', mediaUrls: ['/x/doc_0123456789ab_scan.pdf'] }), true);
assert.strictEqual(chq.pareceLoteCheques({ body: 'pagamento em cheque do João', mediaUrls: ['/x/doc_0123456789ab_recibo.pdf'] }), false,
  'cheque solto em legenda de comprovante não é lote');
assert.strictEqual(chq.pareceLoteCheques({ body: 'Parcela setembro', mediaUrls: ['/x/doc_0123456789ab_comprovante.pdf'] }), false);

const bom = chq.normalizarCheque({ banco: '237', agencia: '1234', numero: '000123', cmc7: CMC7, valor: 367,
  valor_extenso: 'trezentos e sessenta e sete reais', emitente_nome: 'FULANO DE TAL TESTE', emitente_documento: '11144477735' });
assert.strictEqual(bom.confiavel, true, JSON.stringify(bom.problemas));
assert.strictEqual(bom.conta_final, '6789');
const numDiverge = chq.normalizarCheque({ banco: '237', agencia: '1234', numero: '000124', cmc7: CMC7, valor: 367 });
assert.strictEqual(numDiverge.confiavel, false);
const valorDiverge = chq.normalizarCheque({ banco: '237', agencia: '1234', numero: '000123', cmc7: CMC7, valor: 364,
  valor_extenso: 'trezentos e sessenta e sete reais' });
assert.strictEqual(valorDiverge.confiavel, false, 'extenso 367 × numérico 364 tem de virar ❓');

const cand = (id, score, extra = {}) => ({ emusys_fatura_id: id, score, status: 'aberta', valor_original: 367,
  data_vencimento: '2026-09-20', aluno_nome: 'Aluno ' + id, responsavel_nome: 'Resp ' + id, ...extra });
assert.strictEqual(chq.escolherFatura({ ok: true, emitente: { resolvido: true }, candidatas: [cand(1, 0.9), cand(2, 0.5)] }, bom, '2026-09-20').fatura.emusys_fatura_id, 1);
assert.strictEqual(chq.escolherFatura({ ok: true, emitente: { resolvido: true },
  candidatas: [cand(1, 0.7, { data_vencimento: '2026-08-20' }), cand(2, 0.7, { data_vencimento: '2026-09-20' })] }, bom, '2026-09-20').fatura.emusys_fatura_id, 2,
  'empate: a de data mais próxima do lote');
assert.strictEqual(chq.escolherFatura({ ok: true, emitente: { resolvido: true },
  candidatas: [cand(1, 0.7), cand(2, 0.7)] }, bom, '2026-09-20').fatura, null, 'empate total: sem fatura');
const desconhecido = chq.escolherFatura({ ok: true, emitente: { resolvido: false },
  candidatas: [cand(1, 0.3, { responsavel_nome: 'Outra Pessoa' }), cand(2, 0.3, { responsavel_nome: 'Maria Tal Teste' })] }, bom, '2026-09-20');
assert.strictEqual(desconhecido.fatura, null);
assert.ok(/Maria Tal Teste/.test(desconhecido.suspeitos[0].rotulo), 'sobrenome em comum com o emitente vem primeiro');
console.log('A. regras puras — OK');

// ---------------------------------------------------------------- B/C/D. handler real
const CHAT = 'grupo-cg@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const DM = '5521900000099@s.whatsapp.net';

function montar() {
  const enviadas = []; const lancados = []; const sf = []; let seq = 0;
  const cheques = chq.criarCheques({
    carregarEnv: () => ({ url: 'https://x', key: 'k' }),
    sendFn: async (c, t) => { enviadas.push({ c, t }); return 'MSG' + (++seq); },
    agoraFn: () => Date.parse('2026-09-26T15:00:00Z'),
    lerLoteFn: async () => ({ ok: true, cheques: [
      { banco: '237', agencia: '1234', numero: '000123', cmc7: CMC7, valor: 367, valor_extenso: 'trezentos e sessenta e sete reais',
        emitente_nome: 'BELTRANO SOUZA TESTE', emitente_documento: '11144477735' },
      { banco: '237', agencia: '1234', numero: '000999', cmc7: CMC7, valor: 400, emitente_nome: 'CICRANO' },
    ] }),
    rpcFn: async (nome, args) => {
      if (nome === 'sol_cheque_documento_hash_v1') return 'a'.repeat(64);
      if (/natalia/i.test(args.p_emitente_nome || '')) {
        return { ok: true, emitente: { resolvido: true }, candidatas: [cand(47000, 0.8, { aluno_nome: 'Natalia Souza Teste' })] };
      }
      return { ok: true, emitente: { resolvido: false }, candidatas: [cand(47000, 0.3, { responsavel_nome: 'Mae Souza Teste', aluno_nome: 'Natalia Souza Teste' })] };
    },
    superFolhaFn: async (p) => {
      sf.push(JSON.parse(JSON.stringify(p)));
      return { success: true, ligados_ao_banco: p.acao === 'registrar' ? 1 : undefined,
        cheques: p.cheques.map((c, i) => ({ indice: i + 1, acao: c.emusys_fatura_id ? 'depositar' : 'confirmar',
          avisos: c.emusys_fatura_id ? [] : [{ codigo: 'sem_fatura', texto: 'Não achei a parcela desse cheque.' }],
          parcela: c.emusys_fatura_id ? { aluno_nome: 'Natalia Souza Teste', competencia: '2026-09-01' } : null, id: 'id' + i, gravado: true })) };
    },
  });
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (c, t) => { enviadas.push({ c, t }); return 'MSG' + (++seq); },
    chequesFn: cheques,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M', valor: p.valor, forma: p.forma }; },
    identidadeFn: async () => ({ identificado: true, nome: 'Rose' }),
    log: () => {},
  });
  return { h, enviadas, lancados, sf };
}
function pdfTemp() {
  const p = path.join(os.tmpdir(), `doc_0123456789ab_2_CH_-_20SETEMBRO2026_-_C.GRANDE_${Date.now()}.pdf`);
  fs.writeFileSync(p, 'x'); return p;
}
const ev = (o) => ({ chatId: CHAT, senderPhone: '5521900000011', senderId: '5521900000011@lid', hasMedia: false, ...o });

(async () => {
  // B. grupo
  process.env.SOL_CHEQUES_MODO = 'grupo';
  {
    const { h, enviadas, lancados, sf } = montar();
    const arq = pdfTemp();
    const r = await h.handle(ev({ messageId: 'LOTE1', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [arq] }));
    assert.strictEqual(r.acao, 'cheques_lote_conferido', JSON.stringify(r));
    assert.strictEqual(fs.existsSync(arq), false, 'o PDF tem de ser apagado depois da leitura');
    const msg = enviadas[0];
    assert.strictEqual(msg.c, CHAT);
    assert.ok(/Li 2 cheques do lote de 20\/09 \(Campo Grande\)/.test(msg.t), msg.t);
    assert.ok(/não confiei na leitura/.test(msg.t), 'o 2º cheque (nº diverge do CMC-7) tem de ser ❓');
    assert.ok(/Mae Souza Teste/.test(msg.t), 'suspeito oferecido para o ❓');
    assert.strictEqual(sf.length, 1); assert.strictEqual(sf[0].acao, 'conferir');
    assert.strictEqual(sf[0].cheques.length, 1, 'cheque sem leitura provada fica FORA do Super Folha');
    assert.ok(!JSON.stringify(sf).includes('11144477735'), 'documento em claro nunca sai');
    assert.strictEqual(sf[0].cheques[0].emitente_documento_hash, 'a'.repeat(64));
    assert.strictEqual(sf[0].cheques[0].conta_final, '6789');
    assert.strictEqual(sf[0].cheques[0].lote_data, '2026-09-20');

    // "pode" seco não é do lote: segue para o caixa (sem pendência → nada)
    await h.handle(ev({ messageId: 'P0', body: 'pode' }));
    assert.strictEqual(sf.length, 1, '"pode" sem citar não registra o lote');

    const ri = await h.handle(ev({ messageId: 'ID1', body: '1 é da Natalia', quotedMessageId: 'MSG1' }));
    assert.strictEqual(ri.acao, 'cheques_identificacao', JSON.stringify(ri));
    assert.strictEqual(sf[1].acao, 'conferir'); assert.strictEqual(sf[1].cheques[0].emusys_fatura_id, 47000);
    assert.ok(/Atualizei/.test(enviadas[enviadas.length - 1].t) && /depositar/.test(enviadas[enviadas.length - 1].t));

    const rp = await h.handle(ev({ messageId: 'PODE1', body: 'pode', quotedMessageId: 'MSG1' }));
    assert.strictEqual(rp.acao, 'cheques_registrados', JSON.stringify(rp));
    const reg = sf[sf.length - 1];
    assert.strictEqual(reg.acao, 'registrar');
    assert.strictEqual(reg.cheques.length, 1); assert.strictEqual(reg.cheques[0].situacao, 'a_depositar');
    assert.strictEqual(reg.ator.autorizado_por, 'Rose'); assert.strictEqual(reg.ator.tipo, 'sol');
    assert.ok(/Nada foi lançado no caixa/.test(enviadas[enviadas.length - 1].t));
    assert.strictEqual(lancados.length, 0, 'cheque NUNCA vai para o caixa do dia');
    console.log('B. modo grupo — OK');
  }

  // C. sombra
  process.env.SOL_CHEQUES_MODO = 'sombra';
  process.env.SOL_CHEQUES_SOMBRA_JID = DM;
  {
    const { h, enviadas, sf } = montar();
    const r = await h.handle(ev({ messageId: 'LOTE2', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [pdfTemp()] }));
    assert.strictEqual(r.acao, 'cheques_lote_sombra');
    assert.ok(enviadas.every((m) => m.c === DM), 'sombra não fala no grupo: ' + JSON.stringify(enviadas.map((m) => m.c)));
    assert.ok(/SOMBRA/.test(enviadas[0].t));
    assert.ok(sf.every((p) => p.acao === 'conferir'), 'sombra nunca registra');
    console.log('C. modo sombra — OK');
  }

  // D. off
  process.env.SOL_CHEQUES_MODO = 'off';
  {
    const { h, sf } = montar();
    const r = await h.handle(ev({ messageId: 'LOTE3', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [pdfTemp()] }));
    assert.ok(!/^cheques_/.test(String(r && r.acao)), 'off não intercepta: ' + JSON.stringify(r));
    assert.strictEqual(sf.length, 0);
    console.log('D. modo off — OK');
  }
  console.log('\nRESULTADO: OK');
})().catch((e) => { console.error('FALHOU:', e && e.message); process.exit(1); });
