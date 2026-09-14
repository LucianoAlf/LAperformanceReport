#!/usr/bin/env node
'use strict';

// Incidente Gabriel/CG 14/09/2026: o total de R$ 667 fechava exatamente com
// parcela R$ 417 + passaporte R$ 250 do mesmo aluno. O parser reconhecia as
// duas cobranças, mas mantinha o executor singular e gravava tudo como
// `parcela`. Este replay exige o contrato correto nos tres grupos: um preview,
// um `pode`, um lote atomico e dois movimentos com categorias/faturas próprias.
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_LOTE_MS = '0';
delete process.env.SOL_CAIXA_V4_CANARIO;

const mod = require('./_alvo.cjs');
const ADM = '5521995507831';
const TEXTO = 'PG pix parcela 09/2026 + segunda metade do passaporte aluno Gabriel Souza R$ 667,00';
const GRUPOS = [
  ['grupo-cg@g.us', 'unidade-cg', 'Campo Grande'],
  ['grupo-recreio@g.us', 'unidade-recreio', 'Recreio'],
  ['grupo-barra@g.us', 'unidade-barra', 'Barra'],
];

const ITENS = [
  {
    aluno_nome: 'Gabriel Souza', responsavel_financeiro: 'Rodrigo Souza',
    aluno_id: 101, valor: 417, categoria: 'parcela', competencia: '09/2026',
    canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    descricao: 'Parcela 09/2026', sem_vinculo_fatura: false,
    fatura: { status: 'paga', data_pagamento: '2026-09-14' },
  },
  {
    aluno_nome: 'Gabriel Souza', responsavel_financeiro: 'Rodrigo Souza',
    aluno_id: 101, valor: 250, categoria: 'passaporte', competencia: '09/2026',
    canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000002',
    descricao: 'Passaporte 2/2', sem_vinculo_fatura: false,
    fatura: { status: 'paga', data_pagamento: '2026-09-14' },
  },
];

function fixture(chat, unidade, nome, itensOficiais = ITENS) {
  const enviadas = []; const lotes = []; const singulares = []; const readbacks = [];
  const idsPorHash = new Map(); let msgSeq = 0; let ledSeq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [chat]: { unidade_id: unidade, nome } },
    sendFn: async (_chat, texto) => { enviadas.push(String(texto)); return 'MSG-' + (++msgSeq); },
    ocrFn: async () => ({ text: 'Comprovante Pix R$ 667,00', status: 'ok', file_bytes: 6670 }),
    visaoFn: async () => ({ valor: 667, forma: 'pix', pagador_nome: 'Rodrigo Souza' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Gabriel Souza',
      competencia: '09/2026', forma: 'pix', pagamentos: [] }),
    interpretarMultiFn: async () => null,
    canonicaFn: async () => null,
    casarFn: async () => null,
    pagadorFn: async () => null,
    responsavelFn: async () => ({ aluno_nome: 'Gabriel Souza', responsavel_nome: 'Rodrigo Souza' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    faturasMesFn: async () => ({
      ok: true, aluno_nome: 'Gabriel Souza', competencia: '09/2026',
      responsavel_financeiro: 'Rodrigo Souza',
      partes: itensOficiais.map((i) => ({ ...i, curso: i.descricao })),
      itens: itensOficiais.map((i) => ({ ...i })),
    }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    registrarPreviewV3Fn: async (p) => {
      const id = idsPorHash.get(p.preview_hash) || 'LED-' + (++ledSeq);
      idsPorHash.set(p.preview_hash, id);
      return { ok: true, preview_id: id };
    },
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    registrarApprovalV3Fn: async () => ({
      ok: true, approval_id: 'AP-1', approval_event_hash: 'EH-1', actor_id_hash: 'AH-1',
    }),
    lancarFn: async (payload) => { singulares.push(payload); return { ok: true, movimentacao_id: 'SINGULAR' }; },
    lancarLoteFn: async (payload) => {
      lotes.push(payload);
      return { ok: true, lote_id: 'LOTE-1', movimentacoes: payload.itens.map((i, n) => ({
        aluno_nome: i.aluno_nome, valor: i.valor, movimentacao_id: 'MOV-' + n,
      })) };
    },
    buscarMovimentosFn: async (payload) => { readbacks.push(payload); return { ok: true, items: [] }; },
    log: () => {},
  });
  return { h, enviadas, lotes, singulares, readbacks };
}

