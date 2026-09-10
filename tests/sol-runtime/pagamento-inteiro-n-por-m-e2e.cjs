// N ALUNOS × N FATURAS PONTA A PONTA — do que o humano escreve ao que o caixa
// grava. É o caso que a Mayra abandonou em 09/09 depois de 19 minutos e 6
// mensagens: PIX de R$ 1.722,00 para dois alunos, um deles com QUATRO cursos.
//
// 🔴 POR QUE ESTE TESTE EXISTE. O resolver antigo
//    (`sol_caixa_resolver_multi_aluno_v1`) escolhe UMA fatura por aluno
//    (`limit 1`) e depois recusa o lote inteiro com `soma_itens_divergente` —
//    então aluno com dois cursos, ou com passaporte + parcela, nunca fechava.
//    O par tinha sido lançado com sucesso em 01/09, e por isso o time chama
//    isso de regressão mesmo sem ninguém ter mexido no código.
//
// ⚠️ A FIXTURE NÃO FOI INVENTADA. É a saída literal de
//    `sol_caixa_resolver_pagamento_itens_v1` rodando contra produção em
//    09/09/2026 (leitura pura, função recriada em `pg_temp` para não mutar
//    nada): 2 alunos declarados → 5 linhas, 5 `canonical_fatura_id` distintos,
//    soma 1722.00. Fixture inventada testaria o que eu imagino; esta testa o
//    que o banco respondeu.
//
// ⚠️ Roda em CHECKOUT LIMPO, sem patch e sem VPS: lê o artefato canônico do
//    repositório. Era exatamente o buraco que o Alfredo apontou no 02b849eb.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ALVO = process.env.SOL_CAIXA_CJS
  || path.join(__dirname, '..', '..', 'vps', 'la-hq', 'sol', 'runtime', 'caixa-financeiro.cjs');

const mod = { exports: {} };
const ctx = {
  module: mod, exports: mod.exports, require, console, process,
  __filename: ALVO, __dirname: path.dirname(ALVO),
  Buffer, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ALVO, 'utf8'), ctx, { filename: ALVO });

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const MAYRA = '5521933330002';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ultimo = (a) => String(a[a.length - 1] || '');

// ── saída REAL de sol_caixa_resolver_pagamento_itens_v1 (produção, 09/09) ─────
const fat = (id, desc, valor) => ({
  canonical_fatura_id: id, descricao: desc, tipo_fatura: 'parcela',
  competencia: '2026-09-01', status: 'paga', data_pagamento: '2026-09-04',
  forma_pagamento: { nome: 'Pix', fonte: 'transacao', rotulo: 'Pago via' },
  valor_pago: String(valor.toFixed(2)), valor_hoje: null,
});
const linha = (ordem, nome, desc, valor, id) => ({
  ordem, aluno_nome: nome, responsavel_financeiro: 'Elisangela de Souza Chaves Ribeiro',
  valor, categoria: 'parcela', competencia: '09/2026', canonical_fatura_id: id,
  descricao: desc, sem_vinculo_fatura: false, declarado_pelo_humano: false,
  fatura: fat(id, desc, valor),
});
const DAVI = 'Davi Guilherme De Souza Chaves Ribeiro';
const THU = 'Thuanny de Souza Chaves Ribeiro';
const CINCO_LINHAS = {
  ok: true, soma_itens: 1722, valor_total: 1722, alunos: 2,
  itens: [
    linha(1, DAVI, 'Parcela 09/2026 do curso de Harmonia', 149, '50664835-c59f-483e-877a-4ac0d6cf67e7'),
    linha(2, DAVI, 'Parcela 09/2026 do curso de Guitarra', 380, '6a205e35-9047-4cc9-971d-ad8d9f520399'),
    linha(3, DAVI, 'Parcela 09/2026 do curso de Teclado  / Piano', 367, '7032a728-36cd-4929-b92f-d8a53e0799c1'),
    linha(4, DAVI, 'Parcela 09/2026 do curso de Canto', 394, '74e84071-efc1-4b91-989e-26bc6eb4b46d'),
    linha(5, THU, 'Parcela 09/2026 do curso de Canto', 432, '3153ad70-2cb8-4f67-b41e-4bd3e688e0de'),
  ],
};

