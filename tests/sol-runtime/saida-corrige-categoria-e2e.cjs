// Caso Jhon/CG (09/09/2026, 16:08-16:09): saída de R$ 100 da segurança — o
// lançamento mais simples que existe — levou TRÊS rodadas.
//
//   16:08 Jhon  "Sol, saída em dinheiro R$100,00 pagamento semanal segurança"
//   16:08 Sol   card certo: R$ 100 · dinheiro · categoria despesa
//   16:09 Jhon  (CITANDO o card) "Sol, Categoria segurança"
//   16:09 Sol   "Entendi que é saída de segurança, mas falta o valor."   ← 🔴
//   16:09 Jhon  repete o ditado inteiro
//   16:09 Sol   segundo card, agora com a categoria certa
//   16:09 Jhon  "Pode"  → lançou
//   16:09 Sol   "📌 Ainda aguardando: PG Semana Despesa - segurança — R$ 100,00" ← 🔴
//
// 🔴 DEFEITO 1 — o valor estava na mensagem que ele CITOU. A guarda contra isso
//    já existia e cobria metade: `_pendAbertaTexto` anulava
//    `_saidaExplicitaFromCaption` mas não `_categoriaExplicitaFromCaption`, que
//    é justamente a forma de corrigir. O comentário no código dizia "com card
//    aberto, frase de saída é CORREÇÃO, nunca lançamento novo" — a intenção
//    estava escrita, o parêntese é que deixava passar.
//
// 🔴 DEFEITO 2 — o primeiro card nunca foi encerrado. Card órfão COM VALOR não
//    é ruído: um "pode" citando ele lança os mesmos R$ 100 de novo. Mesma
//    família do que foi corrigido em 08/09 para o multi-aluno ("preview bom
//    encerra a revisão manual do mesmo valor") — o caminho de saída ficou fora.
//
// 📊 A V4 tinha acertado: no shadow das 19:09:08 UTC ela leu a mesma mensagem
//    como `corrigir_categoria` (0,75) enquanto o runtime dizia
//    `saida_texto_sem_valor`.
const path = require('path');
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204226@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const JHON = '5521933330003';
const DITADO = 'Sol, saída em dinheiro R$100,00 pagamento semanal segurança';
const ultimo = (a) => String(a[a.length - 1] || '');

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancadas = [];
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    identidadeFn: async () => ({ identificado: true, nome: 'Jhon' }),
    lancarSaidaFn: async (p) => { lancadas.push(p); return { ok: true, movimentacao_id: 'MOV1' }; },
    duplicataFn: async () => ({ ja_lancado: false }),
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, ids, logs, lancadas };
}

const msg = (h, body, extra = {}) => h.handle({
  chatId: CHAT, senderPhone: JHON, messageId: 'J' + Math.random().toString(36).slice(2, 8),
  body, hasMedia: false, ...extra,
});

(async () => {
  const falhas = [];
  const checar = (cond, m) => { if (!cond) falhas.push(m); };

  // ── 1. o incidente, do jeito que aconteceu ────────────────────────────────
  const A = novo();
  const r1 = await msg(A.h, DITADO);
  checar(String(r1 && r1.acao) === 'saida_texto_preview_enviado',
    `o ditado abre o card de primeira; veio "${r1 && r1.acao}"`);
  const cardId = A.ids[A.ids.length - 1];

  // ele CITA o card e só troca a categoria — o valor está ali na frente
  const r2 = await msg(A.h, 'Sol, Categoria segurança', { quotedMessageId: cardId });
  checar(String(r2 && r2.acao) === 'preview_categoria_saida_corrigida',
    `corrigir categoria com card citado não pode pedir valor; veio "${r2 && r2.acao}"`);
  checar(!/falta o valor/i.test(ultimo(A.enviadas)),
    'a Sol não pergunta o valor que está no card que a pessoa citou');
  checar(/segurança|seguranca/i.test(ultimo(A.enviadas)), 'o card remontado mostra a categoria nova');
  checar(/100,00/.test(ultimo(A.enviadas)), 'e mantém o valor original');

  // "pode" lança UMA vez, com a categoria corrigida
  await msg(A.h, 'pode');
  checar(A.lancadas.length === 1, `"pode" lança uma vez; lançou ${A.lancadas.length}`);
  if (A.lancadas[0]) {
    checar(/seguranc?a/i.test(String(A.lancadas[0].categoria)),
      `lança com a categoria corrigida; veio "${A.lancadas[0].categoria}"`);
    checar(Math.abs(Number(A.lancadas[0].valor) - 100) < 0.01, 'lança R$ 100');
    // a descrição é reconstruída do DITADO original, não da frase de correção
    checar(!/despesa/i.test(String(A.lancadas[0].descricao || '')),
      `a descrição não pode guardar a categoria velha; veio "${A.lancadas[0].descricao}"`);
  }

  // e não sobra card aberto para alguém aprovar de novo
  const sobrou = A.enviadas.filter((t) => /Ainda aguardando/i.test(String(t)));
  checar(sobrou.length === 0, `não pode sobrar card órfão; sobrou: ${sobrou.join(' | ')}`);

  // ── 2. reenvio do MESMO ditado substitui o card, não empilha ──────────────
  const B = novo();
  await msg(B.h, DITADO);
  await msg(B.h, DITADO);
  const substituiu = B.logs.filter((l) => l.acao === 'saida_preview_substitui_reenvio');
  checar(substituiu.length === 1, 'reenviar o mesmo ditado substitui o card anterior');
  await msg(B.h, 'pode');
  checar(B.lancadas.length === 1, `reenvio não pode virar dois lançamentos; lançou ${B.lancadas.length}`);

  // ── 3. duas saídas LEGÍTIMAS de mesmo valor coexistem ────────────────────
  // O discriminador é o texto, não o valor: R$ 100 de segurança e R$ 100 de
  // material no mesmo dia são dois lançamentos de verdade.
  const C = novo();
  await msg(C.h, DITADO);
  await msg(C.h, 'Sol, saída em dinheiro R$100,00 material de limpeza');
  const substituiuC = C.logs.filter((l) => l.acao === 'saida_preview_substitui_reenvio');
  checar(substituiuC.length === 0, 'saída de outro assunto com o mesmo valor NÃO substitui a anterior');

  // ── 4. sem card aberto, continua pedindo o valor (não inventa) ───────────
  const D = novo();
  const rD = await msg(D.h, 'Sol, Categoria segurança');
  checar(String(rD && rD.acao) === 'saida_texto_sem_valor',
    `sem card aberto a Sol precisa do valor; veio "${rD && rD.acao}"`);
  checar(D.lancadas.length === 0, 'e não lança nada');

  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s):`);
    falhas.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('\nsaída: correção de categoria e reenvio — todos os cenários ok');
})().catch((e) => { console.error(e); process.exit(1); });
