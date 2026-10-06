#!/usr/bin/env node
'use strict';

// CG, 05/10/2026: comprovante de dois alunos, um nome digitado com uma letra a
// mais no primeiro nome. O resolver devolveu `aluno_nao_encontrado` e a Sol só
// disse "confere o nome completo" — a equipe, que via o nome certo, travou 3x e
// descartou. Agora, com UM aluno parecido na unidade, ela pergunta "É Fulana?";
// o "sim" de QUEM MANDOU refaz a resolução com o nome do cadastro e segue para o
// preview de sempre. Nada é lançado sem o "pode".
//
// Nomes FICTÍCIOS (o caso real não entra no repositório). Handler real,
// sendFn/lancarLoteFn fakes: nada vai ao WhatsApp nem ao caixa.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
delete process.env.SOL_CAIXA_V4_CANARIO;
delete process.env.SOL_CAIXA_TOOLS_CANARIO;
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const AUTORA = '5521933330001';
const COLEGA = '5521933330002';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

const DIGITADO = 'Isabelle Fontana';
const CADASTRO = 'Isabele Fontana';
const OUTRO = 'Marcos Teixeira';
const CAPTION = `Parcelas 10/2026\n${DIGITADO} - R$ 400,00\n${OUTRO} - R$ 350,00\nLA CG - R$ 750,00 pix`;

// Cadastro fake: só estes nomes resolvem. `motivoFalha` escolhe a recusa.
function novo({ sugestoes = [CADASTRO], sugerirErro = false, motivoFalha = 'aluno_nao_encontrado' } = {}) {
  const enviadas = []; const ids = []; const logs = []; const lotes = []; const resolverCalls = []; const sugerirCalls = [];
  let seq = 0;
  const cadastro = { [norm(CADASTRO)]: CADASTRO, [norm(OUTRO)]: OUTRO };
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: 'Comprovante Pix\nValor R$ 750,00\nDestino ESCOLA DE MUSICA L A', status: 'ok', file_bytes: 40000 }),
    visaoFn: async () => ({ valor: 750, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: null, competencia: '10/2026', forma: 'pix' }),
    interpretarMultiFn: async () => ({ tipo_recebimento: 'multi_aluno', valor_total: 750, forma: 'pix', categoria: 'parcela',
      itens: [{ aluno_nome: DIGITADO, valor: 400, categoria: 'parcela' }, { aluno_nome: OUTRO, valor: 350, categoria: 'parcela' }] }),
    resolverMultiFn: async (args) => {
      resolverCalls.push(JSON.parse(JSON.stringify(args)));
      const itens = args.itens || [];
      for (let i = 0; i < itens.length; i++) {
        if (!cadastro[norm(itens[i].aluno_nome)]) {
          return { ok: false, motivo: motivoFalha, ordem: String(i + 1), aluno_nome: itens[i].aluno_nome };
        }
      }
      return { ok: true, valor_total: 750, soma_itens: 750, itens: itens.map((it, i) => ({
        ordem: i + 1, aluno_nome: cadastro[norm(it.aluno_nome)], valor: Number(it.valor), categoria: 'parcela',
        competencia: '10/2026', canonical_fatura_id: `0000000${i + 1}-1111-4111-8111-111111111111`,
        sem_vinculo_fatura: false, declarado_pelo_humano: false,
        fatura: { status: 'paga', data_pagamento: '2026-10-05', forma_pagamento: { nome: 'Pix' } } })) };
    },
    sugerirAlunoFn: async (args) => {
      sugerirCalls.push(args);
      if (sugerirErro) throw new Error('sugerir aluno: HTTP 404');
      return { ok: true, candidatos: sugestoes.map((n) => ({ aluno_nome: n, similaridade: 0.6 })) };
    },
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Equipe CG' }),
    lancarFn: async () => { throw new Error('lancamento single nao deveria acontecer'); },
    lancarLoteFn: async (p) => { lotes.push(p); return { ok: true, lote_id: 'L1', movimentacoes: [] }; },
    log: (o) => logs.push(o),
  });
  return { h, enviadas, ids, logs, lotes, resolverCalls, sugerirCalls };
}

