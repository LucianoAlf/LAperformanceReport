// Diagnóstico do caso Mayra/CG 25/08: "Sol, teve uma saída em dinheiro - PG segurança
// semana 25/08 R$100,00" virou RECEBIMENTO, e depois a correção "Sol, foi saída" virou
// NOME DE ALUNO.
const mod = require('/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs');

const CHAT = '5521999999999-cg@g.us';
const UNIDADE = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

function novo() {
  const enviadas = [];
  const logs = [];
  let lancouEntrada = null;
  let lancouSaida = null;
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Campo Grande' } },
    sendFn: async (_c, t) => { enviadas.push(t); return 'M' + (++seq); },
    identidadeFn: async () => ({ identificado: true, nome: 'Mayra' }),
    duplicataFn: async () => ({ ja_lancado: false }),
    lancarFn: async (p) => { lancouEntrada = p; return { ok: true, movimentacao_id: 'E1', valor: Number(p.valor), forma: p.forma, categoria: p.categoria }; },
    lancarSaidaFn: async (p) => { lancouSaida = p; return { ok: true, movimentacao_id: 'S1', valor: Number(p.valor), forma: p.forma, categoria: p.categoria }; },
    log: (o) => logs.push(o),
  });
  return { handle: (e) => h.handle(e), enviadas, logs,
           get entrada() { return lancouEntrada; }, get saida() { return lancouSaida; } };
}

(async () => {
  const H = novo();

  const r1 = await H.handle({
    chatId: CHAT, senderPhone: '5521988887777', messageId: 'M1',
    body: 'Sol, teve uma saída em dinheiro - PG segurança semana 25/08 R$100,00',
    hasMedia: false,
  });
  console.log('PASSO 1 acao:', r1 && r1.acao);
  console.log('  msg:', String(H.enviadas[H.enviadas.length - 1] || '').replace(/\n/g, ' | ').slice(0, 220));

  const r2 = await H.handle({
    chatId: CHAT, senderPhone: '5521988887777', messageId: 'M2',
    body: 'Sol, foi saída', hasMedia: false,
  });
  console.log('PASSO 2 acao:', r2 && r2.acao);
  console.log('  msg:', String(H.enviadas[H.enviadas.length - 1] || '').replace(/\n/g, ' | ').slice(0, 260));

  console.log('');
  console.log('logs:', H.logs.map((l) => l.acao).join(' -> '));
  console.log('lancou ENTRADA?', H.entrada ? JSON.stringify({ v: H.entrada.valor, c: H.entrada.categoria, a: H.entrada.aluno }) : 'nao');
  console.log('lancou SAIDA?', H.saida ? JSON.stringify({ v: H.saida.valor, c: H.saida.categoria }) : 'nao');
})().catch((e) => { console.error('ERRO:', e && e.stack); process.exit(1); });
