// Incidente Bernardo/Barra, 15/09/2026.
//
// O comprovante de R$ 492,76 dizia aluno + setembro + Pix. A fatura da Barra
// estava paga no Emusys por exatamente R$ 492,76 (R$ 482,00 original +
// R$ 10,76 de multa/mora), mas o caminho com competência pulava a canônica e
// consultava o matcher bruto. Como `emusys_student_id=518` também existia em
// Campo Grande, o card inventou múltiplas parcelas e ainda terminou pedindo
// `pode` depois de afirmar que `pode` seria recusado.

process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '0';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';

const mod = require('./_alvo.cjs');

const CHAT = 'barra-bernardo@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const FATURA_BARRA = '0ee7874a-2335-423c-99dc-3fef4f923f4d';
const CAPTION = 'parcela do aluno Bernardo Berriel referente ao mês de Setembro via pix';

const canonicaPaga = {
  ok: true,
  aluno_nome: 'Bernardo Berriel',
  responsavel_nome: 'Nelson Berriel Pereira',
  motivo_escolha: 'valor_exato',
  fonte_status: 'partial',
  fatura: {
    canonical_fatura_id: FATURA_BARRA,
    emusys_fatura_id: '11642',
    tipo_fatura: 'parcela',
    descricao: 'Parcela 09/2026 do curso de Bateria',
    competencia: '2026-09-01',
    numero_parcela: 11,
    total_parcelas_contrato: 12,
    status: 'paga',
    data_pagamento: '2026-09-15',
    data_vencimento: '2026-09-05',
    vencida: false,
    dias_atraso: 0,
    forma_pagamento: { nome: 'Pix' },
    valor_da_parcela: 482,
    valor_pago: 492.76,
    valor_hoje: null,
  },
};

function novo({ canonicaFn = async () => canonicaPaga, casarFn } = {}) {
  const enviadas = [];
  const logs = [];
  let seq = 0;
  let casarCalls = 0;
  const casar = casarFn || (async () => {
    return {
      ok: true,
      aluno_nome: 'Bernardo Berriel',
      parcela: {
        fatura_id: '6dca4fb5-6a67-473e-b7bd-9ca2fab4decc',
        descricao: 'Parcela 09/2026 do curso de Bateria',
        competencia: '09/2026',
        valor: 397,
        valor_bate: false,
        multiplas_no_mes: true,
      },
    };
  });
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_chat, texto) => { enviadas.push(String(texto)); return `MSG-${++seq}`; },
    ocrFn: async () => ({ text: 'Pix\nR$ 492,76\nNelson Berriel Pereira', status: 'ok', file_bytes: 49734 }),
    visaoFn: async () => ({ valor: 492.76, forma: 'pix', pagador_nome: 'Nelson Berriel Pereira' }),
    interpretarFn: async () => ({ valor: 492.76, categoria: 'parcela', aluno: 'Bernardo Berriel',
      competencia: '09/2026', forma: 'pix', pagador_nome: 'Nelson Berriel Pereira' }),
    interpretarMultiFn: async () => null,
    canonicaFn,
    casarFn: async (...args) => { casarCalls += 1; return casar(...args); },
    responsavelFn: async () => ({ ok: true, aluno_nome: 'Bernardo Berriel',
      responsavel_nome: 'Nelson Berriel Pereira' }),
    pagadorFn: async () => null,
    faturasMesFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Duda' }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: `LEDGER-${++seq}` }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'APPROVAL' }),
    lancarFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    lancarLoteFn: async () => { throw new Error('ESCRITA PROIBIDA NO ENSAIO'); },
    rotearV4Fn: async () => null,
    log: (item) => logs.push(item),
  });
  return { h, enviadas, logs, casarCalls: () => casarCalls };
}

async function enviar(h, id) {
  return h.handle({
    chatId: CHAT,
    senderPhone: '5521964275335',
    messageId: id,
    body: CAPTION,
    hasMedia: true,
    mediaType: 'image',
    mediaUrls: ['fake://bernardo-pix.jpg'],
  });
}

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // 1) A canônica da competência manda e o matcher bruto nem é consultado.
  const A = novo();
  const rA = await enviar(A.h, 'BERNARDO-1');
  const cardA = A.enviadas.join('\n');
  checar(rA && rA.acao === 'preview_enviado', `A: acao inesperada ${JSON.stringify(rA)}`);
  checar(A.casarCalls() === 0, `A: matcher bruto foi chamado ${A.casarCalls()}x`);
  checar(/Parcela 11\/12.*09\/2026/i.test(cardA), 'A: não exibiu a fatura canônica de setembro');
  checar(/Valor pago: R\$ 492,76\s+✅ confere/i.test(cardA), 'A: não comparou com valor_pago');
  checar(/Valor original: R\$ 482,00/i.test(cardA), 'A: não explicou o valor original');
  checar(/Já pago no Emusys.*Pix/i.test(cardA), 'A: não mostrou a baixa oficial');
  checar(!/mais de uma parcela aberta/i.test(cardA), 'A: inventou múltiplas parcelas');
  checar(!/difere do valor da parcela/i.test(cardA), 'A: inventou divergência de valor');
  checar(/Posso lançar no caixa de hoje/i.test(cardA), 'A: card correto deixou de pedir aprovação');
  checar(A.logs.some((x) => x.acao === 'canonica_competencia_result'
    && x.competencia_canonica === '2026-09-01'), 'A: não registrou a decisão canônica por competência');

  // 2) Se a canônica responder outra competência, a explícita ainda pode
  // desambiguar; porém um card bloqueado jamais termina pedindo `pode`.
  const B = novo({
    canonicaFn: async () => ({ ...canonicaPaga,
      fatura: { ...canonicaPaga.fatura, competencia: '2026-10-01', status: 'aberta',
        valor_pago: null, valor_da_parcela: 482 } }),
    casarFn: async () => ({ ok: true, aluno_nome: 'Bernardo Berriel',
      parcela: { fatura_id: FATURA_BARRA, descricao: 'Parcela 09/2026 do curso de Bateria',
        competencia: '09/2026', valor: 482, valor_bate: false, multiplas_no_mes: true } }),
  });
  await enviar(B.h, 'BERNARDO-2');
  const cardB = B.enviadas.join('\n');
  checar(B.casarCalls() === 1, `B: matcher explícito deveria rodar 1x, rodou ${B.casarCalls()}x`);
  checar(/Não vou lançar com \*pode\*/i.test(cardB), 'B: perdeu a trava financeira');
  checar(/Me explica a divisão\/curso correto antes de lançar/i.test(cardB), 'B: não explicou o próximo passo');
  checar(!/Posso lançar no caixa de hoje/i.test(cardB), 'B: card bloqueado continuou pedindo pode');

  if (falhas.length) {
    console.error(`${falhas.length} falha(s):`);
    falhas.forEach((f) => console.error('  - ' + f));
    console.error('CARD A:\n' + cardA);
    process.exit(1);
  }
  console.log('bernardo/barra: canônica por competência, valor pago e gate coerente');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
