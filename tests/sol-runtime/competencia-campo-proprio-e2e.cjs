#!/usr/bin/env node
// Incidente Mayra/CG 12/09/2026: a fonte trouxe competencia 09/2026, mas a
// descricao historica dizia "Parcela 08/2026". O card preferiu o texto velho.
// Quando a Mayra corrigiu "a parcela e 09/2026", o fallback transformou a
// competencia em uma frase com o nome do card e respondeu que tinha corrigido
// o ALUNO. Este teste fecha as duas raizes e prova o lancamento uma vez so.
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '0';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';

const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const ADM = '5521995507831';
const FATURA_ID = '55226311-5ed5-4cee-8152-c1f7bbca5fe3';

const PARCELA_INCONSISTENTE = {
  fatura_id: FATURA_ID,
  aluno_id: 1027,
  descricao: 'Parcela 08/2026 do curso de Musicalização Infantil',
  competencia: '09/2026',
  vencimento: '05/09',
  valor: 500,
  valor_bate: false,
  multiplas_no_mes: false,
};

const CANONICA_09 = {
  ok: true,
  aluno_nome: 'Heitor Dias Berriel Abreu',
  responsavel_nome: 'Diana Pereira Dias',
  fatura: {
    canonical_fatura_id: FATURA_ID,
    descricao: 'Parcela 08/2026 do curso de Musicalização Infantil',
    competencia: '2026-09-01',
    data_vencimento: '2026-09-05',
    numero_parcela: 6,
    total_parcelas_contrato: 12,
    status: 'aberta',
    vencida: true,
    dias_atraso: 7,
    valor_da_parcela: 500,
    valor_hoje: 511.17,
  },
};

function novo() {
  const enviadas = [];
  const ids = [];
  const logs = [];
  const lancados = [];
  let seq = 0;
  let chamadasCanonica = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_chat, texto) => {
      enviadas.push(String(texto));
      const id = 'MSG' + (++seq);
      ids.push(id);
      return id;
    },
    ocrFn: async () => ({ text: 'Comprovante Pix\nR$ 510,75', status: 'ok', file_bytes: 50719 }),
    visaoFn: async () => ({ valor: 510.75, forma: 'pix' }),
    interpretarFn: async () => ({
      categoria: 'parcela', aluno: 'Heitor Dias Berriel Abreu',
      competencia: '09/2026', forma: 'pix', pagamentos: [],
    }),
    // No evento real a cascata canonica nao resolveu no primeiro turno; o
    // casamento por competencia trouxe a fatura, com descricao incoerente.
    canonicaFn: async () => (++chamadasCanonica === 1
      ? { ok: false, motivo: 'nenhuma_fatura_aberta' }
      : CANONICA_09),
    casarFn: async () => ({
      ok: true, aluno_nome: 'Heitor Dias Berriel Abreu',
      parcela: { ...PARCELA_INCONSISTENTE },
    }),
    responsavelFn: async () => ({
      ok: true, aluno_nome: 'Heitor Dias Berriel Abreu', responsavel_nome: 'Diana Pereira Dias',
    }),
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    lancarFn: async (payload) => {
      lancados.push(payload);
      return { ok: true, movimentacao_id: 'M1', valor: payload.valor, forma: payload.forma };
    },
    log: (o) => logs.push(o),
  });
  return { h, enviadas, ids, logs, lancados };
}

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };
  const A = novo();

  const r1 = await A.h.handle({
    chatId: CHAT, senderPhone: ADM, messageId: 'DOC1', hasMedia: true,
    mediaType: 'document', mediaUrls: ['fake://comprovante.pdf'],
    body: 'PG pix parcela 09/2026 aluno Heitor Dias Berriel Abreu R$510,75',
  });
  const card1 = A.enviadas[A.enviadas.length - 1] || '';
  checar(r1 && r1.acao === 'preview_enviado', 'setup deveria criar preview');
  checar(/Parcela 09\/2026/.test(card1), 'competencia estruturada 09/2026 deve aparecer no primeiro card');
  checar(!/Parcela 08\/2026/.test(card1), 'descricao historica 08/2026 nao pode contradizer o campo estruturado');

  const r2 = await A.h.handle({
    chatId: CHAT, senderPhone: ADM, messageId: 'CORR1', hasMedia: false,
    quotedMessageId: A.ids[A.ids.length - 1], body: 'Sol, a parcela é 09/2026',
  });
  const card2 = A.enviadas[A.enviadas.length - 1] || '';
  checar(r2 && r2.acao === 'preview_competencia_corrigida',
    `correcao precisa ter acao propria; veio ${JSON.stringify(r2 && r2.acao)}`);
  checar(/^Corrigi a competência para \*09\/2026\*/.test(card2), 'cabecalho precisa dizer o campo realmente corrigido');
  checar(!/aluno informado/i.test(card2), 'correcao de competencia nao pode alegar correcao de aluno');
  checar(/Parcela (?:6\/12 · )?09\/2026/.test(card2), 'card remontado deve usar a fatura estruturada de 09/2026');

  const pend = (A.h._pendentes.get(CHAT) || [])[0] || {};
  checar(pend.competencia === '09/2026', 'pendencia deve persistir competencia 09/2026');
  checar((pend.canonica && pend.canonica.fatura && pend.canonica.fatura.canonical_fatura_id === FATURA_ID)
      || (pend.parcela && pend.parcela.fatura_id === FATURA_ID),
    'pendencia deve ficar ligada a fatura canonica 09/2026');

  await A.h.handle({
    chatId: CHAT, senderPhone: ADM, messageId: 'OK1', hasMedia: false,
    quotedMessageId: A.ids[A.ids.length - 1], body: 'Pode',
  });
  checar(A.lancados.length === 1, `aprovacao deve lancar uma vez; lancou ${A.lancados.length}`);
  if (A.lancados[0]) {
    checar(A.lancados[0].fatura_id === FATURA_ID, `fatura lancada deve ser a 09/2026; veio ${A.lancados[0].fatura_id}`);
    checar(A.lancados[0].forma === 'pix', 'forma pix precisa sobreviver');
    checar(Number(A.lancados[0].valor) === 510.75, 'valor 510,75 precisa sobreviver');
    checar(!/Parcela 08\/2026/.test(String(A.lancados[0].descricao || '')),
      'descricao futura do lancamento nao pode carregar 08/2026');
  }

  // Fronteiras: um pagamento novo com competencia nao corrige card aberto;
  // e um palpite `aprovar` do modelo vira correcao quando o texto diz o campo.
  checar(mod.extrairCorrecaoCompetencia('PG pix parcela 09/2026 aluno Fulano R$510,75') === null,
    'legenda de pagamento novo nao e correcao');
  checar(mod.extrairCorrecaoCompetencia('Sol, a parcela é 09/2026') === '09/2026',
    'frase real detecta correcao 09/2026');
  const normalizada = mod.normalizarCorrecaoCompetenciaRoteador(
    { intencao: 'aprovar', competencia: '09/2026' }, 'Sol, a parcela é 09/2026', true);
  checar(normalizada.intencao === 'corrigir_competencia',
    'roteador nao pode transformar correcao de campo em aprovacao');

  if (falhas.length) {
    console.error('FALHOU:');
    falhas.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('ok competencia tem campo proprio, card coerente e lancamento unico');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
