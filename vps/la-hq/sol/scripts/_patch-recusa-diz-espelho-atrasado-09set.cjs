#!/usr/bin/env node
/**
 * A recusa por competência passa a admitir a hipótese mais provável: o espelho
 * está atrasado.
 *
 * 🔴 O CASO (09/09/2026, ao vivo, Recreio). A Vitória mandou R$ 862,00 com
 *    "parcela de setembro / Maria Helena — R$431,00 / João Pedro — R$431,00".
 *    A Sol respondeu *"a competência não bate com a fatura — confere o mês"*.
 *
 *    Ela estava certa em NÃO LANÇAR e errada no que disse. Medido:
 *        recusa .................. 13:45:11
 *        faturas sincronizadas ... 13:48:29   (3min18s DEPOIS)
 *    As parcelas 09/2026 existiam, valiam R$ 431,00 no centavo e tinham sido
 *    pagas em 08/09 — a data do comprovante. O mês estava certo; o que faltava
 *    era a cópia local. Às 13:52, reenviado, lançou sem discussão.
 *
 * 🔴 O CUSTO DA MENSAGEM ERRADA é maior que o da recusa: mandar conferir um
 *    dado correto faz a pessoa procurar erro onde não há, e é assim que a
 *    equipe conclui que "ela não entende nada". A recusa honesta ensina a
 *    esperar; a recusa que acusa ensina a desconfiar.
 *
 * ⚠️ O texto certo JÁ EXISTE no ramo vizinho (`alocacao_nao_derivavel`): "ainda
 *    não vejo a fatura como paga na minha cópia do Emusys (ela atualiza a cada
 *    15 min)". Só não cobria este motivo. É reuso, não invenção.
 * ⚠️ NÃO afrouxa nada: continua sem lançar. Muda só o que a Sol diz sobre o
 *    porquê — e a diferença entre "confere o mês" e "meu espelho pode estar
 *    atrasado" é a diferença entre culpar a pessoa e assumir a limitação.
 */
const fs = require('fs');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

const carimbo = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
fs.writeFileSync(`${ALVO}.bak-${carimbo}-antes-recusa-sincera`, fs.readFileSync(ALVO, 'utf8'));

let src = fs.readFileSync(ALVO, 'utf8');
function troca(nome, alvo, novo, esperado = 1) {
  const n = src.split(alvo).length - 1;
  if (n !== esperado) {
    console.error(`🔴 ${nome}: ancora ${n}x, esperava ${esperado} — ABORTADO`);
    process.exit(1);
  }
  src = src.split(alvo).join(novo);
  console.log('  ok:', nome);
}

troca('competencia divergente admite defasagem do espelho',
  '        competencia_item_divergente: `a competência não bate com a fatura${_quem} — confere o mês.`,',
  `        // 🔴 09/09: a Vitoria mandou "parcela de setembro" com o mes CERTO e
        // ouviu "confere o mes". As faturas entraram no espelho 3min18s depois
        // da recusa; as 13:52, reenviado, lancou. A hipotese mais provavel
        // quando o pagamento e recente nao e' a pessoa ter errado o mes — e' a
        // copia local estar atrasada (sync a cada 15 min).
        competencia_item_divergente: \`a competência que achei na fatura\${_quem} é outra. Se o pagamento é recente, pode ser a minha cópia do Emusys atrasada (ela atualiza a cada 15 min) — me reenvia daqui a pouco. Se não for isso, confere o mês.\`,`);

fs.writeFileSync(ALVO, src);
console.log('aplicado');