const falhas = [];
const ok = (c, m) => { if (!c) falhas.push(m); };
const ev = (o) => ({ chatId: CHAT, senderPhone: AUTORA, senderId: AUTORA + '@lid', hasMedia: false, ...o });
const comprovante = (T, id = 'IMG1') => T.h.handle(ev({ messageId: id, body: CAPTION, hasMedia: true,
  mediaType: 'image', mediaUrls: ['fake://pix.jpg'] }));
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  // ── 1. UM candidato claro: pergunta, não lança ────────────────────────────
  {
    const T = novo();
    const r = await comprovante(T);
    const msg = ultimo(T.enviadas);
    console.log('1. um candidato:', r && r.acao, '|', msg.split('\n')[0].slice(0, 120));
    ok(r && r.acao === 'sugestao_nome_perguntada', '1: esperava pergunta de sugestão; veio ' + (r && r.acao));
    ok(msg.includes(`*${DIGITADO}*`) && msg.includes(`É *${CADASTRO}*?`), '1: pergunta deveria citar o digitado e o sugerido');
    ok(/Responde \*sim\* que eu sigo com os dois/.test(msg), '1: pergunta deveria pedir *sim* e falar "os dois"');
    ok(!/confere o nome completo/.test(msg), '1: não deveria repetir o beco "confere o nome completo"');
    ok(T.sugerirCalls.length === 1 && T.sugerirCalls[0].unidade_id === UNIDADE && T.sugerirCalls[0].nome === DIGITADO,
      '1: sugestão deveria ser buscada na MESMA unidade, com o nome digitado');
    ok(T.lotes.length === 0, '1: nada pode ter sido lançado');
    ok(!T.logs.some((l) => JSON.stringify(l).includes(CADASTRO) || JSON.stringify(l).includes(DIGITADO)),
      '1: log não deveria carregar nome de aluno');
    ok(T.h.deveTratarComplementoDeterministico(ev({ messageId: 'GATE', body: 'sim' })) === true,
      '1: "sim" da autora deveria ficar no trilho determinístico (não ir ao modelo)');
    ok(T.h.deveTratarComplementoDeterministico(ev({ messageId: 'GATE2', senderPhone: COLEGA, senderId: COLEGA + '@lid', body: 'sim' })) === false,
      '1: "sim" da colega sem citar não deveria ser desviado para a sugestão');

    // ── 2. "pode" antes do "sim": continua sem lançar ───────────────────────
    const rp = await T.h.handle(ev({ messageId: 'PODE0', body: 'pode' }));
    console.log('2. "pode" antes do sim:', rp && rp.acao);
    ok(T.lotes.length === 0, '2: "pode" sobre a pergunta lançou algo');

    // ── 3. "sim" de OUTRA pessoa não vale (sem citar e citando) ──────────────
    const chamadasAntes = T.resolverCalls.length;
    const rOutro = await T.h.handle(ev({ messageId: 'SIM-COLEGA', senderPhone: COLEGA, senderId: COLEGA + '@lid', body: 'Sim' }));
    console.log('3a. "sim" da colega sem citar:', rOutro && rOutro.acao);
    ok(T.resolverCalls.length === chamadasAntes, '3a: "sim" da colega refez a resolução');
    ok(!/preview_multi/.test(String(rOutro && rOutro.acao)), '3a: "sim" da colega gerou preview');
    const idPergunta = T.ids[T.enviadas.findIndex((t) => t.includes(`É *${CADASTRO}*?`))];
    const rOutroQ = await T.h.handle(ev({ messageId: 'SIM-COLEGA-Q', senderPhone: COLEGA, senderId: COLEGA + '@lid',
      body: 'sim', quotedMessageId: idPergunta }));
    console.log('3b. "sim" da colega citando:', rOutroQ && rOutroQ.acao);
    ok(rOutroQ && rOutroQ.acao === 'sugestao_nome_sim_de_outro_autor', '3b: citação da colega deveria ser recusada com explicação');
    ok(T.resolverCalls.length === chamadasAntes && T.lotes.length === 0, '3b: "sim" da colega citando refez/lançou');

    // ── 4. "sim" da autora: refaz com o nome do cadastro e vai ao preview ────
    const rSim = await T.h.handle(ev({ messageId: 'SIM-AUTORA', body: 'Sim, é ela' }));
    const card = ultimo(T.enviadas);
    console.log('4. "sim" da autora:', rSim && rSim.acao);
    ok(rSim && /preview_multi/.test(String(rSim.acao)), '4: "sim" da autora deveria gerar o preview do lote; veio ' + (rSim && rSim.acao));
    const ultimaChamada = T.resolverCalls[T.resolverCalls.length - 1];
    ok(ultimaChamada && ultimaChamada.itens.map((i) => i.aluno_nome).join('|') === `${CADASTRO}|${OUTRO}`,
      '4: o resolver deveria rodar de novo com o nome do CADASTRO no item recusado e o outro intacto');
    ok(card.includes(CADASTRO) && card.includes(OUTRO), '4: preview deveria listar os dois alunos do cadastro');
    ok(T.lotes.length === 0, '4: "sim" não pode lançar — só o "pode" no preview');
    const pend = T.h._pendentes.get(CHAT) || [];
    ok(!pend.some((p) => p.tipoOperacao === 'manual_review_multi_student'), '4: a revisão da pergunta deveria ter morrido');

    // ── 5. segundo "sim" não reabre nada ────────────────────────────────────
    const nPrev = T.enviadas.length;
    const rSim2 = await T.h.handle(ev({ messageId: 'SIM-AUTORA-2', body: 'sim' }));
    console.log('5. segundo "sim":', rSim2 && rSim2.acao);
    ok(!/preview_multi|sugestao_nome/.test(String(rSim2 && rSim2.acao)), '5: segundo "sim" reabriu o fluxo');
    ok(T.lotes.length === 0, '5: segundo "sim" lançou');
    ok(!T.enviadas.slice(nPrev).some((t) => t.includes(CADASTRO)), '5: segundo "sim" mandou outro card/pergunta');

    // ── 6. o "pode" humano no preview é o que lança ─────────────────────────
    await T.h.handle(ev({ messageId: 'PODE1', body: 'pode' }));
    console.log('6. "pode" no preview: lotes =', T.lotes.length);
    ok(T.lotes.length === 1, `6: "pode" no preview deveria lançar o lote; lançou ${T.lotes.length}`);
    const nomesLote = JSON.stringify(T.lotes[0] || {});
    ok(nomesLote.includes(CADASTRO) && !nomesLote.includes(DIGITADO), '6: lote deveria sair com o nome do cadastro');
  }

  // ── 7. ZERO candidatos: comportamento antigo ─────────────────────────────
  {
    const T = novo({ sugestoes: [] });
    const r = await comprovante(T);
    const msg = ultimo(T.enviadas);
    console.log('7. zero candidatos:', r && r.acao);
    ok(r && r.acao === 'manual_review_multi_student', '7: sem candidato deveria manter a revisão de sempre');
    ok(/confere o nome completo/.test(msg) && !/É \*/.test(msg), '7: mensagem antiga, sem pergunta');
    const n = T.resolverCalls.length;
    await T.h.handle(ev({ messageId: 'SIM7', body: 'sim' }));
    ok(T.resolverCalls.length === n && T.lotes.length === 0, '7: "sim" sem pergunta aberta não pode refazer nem lançar');
  }

  // ── 8. 2+ candidatos: lista até 3, não escolhe ───────────────────────────
  {
    const T = novo({ sugestoes: ['Isabela Fontana', 'Isabele Fontana', 'Isadora Fontana', 'Isabel Fontana'] });
    const r = await comprovante(T);
    const msg = ultimo(T.enviadas);
    console.log('8. quatro candidatos:', r && r.acao, '|', msg.slice(0, 160).replace(/\n/g, ' '));
    ok(r && r.acao === 'manual_review_multi_student', '8: 2+ candidatos não pode virar pergunta de sim');
    ok(/Os mais parecidos/.test(msg) && /não escolho por você/.test(msg), '8: deveria listar e dizer que não escolhe');
    ok(msg.includes('*Isabela Fontana*') && msg.includes('*Isadora Fontana*') && !msg.includes('Isabel Fontana*'),
      '8: deveria listar no máximo 3');
    ok(/\(e outros\)/.test(msg), '8: com 4 deveria indicar que há outros');
    const n = T.resolverCalls.length;
    await T.h.handle(ev({ messageId: 'SIM8', body: 'sim' }));
    ok(T.resolverCalls.length === n && T.lotes.length === 0, '8: "sim" com lista não pode escolher');
  }

  // ── 9. RPC de sugestão fora do ar / não aplicada: mensagem antiga ────────
  {
    const T = novo({ sugerirErro: true });
    const r = await comprovante(T);
    console.log('9. sugestão com erro:', r && r.acao);
    ok(r && r.acao === 'manual_review_multi_student' && /confere o nome completo/.test(ultimo(T.enviadas)),
      '9: falha da RPC de sugestão deveria cair na mensagem antiga');
  }

  // ── 10. candidato que já é o OUTRO item do comprovante é descartado ──────
  {
    const T = novo({ sugestoes: [OUTRO] });
    const r = await comprovante(T);
    console.log('10. candidato = outro item:', r && r.acao);
    ok(r && r.acao === 'manual_review_multi_student' && !/É \*/.test(ultimo(T.enviadas)),
      '10: não pode sugerir aluno que já está no mesmo comprovante');
  }

  // ── 11. aluno_baixa_confianca também pergunta ────────────────────────────
  {
    const T = novo({ motivoFalha: 'aluno_baixa_confianca' });
    const r = await comprovante(T);
    console.log('11. baixa confiança:', r && r.acao);
    ok(r && r.acao === 'sugestao_nome_perguntada', '11: baixa confiança com 1 candidato deveria perguntar');
  }

  // ── 12. nome_ambiguo NÃO usa sugestão (já lista os homônimos) ────────────
  {
    const T = novo({ motivoFalha: 'nome_ambiguo' });
    const r = await comprovante(T);
    console.log('12. nome ambíguo:', r && r.acao, '| sugerir chamado:', T.sugerirCalls.length);
    ok(r && r.acao === 'manual_review_multi_student' && T.sugerirCalls.length === 0, '12: nome_ambiguo não deveria buscar sugestão');
  }

  // ── 13. "sim" com conversa junto não é confirmação ───────────────────────
  {
    const T = novo();
    await comprovante(T);
    const n = T.resolverCalls.length;
    for (const t of ['sim mas espera', 'Sim, vou ver com a mãe', 'simone pagou?']) {
      await T.h.handle(ev({ messageId: 'X' + t, body: t }));
    }
    console.log('13. frases que não confirmam: resolver chamado de novo =', T.resolverCalls.length - n);
    ok(T.resolverCalls.length === n && T.lotes.length === 0, '13: frase que não é confirmação refez a resolução');
  }

  await sleep(10);
  if (falhas.length) { console.log('\nRESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('\nRESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
