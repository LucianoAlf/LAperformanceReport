// Rabiolas da auditoria de 29/08 (fluxo Soraia + fechamento de CG).
//
// 1. RESPONSÁVEL DA FAMÍLIA ERRADA: o card da Soraia saiu com "Resp. financeiro:
//    Rayanne do Nascimento Sobreira" — responsável da LAURA (confirmado no banco;
//    a Soraia está SEM responsável). A RPC sol_caixa_responsavel_aluno só busca
//    ATIVOS (a Soraia é lead), casou a Laura por similaridade, e o runtime usava
//    o responsável sem conferir o `aluno_nome` que a própria RPC devolve. O dado
//    sujo foi até o lançamento.
//
// 2. DESPEDIDAS: "Fechado pessoal" / "Bom final de semana" iam ao LLM, que
//    respondia vazio, e o fallback do gateway postava "(Response formatting
//    failed, plain text:)" no grupo (2x às 15:02-15:03).
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');
const gate = require('/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/group-engagement.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const MAYRA = '5521955550001';

function novo(overrides = {}) {
  const enviadas = []; const logs = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: 'PIX R$ 976,00\nOrigem Soraia da Silveira Duarte', status: 'ok', file_bytes: 1111 }),
    visaoFn: async () => ({ valor: 976, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Soraia da Silveira Duarte', competencia: '02/2026', forma: 'pix' }),
    canonicaFn: async () => null,
    casarFn: async () => null,
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, logs };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── 1a. responsável de OUTRA família é rejeitado ────────────────────────────
  const A = novo({
    // shape real da RPC: devolve com QUEM o fuzzy casou
    responsavelFn: async () => ({ ok: true, aluno_nome: 'Laura Sobreira da Silveira',
      responsavel_nome: 'Rayanne do Nascimento Sobreira', confianca_nome: 0.52 }),
  });
  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'A1',
    body: 'PG Parcelas 02/2026 e 05/2026 - Aluna Soraia da Silveira Duarte - LA CG - R$976,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const cardA = ultimo(A.enviadas);
  console.log('card A:', cardA.split('\n').filter(l => /ALUNO|Resp|Soraia|Rayanne/i.test(l)).join(' | ').slice(0, 140));
  checar(/Soraia/i.test(cardA), 'card mantém a Soraia');
  checar(!/Rayanne/i.test(cardA), 'a responsável da Laura NÃO pode entrar no card da Soraia');
  checar(A.logs.some(l => l.acao === 'responsavel_rejeitado_nome_diverge'),
    'deveria logar responsavel_rejeitado_nome_diverge');

  // ── 1b. responsável da PRÓPRIA pessoa continua entrando ────────────────────
  const B = novo({
    responsavelFn: async () => ({ ok: true, aluno_nome: 'Soraia da Silveira Duarte',
      responsavel_nome: 'Marcia Duarte', confianca_nome: 0.95 }),
  });
  await B.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'B1',
    body: 'PG Parcelas 02/2026 - Aluna Soraia da Silveira Duarte - R$976,00',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  checar(/Marcia Duarte/i.test(ultimo(B.enviadas)), 'responsável legítimo continua no card');

  // ── 2. despedidas encerram o turno (não vão ao LLM) ─────────────────────────
  const despedidas = ['Bom final de semana', 'bom fim de semana!', 'Boa semana pessoal', 'até segunda', 'Até amanhã', 'bom descanso'];
  for (const d of despedidas) {
    if (!gate.encerraTurnoDaSol(d)) falhas.push(`encerraTurnoDaSol("${d}") deveria ser true`);
  }
  const naoEncerram = ['pode fechar o caixa', 'bom dia', 'a forma é dinheiro', 'Sol, o valor foi R$100'];
  for (const d of naoEncerram) {
    if (gate.encerraTurnoDaSol(d)) falhas.push(`encerraTurnoDaSol("${d}") NÃO podia ser true`);
  }
  console.log('gate de despedidas: ok');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — responsável certo ou nenhum, e despedida encerra em silêncio');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
