// E2E do caso Jhon/CG 25/08: legenda rotula "aluno: Rafael Magalhães Barbosa", a Sol
// deduziu Marcos pelo pagador do PIX, e a correção do humano vazou para o LLM (que
// inventou R$ 53,00).
//
// Cobre: (1) rótulo humano ganha do pagador; (2) correção CITANDO o card alcança
// pendência cujo aluno está errado mas plausível.
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

function novo() {
  const enviadas = [];
  const ids = [];
  const logs = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    // OCR/visão entregam o PAGADOR do PIX, como no caso real
    ocrFn: async () => ({ texto: 'MARCOS LAZARO SANTO ESCOLA DE MUSICA L A R$ 300,00', status: 'ok' }),
    visaoFn: async () => ({ valor: 300, forma: 'pix', pagador_nome: 'Marcos Lazaro Santo' }),
    interpretarFn: async () => ({ categoria: 'passaporte', aluno: null, competencia: null, forma: 'pix' }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhonatan Vicente' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    log: (o) => logs.push(o),
  });
  return { handle: (e) => h.handle(e), temPendencia: h.temPendencia, enviadas, ids, logs };
}

(async () => {
  const falhas = [];
  const H = novo();

  // PASSO 1 — comprovante com legenda que ROTULA o aluno
  await H.handle({
    chatId: CHAT, senderPhone: '5521995697704', messageId: 'ORIG',
    body: 'PG Passaporte (Pix)\naluno: Rafael Magalhães Barbosa\nLA CG - R$300,00',
    hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg',
  });
  const card1 = H.enviadas[H.enviadas.length - 1] || '';
  console.log('PASSO 1 — aluno no card:');
  console.log('  ', (card1.match(/\*ALUNO\*[\s\S]{0,120}/) || [''])[0].replace(/\n/g, ' | ').slice(0, 150));

  if (/Marcos/i.test(card1)) {
    falhas.push('PASSO 1: o pagador (Marcos) sobrescreveu o rótulo humano (Rafael)');
  }
  if (!/Rafael/i.test(card1)) {
    falhas.push('PASSO 1: o rótulo "aluno: Rafael Magalhães Barbosa" não apareceu no card');
  }

  // PASSO 2 — humano corrige CITANDO o card. Antes isso caía no LLM.
  const idCard = H.ids[H.ids.length - 1];
  const r2 = await H.handle({
    chatId: CHAT, senderPhone: '5521995697704', messageId: 'CORR',
    body: 'Sol, o aluno é o Rafael Magalhães Barbosa',
    hasMedia: false, quotedMessageId: idCard,
  });
  console.log('PASSO 2 — acao:', r2 && r2.acao);
  if (!r2 || r2.acao === 'nada') {
    falhas.push('PASSO 2: correção citada devolveu "nada" — vazaria para o LLM de novo');
  }

  console.log('');
  console.log('logs:', H.logs.map((l) => l.acao).filter(Boolean).join(' -> ').slice(0, 300));
  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — rótulo humano manda e a correção citada é tratada');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
