// Incidente Barra, 17/09/2026 (dados pessoais removidos).
//
// A legenda humana terminava o nome com um comentario operacional:
//   "parcela Lauro Rodrigues pago no pix (Ativamos o pix automatico dele)"
// O parser tratava "pago no pix..." como sobrenome, perdia o casamento direto
// pelo aluno e dependia do fallback pelo pagador. Este ensaio preserva a frase
// real e prova que o caminho principal chega limpo a fonte canonica.

process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '0';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';

const mod = require('./_alvo.cjs');

const CHAT = 'barra-comentario-pagamento@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const CAPTION = 'parcela Lauro Rodrigues pago no pix (Ativamos o pix automatico dele)';
const FATURA = '44444444-4444-4444-8444-444444444444';

const canonicaPagaHoje = {
  ok: true,
  aluno_nome: 'Lauro Rodrigues Pereira',
  responsavel_nome: 'Responsavel Exemplo',
  motivo_escolha: 'paga_hoje_valor_exato',
  fonte_status: 'partial',
  fatura: {
    canonical_fatura_id: FATURA,
    emusys_fatura_id: 'fixture-outubro',
    tipo_fatura: 'parcela',
    descricao: 'Parcela 10/2026 do curso',
    competencia: '2026-10-01',
    numero_parcela: 10,
    total_parcelas_contrato: 12,
    status: 'paga',
    data_pagamento: '2026-09-17',
    data_vencimento: '2026-10-05',
    vencida: false,
    dias_atraso: 0,
    forma_pagamento: { nome: 'Pix' },
    valor_da_parcela: 465,
    valor_pago: 465,
    valor_hoje: null,
  },
};

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  checar(mod._alunoFromCaption(CAPTION) === 'Lauro Rodrigues',
    `parser deveria devolver "Lauro Rodrigues"; veio "${mod._alunoFromCaption(CAPTION)}"`);
  checar(mod._limparAlunoRotulado('Lauro Rodrigues Pereira pago via pix') === 'Lauro Rodrigues Pereira',
    'rotulo explicito tambem precisa cortar o comentario de pagamento');
  checar(mod._alunoFromCaption('parcela Maria Pago Silva') === 'Maria Pago Silva',
    'sobrenome Pago nao pode ser cortado sem complemento de pagamento');

  const enviadas = [];
  const chamadasCanonica = [];
  let chamadasPagador = 0;
  let chamadasMatcher = 0;
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_chat, texto) => { enviadas.push(String(texto)); return `MSG-${++seq}`; },
    ocrFn: async () => ({ text: 'Pix\nR$ 465,00\nResponsavel Exemplo', status: 'ok', file_bytes: 42000 }),
    visaoFn: async () => ({ valor: 465, forma: 'pix', pagador_nome: 'Responsavel Exemplo' }),
    interpretarFn: async () => ({ valor: 465, categoria: 'parcela', aluno: null,
      competencia: null, forma: 'pix', pagador_nome: 'Responsavel Exemplo' }),
    interpretarMultiFn: async () => null,
    canonicaFn: async (_unidade, nome, valor) => {
      chamadasCanonica.push({ nome, valor });
      return canonicaPagaHoje;
    },
    casarFn: async () => { chamadasMatcher += 1; return null; },
    pagadorFn: async () => { chamadasPagador += 1; return null; },
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Ana' }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: `LEDGER-${++seq}` }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'APPROVAL' }),
    lancarFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    lancarLoteFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    rotearV4Fn: async () => null,
    log: () => {},
  });

  const r = await h.handle({
    chatId: CHAT,
    senderPhone: '5521999999999',
    messageId: 'BARRA-PAGO-PIX-1',
    body: CAPTION,
    hasMedia: true,
    mediaType: 'image',
    mediaUrls: ['fake://barra-pix.jpg'],
  });
  const card = enviadas.join('\n');

  checar(r && r.acao === 'preview_enviado', `acao inesperada: ${JSON.stringify(r)}`);
  checar(chamadasCanonica.length >= 1, 'fonte canonica nao foi consultada');
  checar(chamadasCanonica[0] && chamadasCanonica[0].nome === 'Lauro Rodrigues',
    `nome enviado a canonica veio contaminado: ${JSON.stringify(chamadasCanonica[0])}`);
  checar(chamadasCanonica[0] && Math.abs(chamadasCanonica[0].valor - 465) < 0.01,
    'valor do comprovante nao chegou a canonica');
  checar(chamadasPagador === 0, `fallback pelo pagador foi chamado ${chamadasPagador}x`);
  checar(chamadasMatcher === 0, `matcher legado foi chamado ${chamadasMatcher}x`);
  checar(/Lauro Rodrigues Pereira/i.test(card), 'card nao trouxe o aluno canonico');
  checar(/10\/2026/i.test(card), 'card nao trouxe a competencia paga correta');
  checar(/R\$ 465,00/i.test(card), 'card nao trouxe o valor correto');
  checar(/Ja pago no Emusys|Já pago no Emusys/i.test(card), 'card nao mostrou a baixa oficial');
  checar(!/09\/2026/i.test(card), 'card voltou para a parcela vencida de setembro');

  if (falhas.length) {
    console.error(`${falhas.length} falha(s):`);
    falhas.forEach((f) => console.error('  - ' + f));
    console.error('CARD:\n' + card);
    process.exit(1);
  }
  console.log('barra: nome limpo e fatura paga do dia chegam ao preview');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
