#!/usr/bin/env node
'use strict';

// Conversa sobre o lote de cheques pelo AGENTE (06/10/2026) — dados INVENTADOS.
//
// Reproduz os casos de 06/10 (Recreio e CG) pelo handler REAL do caixa, o módulo
// REAL de cheques e o executor REAL das ferramentas (o mesmo de POST /caixa/tool).
// O "modelo" é falso e determinístico: cada caso diz qual ferramenta um agente
// chamaria com a fala da equipe. O que se prova é o que o CÓDIGO faz com isso:
// valida, recusa com motivo, muda o estado, republica o card, e só o "pode"
// humano grava.
//
//   CG  — 8 cheques [lancar, sem_parcela, lancar, lancar, sem_parcela, repetido,
//         lancar, lancar]; "Sol,\n\nO Cheque 2 é da X\n\nO Cheque 5 é do Y\n\nO
//         Cheque 6 é da Z" citando o card; sem citar; fala de humano para humano;
//         card vencido + "pode"; PDF reenviado.
//   REC — CMC-7 × papel divergem (nº); cheque de R$ 800 de irmãos; "SA000170";
//         número × extenso; lista digitada sem citar; "só confere".
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_LOTE_MS = '0';
process.env.SOL_CHEQUES_MODO = 'grupo';
process.env.SOL_CHEQUES_AGENTE = '1';
process.env.SOL_CHEQUES_LOTE_MULTI_FATURA = '0';
delete process.env.SOL_CAIXA_V4_CANARIO;
delete process.env.SOL_CAIXA_TOOLS_CANARIO;
const assert = require('assert');
const path = require('path');
const mod = require('./_alvo.cjs');
const F = require('./_cheques-fakes.cjs');
const { U, cmc7, extenso, arquivoTemp, chq } = F;
const exec = require(path.join(F.RUNTIME, 'caixa-tool-executor.cjs'));