function novo(overrides = {}) {
  const enviadas = []; const logs = []; const lancadosLote = []; const resolverCalls = [];
  let seq = 0;
  const criar = vm.runInContext('criarHandlerFinanceiro', ctx);
  const h = criar({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: 'Comprovante\nValor R$ 1.722,00\nPix', status: 'ok', file_bytes: 4198 }),
    visaoFn: async () => ({ valor: 1722, forma: 'pix' }),
    // 🔴 É o MODELO que enxerga "são dois alunos", lendo a legenda — não um
    //    regex de portaria. `pagamentos[]` é o contrato que a interpretação
    //    ganhou em 09/09 justamente para isso. O regex sobrou como atalho
    //    barato, e por isso o teste não depende dele.
    interpretarFn: async () => ({
      categoria: 'parcela', aluno: null, competencia: '09/2026', forma: 'pix',
      pagamentos: [{ aluno: DAVI, valor: 1290 }, { aluno: 'Thuanny De Souza', valor: 432 }],
    }),
    interpretarMultiFn: async () => null,
    resolverMultiFn: async (args) => { resolverCalls.push(args); return CINCO_LINHAS; },
    canonicaFn: async () => null, casarFn: async () => null, responsavelFn: async () => null,
    faturasMesFn: async () => null, pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    lancarLoteFn: async (p) => { lancadosLote.push(p); return { ok: true, lote_id: 'L1', movimentacoes: p.itens.map((_, i) => ({ movimentacao_id: 'M' + i })) }; },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, logs, lancadosLote, resolverCalls };
}

