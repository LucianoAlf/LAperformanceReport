// SOL-134 — EXCEDENTE DECLARADO VIRA ADIANTAMENTO (decisão do Alf, 29/09/2026).
// Recreio 29/09: aluna com 2 cursos pagou R$ 1.650 = passaporte R$ 550 + parcelas
// 10/2026 de Bateria e Piano (R$ 500 cada) + R$ 100, e a equipe escreveu "vai sobrar
// R$100 que será adiantamento para a parcela de novembro". Prova:
//  • a declaração explícita (valor + mês) vira UM item sem fatura no lote de sempre;
//  • o restante vai ao resolvedor de combinação única e tem de fechar no centavo;
//  • o card pede "pode" e o "pode" leva o item rastreável ao lote atômico;
//  • sem declaração, nada de adiantamento; faturas que não fecham, de outra pessoa
//    ou sem vínculo = sem card aprovável.
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V4_CANARIO = '';
process.env.SOL_CAIXA_TOOLS_CANARIO = '';
const mod = require('./_alvo.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const NOME = 'Fulana Beltrana de Souza';
const fat = (i, cat, desc, v) => ({ ordem: i, aluno_nome: NOME, responsavel_financeiro: null, valor: v, categoria: cat,
  competencia: '10/2026', canonical_fatura_id: `0a000000-0000-4000-8000-00000000013${i}`, descricao: desc,
  sem_vinculo_fatura: false, declarado_pelo_humano: false,
  fatura: { canonical_fatura_id: `0a000000-0000-4000-8000-00000000013${i}`, descricao: desc, status: 'aberta' } });
const OK = { ok: true, itens: [fat(1, 'passaporte', 'Passaporte - curso de Piano', 550),
  fat(2, 'parcela', 'Parcela 10/2026 do curso de Bateria', 500), fat(3, 'parcela', 'Parcela 10/2026 do curso de Piano', 500)],
  soma_itens: 1550, valor_total: 1550 };
const PROSA = `PG pix aluna ${NOME} passaporte + parcelas de outubro de bateria e piano, total R$1.650,00. `
  + 'Vai sobrar R$100 que será adiantamento para a parcela de novembro';

function novo({ resolver = OK, ocr = 'Comprovante Pix R$ 1.650,00' } = {}) {
  const enviadas = []; const ids = []; const envelopes = []; const lotes = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: ocr, status: 'ok', file_bytes: 88001 }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: NOME, competencia: null, forma: 'pix' }),
    resolverEnvelopeFn: async (q) => { envelopes.push(q); return JSON.parse(JSON.stringify(resolver)); },
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => ({ ok: false }), pagadorFn: async () => ({ ok: false }),
    responsavelFn: async () => null, identificarAlunoNovoFn: async () => ({ ok: false }),
    faturasMesFn: async () => null, duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Equipe Recreio' }),
    rotearV4Fn: async () => null, listarPreviewsAbertosFn: async () => [], chequesFn: null,
    lancarFn: async () => { throw new Error('não era para lançar singular'); },
    lancarLoteFn: async (p) => { lotes.push(p); return { ok: true, lote_id: 'L1',
      movimentacoes: p.itens.map((i, n) => ({ movimentacao_id: 'M' + n, aluno_nome: i.aluno_nome, valor: i.valor })) }; },
    log: (x) => logs.push(x),
  });
  return { h, enviadas, ids, envelopes, lotes, logs };
}
const midia = (id, body) => ({ chatId: CHAT, senderPhone: '5521900000001', senderId: '5521900000001@c.us',
  messageId: id, body, hasMedia: true, mediaType: 'document', mediaUrls: ['/tmp/' + id + '.pdf'] });
const texto = (id, body, q) => ({ chatId: CHAT, senderPhone: '5521900000001', senderId: '5521900000001@c.us',
  messageId: id, body, hasMedia: false, quotedMessageId: q });

