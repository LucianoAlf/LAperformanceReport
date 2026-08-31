// Caso Kailane/Barra (31/08 16:28-16:31): comprovante de R$399 (taxa de
// matrícula = passaporte, vencendo no dia). A aluna também tinha uma parcela de
// R$460 vencida em 15/08. A Sol montou o card com a PARCELA ATRASADA
// ("atrasada há 16 dias, hoje R$471,65", "o comprovante difere do valor"), e
// quando a consultora respondeu "A parcela não está vencida, será apenas mês
// que vem. Já foi corrigido no sistema", a Sol respondeu "Ajustei: a categoria
// é parcela" — ou seja, além de não ouvir, DESTRUIU a categoria correta
// (passaporte → parcela) e repetiu o mesmo card. Três vezes.
//
// Raízes cobertas aqui (a da RPC está na migration 20260831210000):
//  R-h: a palavra "parcela" SOLTA não é comando de categoria. A condição tinha
//       `\bparcela\b` como alternativa, então qualquer frase que mencionasse a
//       palavra virava "a categoria é parcela".
//  R-i: contestação de fatura é uma gramática que não existia. Quando a equipe
//       diz que a fatura casada está errada/desatualizada, a Sol SOLTA a fatura
//       e remonta o card sem o bloco de atraso/multa — em vez de repetir.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const KAILANE = '5521922220001';

const FATURA_ERRADA = {
  ok: true, aluno_nome: 'Luiza Silva Araújo', responsavel_nome: 'Patrícia Helena Silva Sousa',
  motivo_escolha: 'atrasada',
  fatura: {
    tipo_fatura: 'parcela', descricao: 'Parcela 08/2026 do curso de Canto',
    competencia: '2026-08-01', data_vencimento: '2026-08-15', numero_parcela: 1,
    total_parcelas_contrato: 12, status: 'aberta', vencida: true, dias_atraso: 16,
    valor_da_parcela: 460, valor_hoje: 471.65,
  },
};

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: 'Sua compra foi aprovada\nValor do pagamento\nR$ 399,00', status: 'ok', file_bytes: 20167 }),
    visaoFn: async () => ({ valor: 399, forma: 'cartao' }),
    interpretarFn: async () => ({ categoria: 'passaporte', aluno: 'Luiza Silva Araújo', competencia: null, forma: 'cartao' }),
    canonicaFn: async () => FATURA_ERRADA,
    casarFn: async () => null,
    responsavelFn: async () => ({ ok: true, aluno_nome: 'Luiza Silva Araújo', responsavel_nome: 'Patrícia Helena Silva Sousa' }),
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Kailane' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: true, movimentacao_id: 'M' + lancados.length, valor: p.valor, forma: p.forma }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancados };
}
const ultimo = (a) => String(a[a.length - 1] || '');

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── unidades R-i: o detector de contestação ─────────────────────────────────
  const contesta = [
    'A parcela não está vencida, será apenas mês que vem. Já foi corrigido no sistema',
    'TA ERRADO A PARCELA NÃO ESTÁ VENCIDA',
    'essa fatura está errada, já corrigi no sistema',
    'não venceu ainda não, vence mês que vem',
  ];
  for (const t of contesta) {
    if (!mod._contestaFatura(t)) falhas.push(`_contestaFatura("${t.slice(0, 34)}") deveria ser true`);
  }
  const naoContesta = [
    'aluno: Maria Clara Souza',
    'pode',
    'coloca a categoria como venda',
    'é de banda, não tem aluno específico',
    'a forma é dinheiro',
  ];
  for (const t of naoContesta) {
    if (mod._contestaFatura(t)) falhas.push(`_contestaFatura("${t}") NÃO podia ser true`);
  }

  // ── e2e: o fluxo real ───────────────────────────────────────────────────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K1',
    body: '', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://comprovante.pdf'] });
  const card1 = ultimo(A.enviadas);
  checar(/Atrasada/i.test(card1), 'setup: o card de hoje traz a fatura atrasada');

  const rC = await A.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K2',
    body: 'A parcela não está vencida, será apenas mês que vem. Já foi corrigido no sistema', hasMedia: false });
  console.log('contestação acao:', rC && rC.acao);
  const card2 = ultimo(A.enviadas);
  console.log('card 2:', card2.split('\n').filter(Boolean).slice(0, 8).join(' | ').slice(0, 200));

  checar(rC && rC.acao === 'preview_fatura_contestada',
    `contestação deveria soltar a fatura; veio "${rC && rC.acao}"`);
  checar(!/Ajustei: a categoria é parcela/i.test(card2),
    'R-h: a palavra "parcela" na frase NÃO pode virar correção de categoria');
  checar(!/Atrasada/i.test(card2), 'card remontado não pode repetir "atrasada"');
  checar(!/multa\/mora/i.test(card2), 'card remontado não pode repetir multa/mora');
  checar(!/difere do valor da parcela/i.test(card2), 'card remontado não pode repetir a divergência de valor');
  checar(/399/.test(card2), 'card mantém os R$ 399');
  checar(/Luiza Silva Araújo/i.test(card2), 'card mantém a aluna');
  checar(/passaporte/i.test(card2), 'R-h: a categoria passaporte NÃO pode virar parcela');

  // ...e o "pode" lança com a categoria certa e sem fatura vinculada
  await A.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K3', body: 'pode', hasMedia: false });
  checar(A.lancados.length === 1, `"pode" deveria lançar; lançou ${A.lancados.length}`);
  if (A.lancados[0]) {
    checar(Number(A.lancados[0].valor) === 399, `valor 399; veio ${A.lancados[0].valor}`);
    checar(A.lancados[0].categoria === 'passaporte', `categoria passaporte; veio "${A.lancados[0].categoria}"`);
    checar(!A.lancados[0].fatura_id, 'fatura contestada não pode ser vinculada no lançamento');
  }

  // ── REGRESSÃO R-h: correção de categoria EXPLÍCITA continua funcionando ─────
  const B = novo({ interpretarFn: async () => ({ categoria: 'lojinha', aluno: 'Luiza Silva Araújo', competencia: null, forma: 'cartao' }), canonicaFn: async () => null });
  await B.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K4',
    body: 'venda', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://c.pdf'] });
  const rB = await B.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K5',
    body: 'não é lojinha, é parcela', hasMedia: false });
  console.log('REG categoria explícita:', rB && rB.acao);
  checar(rB && /parcela_corrigida|competencia_corrigida/.test(String(rB.acao)),
    `"não é lojinha, é parcela" deve seguir corrigindo; veio "${rB && rB.acao}"`);

  // ── REGRESSÃO: "Parcela 08/2026" (ditado curto) continua sendo aceito ───────
  const C = novo({ canonicaFn: async () => null });
  await C.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K6',
    body: '', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://c.pdf'] });
  const rCc = await C.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K7',
    body: 'Parcela 08/2026', hasMedia: false });
  console.log('REG ditado parcela:', rCc && rCc.acao);
  checar(rCc && rCc.acao !== 'nada', `"Parcela 08/2026" não pode virar "nada"; veio "${rCc && rCc.acao}"`);

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — a Sol ouve a contestação e para de repetir a fatura errada');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
