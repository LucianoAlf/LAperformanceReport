// Caso Ana Paula/CG (31/08 14:12-14:26): pagamentos do evento "Bora Gravar -
// Julina Rock Fest" (bandas StarLine R$633 e Pareidolia R$300).
//
// 1. "Sol,é de Banda, nome Starline , não tem aluno específico" (citando o card)
//    levou "Não entendi essa" — não existia gramática de SEM ALUNO. Ela então
//    escreveu "Nome do aluno : Starline" e o lançamento saiu com ALUNO
//    "Nome do aluno Starline" (rótulo inteiro grudado).
// 2. "pode , mas coloca a categoria como venda" caiu em SILÊNCIO (result nada,
//    nenhuma resposta) e o "pode" seco de 5 min depois lançou com categoria
//    "outro" — a correção ditada foi perdida.
//
// Raízes:
//  R-c: gramática sem-aluno/banda — limpa a exigência de ALUNO, guarda a
//       entidade (Banda X) na descrição, categoria vira venda.
//  R-d: aprovação condicional "pode, mas <correção de categoria>" — a correção
//       viaja junto com o pode: aplica, re-registra o preview V3 (o validador
//       exige categoria idêntica entre preview e aprovação) e lança.
const mod = require('./_alvo.cjs');

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const ANA = '5521944440001';

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: 'Destino ESCOLA DE MUSICA L A\nOrigem Adriana Freire Rodrigues\nR$ 633,00', status: 'ok', file_bytes: 43985 }),
    visaoFn: async () => ({ valor: 633, forma: 'pix', pagador_nome: 'Adriana Freire Rodrigues' }),
    interpretarFn: async () => ({ categoria: 'venda', aluno: null, competencia: null, forma: 'pix' }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => null,
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    // é o que produziu o card real: pagadora com 2 alunos na família → candidatos
    pagadorFn: async () => ({ ok: true, via: 'familia', total: 2, ambiguo: true,
      alunos: [{ aluno_nome: 'Aline Corrêa Reis Freire' }, { aluno_nome: 'Fernanda Gonçalves Freire' }] }),
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Ana Paula' }),
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

  // ── unidades: gramática e parser ────────────────────────────────────────────
  const sa = mod._semAlunoDeclarado('Sol,é de Banda, nome Starline , não tem aluno específico');
  checar(!!sa, '"é de Banda ... não tem aluno específico" deveria disparar sem-aluno');
  checar(sa && sa.entidade === 'Banda Starline', `entidade deveria ser "Banda Starline"; veio "${sa && sa.entidade}"`);
  checar(mod._semAlunoDeclarado('é o adicional de banda do Rafael Souza') === null,
    '"adicional de banda do Rafael" NÃO pode disparar sem-aluno (tem aluno)');
  checar(mod._semAlunoDeclarado('a aluna é Soraia da Silveira Duarte') === null,
    'correção de nome não dispara sem-aluno');

  const p1 = mod.casarPode('pode , mas coloca a categoria como venda');
  checar(p1.pode === true, '"pode, mas coloca a categoria como venda" É aprovação');
  checar(p1.categoria === 'venda', `a categoria ditada deveria vir junto; veio "${p1.categoria}"`);
  checar(mod.casarPode('Pode, mas muda a categoria pra lojinha').categoria === 'lojinha', 'variação "muda ... pra lojinha"');
  checar(mod.casarPode('pode ser').pode === false, 'REGRESSÃO: "pode ser" segue não aprovando');
  checar(mod.casarPode('pode').pode === true && !mod.casarPode('pode').categoria, 'REGRESSÃO: "pode" seco segue puro');
  checar(mod.casarPode('pode responder mas nao lanca nada').pode === false,
    'REGRESSÃO: "pode" no meio de frase de conversa segue não aprovando');

  // ── R-c: o fluxo real da StarLine ───────────────────────────────────────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'S1',
    body: 'PG Bora Gravar! Julina rock fest - StarLine\nR$633', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const card1 = ultimo(A.enviadas);
  checar(/qual aluno/i.test(card1), 'setup: o card de hoje pergunta de qual aluno é (candidatos da família)');
  const cardId = A.ids[A.ids.length - 1];

  const rSA = await A.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'S2',
    body: 'Sol,é de Banda, nome Starline , não tem aluno específico', hasMedia: false, quotedMessageId: cardId });
  console.log('sem-aluno acao:', rSA && rSA.acao);
  const card2 = ultimo(A.enviadas);
  console.log('card sem-aluno:', card2.split('\n').filter(Boolean).slice(0, 7).join(' | ').slice(0, 180));
  checar(rSA && rSA.acao === 'preview_sem_aluno_corrigido',
    `"é de banda, não tem aluno" deveria corrigir o card; veio "${rSA && rSA.acao}"`);
  checar(/Banda Starline/i.test(card2), 'card deveria registrar a Banda Starline');
  checar(/sem aluno espec/i.test(card2), 'card deveria dizer que não tem aluno específico');
  checar(!/qual aluno/i.test(card2), 'card não pode continuar perguntando de qual aluno é');

  await A.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'S3', body: 'Pode', hasMedia: false });
  checar(A.lancados.length === 1, `"Pode" deveria lançar; lançou ${A.lancados.length}`);
  if (A.lancados[0]) {
    checar(Number(A.lancados[0].valor) === 633, `valor 633; veio ${A.lancados[0].valor}`);
    checar(A.lancados[0].categoria === 'venda', `categoria venda; veio "${A.lancados[0].categoria}"`);
    checar(/Banda Starline/i.test(String(A.lancados[0].descricao || '')), 'descrição com a Banda Starline');
    checar(!A.lancados[0].aluno, 'lançamento sem aluno (não é de aluno)');
  }

  // ── R-d: o fluxo real da Pareidolia ("pode, mas coloca a categoria como venda")
  const B = novo({
    ocrFn: async () => ({ text: 'ComprovanteSantander\nBora Gravar - Julina Rock Fest - Pareidolia\nR$300,00', status: 'ok', file_bytes: 5852 }),
    visaoFn: async () => ({ valor: 300, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'outro', aluno: 'Bora Gravar Julina Rock Fest Pareidolia', competencia: null, forma: 'pix' }),
    pagadorFn: async () => null,
  });
  await B.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'S4',
    body: 'Bora Gravar - Julina Rock Fest - Pareidolia\nR$300,00', hasMedia: true, mediaType: 'document', mediaUrls: ['fake://comprovante.pdf'] });
  checar(B.enviadas.length === 1, 'setup: card da Pareidolia enviado');

  const rPode = await B.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'S5',
    body: 'pode , mas coloca a categoria como venda', hasMedia: false });
  console.log('pode condicional acao:', rPode && rPode.acao);
  checar(rPode && rPode.acao === 'lancado', `"pode, mas categoria venda" deveria lançar; veio "${rPode && rPode.acao}"`);
  checar(B.lancados.length === 1, `deveria ter 1 lançamento; tem ${B.lancados.length}`);
  if (B.lancados[0]) {
    checar(B.lancados[0].categoria === 'venda', `categoria corrigida para venda; veio "${B.lancados[0].categoria}"`);
    checar(/^Venda/i.test(String(B.lancados[0].descricao || '')), `descrição refeita com Venda; veio "${B.lancados[0].descricao}"`);
    checar(Number(B.lancados[0].valor) === 300, 'valor 300 preservado');
  }
  checar(B.logs.some((l) => l.acao === 'categoria_corrigida_no_pode'), 'log da correção no pode');
  checar(/venda/i.test(ultimo(B.enviadas)), 'confirmação mostra a categoria corrigida');

  // ── correção tardia com rótulo de 1 token ("Nome do aluno : Starline") ──────
  const C = novo();
  await C.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'S6',
    body: 'PG Bora Gravar! Julina rock fest - StarLine\nR$633', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rNome = await C.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'S7',
    body: 'Nome do aluno : Starline', hasMedia: false, quotedMessageId: C.ids[C.ids.length - 1] });
  checar(rNome && /preview_aluno_corrigido/.test(String(rNome.acao)),
    `rótulo com dois-pontos deveria corrigir; veio "${rNome && rNome.acao}"`);
  const cardC = ultimo(C.enviadas);
  checar(!/Nome do aluno Starline/i.test(cardC), 'o rótulo inteiro não pode virar o nome');
  checar(/Starline/i.test(cardC), 'o nome ditado (Starline) entra no card');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — banda sem aluno tem voz, e o pode condicional aplica a correção');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