(async () => {
  const falhas = [];
  const checar = (c, m) => { if (!c) falhas.push(m); };
  const m = mod.extrairAdiantamentoDeclarado;
  const hoje = new Date('2026-09-29T12:00:00-03:00');

  // detector: só declaração explícita com valor e mês
  checar(JSON.stringify(m(PROSA, hoje)) && m(PROSA, hoje).competencia === '11/2026' && m(PROSA, hoje).valor === 100, 'detector: prosa real');
  checar(m('Adiantamento parcela 11/2026 R$ 100,00', hoje).competencia === '11/2026', 'detector: linha');
  checar(m('sobrou R$ 100', hoje) === null, 'detector: sobra sem a palavra não é adiantamento');
  checar(m('adiantamento de R$ 100', hoje) === null, 'detector: sem mês, nada');
  checar(m('adiantamento 08/2026 R$ 100', hoje) === null, 'detector: mês passado, nada');
  checar(m('adiantamento 11/2026 R$ 100 · adiantamento 12/2026 R$ 50', hoje) === null, 'detector: dois adiantamentos = ambíguo');

  // 1) o caso real
  {
    const { h, enviadas, ids, envelopes, lotes } = novo();
    const r = await h.handle(midia('D1', PROSA));
    checar(r && r.acao === 'preview_multi_aluno_enviado', `real: card de lote (${JSON.stringify(r)})`);
    const env = envelopes[0] && envelopes[0].envelope;
    checar(env && env.valor_total === 1550, `real: o resolvedor recebe o restante (${env && env.valor_total})`);
    checar(env && env.itens[0].categorias.includes('passaporte') && env.itens[0].categorias.includes('parcela'), 'real: categorias do texto');
    checar(env && !env.itens[0].competencias.includes('11/2026') && env.itens[0].competencias.includes('10/2026'),
      `real: o mês do adiantamento não é fatura a quitar (${env && JSON.stringify(env.itens[0].competencias)})`);
    const card = enviadas[0] || '';
    checar(/Adiantamento parcela 11\/2026 — R\$ 100,00 \(sem fatura\)/.test(card), 'real: linha do adiantamento');
    checar(/R\$ 1\.650,00/.test(card) && /Responde \*pode\*/.test(card), 'real: card fecha e pede pode');
    await h.handle(texto('P1', 'pode', ids[0]));
    const itens = (lotes[0] && lotes[0].itens) || [];
    checar(itens.length === 4, `real: lote com 4 itens (${itens.length})`);
    const ad = itens[3] || {};
    checar(ad.adiantamento === true && ad.sem_vinculo_fatura === true && ad.declarado_pelo_humano === true
      && !ad.canonical_fatura_id && ad.competencia === '11/2026' && ad.valor === 100
      && ad.desconto_negociado_explicito === false, `real: item rastreável (${JSON.stringify(ad)})`);
    checar(/Adiantamento parcela 11\/2026/.test(ad.descricao || ''), 'real: descrição do movimento diz adiantamento');
    checar(Math.abs(itens.reduce((s, i) => s + i.valor, 0) - 1650) < 0.01, 'real: soma = comprovante');
  }

  // 2) faturas que não fecham o restante: explica, sem card aprovável
  {
    const { h, enviadas } = novo({ resolver: { ok: true, itens: OK.itens.slice(0, 2), soma_itens: 1050 } });
    const r = await h.handle(midia('D2', PROSA));
    checar(r && r.acao === 'adiantamento_sem_fechamento', `não fecha: ${JSON.stringify(r)}`);
    checar(!(h._pendentes.get(CHAT) || []).length, 'não fecha: nenhum card aberto');
    checar(!enviadas.some((t) => /Responde \*pode\*/.test(t)), 'não fecha: não pede pode');
  }

  // 3) fatura de OUTRA pessoa não vira item
  {
    const outra = JSON.parse(JSON.stringify(OK)); outra.itens[2].aluno_nome = 'Outro Aluno Qualquer';
    const { h } = novo({ resolver: outra });
    const r = await h.handle(midia('D3', PROSA));
    checar(r && r.acao === 'adiantamento_sem_fechamento', `outra pessoa: ${JSON.stringify(r)}`);
  }

  // 4) total escrito diferente do comprovante: não monta
  {
    const { h } = novo({ ocr: 'Comprovante Pix R$ 1.600,00' });
    const r = await h.handle(midia('D4', PROSA));
    checar(r && r.acao === 'adiantamento_sem_fechamento' && r.motivo === 'total_diverge_comprovante', `total diverge: ${JSON.stringify(r)}`);
  }

  // 5) sem declaração: nenhum adiantamento, resolvedor nem é chamado por este caminho
  {
    const { h, enviadas, logs } = novo();
    await h.handle(midia('D5', `PG pix aluna ${NOME} passaporte + parcelas de outubro de bateria e piano, total R$1.650,00`));
    checar(!enviadas.some((t) => /adiantamento/i.test(t)), 'sem declaração: não fala em adiantamento');
    checar(!logs.some((l) => /^adiantamento_/.test(String(l.acao))), 'sem declaração: caminho do adiantamento não roda');
  }

  if (falhas.length) { falhas.forEach((f) => console.log('✗ ' + f)); process.exit(1); }
  console.log('✓ adiantamento declarado (SOL-134): detector + 5 cenários');
})().catch((e) => { console.error('✗ Error:', e && e.stack); process.exit(1); });
