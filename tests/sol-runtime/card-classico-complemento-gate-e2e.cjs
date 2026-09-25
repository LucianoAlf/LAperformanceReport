// E2E do portão agent-first × card clássico incompleto (Fefê/Recreio, 25/09/2026).
//
// O comprovante do Bernardo saiu com "me confirma a forma". A Fefê respondeu
// "Sol, o pagamento foi feito por pix" e o texto foi parar no AGENTE (o Recreio é
// o grupo agent-first), que respondeu sobre um lançamento de passaporte de 16/09.
// Raiz: `deveTratarComplementoDeterministico` só olhava rascunhos da V4; o card
// clássico pendente em `pendentes` era invisível para ele.
//
// Prova, com o handler REAL (sendFn/lancarFn fakes, nada vai ao WhatsApp nem ao
// caixa), que:
//   1. o card nasce incompleto pedindo a forma;
//   2. o portão SEGURA "Sol, o pagamento foi feito por pix" de quem mandou;
//   3. o portão NÃO segura: outra pessoa, prosa longa, texto sem forma;
//   4. o handle determinístico completa o card com pix.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
const mod = require('./_alvo.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const FEFE = '5521900000001';
const OUTRA = '5521900000002';
const enviadas = [];
let seq = 0;

const _h = mod.criarHandlerFinanceiro({
  grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
  sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
  ocrFn: async () => ({ texto: '', status: 'texto_vazio' }),
  visaoFn: async () => null,
  interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Bernardo Neumann da Cunha', competencia: '09/2026', forma: null }),
  identidadeFn: async () => ({ identificado: true, nome: 'Fernanda' }),
  duplicataFn: async () => ({ ja_lancado: false }),
  responsavelFn: async () => ({ ok: true, aluno_nome: 'Bernardo Neumann da Cunha', responsavel_nome: 'Bruno Aires da Cunha' }),
  canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
  casarFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
  pagadorFn: async () => ({ ok: false }),
  faturasMesFn: async () => null,
  lancarFn: async (p) => ({ ok: true, movimentacao_id: 'MOV-TESTE', valor: Number(p.valor), forma: p.forma }),
  log: () => {},
});

(async () => {
  const falhas = [];
  const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

  const r1 = await _h.handle({
    chatId: CHAT, senderPhone: FEFE, messageId: 'ORIG1',
    body: 'Parcela do mês de Setembro do aluno Bernardo Neumann da Cunha - R$442,75',
    hasMedia: true, mediaType: 'image', mediaPath: '/tmp/inexistente.jpg',
  });
  console.log('1. comprovante:', r1 && r1.acao);
  // Em produção a RPC V3 recusa preview sem forma e o card vira
  // `preview_incompleto_aguardando_complemento`; com o ledger FAKE ele registra
  // e sai `preview_enviado`. Nos dois casos o que importa é o mesmo: card
  // pendente, SEM forma, pedindo a forma.
  ok(r1 && ['preview_incompleto_aguardando_complemento', 'preview_enviado'].includes(r1.acao)
      && /forma não identificada/i.test(enviadas[0] || ''),
    '1: esperava card pendente pedindo a forma, veio ' + (r1 && r1.acao));

  const gate = (ev) => _h.deveTratarComplementoDeterministico({ chatId: CHAT, hasMedia: false, ...ev });

  ok(gate({ senderPhone: FEFE, body: 'Sol, o pagamento foi feito por pix' }) === true,
    '2: portão NÃO segurou "foi feito por pix" de quem mandou o comprovante');
  ok(gate({ senderPhone: OUTRA, body: 'foi pix' }) === false,
    '3a: portão segurou mensagem de OUTRA pessoa sem citação');
  ok(gate({ senderPhone: OUTRA, body: 'foi pix', quotedMessageId: 'MSG1' }) === true,
    '3b: portão NÃO segurou outra pessoa CITANDO o card');
  ok(gate({ senderPhone: FEFE, body: 'Gente, lembrando que amanhã tem reunião às 10h e quem pagar por pix manda o comprovante aqui' }) === false,
    '3c: portão segurou prosa longa');
  ok(gate({ senderPhone: FEFE, body: 'Sol, o nome do aluno é Bernardo' }) === false,
    '3d: portão segurou texto sem forma nem valor');

  const r2 = await _h.handle({ chatId: CHAT, senderPhone: FEFE, messageId: 'RESP1',
    body: 'Sol, o pagamento foi feito por pix', hasMedia: false });
  console.log('4. complemento:', r2 && r2.acao, r2 && r2.forma);
  ok(r2 && r2.acao === 'preview_completado' && r2.forma === 'pix',
    '4: handle não completou a forma -> ' + JSON.stringify(r2));
  ok(gate({ senderPhone: FEFE, body: 'foi pix' }) === false,
    '5: card já completo continua sendo segurado como incompleto');

  console.log('\n=== MENSAGENS DA SOL ===');
  enviadas.forEach((t, i) => console.log(`[${i + 1}] ${String(t).replace(/\n/g, ' | ').slice(0, 160)}`));
  if (falhas.length) { console.log('\nRESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('\nRESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