// ⚠️ A ORDEM IMPORTA e foi onde eu errei primeiro: a legenda tem de chegar
//    ENQUANTO a mídia ainda está sendo processada. Aguardar a mídia antes de
//    mandar o texto faz o comprovante rodar sem legenda nenhuma, cair no fluxo
//    de UM aluno e abrir preview de R$ 1.290 — que é justamente o defeito que
//    este teste deveria pegar. A decisão multi sai da promessa da mídia.
async function divisaoDitada(A) {
  const p = A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'Y1',
    body: '', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  await sleep(250);
  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'Y2',
    body: `${DAVI} - R$ 1.290,00\n\nThuanny De Souza - R$ 432,00`, hasMedia: false });
  return p;
}

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── 1. o caminho feliz: 2 alunos declarados viram 5 linhas de caixa ─────────
  const A = novo();
  const r = await divisaoDitada(A);
  checar(/preview_multi/.test(String(r && r.acao)),
    `divisão deveria abrir o preview do lote; veio "${r && r.acao}"`);

  const chamada = A.resolverCalls[A.resolverCalls.length - 1];
  checar(chamada && Array.isArray(chamada.itens) && chamada.itens.length === 2,
    'o resolver recebe os 2 alunos DECLARADOS, não as 5 faturas — quem compõe é o banco');

  const card = ultimo(A.enviadas);
  checar(/Harmonia/.test(card) && /Guitarra/.test(card) && /Teclado/.test(card),
    'o card mostra os cursos, que é o que a consultora confere antes do "pode"');
  checar(/1\.722,00/.test(card), 'o card mostra o total do comprovante');

  await A.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'Y3', body: 'pode', hasMedia: false });
  checar(A.lancadosLote.length === 1, `"pode" deveria lançar; lançou ${A.lancadosLote.length}`);
  const lote = A.lancadosLote[0];
  if (lote) {
    const itens = lote.itens || [];
    checar(itens.length === 5, `o lote grava 5 linhas (uma por fatura); gravou ${itens.length}`);
    const soma = itens.reduce((s, i) => s + Number(i.valor), 0);
    checar(Math.abs(soma - 1722) < 0.01, `a soma das linhas fecha 1722; deu ${soma}`);
    const ids = new Set(itens.map((i) => i.canonical_fatura_id));
    checar(ids.size === 5, `5 faturas DISTINTAS (fatura repetida pagaria duas vezes); vieram ${ids.size}`);
    checar(itens.filter((i) => i.aluno_nome === DAVI).length === 4,
      'as 4 linhas do Davi sobrevivem — é o aluno de 4 cursos que quebrava antes');
    checar(itens.every((i) => i.fatura && i.fatura.status),
      'toda linha leva o status da fatura: sem ele o snapshot não revalida no "pode"');
  }

  // ── 2. ambiguidade RECUSA e diz quantos ────────────────────────────────────
  // Antes de 09/09 a cascata descia um ramo e ESCOLHIA um dos 10 "Davi" de CG.
  const B = novo({ resolverMultiFn: async () => ({
    ok: false, motivo: 'nome_ambiguo', ordem: 1, aluno_nome: 'Davi',
    candidatos: ['Davi Guilherme', 'Davi de Matos', 'Davi Gonçalves'] }) });
  const rB = await divisaoDitada(B);
  checar(String(rB && rB.acao) === 'manual_review_multi_student', 'ambíguo não vira preview');
  checar(/3 alunos/.test(ultimo(B.enviadas)), 'a recusa diz QUANTOS homônimos existem');
  checar(/nome completo/i.test(ultimo(B.enviadas)), 'a recusa diz o que fazer');
  checar(B.lancadosLote.length === 0, 'ambíguo não grava nada');

  // ── 3. valor declarado que não bate: recusa explicando, não sorteio ────────
  const C = novo({ resolverMultiFn: async () => ({
    ok: false, motivo: 'valor_declarado_nao_bate', ordem: 1, aluno_nome: THU,
    valor_declarado: 999, valor_encontrado: 432 }) });
  const rC = await divisaoDitada(C);
  checar(String(rC && rC.acao) === 'manual_review_multi_student', 'valor divergente não vira preview');
  checar(/432/.test(ultimo(C.enviadas)), 'a recusa mostra o valor da fatura que existe');
  checar(/desconto negociado/i.test(ultimo(C.enviadas)),
    'a recusa aponta a saída legítima (declarar o valor) em vez de só dizer não');

  // ── 4. atomicidade: soma que não fecha não lança NADA ──────────────────────
  const D = novo({ resolverMultiFn: async () => ({
    ok: false, motivo: 'soma_itens_divergente', soma_itens: 1290, valor_total: 1722 }) });
  const rD = await divisaoDitada(D);
  checar(String(rD && rD.acao) === 'manual_review_multi_student', 'soma divergente não vira preview');
  checar(D.lancadosLote.length === 0, 'soma divergente não grava — lote parcial não existe');
  checar(/Não lanço parcialmente/i.test(ultimo(D.enviadas)), 'e a Sol diz isso em voz alta');

  // ── 5. o "pode" continua obrigatório com 5 linhas ──────────────────────────
  const E = novo();
  await divisaoDitada(E);
  await E.h.handle({ chatId: CHAT, senderPhone: MAYRA, messageId: 'Y9',
    body: 'Conferido✅', hasMedia: false });
  checar(E.lancadosLote.length === 0,
    '"Conferido✅" NÃO aprova dinheiro — nem quando o card está visivelmente certo');

  // ── 6. duplicata: o mesmo comprovante reenviado não duplica o lote ─────────
  const F = novo({ duplicataFn: async () => ({ ja_lancado: true, valor: 1722 }) });
  const rF = await divisaoDitada(F);
  checar(F.lancadosLote.length === 0, 'duplicata detectada não lança');
  checar(String(rF && rF.acao) !== 'preview_multi_aluno' || /j[áa] /i.test(ultimo(F.enviadas)),
    'duplicata avisa em vez de abrir outro preview em silêncio');

  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s):`);
    falhas.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('\npagamento inteiro N×M: todos os cenários ok');
})().catch((e) => { console.error(e); process.exit(1); });
