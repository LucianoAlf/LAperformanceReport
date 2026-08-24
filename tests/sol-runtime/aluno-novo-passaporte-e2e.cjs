// E2E do caso REAL Giovanna/Recreio (24/08): passaporte de aluno NOVO com cupom
// de maquininha ilegível. Usa o runtime vivo; sendFn/lancarFn fakes.
// A identificação do aluno vai ao BANCO DE VERDADE (RPC nova).
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');
const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const enviadas = []; let lancou = null;

const _h = mod.criarHandlerFinanceiro({
  grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
  sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + enviadas.length; },
  ocrFn: async () => ({ texto: '', status: 'timeout' }),   // cupom ilegível, como no caso real
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
  const r1 = await handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'G1',
    body: 'Passaporte promocional da aluna Giovanna Oliveira da Cunha - R$400,00',
    hasMedia: true, mediaType: 'image', mediaPath: '/tmp/cupom.jpg' });
  const card = enviadas[0] || '';
  console.log('PASSO 1:', r1 && r1.acao);
  console.log('--- CARD ---'); console.log(card); console.log('---');

  if (/não tenho certeza de qual aluno/i.test(card)) falhas.push('card ainda duvida do aluno que existe no funil');
  if (!/aluno novo|experimental/i.test(card)) falhas.push('card nao informa que e aluno novo');
  if (!/passaporte/i.test(card)) falhas.push('categoria passaporte nao reconhecida');

  const r2 = await handle({ chatId: CHAT, senderPhone: '5521999999999', messageId: 'G2', body: 'pode, cartão', hasMedia: false });
  console.log('PASSO 2:', r2 && r2.acao);
  if (!lancou) falhas.push('nao lancou apos a forma');
  else {
    console.log('PAYLOAD:', JSON.stringify({ valor: lancou.valor, forma: lancou.forma, categoria: lancou.categoria, aluno: lancou.aluno }));
    if (Number(lancou.valor) !== 400) falhas.push('valor: ' + lancou.valor);
    if (lancou.forma !== 'cartao') falhas.push('forma: ' + lancou.forma);
    if (lancou.categoria !== 'passaporte') falhas.push('categoria: ' + lancou.categoria);
    if (!/giovanna/i.test(String(lancou.aluno))) falhas.push('aluno: ' + lancou.aluno);
  }
  console.log('');
  if (falhas.length) { console.log('FALHOU'); falhas.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('PASSOU — aluno novo reconhecido pelo funil e passaporte lançado');
})().catch(e => { console.error('ERRO:', e && e.message); process.exit(1); });
