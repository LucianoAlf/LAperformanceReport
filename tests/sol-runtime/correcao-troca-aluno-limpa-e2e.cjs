// Caso Jhon/CG (01/09 17:53): a correção "Sol, falta o valor de R$432,00
// referente a aluna Thyfany De Souza" trocou aluno e valor no card — mas a
// FATURA DO DAVI (composto de 4 parcelas somando 1.290) ficou grudada, e o
// responsável do Davi também. Recebimento de um, fatura de outro.
// Raiz: `composto || alvoP.composto` ressuscitava enriquecimento do aluno
// trocado. Agora: aluno MUDOU => composto/canonica/parcela/responsável do
// anterior morrem juntos. E "calma ai" (Luciano) é conversa, não divisão.
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const JHON = '5521933330001';

const COMPOSTO_DAVI = {
  ok: true, aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', competencia: '08/2026',
  partes: [
    { curso: 'Bateria', valor: 380 }, { curso: 'Teclado / Piano', valor: 367 },
    { curso: 'Harmonia', valor: 149 }, { curso: 'Canto T', valor: 394 },
  ],
  itens: [
    { aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', valor: 380, categoria: 'parcela', competencia: '08/2026', descricao: 'Bateria', canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000001' },
    { aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', valor: 367, categoria: 'parcela', competencia: '08/2026', descricao: 'Teclado / Piano', canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000002' },
    { aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', valor: 149, categoria: 'parcela', competencia: '08/2026', descricao: 'Harmonia', canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000003' },
    { aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', valor: 394, categoria: 'parcela', competencia: '08/2026', descricao: 'Canto T', canonical_fatura_id: 'aaaaaaaa-0000-0000-0000-000000000004' },
  ],
};

function novo(overrides = {}) {
  const enviadas = []; const logs = []; const lancados = []; let seq = 0; let led = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: 'Comprovante\nValor R$ 1.290,00\nPix\nDestino ESCOLA DE MUSICA L A', status: 'ok', file_bytes: 999 }),
    visaoFn: async () => ({ valor: 1290, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Davi Guilherme', competencia: '08/2026', forma: 'pix' }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => null,
    responsavelFn: async (u, nome) => (/davi/i.test(String(nome))
      ? { ok: true, aluno_nome: 'Davi Guilherme De Souza Chaves Ribeiro', responsavel_nome: 'Elisangela de Souza Chaves Ribeiro' }
      : null),
    faturasMesFn: async (u, nome) => (/davi/i.test(String(nome)) ? COMPOSTO_DAVI : null),
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'LED-' + (++led) }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M1', valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── setup: card do Davi com composto de 4 parcelas ──────────────────────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'C1',
    body: 'Parcela 08/2026 aluno Davi Guilherme', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const card1 = ultimo(A.enviadas);
  checar(/\*PARCELAS\*/i.test(card1) && /1\.290|380/.test(card1), 'setup: card do Davi com o lote de faturas');

  // ── a correção real: troca aluno e valor ────────────────────────────────────
  const rC = await A.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'C2',
    body: 'Sol, falta o valor de R$432,00 referente a aluna Thyfany De Souza', hasMedia: false });
  console.log('correção acao:', rC && rC.acao);
  const card2 = ultimo(A.enviadas);
  console.log('card 2:', card2.split('\n').filter(Boolean).slice(0, 8).join(' | ').slice(0, 220));
  checar(rC && rC.acao === 'lote_invalidado_por_item_faltante', 'correcao deveria invalidar o snapshot inteiro');
  checar(/Thyfany/i.test(card2) && /432/.test(card2), 'aviso identifica o item faltante');
  checar(/Invalidei o lote anterior/i.test(card2), 'aviso nao declarou a invalidacao');
  checar((A.h._pendentes.get(CHAT) || []).length === 0, 'lote antigo continuou aprovavel');

  // ── mesma pessoa: enriquecimento continua sobrevivendo (regressão) ──────────
  const B = novo();
  await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'C3',
    body: 'Parcela 08/2026 aluno Davi Guilherme', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  await B.h.handle({ chatId: CHAT, senderPhone: JHON, messageId: 'C4',
    body: 'aluno: Davi Guilherme De Souza Chaves Ribeiro', hasMedia: false });
  const pendB = (B.h._pendentes.get(CHAT) || [])[0];
  checar(pendB && pendB.tipoOperacao === 'lancar_recebimento_lote' && pendB.itens.length === 4,
    'REGRESSÃO: mesma pessoa mantém o lote imutável');

  // ── "calma ai" é conversa ───────────────────────────────────────────────────
  for (const t of ['calma ai', 'pera', 'espera', 'calma']) {
    if (!mod.ehConversaSemComando(t)) falhas.push(`ehConversaSemComando("${t}") deveria ser true`);
  }
  checar(mod.ehConversaSemComando('pode') === false, 'REGRESSÃO: "pode" não é conversa');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — trocar de aluno limpa a bagagem do anterior');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
