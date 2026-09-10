// Caso Arthur/Barra (31/08 19:53-20:01): fechou o caixa às 19:50 e pediu "Sol,
// consegue abrir novamente?" → o módulo abf devolveu 'nada', o pedido vazou
// para o agente LLM (rota de LEITURA no banco) e morreu em "o banco bloqueou a
// operação". A ferramenta (sol_caixa_reabrir_caixa_v1 + caixa_reaberturas_log)
// existia desde a V3 — nunca teve o fio ligado ao WhatsApp.
// ⚠️ O shadow V4 também disse 'nada' nas duas mensagens: a intenção não existia
// no mapa do roteador. Gap dos dois lados — ambos corrigidos aqui.
const abf = require('./_alvo.cjs').aberturaFechamento();

const CHAT = '120363263030561835@g.us';
const GRUPO = { grupo_jid: CHAT, chat_id: CHAT, unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra' };
const ARTHUR = '5521970183684';

(async () => {
  const falhas = [];
  const checar = (cond, msg) => { if (!cond) falhas.push(msg); };

  // ── gramática do comando ────────────────────────────────────────────────────
  const pede = [
    'Sol, consegue abrir novamente?',
    'Pode abrir novamente',
    'reabre o caixa',
    'pode abrir o caixa de novo?',
    'Sol, dá pra abrir o caixa novamente?',
  ];
  for (const t of pede) if (!abf.pedidoReabrir(t)) falhas.push(`pedidoReabrir("${t}") deveria ser true`);
  const naoPede = [
    'pode',                       // aprovação de lançamento
    'abre o caixa',               // abertura da manhã (outro fluxo)
    'pode fechar o caixa',        // fechamento
    'pode ser',                   // talvez
    'fechamento de caixa novamente', // reemissão do demonstrativo
  ];
  for (const t of naoPede) if (abf.pedidoReabrir(t)) falhas.push(`pedidoReabrir("${t}") NÃO podia ser true`);

  // ── executor: reaberto com sucesso ──────────────────────────────────────────
  function harness(rpcRespostas) {
    const enviadas = []; const logs = []; const rpcs = [];
    return {
      enviadas, logs, rpcs,
      opts: {
        grupo: GRUPO,
        sendFn: async (_c, t) => { enviadas.push(t); return 'MSG' + enviadas.length; },
        log: (o) => logs.push(o),
        rpcFn: async (nome, args) => { rpcs.push({ nome, args }); return rpcRespostas[nome]; },
      },
    };
  }

  const A = harness({ sol_caixa_reabrir_caixa_v1: { ok: true, reaberto: true, caixa_diario_id: 'CX1', saldo_inicial: 62.8 } });
  const rA = await abf.tratarPedidoDiretoReabertura(
    { chatId: CHAT, senderPhone: ARTHUR, senderName: 'Arthur', body: 'Pode abrir novamente', hasMedia: false }, A.opts);
  checar(rA === true, 'pedido de reabertura deveria ser tratado');
  console.log('resposta:', String(A.enviadas[0] || '').split('\n')[0]);
  checar(/reaberto ✅/i.test(String(A.enviadas[0])), 'resposta confirma a reabertura');
  checar(/62,80/.test(String(A.enviadas[0])), 'resposta traz o saldo mantido');
  const chamada = A.rpcs.find((r) => r.nome === 'sol_caixa_reabrir_caixa_v1');
  checar(!!chamada, 'a RPC de reabertura foi chamada');
  if (chamada) {
    const p = chamada.args.p_payload;
    checar(p.unidade_id === GRUPO.unidade_id, 'payload com a unidade certa');
    checar(String(p.motivo || '').length >= 5, 'payload com motivo (a RPC exige)');
    checar(p.ator_numero === ARTHUR, 'payload com o número de quem pediu');
  }

  // ── já aberto e recusa têm resposta clara (nunca silêncio) ──────────────────
  const B = harness({ sol_caixa_reabrir_caixa_v1: { ok: true, ja_aberto: true } });
  await abf.tratarPedidoDiretoReabertura(
    { chatId: CHAT, senderPhone: ARTHUR, senderName: 'Arthur', body: 'reabre o caixa', hasMedia: false }, B.opts);
  checar(/já está aberto/i.test(String(B.enviadas[0])), 'já aberto → resposta clara');

  const C = harness({ sol_caixa_reabrir_caixa_v1: { ok: false, motivo: 'reabrir_nao_autorizado' } });
  await abf.tratarPedidoDiretoReabertura(
    { chatId: CHAT, senderPhone: '5521900000000', senderName: 'Visitante', body: 'reabre o caixa', hasMedia: false }, C.opts);
  checar(/Não reabri/i.test(String(C.enviadas[0])), 'recusa → resposta clara com motivo');

  // ── mensagem que não é pedido de reabertura passa reto (return false) ───────
  const D = harness({});
  const rD = await abf.tratarPedidoDiretoReabertura(
    { chatId: CHAT, senderPhone: ARTHUR, senderName: 'Arthur', body: 'pode', hasMedia: false }, D.opts);
  checar(rD === false && D.enviadas.length === 0, '"pode" seco passa reto para o gate de aprovação');

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — reabrir o caixa é uma frase, com autorização e rastro');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