(async () => {
  const falhas = [];
  const checar = (condicao, mensagem) => { if (!condicao) falhas.push(mensagem); };

  for (const [chat, unidade, nome] of GRUPOS) {
    const F = fixture(chat, unidade, nome);
    const origem = await F.h.handle({
      chatId: chat, senderPhone: ADM, messageId: 'PDF-' + nome,
      body: TEXTO, hasMedia: true, mediaType: 'document', mediaUrls: ['fake://recibo.pdf'],
    });
    const pend = (F.h._pendentes.get(chat) || [])[0];
    checar(origem && origem.acao === 'preview_multi_aluno_enviado', `${nome}: composto nao virou preview de lote`);
    checar(pend && pend.tipoOperacao === 'lancar_recebimento_lote', `${nome}: pendencia ficou singular`);
    checar(pend && pend.categoria === 'outro', `${nome}: categoria de topo nao marcou lote misto`);
    checar(pend && pend.itens && pend.itens.length === 2, `${nome}: lote nao preservou duas cobrancas`);
    checar(pend && Array.isArray(pend.itens)
      && pend.itens.map((i) => i.categoria).join(',') === 'parcela,passaporte',
      `${nome}: categorias por item nao foram preservadas`);
    checar(pend && Array.isArray(pend.itens) && pend.itens.every((i) => i.canonical_fatura_id),
      `${nome}: item sem fatura canonica`);
    checar(F.singulares.length === 0 && F.lotes.length === 0,
      `${nome}: houve escrita antes do pode`);

    const card = F.enviadas.find((x) => /Posso lançar o lote completo/.test(x)) || '';
    checar(/\*ITENS\*/.test(card), `${nome}: card misto chamou tudo de parcelas`);
    checar(/Parcela 09\/2026/.test(card) && /Passaporte 2\/2/.test(card),
      `${nome}: card nao separou parcela e passaporte`);

    await F.h.handle({
      chatId: chat, senderPhone: ADM, messageId: 'PODE-' + nome,
      body: 'pode', quotedMessageId: pend && pend.previewId, hasMedia: false,
      caixaGovernancaEpisode: { episode_id: 'EP-' + nome },
    });
    await new Promise((resolve) => setImmediate(resolve));
    checar(F.singulares.length === 0, `${nome}: executor singular foi chamado`);
    checar(F.lotes.length === 1 && F.lotes[0].itens.length === 2,
      `${nome}: pode nao executou um unico lote de dois itens`);
    checar(F.lotes[0] && Array.isArray(F.lotes[0].itens)
      && F.lotes[0].itens.reduce((s, i) => s + Number(i.valor), 0) === 667,
      `${nome}: soma do lote divergiu`);
    const recibo = F.enviadas[F.enviadas.length - 1] || '';
    checar(/Parcela 09\/2026/.test(recibo) && /Passaporte 2\/2/.test(recibo),
      `${nome}: recibo nao manteve a separacao contabil`);
    checar(F.readbacks.map((r) => r.categoria).join(',') === 'parcela,passaporte',
      `${nome}: readback nao validou a categoria de cada movimento`);
  }

  // Mutantes: depois que a fonte oficial declarou um composto, soma divergente
  // ou item sem fatura jamais podem cair de volta no executor singular.
  for (const [tag, itens] of [
    ['soma-divergente', ITENS.map((i, idx) => idx === 1 ? { ...i, valor: 249 } : { ...i })],
    ['fatura-ausente', ITENS.map((i, idx) => idx === 1 ? { ...i, canonical_fatura_id: null } : { ...i })],
  ]) {
    const [chat, unidade, nome] = GRUPOS[0];
    const F = fixture(chat, unidade, nome, itens);
    const r = await F.h.handle({
      chatId: chat, senderPhone: ADM, messageId: 'MUT-' + tag,
      body: TEXTO, hasMedia: true, mediaType: 'document', mediaUrls: ['fake://recibo.pdf'],
    });
    checar(r && r.acao === 'composto_mes_snapshot_invalido', `${tag}: nao falhou fechado`);
    checar((F.h._pendentes.get(chat) || []).length === 0, `${tag}: deixou preview aprovavel`);
    checar(F.singulares.length === 0 && F.lotes.length === 0, `${tag}: chamou executor financeiro`);
  }

  if (falhas.length) {
    console.error('FALHOU:'); falhas.forEach((f) => console.error('  - ' + f)); process.exit(1);
  }
  console.log('ok composto mesmo aluno: lote atomico, categorias e faturas separadas nos tres grupos');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
