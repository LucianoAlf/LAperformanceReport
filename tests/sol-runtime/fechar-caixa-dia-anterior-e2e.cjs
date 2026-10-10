// 10/10/2026 (Barra): caixa de 09/10 esquecido aberto. "fecha o caixa de ontem"
// tem que achar o caixa aberto do dia anterior e criar a pendência com a data dele.
const abf = require('../../vps/la-hq/sol/runtime/caixa-abertura-fechamento.cjs');
const falhas = []; const checar = (c, m) => { if (!c) falhas.push(m); };
(async () => {
  const chamadas = []; const enviados = [];
  const rpcFn = async (nome, args) => {
    chamadas.push([nome, args]);
    if (nome === 'sol_caixa_dados_abertura') return args.p_data ? { ja_aberto: true, caixa_id_aberto: 'CX-ONTEM', data: args.p_data } : { ja_aberto: false };
    if (nome === 'sol_caixa_dados_fechamento') return { unidade: 'Barra', data: '09/10/2026', entradas: [], saidas: [], saldo_final: 522.8 };
    return { ok: true };
  };
  const ev = { chatId: 'G', body: 'Sol, fecha o caixa de ontem', senderPhone: '5521900000000', senderName: 'Arthur', hasMedia: false };
  const ok = await abf.tratarPedidoDiretoFechamento(ev, { grupo: { unidade_id: 'U-BARRA' }, sendFn: async (_c, t) => { enviados.push(t); return 'PREV'; }, rpcFn, intencaoEstruturada: 'fechar_caixa' });
  checar(ok === true, 'deveria tratar o pedido');
  checar(!enviados.some(t => /não está aberto/.test(t)), 'não pode responder "não está aberto" havendo caixa de ontem aberto');
  const pend = chamadas.find(c => c[0] === 'sol_caixa_pendencia_criar');
  checar(pend && pend[1].p_payload.data && pend[1].p_payload.tipo === 'fechar', 'pendência de fechar deve levar a data do caixa de ontem');
  checar(chamadas.some(c => c[0] === 'sol_caixa_dados_fechamento' && c[1].p_caixa_diario_id === 'CX-ONTEM'), 'demonstrativo deve ser do caixa de ontem');
  if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log('ok fechar-caixa-dia-anterior-e2e');
})();
