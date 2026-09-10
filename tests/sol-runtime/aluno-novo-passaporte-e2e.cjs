// Passaporte + identificação de aluno. Cobre os DOIS estados possíveis:
//   (a) aluno ainda no funil (experimental/lead) -> card mostra selo "aluno novo"
//   (b) aluno já matriculado (Emusys sincronizou)  -> card NÃO mostra selo
// A Giovanna passou de (a) para (b) às 16:32 de 24/08, no meio da própria
// investigação — por isso o teste valida a coerência, não um estado fixo.
const mod = require('./_alvo.cjs');
require('./_alvo.cjs').exigeCredenciais('aluno-novo-passaporte');  // usa as RPCs reais
const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const enviadas = []; let lancou = null;

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
  lancarFn: async (pl) => { lancou = pl; return { ok: true, movimentacao_id: 'MOV', valor: Number(pl.valor), forma: pl.forma }; },
  log: () => {},
});
const handle = (ev) => _h.handle(ev);

(async () => {
  const falhas = [];
  await handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'G1',
    body: 'Passaporte promocional da aluna Giovanna Oliveira da Cunha - R$400,00',
    hasMedia: true, mediaType: 'image', mediaPath: '/tmp/cupom.jpg' });
  const card = enviadas[0] || '';
  console.log('--- CARD ---'); console.log(card); console.log('---');

  const duvida = /não tenho certeza de qual aluno/i.test(card);
  const selo = /🆕/.test(card);
  const dizNaoMatriculado = /ainda não matriculado/i.test(card);
  const dizMatriculado = /🆕 aluno matriculado/i.test(card);

  if (duvida) falhas.push('duvida de aluno que o sistema conhece');
  if (dizMatriculado) falhas.push('selo contraditorio: "aluno matriculado ... ainda nao matriculado"');
  if (selo && !dizNaoMatriculado) falhas.push('selo sem explicacao');
  if (!/passaporte/i.test(card)) falhas.push('categoria passaporte nao reconhecida');
  console.log(selo ? 'estado: aluno AINDA no funil (selo exibido)' : 'estado: aluno JA matriculado (sem selo) — correto');

  await handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'G2', body: 'pode, cartão', hasMedia: false });
  if (!lancou) falhas.push('nao lancou apos a forma');
  else {
    console.log('PAYLOAD:', JSON.stringify({ valor: lancou.valor, forma: lancou.forma, categoria: lancou.categoria, aluno: lancou.aluno }));
    if (Number(lancou.valor) !== 400) falhas.push('valor: ' + lancou.valor);
    if (lancou.forma !== 'cartao') falhas.push('forma: ' + lancou.forma);
    if (lancou.categoria !== 'passaporte') falhas.push('categoria: ' + lancou.categoria);
  }
  console.log('');
  if (falhas.length) { console.log('FALHOU'); falhas.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('PASSOU — identificacao coerente e passaporte lancado');
})().catch(e => { console.error('ERRO:', e && e.message); process.exit(1); });
