#!/usr/bin/env node
'use strict';
// Caso real Barra, 06/10/2026 12:05 BRT (nomes FICTÍCIOS aqui).
//
// Foto do PagBank "VENDA DEBITO MAESTRO R$100,00" com a legenda
//   "Venda caderno teclas para o aluno <Aluno>\n\nVenda <Professor>\n\nDébito: R$ 100"
// O interpretador listou <Aluno> e <Professor> como DOIS pagamentos, o portão do
// multi-aluno abriu (os dois nomes estão na legenda) e a Sol respondeu
//   "⚠️ Entendi a divisão, mas a soma dos alunos não fecha com o valor do
//    comprovante — confere os valores. Não lanço parcialmente."
// Era UMA venda de lojinha; "Venda <Professor>" é quem vendeu (comissão).
//
// O que este teste prende:
//   1. vendedor reconhecido pelo cadastro ATIVO da equipe não vira item nem multi;
//   2. a descrição (card = confirmação = banco) leva o vendedor;
//   3. "venda prof X" no meio da frase também;
//   4. vendedor que NÃO está na equipe: nada de vendedor inventado (caminho antigo);
//   5. dois alunos de verdade continuam no multi;
//   6. aluno com grafia diferente do cadastro: pergunta "É …?", "pode" travado,
//      "sim" de outra pessoa não vale, "sim" do autor ajusta o card;
//   7. 2+ parecidos (irmãos): lista sem escolher;
//   8. nada lança sem "pode".
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
delete process.env.SOL_CAIXA_V4_CANARIO;
delete process.env.SOL_CAIXA_TOOLS_CANARIO;
const mod = require('./_alvo.cjs');

const CHAT = 'barra-teste@g.us';
const UNIDADE = 'u-barra-teste';
const AUTOR = '5521900000101';
const COLEGA = '5521900000102';

const PROF_DITADO = 'Rafael Montenegro';
const PROF_CADASTRO = 'Rafael Montenegro Sales Pinto';
const ALUNO_CADASTRO = 'Tiago Ávila de Souza Prado';
const ALUNO_DITADO = "Tiago D'avila";
const IRMAO = 'Lucas D’Ávila de Souza Prado';

const OCR_PAGBANK = 'PagBank\nVIA ESTABELECIMENTO\nLA MUSIC BARRA\nVENDA DEBITO MAESTRO\nVALOR R$100,00\nAUT 004411';
const EQUIPE = [
  { nome: PROF_CADASTRO, prof: true },
  { nome: PROF_CADASTRO, prof: true },          // professores + colaboradores: a MESMA pessoa
  { nome: 'Kailane Barbosa Lima', prof: false },
  { nome: 'Bruna Teixeira', prof: false },
];

