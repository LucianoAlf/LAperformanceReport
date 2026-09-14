#!/usr/bin/env node
'use strict';

// Incidente Isabella/CG 14/09/2026: a resposta humana
// "sao duas parcelas 08/2026 e 09/2026" sobrescreveu o aluno por
// "sao duas parcelas e" e o fluxo singular perdeu a segunda fatura.
// Este replay prova as duas raizes sem outbound nem escrita financeira real.
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_LOTE_MS = '0';
delete process.env.SOL_CAIXA_V4_CANARIO;

const mod = require('./_alvo.cjs');
const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const ADM = '5521995507831';
const TEXTO = 'PG pix parcelas 08/2026 e 09/2026 aluna Isabella Cruz Rustichelli R$817,19';

const FATURAS_OK = {
  ok: true, valor_total: 817.19, alunos: 1, via: 'itens',
  itens: [
    { aluno_nome: 'Isabella Cruz Rustichelli', responsavel_financeiro: 'Cristina Cruz Rustichelli',
      valor: 460.19, categoria: 'parcela', competencia: '08/2026',
      canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000001', descricao: 'Parcela 08/2026',
      sem_vinculo_fatura: false, fatura: { status: 'paga', data_pagamento: '2026-09-14' } },
    { aluno_nome: 'Isabella Cruz Rustichelli', responsavel_financeiro: 'Cristina Cruz Rustichelli',
      valor: 357, categoria: 'parcela', competencia: '09/2026',
      canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000002', descricao: 'Parcela 09/2026',
      sem_vinculo_fatura: false, fatura: { status: 'paga', data_pagamento: '2026-09-14' } },
  ],
};

function fixture(resolver) {
  const enviadas = []; const pedidos = []; const lotes = [];
  const idsPorHash = new Map(); let msgSeq = 0; let ledSeq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_chat, texto) => { enviadas.push(String(texto)); return 'MSG-' + (++msgSeq); },
    ocrFn: async () => ({ text: 'Comprovante Pix R$ 817,19', status: 'ok', file_bytes: 5848 }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Isabella Cruz Rustichelli',
      competencia: '08/2026', forma: 'pix', pagamentos: [] }),
    interpretarMultiFn: async () => null,
    resolverEnvelopeFn: async (payload) => { pedidos.push(payload); return resolver(payload); },
    canonicaFn: async () => null, casarFn: async () => null,
    faturasMesFn: async () => null, responsavelFn: async () => null,
    pagadorFn: async () => null, duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    registrarPreviewV3Fn: async (p) => {
      const id = idsPorHash.get(p.preview_hash) || 'LED-' + (++ledSeq);
      idsPorHash.set(p.preview_hash, id);
      return { ok: true, preview_id: id };
    },
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'AP-1' }),
    lancarFn: async () => { throw new Error('executor singular proibido neste caso'); },
    lancarLoteFn: async (payload) => {
      lotes.push(payload);
      return { ok: true, lote_id: 'LOTE-1', movimentacoes: payload.itens.map((i, n) => ({
        aluno_nome: i.aluno_nome, valor: i.valor, movimentacao_id: 'MOV-' + n,
      })) };
    },
    buscarMovimentosFn: async () => ({ ok: true, items: [] }),
    log: () => {},
  });
  return { h, enviadas, pedidos, lotes };
}

