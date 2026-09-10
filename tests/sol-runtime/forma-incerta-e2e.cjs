// E2E do fluxo "forma não identificada" — reproduz o caso Giovanna (24/08) com o
// handler REAL do runtime, sem tocar no WhatsApp (sendFn é fake) e sem gravar no
// caixa (lancarFn é fake). Prova que a conversa completa fecha:
//   comprovante ilegível -> Sol pede a forma -> humano responde -> Sol remonta
//   com V3 -> "pode" lança.
const mod = require('./_alvo.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const enviadas = [];
let seq = 0;

const grupos = { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } };
const sendFn = async (_chat, texto) => { enviadas.push(texto); return 'MSG' + (++seq); };

let lancou = null;
const _h = mod.criarHandlerFinanceiro({
  grupos,
  sendFn,
  // OCR e visão falham, como no caso real (cupom de maquininha ilegível)
  ocrFn: async () => ({ texto: '', status: 'timeout' }),
  visaoFn: async () => null,
  interpretarFn: async () => ({ categoria: null, aluno: null, competencia: null, forma: null }),
  // identidade/autorização do grupo
  identidadeFn: async () => ({ identificado: true, nome: 'Fernanda' }),
  duplicataFn: async () => ({ ja_lancado: false }),
  responsavelFn: async () => ({ ok: false }),
  canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
  pagadorFn: async () => ({ ok: false }),
  faturasMesFn: async () => null,
  lancarFn: async (payload) => {
    lancou = payload;
    return { ok: true, movimentacao_id: 'MOV-TESTE', valor: Number(payload.valor),
             forma: payload.forma, categoria: payload.categoria, descricao: payload.descricao };
  },
  log: () => {},
});
const handler = (ev) => _h.handle(ev);

function ultima() { return enviadas[enviadas.length - 1] || ''; }
function achou(txt, alvo) { return String(txt).toLowerCase().includes(alvo.toLowerCase()); }

(async () => {
  const falhas = [];

  // PASSO 1 — comprovante ilegível com legenda (o caso da Giovanna)
  const r1 = await handler({
    chatId: CHAT, senderPhone: '5521999999999', messageId: 'ORIG1',
    body: 'Passaporte promocional da aluna Giovanna Oliveira da Cunha - R$400,00',
    hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg',
  });
  console.log('PASSO 1 (comprovante ilegível):', r1 && r1.acao);
  if (r1 && r1.acao === 'preview_enviado_sem_v3') {
    falhas.push('PASSO 1: preview descartado (bug antigo) — a conversa morreria aqui');
  }
  if (!achou(ultima(), 'confirma a forma')) {
    falhas.push('PASSO 1: nao pediu a forma. Ultima msg: ' + ultima().slice(0, 120));
  }
  if (achou(ultima(), 'nao foi registrado') || achou(ultima(), 'não foi registrado')) {
    falhas.push('PASSO 1: ainda manda a mensagem de preview invalido junto com o pedido');
  }

  // PASSO 2 — Fernanda responde a forma (o cupom dizia crédito parcelado)
  const r2 = await handler({
    chatId: CHAT, senderPhone: '5521999999999', messageId: 'RESP1',
    body: 'pode, cartão', hasMedia: false,
  });
  console.log('PASSO 2 (responde a forma):', r2 && r2.acao);
  if (!r2 || /sem_v3|sem_pendencia|nada/.test(String(r2.acao))) {
    falhas.push('PASSO 2: resposta nao encontrou a pendencia -> acao=' + (r2 && r2.acao));
  }

  console.log('');
  console.log('=== MENSAGENS DA SOL ===');
  enviadas.forEach((t, i) => console.log(`[${i + 1}] ${String(t).replace(/\n/g, ' | ').slice(0, 150)}`));
  console.log('');
  console.log('=== PAYLOAD QUE IRIA PARA A RPC DE LANCAMENTO ===');
  if (!lancou) {
    falhas.push('nao chegou a chamar o lancamento');
  } else {
    console.log(JSON.stringify({ valor: lancou.valor, forma: lancou.forma, categoria: lancou.categoria,
      cartao_modalidade: lancou.cartao_modalidade, aluno: lancou.aluno,
      autorizado_por: lancou.autorizado_por, unidade_id: lancou.unidade_id }, null, 1));
    if (Number(lancou.valor) !== 400) falhas.push('valor errado no payload: ' + lancou.valor);
    if (lancou.forma !== 'cartao') falhas.push('forma errada no payload: ' + lancou.forma);
    if (lancou.categoria !== 'passaporte') falhas.push('categoria errada: ' + lancou.categoria);
  }
  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — preview incompleto sobrevive e aceita o complemento');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.message); process.exit(1); });
