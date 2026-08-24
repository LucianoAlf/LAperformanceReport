// REGRESSÃO: o preview incompleto agora sobrevive — mas o gate NÃO pode ter afrouxado.
// 1) "pode" seco (sem forma) num preview incompleto -> NÃO pode lançar
// 2) preview COMPLETO cujo V3 falha de verdade -> continua bloqueado
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';

function novoHandler(overrides = {}) {
  const enviadas = [];
  const estado = { lancou: null, enviadas };
  const _h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + enviadas.length; },
    ocrFn: async () => ({ texto: '', status: 'timeout' }),
    visaoFn: async () => null,
    interpretarFn: async () => ({ categoria: null, aluno: null, competencia: null, forma: null }),
    identidadeFn: async () => ({ identificado: true, nome: 'Fernanda' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    responsavelFn: async () => ({ ok: false }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    pagadorFn: async () => ({ ok: false }),
    faturasMesFn: async () => null,
    lancarFn: async (payload) => { estado.lancou = payload; return { ok: true, movimentacao_id: 'MOV', valor: Number(payload.valor), forma: payload.forma }; },
    log: () => {},
    ...overrides,
  });
  estado.handle = (ev) => _h.handle(ev);
  return estado;
}

(async () => {
  const falhas = [];

  // CASO 1 — "pode" seco num preview sem forma: não pode lançar
  const c1 = novoHandler();
  await c1.handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'O1',
    body: 'Passaporte da aluna Giovanna - R$400,00', hasMedia: true, mediaType: 'image', mediaPath: '/tmp/x.jpg' });
  const r1 = await c1.handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'P1', body: 'pode', hasMedia: false });
  console.log('CASO 1 ("pode" seco, sem forma):', r1 && r1.acao, '| lancou:', !!c1.lancou);
  if (c1.lancou) falhas.push('CASO 1: LANCOU sem forma confirmada — gate afrouxou!');
  if (!/sem_forma/.test(String(r1 && r1.acao))) falhas.push('CASO 1: esperava sem_forma, veio ' + (r1 && r1.acao));

  // CASO 2 — preview COMPLETO (forma na legenda) com V3 falhando de verdade:
  // tem que continuar bloqueando, com a mensagem de preview inseguro.
  const c2 = novoHandler({
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Fulano', competencia: '08/2026', forma: 'pix' }),
    registrarPreviewV3Fn: async () => { throw new Error('falha_infra_simulada'); },
  });
  const r2 = await c2.handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'O2',
    body: 'Parcela de agosto do aluno Fulano - R$ 300,00 pix', hasMedia: true, mediaType: 'image', mediaPath: '/tmp/y.jpg' });
  const bloqueou = String(c2.enviadas[c2.enviadas.length - 1] || '').includes('não foi registrado');
  console.log('CASO 2 (V3 falha de infra, preview completo):', r2 && r2.acao, '| avisou preview inseguro:', bloqueou);
  if (!/sem_v3/.test(String(r2 && r2.acao))) falhas.push('CASO 2: esperava bloqueio sem_v3, veio ' + (r2 && r2.acao));
  if (!bloqueou) falhas.push('CASO 2: nao avisou que o preview seguro nao foi registrado');

  console.log('');
  if (falhas.length) { console.log('REGRESSAO: FALHOU'); falhas.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('REGRESSAO: PASSOU — gate intacto nos dois cenarios');
})().catch((e) => { console.error('ERRO:', e && e.message); process.exit(1); });
