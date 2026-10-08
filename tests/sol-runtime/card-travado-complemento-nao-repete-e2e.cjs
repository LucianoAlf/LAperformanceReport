// Card travado + complemento repetido não vira laço (CG 07/10/2026, 18:40–18:43).
//
// Comprovante bem maior que a única fatura casada trava o "pode" (SOL-135). A
// equipe respondeu aluno + curso + parcela citando o card, duas vezes, e a Sol
// remontou o MESMO card travado ("Atualizei a pendência…"). Agora ela diz o que
// falta (divisão, ou ajustar a fatura no Emusys e reenviar) e não repete o card.
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '0';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const mod = require('./_alvo.cjs');

const CHAT = 'cg-card-travado@g.us';
const UNIDADE = '11111111-1111-4111-8111-111111111111';
const CANONICA = {
  ok: true, aluno_nome: 'Caio Teste Lima', responsavel_nome: 'Resp Teste', motivo_escolha: 'unica_aberta',
  fatura: { canonical_fatura_id: '22222222-2222-4222-8222-222222222222', emusys_fatura_id: 'fx-09', tipo_fatura: 'parcela',
    descricao: 'Parcela 09/2026 do curso de Guitarra', competencia: '2026-09-01', numero_parcela: 2, total_parcelas_contrato: 12,
    status: 'aberta', data_vencimento: '2026-10-05', vencida: false, dias_atraso: 0, valor_da_parcela: 500, valor_hoje: 500 },
};

(async () => {
  const falhas = []; const checar = (c, m) => { if (!c) falhas.push(m); };
  const enviadas = []; const lancados = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(String(t)); return `MSG-${++seq}`; },
    ocrFn: async () => ({ text: 'Pix\nR$ 900,00', status: 'ok', file_bytes: 40000 }),
    visaoFn: async () => ({ valor: 900, forma: 'pix' }),
    interpretarFn: async () => ({ valor: 900, categoria: 'parcela', aluno: 'Caio Teste Lima', competencia: '09/2026', forma: 'pix' }),
    interpretarMultiFn: async () => null,
    canonicaFn: async () => CANONICA,
    casarFn: async () => null,
    responsavelFn: async (_u, n) => ({ ok: true, aluno_nome: n, responsavel_nome: 'Resp Teste' }),
    identidadeFn: async () => ({ identificado: true, nome: 'Equipe' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    pagadorFn: async () => null, faturasMesFn: async () => null, classificarCorrecaoFn: async () => null,
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'MOV', valor: Number(p.valor) }; },
    log: (o) => logs.push(o),
  });
  const r1 = await h.handle({ chatId: CHAT, senderPhone: '5521900000001', messageId: 'ORIG',
    body: 'PG Parcela 09/2026 - aluno Caio Teste Lima - R$900,00', hasMedia: true, mediaType: 'image', mediaPath: '/tmp/x.jpg' });
  checar(r1 && r1.acao === 'preview_enviado', 'card não nasceu: ' + (r1 && r1.acao));
  const card = `MSG-${seq}`;
  const antes = enviadas.length;
  const r2 = await h.handle({ chatId: CHAT, senderPhone: '5521900000002', messageId: 'C1', quotedMessageId: card,
    body: 'Aluno: Caio Teste Lima\nCurso: Guitarra\nParcela: 09/2026' });
  console.log('r2', r2 && r2.acao);
  const novas = enviadas.slice(antes).join('\n---\n');
  checar(!/Atualizei a pend/i.test(novas), 'repetiu o card travado em vez de explicar');
  checar(/Continua travado/.test(novas) && /divisão/.test(novas) && /Emusys/.test(novas), 'não explicou o que falta: ' + novas);
  checar(lancados.length === 0, 'lançou com o card travado');
  const r3 = await h.handle({ chatId: CHAT, senderPhone: '5521900000002', messageId: 'P1', quotedMessageId: card, body: 'pode' });
  checar(lancados.length === 0, 'pode lançou com o card travado: ' + (r3 && r3.acao));

  if (falhas.length) { console.error('FALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log('OK card-travado-complemento-nao-repete');
})().catch((e) => { console.error(e); process.exit(1); });