function novo({ legendaAluno = ALUNO_CADASTRO, pagamentos = null, sugestoes = [], equipe = EQUIPE,
  equipeErro = false, ocr = OCR_PAGBANK, valor = 100 } = {}) {
  const enviadas = []; const logs = []; const lancados = []; const lotes = [];
  const resolverCalls = []; const equipeCalls = []; const sugerirCalls = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return 'SOL' + (++seq); },
    ocrFn: async () => ({ text: ocr, status: 'ok', file_bytes: 224560 + seq }),
    visaoFn: async () => ({ valor, forma: 'cartao' }),
    // o que o modelo devolveu no caso real: as DUAS pessoas como pagamentos
    interpretarFn: async () => ({ categoria: 'lojinha', aluno: legendaAluno, competencia: null, forma: 'cartao',
      pagamentos: pagamentos || [{ aluno: legendaAluno, valor: null }, { aluno: PROF_DITADO, valor: null }] }),
    interpretarMultiFn: async () => null,
    resolverMultiFn: async (args) => { resolverCalls.push(args); return { ok: false, motivo: 'soma_itens_divergente' }; },
    sugerirAlunoFn: async (args) => { sugerirCalls.push(args);
      return { ok: true, candidatos: sugestoes.map((n) => ({ aluno_nome: n, similaridade: 0.5 })) }; },
    equipeFn: async () => { equipeCalls.push(1); if (equipeErro) throw new Error('GET professores 500'); return equipe; },
    canonicaFn: async () => null, casarFn: async () => null, faturasMesFn: async () => null, pagadorFn: async () => null,
    responsavelFn: async (_u, nome) => (/tiago/i.test(nome) ? { aluno_nome: ALUNO_CADASTRO, responsavel_nome: 'Helena Prado' } : null),
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Equipe Barra' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV' + lancados.length, valor: Number(p.valor), forma: p.forma }; },
    lancarLoteFn: async (p) => { lotes.push(p); return { ok: true, lote_id: 'L1', movimentacoes: [] }; },
    log: (o) => logs.push(o),
  });
  return { h, enviadas, logs, lancados, lotes, resolverCalls, equipeCalls, sugerirCalls };
}
let n = 0;
const ev = (o) => ({ chatId: CHAT, senderPhone: AUTOR, senderId: AUTOR, messageId: 'M' + (++n), hasMedia: false, ...o });
const foto = (T, legenda) => T.h.handle(ev({ body: legenda, hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pagbank.jpg'] }));
const ultimo = (a) => String(a[a.length - 1] || '');
const todas = (T) => T.enviadas.join('\n----\n');

(async () => {
  const falhas = [];
  const ok = (c, m) => { if (!c) falhas.push(m); };

  // ── 0. leitura pura do texto ──────────────────────────────────────────────
  {
    const vc = mod._vendedoresCitados;
    ok(typeof vc === 'function', '0: _vendedoresCitados precisa existir');
    if (typeof vc === 'function') {
      const a = vc(`Venda caderno teclas para o aluno ${ALUNO_DITADO}\n\nVenda ${PROF_DITADO}\n\nDébito: R$ 100`);
      ok(a.length === 1 && a[0].declarado === PROF_DITADO && !a[0].explicito, '0: "Venda <Nome>" em linha própria: ' + JSON.stringify(a));
      const b = vc(`Venda de caderno para aluna Maria Souza venda prof ${PROF_DITADO} crédito 1x`);
      ok(b.length === 1 && b[0].declarado === PROF_DITADO && b[0].prof, '0: "venda prof X" no meio: ' + JSON.stringify(b));
      ok(vc('Venda realizada no cartão').length === 0, '0: "venda realizada" não é nome');
      ok(vc('Venda de corda para a aluna Ana Lima Valor:60 reais pix').length === 0, '0: "venda de corda" não é nome');
      ok(mod._casaNomeEquipe(PROF_DITADO, PROF_CADASTRO) === true, '0: ditado deveria casar o cadastro');
      ok(mod._casaNomeEquipe('Rafael Moreira', PROF_CADASTRO) === false, '0: sobrenome diferente não casa');
    }
  }

  // ── 1. o caso real: 1 venda, vendedor professor, nada de multi ────────────
  {
    const T = novo();
    const legenda = `Venda caderno teclas para o aluno ${ALUNO_CADASTRO}\n\nVenda ${PROF_DITADO}\n\nDébito: R$ 100`;
    const r = await foto(T, legenda);
    const card = ultimo(T.enviadas);
    const desc = `Lojinha/Venda - Caderno de Teclas - ${ALUNO_CADASTRO} · venda prof. ${PROF_DITADO}`;
    console.log('1.', r && r.acao, '|', card.split('\n').filter(Boolean).slice(0, 12).join(' | ').slice(0, 260));
    ok(r && r.acao === 'preview_enviado', '1: esperava card de lojinha; veio ' + (r && r.acao));
    ok(!/soma dos alunos/i.test(todas(T)), '1: "soma dos alunos não fecha" não pode aparecer');
    ok(!/Entendi a divis/i.test(todas(T)), '1: não é divisão de alunos');
    ok(T.resolverCalls.length === 0, '1: resolver multi-aluno não pode ser chamado');
    ok(!T.logs.some((l) => /^multi_/.test(String(l.acao || ''))), '1: nenhum log multi_*');
    ok(card.includes(ALUNO_CADASTRO), '1: card deveria trazer o aluno comprador');
    ok(!new RegExp(`\\*ALUNO\\*[\\s\\S]*${PROF_DITADO}[\\s\\S]*\\*LAN`).test(card), '1: professor não pode aparecer como ALUNO');
    ok(card.includes(desc), '1: card deveria mostrar a descrição com vendedor: ' + desc);
    ok(T.lancados.length === 0, '1: nada lança antes do pode');
    const rp = await T.h.handle(ev({ body: 'pode' }));
    const conf = ultimo(T.enviadas);
    console.log('1. pode:', rp && rp.acao, '|', conf.split('\n')[0].slice(0, 200));
    ok(T.lancados.length === 1, '1: o pode deveria lançar uma vez; lançou ' + T.lancados.length);
    const p = T.lancados[0] || {};
    ok(p.descricao === desc, `1: banco deveria gravar "${desc}"; veio "${p.descricao}"`);
    ok(p.categoria === 'lojinha' && Number(p.valor) === 100, '1: lojinha R$ 100');
    ok(p.aluno === ALUNO_CADASTRO, '1: aluno do payload é o comprador; veio ' + p.aluno);
    ok(conf.includes(desc), '1: confirmação deveria trazer a mesma descrição');
  }

  // ── 2. "venda prof X" no meio do texto ────────────────────────────────────
  {
    const T = novo({ ocr: OCR_PAGBANK.replace('DEBITO MAESTRO', 'CREDITO MASTERCARD') });
    const legenda = `Venda de caderno para aluno ${ALUNO_CADASTRO} venda prof ${PROF_DITADO} crédito 1x R$ 100`;
    const r = await foto(T, legenda);
    const card = ultimo(T.enviadas);
    console.log('2.', r && r.acao, '|', (card.match(/📝[^\n]*/) || [''])[0]);
    ok(r && r.acao === 'preview_enviado', '2: card de lojinha; veio ' + (r && r.acao));
    ok(T.resolverCalls.length === 0 && !/soma dos alunos/i.test(todas(T)), '2: sem multi');
    ok(card.includes(`· venda prof. ${PROF_DITADO}`), '2: descrição com o vendedor');
  }

  // ── 3. vendedor que NÃO é da equipe: não inventa vendedor ─────────────────
  {
    const T = novo({ pagamentos: [{ aluno: ALUNO_CADASTRO, valor: null }, { aluno: 'Joana Pereira', valor: null }] });
    const legenda = `Venda caderno teclas para o aluno ${ALUNO_CADASTRO}\n\nVenda Joana Pereira\n\nDébito: R$ 100`;
    const r = await foto(T, legenda);
    console.log('3.', r && r.acao);
    ok(T.equipeCalls.length >= 1, '3: a equipe deveria ser consultada');
    ok(!/venda prof|· venda /i.test(todas(T)), '3: nenhum vendedor inventado');
    ok(T.resolverCalls.length === 1, '3: sem vendedor reconhecido, o caminho antigo (multi) segue');
    ok(T.lancados.length === 0, '3: nada lançado');
  }

  // ── 3b. cadastro da equipe fora do ar: comportamento antigo, sem quebrar ──
  {
    const T = novo({ equipeErro: true });
    const r = await foto(T, `Venda caderno teclas para o aluno ${ALUNO_CADASTRO}\n\nVenda ${PROF_DITADO}\n\nDébito: R$ 100`);
    console.log('3b.', r && r.acao);
    ok(T.logs.some((l) => l.acao === 'vendedor_equipe_erro'), '3b: erro da equipe deveria ser logado');
    ok(!/venda prof/i.test(todas(T)), '3b: sem cadastro, sem vendedor');
    ok(T.lancados.length === 0, '3b: nada lançado');
  }

  // ── 4. dois alunos de verdade continuam no multi ──────────────────────────
  {
    const T = novo({ pagamentos: [{ aluno: 'Ana Lima Duarte', valor: null }, { aluno: 'Bruno Reis Costa', valor: null }],
      legendaAluno: null });
    const r = await foto(T, 'Venda de 2 cadernos para os alunos Ana Lima Duarte e Bruno Reis Costa R$ 100 débito');
    console.log('4.', r && r.acao);
    ok(T.resolverCalls.length === 1, '4: dois alunos de verdade seguem no multi');
    ok(!/venda prof/i.test(todas(T)), '4: sem vendedor');
    ok(T.lancados.length === 0, '4: nada lançado');
  }

  // ── 5. aluno com grafia diferente: pergunta, "pode" travado, "sim" do autor ─
  {
    const T = novo({ legendaAluno: ALUNO_DITADO, sugestoes: [ALUNO_CADASTRO],
      pagamentos: [{ aluno: ALUNO_DITADO, valor: null }, { aluno: PROF_DITADO, valor: null }] });
    const legenda = `Venda caderno teclas para o aluno ${ALUNO_DITADO}\n\nVenda ${PROF_DITADO}\n\nDébito: R$ 100`;
    const r = await foto(T, legenda);
    const card = ultimo(T.enviadas);
    console.log('5.', r && r.acao, '|', (card.match(/⚠️ Não achei[^\n]*/) || [''])[0]);
    ok(r && r.acao === 'preview_enviado', '5: card; veio ' + (r && r.acao));
    ok(T.sugerirCalls.length === 1, '5: a sugestão deveria ser consultada para o aluno da lojinha');
    ok(card.includes(`É *${ALUNO_CADASTRO}*?`), '5: card deveria perguntar "É <cadastro>?"');
    ok(!/soma dos alunos/i.test(todas(T)), '5: sem "soma dos alunos"');
    const rp = await T.h.handle(ev({ body: 'pode' }));
    console.log('5. pode antes do sim:', rp && rp.acao);
    ok(T.lancados.length === 0, '5: "pode" com pergunta aberta NÃO lança');
    ok(/Não lancei/i.test(ultimo(T.enviadas)), '5: deveria explicar que não lançou');
    const rOutro = await T.h.handle(ev({ body: 'sim', senderPhone: COLEGA, senderId: COLEGA }));
    console.log('5. sim de outra pessoa:', rOutro && rOutro.acao);
    ok(!T.enviadas.some((t) => /Ajustei o aluno/.test(t)), '5: "sim" de outra pessoa não ajusta');
    const rs = await T.h.handle(ev({ body: 'sim' }));
    const card2 = ultimo(T.enviadas);
    const desc = `Lojinha/Venda - Caderno de Teclas - ${ALUNO_CADASTRO} · venda prof. ${PROF_DITADO}`;
    console.log('5. sim do autor:', rs && rs.acao, '|', (card2.match(/📝[^\n]*/) || [''])[0]);
    ok(rs && rs.acao === 'sugestao_nome_lojinha_confirmada', '5: "sim" do autor ajusta; veio ' + (rs && rs.acao));
    ok(card2.includes(desc) && card2.includes('Helena Prado'), '5: card novo com nome do cadastro, vendedor e responsável');
    ok(T.lancados.length === 0, '5: o "sim" não lança');
    await T.h.handle(ev({ body: 'pode' }));
    ok(T.lancados.length === 1, '5: depois do sim, o pode lança; lançou ' + T.lancados.length);
    ok((T.lancados[0] || {}).descricao === desc, '5: banco grava a descrição do card; veio ' + (T.lancados[0] || {}).descricao);
    ok((T.lancados[0] || {}).aluno === ALUNO_CADASTRO, '5: aluno do cadastro no payload');
  }

  // ── 6. irmãos parecidos: lista sem escolher, "sim" não escolhe ────────────
  {
    const T = novo({ legendaAluno: ALUNO_DITADO, sugestoes: [ALUNO_CADASTRO, IRMAO],
      pagamentos: [{ aluno: ALUNO_DITADO, valor: null }, { aluno: PROF_DITADO, valor: null }] });
    await foto(T, `Venda caderno teclas para o aluno ${ALUNO_DITADO}\n\nVenda ${PROF_DITADO}\n\nDébito: R$ 100`);
    const card = ultimo(T.enviadas);
    console.log('6.', (card.match(/⚠️ Não achei[^\n]*/) || [''])[0].slice(0, 200));
    ok(card.includes(ALUNO_CADASTRO) && card.includes(IRMAO) && /não escolho/i.test(card), '6: lista os dois e não escolhe');
    await T.h.handle(ev({ body: 'sim' }));
    ok(!T.enviadas.some((t) => /Ajustei o aluno/.test(t)), '6: "sim" com 2+ candidatos não escolhe');
    await T.h.handle(ev({ body: 'pode' }));
    ok(T.lancados.length === 0, '6: "pode" com aluno ambíguo não lança');
  }

  // ── 7. a mesma venda DITADA por texto (sem foto): mesma descrição ─────────
  {
    const T = novo();
    const r = await T.h.handle(ev({ body: `Venda caderno teclas para o aluno ${ALUNO_CADASTRO}\nVenda ${PROF_DITADO}\nR$ 100 cartão débito` }));
    const card = ultimo(T.enviadas);
    console.log('7.', r && r.acao, '|', (card.match(/📝[^\n]*/) || [''])[0]);
    ok(card.includes(`${ALUNO_CADASTRO} · venda prof. ${PROF_DITADO}`), '7: card do ditado com o vendedor');
    ok(T.lancados.length === 0, '7: nada lança sem pode');
    await T.h.handle(ev({ body: 'pode' }));
    ok(T.lancados.length === 1 && /venda prof\. Rafael Montenegro$/.test(String((T.lancados[0] || {}).descricao)),
      '7: banco com o vendedor; veio ' + JSON.stringify(T.lancados.map((x) => x.descricao)));
  }

  // ── 8. apelido/registro mesclado (06/10, Alf: "Gabriel Leão" é nome do Emusys) ──
  {
    const CAD = 'Caio Santos Pereira da Silva';
    const eq = [{ nome: CAD, prof: true, match: `${CAD} Caio Leão` }, { nome: 'Caio Barbosa Rufino', prof: true }];
    for (const dit of ['Caio Leão', 'Caio Pereira Leão']) {
      const T = novo({ equipe: eq });
      const r = await foto(T, `Venda de caderno para aluno ${ALUNO_CADASTRO} venda prof ${dit} débito R$ 100`);
      const card = ultimo(T.enviadas);
      ok(r && r.acao === 'preview_enviado', `8 (${dit}): card de lojinha; veio ` + (r && r.acao));
      ok(T.resolverCalls.length === 0 && !/soma dos alunos/i.test(todas(T)), `8 (${dit}): sem multi`);
      ok(card.includes(`· venda prof. ${dit}`), `8 (${dit}): vendedor reconhecido pelo apelido`);
    }
    const T2 = novo({ equipe: eq });
    await foto(T2, `Venda de caderno para aluno ${ALUNO_CADASTRO} venda prof Caio débito R$ 100`);
    ok(!/· venda prof\. Caio\b/.test(ultimo(T2.enviadas)), '8: "Caio" sozinho (2 Caios) não escolhe vendedor');
  }

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — vendedor da equipe não vira aluno, descrição leva o vendedor, nome parecido vira pergunta');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