(async () => {
  const falhas = [];
  const checar = (c, m) => { if (!c) falhas.push(m); };

  checar(mod._nomeHumanoTardio('Sol, são duas parcelas 08/2026 e 09/2026') === null,
    'metafrasa de parcelas virou nome');
  checar(mod._nomeHumanoTardio('Sol, são 6 parcelas 09/2026, 10/2026, 11/2026, 12/2026, 01/2027 e 02/2027') === null,
    'metafrasa de seis parcelas virou nome');
  checar(mod._nomeHumanoTardio('Sol, a aluna faz dois cursos') === null,
    'metafrasa de cursos virou nome');
  checar(JSON.stringify(mod.extrairCompetenciasTexto(TEXTO)) === JSON.stringify(['08/2026', '09/2026']),
    'nao extraiu as duas competencias em ordem');

  // O estado vivo de 14/09: duas faturas existem, mas somam 816,67; o recibo
  // traz 817,19. O correto e explicar R$0,52 e NAO abrir preview aprovavel.
  const D = fixture(async () => ({ ok: false, motivo: 'nenhuma_combinacao_fecha', valor_total: 817.19,
    soma_disponivel: 816.67, faturas: [
      { aluno_nome: 'Isabella Cruz Rustichelli', valor: 459.67, categoria: 'parcela', competencia: '08/2026' },
      { aluno_nome: 'Isabella Cruz Rustichelli', valor: 357, categoria: 'parcela', competencia: '09/2026' },
    ] }));
  const rd = await D.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'PDF-REAL',
    body: TEXTO, hasMedia: true, mediaType: 'document', mediaUrls: ['fake://recibo.pdf'] });
  const aviso = D.enviadas.join('\n');
  checar(rd && rd.acao === 'parcelas_competencias_divergentes', 'divergencia caiu no singular');
  checar(/Isabella Cruz Rustichelli/.test(aviso) && /08\/2026 e 09\/2026/.test(aviso),
    'aviso perdeu aluno ou competencias');
  checar(/R\$\s*0,52/.test(aviso), 'aviso nao explicou a diferenca de R$0,52');
  checar((D.h._pendentes.get(CHAT) || []).length === 0, 'divergencia deixou card aprovavel');

  // Quando a fonte fecha, a mesma frase corrige um card singular para DUAS
  // linhas e o "pode" executa UMA RPC de lote, nunca duas escritas parciais.
  const S = fixture(async () => FATURAS_OK);
  S.h._pendentes.set(CHAT, [{
    previewId: 'CARD-ANTIGO', msgIds: ['CARD-ANTIGO'], v3PreviewId: 'LED-ANTIGO',
    v3PreviewHash: 'HASH-ANTIGO', unidade_id: UNIDADE, nome: 'Campo Grande',
    valor: 817.19, forma: 'pix', categoria: 'parcela', aluno: 'Isabella Cruz Rustichelli',
    competencia: '08/2026', origem: 'PDF-ORIGEM', idemKey: CHAT + ':PDF-ORIGEM', ts: Date.now(),
  }]);
  const rs = await S.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'CORRECAO-2-MESES',
    body: 'Sol, são duas parcelas 08/2026 e 09/2026', quotedMessageId: 'CARD-ANTIGO', hasMedia: false });
  const pend = (S.h._pendentes.get(CHAT) || [])[0];
  checar(rs && rs.acao === 'preview_multi_aluno_enviado', 'correcao nao virou preview de lote');
  checar(pend && pend.tipoOperacao === 'lancar_recebimento_lote' && pend.itens.length === 2,
    'pendencia nao virou lote atomico de duas faturas');
  checar(pend && pend.itens.every((i) => i.aluno_nome === 'Isabella Cruz Rustichelli'),
    'lote perdeu o aluno original');
  const card = S.enviadas.find((x) => /\*PARCELAS\*/.test(x)) || '';
  checar(/08\/2026/.test(card) && /09\/2026/.test(card), 'card nao mostra os dois meses');

  await S.h.handle({ chatId: CHAT, senderPhone: ADM, messageId: 'PODE-LOTE',
    body: 'pode', quotedMessageId: pend && pend.previewId, hasMedia: false });
  checar(S.lotes.length === 1 && S.lotes[0].itens.length === 2,
    'pode nao executou exatamente um lote de duas linhas');

  if (falhas.length) {
    console.error('FALHOU:'); falhas.forEach((f) => console.error('  - ' + f)); process.exit(1);
  }
  console.log('ok Isabella: metafrasa bloqueada, duas competencias, divergencia segura e lote atomico');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