const UNI = { cg: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', rec: '95553e96-971b-4590-a6eb-0201d013c14d' };
const CHAT = { cg: 'grupo-cg@g.us', rec: 'grupo-rec@g.us' };
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const mais = (d) => new Date(Date.parse(hoje) + d * 86400e3).toISOString().slice(0, 10);
const COMP = hoje.slice(0, 7) + '-01';
const MMAAAA = `${hoje.slice(5, 7)}/${hoje.slice(0, 4)}`;

// ---------------------------------------------------------------- cadastro falso
// alunos: { nome, resp, faturas: [{ n, valor, comp?, status?, forma? }] }
function criarCadastro(alunos) {
  const faturas = {}; const donos = {};
  for (const a of alunos) for (const f of a.faturas) {
    const id = U(f.n);
    faturas[id] = { id, emusys_fatura_id: f.n, descricao: `Parcela ${f.compTxt || MMAAAA} do curso de Violão`, status: f.status || 'aberta',
      valor_pago: f.status === 'paga' ? String(f.valor) : null, valor_original: String(f.valor), desconto_fixo: '0', desconto_condicional: '0',
      competencia: f.comp || COMP, data_pagamento: f.status === 'paga' ? mais(-2) : null, data_vencimento: f.venc || mais(5), forma: f.forma || null };
    donos[id] = a;
  }
  const tok = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const casa = (nome, alvo) => { const t = new Set(tok(alvo)); return tok(nome).filter((w) => t.has(w)).length >= Math.min(2, tok(nome).length); };
  const db = { faturas, links: new Set(), movimentos: [], estornos: [], chamadas: [] };
  db.rpcFn = async (nome, args) => {
    db.chamadas.push(nome);
    if (nome === 'sol_cheque_documento_hash_v1') return 'b'.repeat(64);
    const e = String(args.p_emitente_nome || '');
    const achados = alunos.filter((a) => casa(e, a.nome) || casa(e, a.resp));
    const cands = [];
    for (const a of achados) for (const f of a.faturas) {
      cands.push({ emusys_fatura_id: f.n, la_report_fatura_id: U(f.n), score: 0.3 + (args.p_valor != null && Math.abs(f.valor - args.p_valor) < 0.01 ? 0.35 : 0),
        status: f.status || 'aberta', valor_original: f.valor, valor_pago: f.status === 'paga' ? f.valor : null,
        data_pagamento: null, data_vencimento: f.venc || mais(5), aluno_nome: a.nome, responsavel_nome: a.resp });
    }
    cands.sort((x, y) => y.score - x.score);
    return { ok: true, emitente: { resolvido: achados.length > 0 }, candidatas: cands };
  };
  db.consultaFn = async (caminho) => {
    const ids = ((caminho.match(/in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
    if (caminho.startsWith('emusys_faturas')) return ids.map((id) => db.faturas[id]).filter(Boolean);
    if (caminho.startsWith('vw_caixa_movimentacao_fatura_links')) {
      const lig = new Set([...db.links, ...db.movimentos.flatMap((m) => m.faturas)]);
      return ids.filter((id) => lig.has(id)).map((id) => ({ fatura_id: id }));
    }
    if (caminho.startsWith('caixa_movimentacoes')) {
      if (/categoria=eq\.estorno/.test(caminho)) return [];
      return db.movimentos.filter((m) => m.cheque_numero && ids.includes(m.cheque_numero));
    }
    return null;
  };
  db.gravar = (itens) => {
    for (const it of itens) {
      db.movimentos.push({ id: U(900000 + db.movimentos.length), tipo: 'entrada', cheque_numero: it.cheque_numero || null,
        cheque_banco: it.cheque_banco || null, data_movimento: hoje, valor: it.valor,
        faturas: Array.isArray(it.fatura_ids) ? it.fatura_ids.slice() : [it.canonical_fatura_id || it.fatura_id].filter(Boolean) });
    }
  };
  return db;
}

// Cheque lido pela visão (CMC-7 válido por construção; `numPapel` simula o papel divergente).
function lido(k, valor, emitente, { banco = '341', numPapel = null, extensoLido = null, numero = null } = {}) {
  const num = numero || String(100000 + k).slice(-6);
  const conta = String(5000000000 + k).slice(-10);
  return { banco, agencia: '1234', numero: numPapel || num, cmc7: cmc7(banco, '1234', '018', num, '5', conta), valor,
    valor_extenso: extensoLido != null ? extenso(extensoLido) : extenso(valor), emitente_nome: emitente, emitente_documento: null, bom_para: null };
}

function montar({ unidade, leituras, alunos }) {
  const chat = CHAT[unidade];
  const db = criarCadastro(alunos);
  const enviadas = []; const lotes = []; const singulares = []; let seq = 0; let led = 0; let leiturasFeitas = 0;
  const regs = []; // o executor mede o que ESTA chamada mandou
  const send = async (c, t) => { const id = 'MSG' + (++seq); enviadas.push({ c, t, id }); exec.registrarEnvio(t); return id; };
  const log = (e) => { regs.push(e); exec.registrarEvento(e); };
  const modCheques = chq.criarCheques({
    carregarEnv: () => ({ url: 'https://x', key: 'k' }), sendFn: send, log,
    lerLoteFn: async () => { leiturasFeitas += 1; return { ok: true, cheques: JSON.parse(JSON.stringify(leituras)) }; },
    rpcFn: db.rpcFn, consultaFn: db.consultaFn,
  });
  const grupos = { [chat]: { grupo_jid: chat, unidade_id: UNI[unidade], nome: unidade === 'cg' ? 'Campo Grande' : 'Recreio' } };
  const h = mod.criarHandlerFinanceiro({
    grupos, sendFn: send, chequesFn: modCheques, log,
    identidadeFn: async () => ({ identificado: true, nome: 'Equipe' }),
    duplicataFn: async () => ({ ok: true, ja_lancado: false, itens: [] }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'LED-' + (++led), preview_hash: 'H' + led }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'AP-' + led, approval_event_hash: 'EH', actor_id_hash: 'AH' }),
    lancarFn: async (p) => { singulares.push(p); db.gravar([{ ...p, canonical_fatura_id: p.fatura_id }]); return { ok: true, movimentacao_id: 'MOV-S' + singulares.length, valor: Number(p.valor), forma: p.forma }; },
    lancarLoteFn: async (p) => { lotes.push(p); db.gravar(p.itens); return { ok: true, lote_id: 'LOTE-' + lotes.length, movimentacoes: p.itens.map((i, n) => ({ aluno_nome: i.aluno_nome, valor: i.valor, movimentacao_id: 'MOV-' + n })) }; },
    buscarMovimentosFn: async () => ({ ok: true, items: [] }),
    ocrFn: async () => ({ text: '', status: 'ok' }),
  });
  const ex = exec.criarExecutorCaixaTool({ obterHandler: async () => h, obterAbf: async () => ({ tratarConfirmacao: async () => false }),
    grupos, enviar: async () => 'X' });
  const ctx = { ok: true, _chat: chat, _ator_numero: '5521900000077', quem: 'Pessoa da Equipe', unidade_id: UNI[unidade] };
  // O "agente": chama a ferramenta como o modelo chamaria, pelo executor real.
  // Mesmo par nome → ação do sol-portas-mcp.mjs (é ele que o agente enxerga).
  const ACAO = { cheques_lote_estado: 'cheques_estado', cheques_atribuir: 'cheques_atribuir',
    cheques_confirmar_leitura: 'cheques_confirmar_leitura', cheques_marcar_conferencia: 'cheques_marcar_conferencia' };
  const tool = (name, args = {}) => ex.executar({ tool: { name, action: ACAO[name] }, ctx, args });
  const cardsCheque = () => (h._pendentes.get(chat) || []).filter((p) => p.forma === 'cheque');
  const ev = (o) => ({ chatId: chat, senderPhone: '5521900000011', senderId: '5521900000011@lid', hasMedia: false, ...o });
  const pdf = (id, conteudo) => ev({ messageId: id, body: '', hasMedia: true, mediaType: 'document', mediaUrls: [arquivoTemp(conteudo)] });
  return { h, db, enviadas, lotes, singulares, tool, cardsCheque, ev, pdf, chat, leiturasFeitas: () => leiturasFeitas, regs };
}

const ultima = (t) => t.enviadas[t.enviadas.length - 1].t;

(async () => {
  // ================================================================== CG
  {
    const alunos = [
      { nome: 'Ana Clara Souza', resp: 'Marcos Souza', faturas: [{ n: 1, valor: 367 }] },
      { nome: 'Bruno Lima Teixeira', resp: 'Carla Teixeira', faturas: [{ n: 2, valor: 420 }] },
      { nome: 'Davi Rocha Prado', resp: 'Elisa Prado', faturas: [{ n: 3, valor: 300 }] },
      { nome: 'Fernanda Alves Costa', resp: 'Gustavo Costa', faturas: [{ n: 4, valor: 380 }] },
      { nome: 'Helena Martins Dias', resp: 'Igor Dias', faturas: [{ n: 5, valor: 410 }] },
      { nome: 'Joana Pires Lopes', resp: 'Kleber Lopes', faturas: [{ n: 6, valor: 464 }] },
      { nome: 'Lucas Nunes Barros', resp: 'Marta Barros', faturas: [{ n: 7, valor: 355 }] },
    ];
    const leituras = [
      lido(1, 367, 'MARCOS SOUZA'), lido(2, 420, 'PESSOA DESCONHECIDA UM'), lido(3, 300, 'ELISA PRADO'), lido(4, 380, 'GUSTAVO COSTA'),
      lido(5, 410, 'PESSOA DESCONHECIDA DOIS'), lido(3, 300, 'ELISA PRADO'), lido(7, 464, 'KLEBER LOPES'), lido(8, 355, 'MARTA BARROS'),
    ];
    const t = montar({ unidade: 'cg', leituras, alunos });
    const r1 = await t.h.handle(t.pdf('PDF1', 'MALOTE-CG'));
    assert.strictEqual(r1.acao, 'preview_multi_aluno_enviado', JSON.stringify(r1));
    const decis = t.regs.find((e) => e.acao === 'cheques_lote_decidido').decisoes;
    assert.deepStrictEqual(decis, ['lancar', 'sem_parcela', 'lancar', 'lancar', 'sem_parcela', 'repetido', 'lancar', 'lancar']);
    const card1 = t.cardsCheque()[0].previewId;
    assert.ok(/me conta citando esta mensagem, do seu jeito/.test(t.enviadas.find((m) => m.id === card1).t), 'card convida a falar do jeito da pessoa');
    console.log('CG-1. lote de 8 lido com as decisões de 06/10 e card publicado — OK');

    // A equipe cita o card: "Sol,\n\nO Cheque 2 é da …". Vai ao agente (citou), não ao "não entendi".
    const falaEquipe = 'Sol,\n\nO Cheque 2 é da Bruno Lima\n\nO Cheque 5 é do Helena Martins\n\nO Cheque 6 é da Davi Rocha';
    const conv = t.h.chequesConversa(t.ev({ messageId: 'J1', body: falaEquipe, quotedMessageId: card1 }), { chamouASol: false });
    assert.ok(conv && conv.citou && /cheques_lote_estado/.test(conv.resumo), JSON.stringify(conv));
    const est = await t.tool('cheques_lote_estado');
    assert.strictEqual(est.estado, 'consulta', JSON.stringify(est));
    assert.strictEqual(est.lote.cheques.length, 8);
    assert.strictEqual(est.lote.cheques[1].situacao, 'sem_parcela');
    const at = await t.tool('cheques_atribuir', { p_texto_original: falaEquipe, itens: [
      { cheque: 2, alunos: ['Bruno Lima'] }, { cheque: 5, alunos: ['Helena Martins'] }, { cheque: 6, alunos: ['Davi Rocha'] }] });
    assert.strictEqual(at.estado, 'card_publicado', JSON.stringify(at));
    assert.deepStrictEqual(at.resultados.map((x) => x.ok), [true, true, false]);
    assert.strictEqual(at.resultados[2].motivo, 'cheque_repetido');
    assert.ok(/mesmo cheque 3/.test(at.resultados[2].motivo_humano), at.resultados[2].motivo_humano);
    const cards = t.cardsCheque();
    assert.strictEqual(cards.length, 1, 'card antigo morreu, um card só');
    assert.notStrictEqual(cards[0].previewId, card1);
    assert.strictEqual(cards[0].itens.length, 7, 'os 5 de antes + cheques 2 e 5');
    assert.ok(/\(atualizado\)/.test(ultima(t)) && /Dono informado por Pessoa da Equipe/.test(ultima(t)));
    console.log('CG-2. "Sol, o Cheque 2 é da X / 5 é do Y / 6 é da Z" citando o card → atribuídos 2 e 5, 6 recusado (repetido), card republicado — OK');

    // Sem citar, chamando a Sol, com lote aberto: também vai ao agente.
    assert.ok(t.h.chequesConversa(t.ev({ messageId: 'J2', body: 'Sol, e o cheque 6?' }), { chamouASol: true }));
    // Fala de humano para humano citando o card: vai ao agente (que pode ficar calado) —
    // e o caixa determinístico NÃO responde "não entendi / para abrir o caixa".
    const falaAlf = 'ajusta aí com a Sol logo senão vai sair da janela';
    assert.ok(t.h.chequesConversa(t.ev({ messageId: 'A1', body: falaAlf, quotedMessageId: cards[0].previewId }), { chamouASol: false }));
    const nEnv = t.enviadas.length;
    const rAlf = await t.h.handle(t.ev({ messageId: 'A1b', body: falaAlf, quotedMessageId: cards[0].previewId }));
    assert.strictEqual(t.enviadas.length, nEnv, 'handler não fala nada sobre a fala entre colegas: ' + JSON.stringify(rAlf));
    assert.ok(t.h.citaLoteCheques(t.chat, cards[0].previewId), 'a ponte reconhece a citação do lote (sem orientação genérica)');
    // "pode"/"não" nunca vão ao agente.
    assert.strictEqual(t.h.chequesConversa(t.ev({ messageId: 'P0', body: 'pode', quotedMessageId: cards[0].previewId }), {}), null);
    // Conversa comum sem citar, sem Sol, sem número de cheque: não é do lote.
    assert.strictEqual(t.h.chequesConversa(t.ev({ messageId: 'C0', body: 'alguém viu o carregador?' }), { chamouASol: false }), null);
    console.log('CG-3. sem citar chamando a Sol → agente; fala entre colegas → sem "não entendi"; pode/não ficam determinísticos — OK');

    // O card VENCE (30 min) e a equipe responde "pode" nele: nada é lançado, card renovado.
    for (const p of t.h._pendentes.get(t.chat)) p.ts -= 31 * 60 * 1000;
    const velho = cards[0].previewId;
    const rp = await t.h.handle(t.ev({ messageId: 'P1', body: 'pode', quotedMessageId: velho }));
    assert.strictEqual(t.lotes.length + t.singulares.length, 0, 'pode em card vencido não grava: ' + JSON.stringify(rp));
    assert.ok(/venceu — \*nada foi lançado\*/.test(ultima(t)), ultima(t));
    const novo = t.cardsCheque();
    assert.strictEqual(novo.length, 1);
    assert.strictEqual(novo[0].itens.length, 7);
    console.log('CG-4. "pode" em card vencido → nada lançado, card renovado do estado — OK');

    // PDF reenviado ("saiu da janela") com o card vivo: aponta o card, não relê.
    const lidas = t.leiturasFeitas();
    const rr = await t.h.handle(t.pdf('PDF2', 'MALOTE-CG'));
    assert.strictEqual(rr.acao, 'cheques_lote_repetido', JSON.stringify(rr));
    // E com o card vencido: republica do estado, sem reler.
    for (const p of t.h._pendentes.get(t.chat)) p.ts -= 31 * 60 * 1000;
    const rr2 = await t.h.handle(t.pdf('PDF3', 'MALOTE-CG'));
    assert.strictEqual(t.leiturasFeitas(), lidas, 'o mesmo PDF não é relido');
    assert.ok(/já li hoje/.test(t.enviadas.map((m) => m.t).join('\n')), 'avisa que já leu');
    assert.ok(['preview_multi_aluno_enviado', 'cheques_lote_republicado'].includes(rr2.acao), JSON.stringify(rr2));
    const vivo = t.cardsCheque();
    assert.strictEqual(vivo.length, 1);
    // O "pode" no card vivo lança os 7 de uma vez, com número de cheque em cada item.
    const rpode = await t.h.handle(t.ev({ messageId: 'P2', body: 'pode', quotedMessageId: vivo[0].previewId }));
    assert.strictEqual(rpode.acao, 'lote_multi_lancado', JSON.stringify(rpode));
    assert.strictEqual(t.lotes[0].itens.length, 7);
    assert.ok(t.lotes[0].itens.every((i) => i.cheque_numero && i.cheque_banco === '341'));
    // Depois do "pode", o lote não é mais assunto: citar o card não vai ao agente.
    assert.strictEqual(t.h.chequesConversa(t.ev({ messageId: 'D1', body: 'Sol, e agora?' }), { chamouASol: true }), null);
    console.log('CG-5. PDF reenviado: card vivo → aponta; vencido → republica sem reler; "pode" lança 7 — OK');
  }

  // ================================================================== RECREIO
  for (const multiNoLote of [false, true]) {
    process.env.SOL_CHEQUES_LOTE_MULTI_FATURA = multiNoLote ? '1' : '0';
    const alunos = [
      { nome: 'Otavio Reis Campos', resp: 'Paula Campos', faturas: [{ n: 11, valor: 390 }] },
      // Irmãos da mesma mãe: R$ 400 cada (o cheque de R$ 800).
      { nome: 'Rafael Moura Braga', resp: 'Silvia Braga', faturas: [{ n: 12, valor: 400 }] },
      { nome: 'Tiago Moura Braga', resp: 'Silvia Braga', faturas: [{ n: 13, valor: 400 }] },
      { nome: 'Vera Nogueira Sales', resp: 'Wagner Sales', faturas: [{ n: 14, valor: 450 }] },
      { nome: 'Yara Freitas Leal', resp: 'Zeca Leal', faturas: [{ n: 15, valor: 330 }] },
      // Irmãos sem emitente no cadastro (o cheque 5, R$ 700).
      { nome: 'Bia Torres Melo', resp: 'Caio Melo', faturas: [{ n: 16, valor: 350 }] },
      { nome: 'Dani Torres Melo', resp: 'Caio Melo', faturas: [{ n: 17, valor: 350 }] },
    ];
    const leituras = [
      lido(1, 390, 'NAO INFORMADO', { numPapel: '000201', numero: '000210' }), // papel × CMC-7 divergem
      lido(2, 800, 'SILVIA BRAGA'),                                              // irmãos
      lido(3, 450, 'PESSOA SEM CADASTRO', { numero: '000170' }),                 // equipe digita SA000170
      lido(4, 330, 'ZECA LEAL', { extensoLido: 333 }),                           // número × extenso
      lido(5, 700, 'OUTRA PESSOA SEM CADASTRO'),                                 // irmãos, emitente fora
    ];
    const t = montar({ unidade: 'rec', leituras, alunos });
    const r1 = await t.h.handle(t.pdf('RPDF1', 'MALOTE-REC'));
    const decis = t.regs.find((e) => e.acao === 'cheques_lote_decidido').decisoes;
    assert.deepStrictEqual(decis, ['leitura', 'lancar', 'sem_parcela', 'leitura', 'sem_parcela'], JSON.stringify(decis));
    // O cheque 2 (R$ 800) é dos DOIS irmãos, sozinho: uma combinação única no mesmo mês.
    const card0 = t.cardsCheque();
    assert.strictEqual(card0.length, 1, JSON.stringify(r1));
    assert.deepStrictEqual(card0[0].faturaIdsCheque, [U(12), U(13)], 'um cheque, duas faturas, uma movimentação');
    assert.ok(/Alunos: Rafael Moura Braga e Tiago Moura Braga/.test(t.enviadas.find((m) => m.id === card0[0].previewId).t));
    console.log(`REC-1${multiNoLote ? 'b' : 'a'}. cheque de R$ 800 de irmãos → ✅ sozinho, 1 movimentação ligada às 2 faturas — OK`);

    // A equipe digita a lista SEM citar e sem chamar a Sol: o número de um cheque do lote basta.
    const lista = 'CONTROLE DE CHEQUES\n1) Número: 000201 Valor: 390,00 Emitente: Não informado Aluno: Otavio Reis\n'
      + '2) Número 000102 Valor 800,00 Alunos: Rafael e Tiago\n3) Número: SA000170 Valor: 450,00 Aluno: Vera Nogueira\n'
      + '4) Número: 000104 Valor: 330,00 Aluno: Yara Freitas\n5) Número: 000105 Valor: 700,00 Alunos: Bia Torres e Dani Torres';
    assert.ok(t.h.chequesConversa(t.ev({ messageId: 'V1', body: lista }), { chamouASol: false }), 'lista com número de cheque do lote vai ao agente');

    // O agente confirma a leitura dos cheques 1 e 4 com a lista…
    const cl = await t.tool('cheques_confirmar_leitura', { p_texto_original: lista, itens: [
      { cheque: 1, numero: '000201', valor: 390 }, { cheque: 4, valor: 330 }] });
    assert.deepStrictEqual(cl.resultados.map((x) => x.ok), [true, true], JSON.stringify(cl.resultados));
    // …e diz de quem é cada um (o 3 pelo número digitado "SA000170").
    const at = await t.tool('cheques_atribuir', { p_texto_original: lista, itens: [
      { cheque: 1, alunos: ['Otavio Reis'] }, { numero_cheque: 'SA000170', alunos: ['Vera Nogueira'] },
      { cheque: 5, alunos: ['Bia Torres', 'Dani Torres'] }] });
    assert.deepStrictEqual(at.resultados.map((x) => x.ok), [true, true, true], JSON.stringify(at.resultados));
    assert.strictEqual(at.estado, 'card_publicado', JSON.stringify(at));
    const est = await t.tool('cheques_lote_estado');
    assert.deepStrictEqual(est.lote.cheques.map((c) => c.situacao), ['lancar', 'lancar', 'lancar', 'lancar', 'lancar']);
    assert.strictEqual(est.lote.cheques[0].numero, '000201', 'número confirmado pela equipe');
    assert.strictEqual(est.lote.cheques[0].conferido_por, 'Pessoa da Equipe');
    const cards = t.cardsCheque();
    if (multiNoLote) {
      assert.strictEqual(cards.length, 1, 'com a migration: um card só');
      assert.strictEqual(cards[0].itens.length, 5);
      assert.strictEqual(cards[0].itens.filter((i) => Array.isArray(i.fatura_ids)).length, 2);
    } else {
      assert.strictEqual(cards.length, 3, 'sem a migration: card do lote + 1 card por cheque de irmãos');
      assert.ok(/vai num card separado/.test(t.enviadas.map((m) => m.t).join('\n')));
    }
    console.log(`REC-2${multiNoLote ? 'b' : 'a'}. lista digitada → leitura confirmada (1, 4), donos (1, SA000170, 5 de irmãos) → todos ✅ — OK`);

    // Recusas: nome fora da fala, número que a visão não leu, soma que não fecha.
    const t2 = montar({ unidade: 'rec', leituras, alunos });
    await t2.h.handle(t2.pdf('RPDF9', 'MALOTE-REC'));
    const rr = await t2.tool('cheques_atribuir', { p_texto_original: 'o 3 é da Vera Nogueira', itens: [{ cheque: 3, alunos: ['Yara Freitas'] }] });
    assert.strictEqual(rr.resultados[0].motivo, 'aluno_fora_da_fala');
    assert.strictEqual(rr.estado, 'nada_aconteceu');
    const rn = await t2.tool('cheques_confirmar_leitura', { p_texto_original: 'o número do 1 é 000999', itens: [{ cheque: 1, numero: '000999', valor: null }] });
    assert.strictEqual(rn.resultados[0].motivo, 'numero_nao_lido');
    const rs = await t2.tool('cheques_atribuir', { p_texto_original: 'o 3 é do Otavio Reis', itens: [{ cheque: 3, alunos: ['Otavio Reis'] }] });
    assert.strictEqual(rs.resultados[0].motivo, 'soma_nao_fecha');
    assert.ok(rs.resultados[0].parcelas_encontradas.length >= 1);
    const rl = await t2.tool('cheques_atribuir', { p_texto_original: 'o 1 é do Otavio Reis', itens: [{ cheque: 1, alunos: ['Otavio Reis'] }] });
    assert.strictEqual(rl.resultados[0].motivo, 'leitura_nao_confirmada');
    // "só confere": o cheque sai do card e não vai para o caixa.
    const rc = await t2.tool('cheques_marcar_conferencia', { p_texto_original: 'esse do 2 é só pra conferir, não lança', cheques: [2] });
    assert.strictEqual(rc.resultados[0].ok, true);
    const e2 = await t2.tool('cheques_lote_estado');
    assert.strictEqual(e2.lote.cheques[1].situacao, 'conferencia');
    assert.strictEqual(t2.cardsCheque().length, 0, 'sem ✅, sem card aprovável');
    assert.ok(/SÓ CONFERÊNCIA/.test(ultima(t2)));
    console.log(`REC-3${multiNoLote ? 'b' : 'a'}. recusas com motivo (nome fora da fala, nº não lido, soma não fecha, leitura pendente) e "só confere" — OK`);

    // O "pode": cada cheque vira UMA movimentação; o de irmãos leva as duas faturas.
    for (const c of t.cardsCheque()) await t.h.handle(t.ev({ messageId: 'OK' + c.previewId, body: 'pode', quotedMessageId: c.previewId }));
    const movs = t.db.movimentos;
    assert.strictEqual(movs.length, 5, 'um movimento por cheque: ' + movs.length);
    const irmaos = movs.find((m) => Number(m.valor) === 800);
    assert.deepStrictEqual(irmaos.faturas, [U(12), U(13)]);
    assert.strictEqual(new Set(movs.map((m) => m.cheque_numero)).size, 5, 'números distintos');
    if (!multiNoLote) {
      const simples800 = t.singulares.find((p) => Number(p.valor) === 800);
      assert.deepStrictEqual(simples800.fatura_ids, [U(12), U(13)], 'lançamento simples liga as 2 faturas');
      assert.strictEqual(simples800.forma, 'cheque');
    }
    console.log(`REC-4${multiNoLote ? 'b' : 'a'}. "pode" → 5 movimentações, a de R$ 800 ligada às 2 faturas — OK`);
  }

  // ================================================================== mesma parcela
  {
    // Sombra com dado real (06/10) achou: a equipe diz que DOIS cheques são do mesmo
    // aluno e só há UMA parcela. A ferramenta aceita o pedido, mas nenhum entra — e o
    // agente fica sabendo o porquê (aviso), em vez de "ok" seco. O estado só diz
    // card_publicado quando há card aprovável de verdade.
    const t = montar({ unidade: 'cg', leituras: [lido(1, 367, 'NINGUEM UM'), lido(2, 367, 'NINGUEM DOIS')],
      alunos: [{ nome: 'Ana Clara Souza', resp: 'Marcos Souza', faturas: [{ n: 1, valor: 367 }] }] });
    await t.h.handle(t.pdf('M1', 'MALOTE-M'));
    const fala = 'o 1 e o 2 são da Ana Clara';
    const r = await t.tool('cheques_atribuir', { p_texto_original: fala, itens: [{ cheque: 1, alunos: ['Ana Clara'] }, { cheque: 2, alunos: ['Ana Clara'] }] });
    assert.strictEqual(r.estado, 'mensagem_publicada', JSON.stringify(r));
    assert.ok(r.resultados.every((x) => x.ok && x.situacao_final === 'sem_parcela' && /mesma parcela/.test(x.aviso)), JSON.stringify(r.resultados));
    assert.strictEqual(t.cardsCheque().length, 0);
    assert.ok(/apontam para a mesma parcela/.test(ultima(t)));
    console.log('MP-1. dois cheques para a mesma parcela → nenhum entra, aviso ao agente, sem card fantasma — OK');
  }

  // ================================================================== interruptor
  {
    process.env.SOL_CHEQUES_AGENTE = '0';
    const t = montar({ unidade: 'cg', leituras: [lido(1, 367, 'MARCOS SOUZA'), lido(2, 420, 'NINGUEM')],
      alunos: [{ nome: 'Ana Clara Souza', resp: 'Marcos Souza', faturas: [{ n: 1, valor: 367 }] },
        { nome: 'Bruno Lima Teixeira', resp: 'Carla Teixeira', faturas: [{ n: 2, valor: 420 }] }] });
    await t.h.handle(t.pdf('X1', 'MALOTE-X'));
    const card = t.cardsCheque()[0].previewId;
    assert.strictEqual(t.h.chequesConversa(t.ev({ messageId: 'X2', body: 'Sol, o 2 é do Bruno Lima', quotedMessageId: card }), { chamouASol: true }), null);
    const r = await t.tool('cheques_atribuir', { p_texto_original: 'o 2 é do Bruno Lima', itens: [{ cheque: 2, alunos: ['Bruno Lima'] }] });
    assert.strictEqual(r.estado, 'nada_aconteceu');
    assert.strictEqual(r.motivo, 'cheques_agente_desligado');
    // Fallback: o atalho antigo continua funcionando.
    const rf = await t.h.handle(t.ev({ messageId: 'X3', body: '2 é do Bruno Lima Teixeira', quotedMessageId: card }));
    assert.ok(['preview_cheque_enviado', 'cheques_identificacao'].includes(rf.acao), JSON.stringify(rf));
    process.env.SOL_CHEQUES_AGENTE = '1';
    console.log('SW-1. agente desligado → ferramenta recusa com motivo; atalho antigo segue de fallback — OK');
  }
  console.log('\ncheques-conversa-agente: tudo verde');
})().catch((e) => { console.error('✗', e && e.stack || e); process.exit(1); });
