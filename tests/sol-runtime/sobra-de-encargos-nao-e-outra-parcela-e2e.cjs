// Sobra de encargos não é outra parcela (CG 07/10/2026, 18:37).
//
// Pix de R$ 474,59 da parcela 09 vencida: o Emusys cobrou R$ 447,00 + R$ 27,59;
// o cálculo local de "hoje com multa/mora" deu R$ 458,47. A sobra de R$ 16,12
// travava o "pode" como "mais de uma parcela/curso possível" e o card entrava em
// laço mesmo com a equipe dizendo curso e parcela.
const mod = require('./_alvo.cjs');
const falhas = [];
const checar = (c, m) => { if (!c) falhas.push(m); };
const can = (f) => ({ fatura: { tipo_fatura: 'parcela', ...f } });

// A. caso real: vencida, sobra pequena → não trava (segue "difere — confere" + pode)
checar(mod.deveBloquearLancamento({ canonica: can({ status: 'aberta', vencida: true, valor_da_parcela: 387, valor_hoje: 458.47 }), valor: 474.59 }) === false,
  'A: sobra de encargos numa fatura vencida não pode travar o pode');
// B. SOL-135 continua: R$ 900 numa fatura de R$ 500 em dia → trava
checar(mod.deveBloquearLancamento({ canonica: can({ status: 'aberta', vencida: false, valor_da_parcela: 500 }), valor: 900 }) === true,
  'B: comprovante bem maior que a fatura em dia continua travando');
// C. vencida mas sobra de meia parcela ou mais (cara de duas parcelas) → trava
checar(mod.deveBloquearLancamento({ canonica: can({ status: 'aberta', vencida: true, valor_da_parcela: 387, valor_hoje: 400 }), valor: 787 }) === true,
  'C: sobra do tamanho de outra parcela continua travando mesmo vencida');
// D. fatura em dia com sobra pequena continua travando (sem encargo que explique)
checar(mod.deveBloquearLancamento({ canonica: can({ status: 'aberta', vencida: false, valor_da_parcela: 387 }), valor: 400 }) === true,
  'D: fatura em dia não tem encargo; sobra continua travando');
// E. valor igual ou menor não trava (parcial continua como antes)
checar(mod.deveBloquearLancamento({ canonica: can({ status: 'aberta', vencida: true, valor_da_parcela: 387, valor_hoje: 458.47 }), valor: 300 }) === false,
  'E: pagamento menor continua sem trava');

if (falhas.length) { console.error('FALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
console.log('OK sobra-de-encargos-nao-e-outra-parcela');
