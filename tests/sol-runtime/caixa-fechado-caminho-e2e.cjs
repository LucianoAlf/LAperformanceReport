// Campo Grande, 03/10/2026 (Ana Paula, Pix R$ 377 de parcela Kids):
//
// 08:00 a Sol postou o card de abertura e ninguém respondeu. 08:25 chegou um
// comprovante; o "pode" citando o card do comprovante foi recusado (certo: caixa
// fechado), mas a recusa "Não lancei: o caixa de hoje ainda não está aberto" não
// dizia como sair dali. "Pode abrir sol", citando essa recusa, ficou MUDO: o nome
// no fim não contava como chamada e citar a própria Sol também não.
//
// Raiz corrigida:
//  1. recusa por caixa fechado guarda o comprovante, explica os dois "pode" e
//     posta ali o card OFICIAL de abertura (no máximo 1x a cada 10 min);
//  2. "Pode abrir sol" (nome no fim) e citar mensagem da Sol contam como chamada;
//  3. resposta direta à Sol que nada tratou, sem card aberto, recebe orientação;
//  4. depois de abrir, a Sol lembra do comprovante guardado, sem lançar sozinha.
// Nenhuma escrita real e nenhum outbound real: tudo fake.
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const fs = require('fs');
const path = require('path');
const mod = require('./_alvo.cjs');
const abf = mod.aberturaFechamento();
const ge = require(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/group-engagement.cjs'));

const CHAT = '5521981278047-1544204225@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const ANA = '5521900000001';

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

function novo(overrides = {}) {
  const enviadas = []; const logs = []; const lancados = []; const ofertas = []; let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + (++seq); },
    ocrFn: async () => ({ text: 'Comprovante de Pix\nR$ 377,00\nPara L A MUSIC KIDS', status: 'ok', file_bytes: 1000 }),
    visaoFn: async () => ({ valor: 377, forma: 'pix' }),
    interpretarFn: async () => ({ categoria: 'parcela', aluno: 'Ravi Teste', competencia: '10/2026', forma: 'pix' }),
    canonicaFn: async () => ({ ok: false, motivo: 'aluno_nao_encontrado' }),
    casarFn: async () => null,
    responsavelFn: async () => null,
    faturasMesFn: async () => null,
    pagadorFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'Ana' }),
    lancarFn: async (p) => { lancados.push(p); return { ok: false, motivo: 'caixa_nao_aberto' }; },
    abrirPreviewFn: async (grupo, opts) => {
      ofertas.push(grupo);
      const id = await opts.sendFn(grupo.chat_id, '🔓 *ABERTURA DE CAIXA DE CAMPO GRANDE*\nPosso abrir? Responde *pode* que eu abro. ✅');
      return { ok: true, previewId: id };
    },
    log: (o) => logs.push(o),
    ...overrides,
  });
  return { h, enviadas, logs, lancados, ofertas };
}

