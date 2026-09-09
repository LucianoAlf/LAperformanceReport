// Caso Kailane/Barra (31/08 20:17-20:19, "Como fala com esse robô"):
// comprovante com rótulo "Aluna Luiza Rodrigues" — nome que NÃO EXISTE (a
// menina é Leticia Rodrigues; a Kailane errou o nome). Três defeitos em fila:
//  1. sol_caixa_identificar_aluno_novo_v1 (fuzzy SEM guarda de primeiro nome)
//     devolveu "Miguel Luís RODRIGUES Alves da Rocha Pinto" (sim 0.72) e o card
//     saiu com aluno e responsável de outra família — 4ª porta do buraco
//     Soraia/Laura (migrations 20260901010000 + complemento).
//  2. "O aluno está errado" → card com ALUNO "está errado" (frase sobre o
//     aluno tratada como nome).
//  3. "Aluno é Luiza Rodrigues é responsável financeiro Salomé Cristina
//     Rodrigues" → a frase INTEIRA virou o nome (não cortava no campo
//     seguinte, e o responsável declarado era ignorado).
// Shadow V4 nas mesmas mensagens: corrigir_aluno SEM nome (certo!) e
// corrigir_aluno "Luiza Rodrigues" (certo!) — 2 vitórias do roteador.
const mod = require('./_alvo.cjs');

const CHAT = '120363263030561835@g.us';
const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const KAILANE = '5521984690143';

function novo(overrides = {}) {
  const enviadas = []; const ids = []; const logs = []; const lancados = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Barra' } },
    sendFn: async (_c, t) => { enviadas.push(t); const id = 'MSG' + (++seq); ids.push(id); return id; },
    ocrFn: async () => ({ text: 'PIX R$ 399,00\nDe SALOME CRISTINA S RODRIGUES\nPara L.A MUSIC KIDS BARRA', status: 'ok', file_bytes: 83709 }),
    visaoFn: async () => ({ valor: 399, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'passaporte', aluno: 'Luiza Rodrigues', competencia: null, forma: 'pix' }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => null,
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    // com a guarda no banco, o aluno-novo não devolve mais o Miguel: não acha
    alunoNovoRespostas: null,
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

  // ── R-m: frase sobre o aluno nunca é nome ──────────────────────────────────
  checar(mod._nomeHumanoTardio('O aluno está errado') === null, '"O aluno está errado" não é nome');
  checar(mod._nomeHumanoTardio('aluno tá incorreto') === null, '"aluno tá incorreto" não é nome');
  checar(mod._nomeHumanoTardio('aluno: Maria Clara Souza') === 'Maria Clara Souza', 'REGRESSÃO: nome real segue passando');

  // ── R-n: o nome corta onde começa o campo seguinte ─────────────────────────
  const nome = mod._nomeHumanoTardio('Aluno é Luiza Rodrigues é responsável financeiro Salomé Cristina Rodrigues');
  checar(nome === 'Luiza Rodrigues', `nome deveria cortar em "responsável"; veio "${nome}"`);

  // ── e2e: a correção da Kailane com nome + responsável declarados ───────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K1',
    body: 'PASSAPORTE R$399,00 pix\n\nAluna Luiza Rodrigues',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const card1 = ultimo(A.enviadas);
  checar(/Luiza Rodrigues/i.test(card1), 'card mantém o rótulo humano (mesmo sem cadastro)');
  checar(!/Miguel/i.test(card1), 'card NÃO pode trazer o Miguel de outra família');

  const rC = await A.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K2',
    body: 'Aluno é Luiza Rodrigues é responsável financeiro Salomé Cristina Rodrigues', hasMedia: false });
  console.log('correção acao:', rC && rC.acao);
  const card2 = ultimo(A.enviadas);
  console.log('card 2:', card2.split('\n').filter(Boolean).slice(0, 7).join(' | ').slice(0, 190));
  checar(rC && /aluno_corrigido/.test(String(rC.acao)), `correção com nome+responsável trata; veio "${rC && rC.acao}"`);
  checar(/Luiza Rodrigues/i.test(card2) && !/é responsável financeiro/i.test(card2.split('\n').find((l) => /Luiza/.test(l)) || ''),
    'ALUNO = só "Luiza Rodrigues", sem a frase colada');
  checar(/Salomé Cristina Rodrigues/i.test(card2), 'responsável DECLARADO entra no card');
  checar(A.logs.some((l) => l.acao === 'responsavel_ditado_pelo_humano'), 'log do responsável ditado');

  // ── "O aluno está errado" via fallback: pede o nome ─────────────────────────
  const B = novo({ classificarCorrecaoFn: async () => ({ intencao: 'corrigir_aluno', aluno_nome: null, categoria: null, valor: null, forma: null, entidade: null }) });
  await B.h.handle({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K3',
    body: 'PASSAPORTE R$399,00 pix\n\nAluna Luiza Rodrigues',
    hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  const rB = await B.h.tratarNaoEntendida({ chatId: CHAT, senderPhone: KAILANE, messageId: 'K4', body: 'O aluno está errado' });
  console.log('fallback sem nome:', JSON.stringify(rB));
  checar(rB && rB.tratou && rB.acao === 'fallback_llm_pede_nome', 'corrigir_aluno sem nome → pede o nome');
  checar(/aluno: Nome Completo/i.test(ultimo(B.enviadas)), 'a resposta ensina o formato');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — frase sobre o aluno não é nome, e o campo seguinte encerra o nome');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
