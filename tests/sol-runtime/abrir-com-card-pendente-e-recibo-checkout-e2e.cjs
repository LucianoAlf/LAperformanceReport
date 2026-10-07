// Barra, 26/09/2026 (Krissya/Arthur, passaporte R$ 499):
//
// 1. IMPASSE: o card do passaporte ficou pendente porque o caixa estava FECHADO,
//    e "Sol, abre o caixa" / "Abre o caixa, sol" levavam "não entendi — tem
//    lançamento em aberto": o pré-roteamento operacional só rodava SEM card
//    pendente. O card esperava o caixa; o caixa esperava o card.
// 2. RECIBO DE CHECKOUT recusado em silêncio: reenviado sem legenda, o mesmo PDF
//    que minutos antes gerou o card virou `sem_sinal_de_comprovante` — a lista
//    conhecia "data DE pagamento"/"ID da transação", e o recibo diz "data DO
//    pagamento"/"Código da transação".
//
// Os dados do comprador foram removidos do texto do recibo (fixture sem PII).
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
const fs = require('fs');
const path = require('path');
const mod = require('./_alvo.cjs');
const abf = mod.aberturaFechamento();

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

const RECIBO_CHECKOUT = [
  'Sua compra foi aprovada',
  'Valor do pagamento',
  'R$ 499,00',
  'Vendido por: LA MUSIC KIDS BARRA',
  'Forma de pagamento: 2x - Mastercard',
  'Código da transação: F4CE2DD3-AFB1-4DE8-AABE-CCD5DC9FA3F5',
  'Data do pagamento: 25/09/2026 às 19:38:53',
  'Detalhes da compra',
  '1 item',
  'Passaporte L.A Music',
  'R$ 499,00',
  'Total R$ 499,00',
  'Identificação',
  'Comprador',
].join('\n');

(async () => {
  // 2. recibo de checkout é comprovante, com ou sem legenda
  const c1 = mod.classificarMidia(RECIBO_CHECKOUT, '');
  ok(c1.tipo === 'comprovante', `2a: recibo de checkout sem legenda -> ${JSON.stringify(c1)}`);
  const c2 = mod.classificarMidia(RECIBO_CHECKOUT, 'Sol, reabre o caixa');
  ok(c2.tipo === 'comprovante', `2b: com a mensagem irmã errada -> ${JSON.stringify(c2)}`);
  ok(mod.classificarMidia('ORCAMENTO fornecedor XYZ R$ 300', '').tipo === 'despesa', '2c: orçamento deixou de ser despesa');
  ok(mod.classificarMidia('Fechamento de caixa saldo inicial R$ 62,80 data do pagamento', '').tipo === 'tela_sistema',
    '2d: print do sistema virou comprovante');
  ok(mod.classificarMidia('Sua compra foi aprovada Loja XYZ R$ 80', '').tipo !== 'comprovante',
    '2e: "compra aprovada" sozinha não pode virar recebimento (pode ser compra da escola)');

  // 1a. "abre o caixa" com o caixa do dia já FECHADO: responde o caminho certo
  const enviadas = [];
  const r = await abf.tratarPedidoDiretoAbertura(
    { chatId: 'g@g.us', body: 'Sol, abre o caixa', hasMedia: false },
    { grupo: { unidade_id: 'u-barra', nome: 'Barra', chat_id: 'g@g.us' },
      sendFn: async (_c, t) => { enviadas.push(t); return 'M1'; },
      rpcFn: async (fn) => (fn === 'sol_caixa_dados_abertura' ? { ja_existe: true, ja_aberto: false } : null),
      intencaoEstruturada: 'abrir_caixa' });
  ok(r === true && /já foi fechado/i.test(enviadas[0] || '') && /reabre o caixa/i.test(enviadas[0] || ''),
    `1a: não orientou a reabertura -> ${enviadas[0]}`);

  // 1b. bridge: o pré-roteamento operacional não exige mais "sem card pendente"
  //     para ABRIR, e continua exigindo para FECHAR.
  const src = fs.readFileSync(path.resolve(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8')
    .replace(/\/\/[^\n]*/g, '');
  const iPre = src.indexOf("process.env.SOL_CAIXA_V4_OPERATIONAL_PREFLIGHT === '1'");
  const trecho = src.slice(Math.max(0, iPre - 400), iPre + 1600);
  ok(iPre > 0, '1b-pre: pré-roteamento operacional não encontrado');
  ok(!/SOL_CAIXA_V4_OPERATIONAL_PREFLIGHT === '1'[\s\S]{0,200}!\(_fh\.temPendencia/.test(trecho),
    '1b: o pré-roteamento ainda exige "sem card pendente" para qualquer intenção');
  ok(/_intencaoOperacional === 'fechar_caixa' && !_cardPendente/.test(trecho),
    '1c: fechar com card pendente deixou de ser barrado');

  if (falhas.length) { console.log('RESULTADO: FALHOU\n - ' + falhas.join('\n - ')); process.exit(1); }
  console.log('RESULTADO: OK');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