(async () => {
  // ── 2. quem é chamada ──────────────────────────────────────────────────────
  ok(ge.pareceChamarSol('Pode abrir sol') === true, '"Pode abrir sol" tem que ser chamada');
  ok(ge.pareceChamarSol('abre o caixa sol') === true, '"abre o caixa sol" tem que ser chamada');
  ok(ge.pareceChamarSol('Fecha o caixa, Sol!') === true, '"Fecha o caixa, Sol!" tem que ser chamada');
  ok(ge.pareceChamarSol('Sol, abre o caixa') === true, 'REGRESSÃO: "Sol, abre o caixa"');
  ok(ge.pareceChamarSol('hoje tá um dia de sol') === false, '"dia de sol" não é chamada');
  ok(ge.pareceChamarSol('que sol') === false, '"que sol" não é chamada');
  ok(ge.pareceChamarSol('pago pix parcela aluno Solano') === false, 'nome parecido não é chamada');

  // ── 2/3. bridge: citar a própria Sol conta; orientação sem card aberto ──────
  const src = fs.readFileSync(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
  ok(src.includes('const _citouSol = !!(event.quotedMessageId && recentlySentIds.has(event.quotedMessageId));'),
    'bridge deveria tratar citação de mensagem da Sol como chamada');
  ok(/const _pareceProSol = _citouSol\s*\|\|/.test(src), '_pareceProSol deveria incluir _citouSol');
  const iPre = src.indexOf("process.env.SOL_CAIXA_V4_OPERATIONAL_PREFLIGHT === '1'");
  const iOri = src.indexOf("_caixaLog({ step: 'orientacao_citou_sol', chatId: chatId });");
  ok(iPre > 0 && iOri > iPre, 'orientação tem que vir DEPOIS do pré-roteamento (abrir/fechar têm prioridade)');
  ok(src.includes("if (!_tratouCaixa && _citouSol && _r && _r.acao === 'nada' && !_cardPendente)"),
    'orientação só sem card aberto (com card, o fallback de diálogo responde)');

  // ── 1. recusa vira caminho ──────────────────────────────────────────────────
  const A = novo();
  await A.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'C1',
    body: 'PG Pix Parcela 10/2026 - Aluno Ravi Teste - R$377,00 - KIDS CG', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  ok(A.h.temPendencia(CHAT), 'comprovante deveria gerar card pendente');
  const antes = A.enviadas.length;
  const r1 = await A.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'C2', body: 'pode', hasMedia: false });
  const novas = A.enviadas.slice(antes).join('\n---\n');
  console.log('recusa:', novas.replace(/\n/g, ' | ').slice(0, 300));
  ok(r1 && r1.acao === 'recusado' && r1.motivo === 'caixa_nao_aberto', `deveria recusar por caixa fechado -> ${JSON.stringify(r1)}`);
  ok(A.lancados.length === 1, 'tentou lançar uma vez (a RPC recusou)');
  ok(/comprovante ficou guardado/i.test(novas), 'recusa deveria dizer que o comprovante ficou guardado');
  ok(/pode\* citando a mensagem de \*abertura/i.test(novas), 'recusa deveria dizer como abrir');
  ok(/ABERTURA DE CAIXA/.test(novas), 'card oficial de abertura deveria ser postado junto');
  ok(A.ofertas.length === 1 && A.ofertas[0].unidade_id === UNIDADE, 'abertura oferecida 1x, na unidade certa');
  ok(A.h.temPendencia(CHAT), 'comprovante continua guardado depois da recusa');

  // segundo "pode" no comprovante, caixa ainda fechado: não reposta o card
  const antes2 = A.enviadas.length;
  await A.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'C3', body: 'pode', hasMedia: false });
  const novas2 = A.enviadas.slice(antes2).join('\n');
  ok(A.ofertas.length === 1, `card de abertura não pode ser repostado em 10 min (ofertas=${A.ofertas.length})`);
  ok(/mensagem de \*abertura/i.test(novas2), 'segunda recusa ainda aponta o caminho');

  // oferta falhou: orienta pedir pelo nome
  const B = novo({ abrirPreviewFn: async () => ({ skip: 'sem_dados' }) });
  await B.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'D1',
    body: 'PG Pix Parcela 10/2026 - Aluno Ravi Teste - R$377,00 - KIDS CG', hasMedia: true, mediaType: 'image', mediaUrls: ['fake://pix.jpg'] });
  await B.h.handle({ chatId: CHAT, senderPhone: ANA, messageId: 'D2', body: 'pode', hasMedia: false });
  ok(B.enviadas.some((t) => /Sol, abre o caixa/.test(t)), 'sem card de abertura, orienta "Sol, abre o caixa"');

  // ── 4. depois de abrir, lembra do comprovante (sem lançar) ─────────────────
  const env = []; const rpcs = [];
  const tratou = await abf.tratarConfirmacao(
    { chatId: CHAT, body: 'pode', quotedMessageId: 'ABF1', senderId: ANA + '@s.whatsapp.net', senderName: 'Ana', hasMedia: false },
    { sendFn: async (_c, t) => { env.push(t); return 'R' + env.length; },
      rpcFn: async (fn) => {
        rpcs.push(fn);
        if (fn === 'sol_caixa_pendencia_aguardando') return { id: 'p1', tipo: 'abrir', unidade_id: UNIDADE, data: '2026-10-03', preview_message_id: 'ABF1', idade_min: 3 };
        if (fn === 'sol_caixa_abrir') return { ok: true, caixa_diario_id: 'cx1', saldo_inicial: 735.2 };
        return null;
      },
      temComprovantePendente: (cid) => cid === CHAT });
  ok(tratou === true && rpcs.includes('sol_caixa_abrir'), 'pode no card de abertura abre o caixa');
  ok(env.some((t) => /Caixa aberto/.test(t)), 'recibo de abertura');
  ok(env.some((t) => /comprovante esperando o caixa abrir/i.test(t)), 'lembra do comprovante guardado');
  ok(!rpcs.some((f) => /lancar/i.test(f)), 'abrir NUNCA lança o comprovante sozinho');

  const env2 = [];
  await abf.tratarConfirmacao(
    { chatId: CHAT, body: 'pode', quotedMessageId: 'ABF1', senderId: ANA + '@s.whatsapp.net', hasMedia: false },
    { sendFn: async (_c, t) => { env2.push(t); return 'X'; },
      rpcFn: async (fn) => (fn === 'sol_caixa_pendencia_aguardando'
        ? { id: 'p1', tipo: 'abrir', unidade_id: UNIDADE, data: '2026-10-03', preview_message_id: 'ABF1', idade_min: 3 }
        : fn === 'sol_caixa_abrir' ? { ok: true, caixa_diario_id: 'cx1', saldo_inicial: 1 } : null),
      temComprovantePendente: () => false });
  ok(!env2.some((t) => /comprovante esperando/i.test(t)), 'sem comprovante guardado, sem lembrete');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — caixa fechado vira caminho, e "Pode abrir sol" é ouvido');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
