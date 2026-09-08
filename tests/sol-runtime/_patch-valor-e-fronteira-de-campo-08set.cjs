#!/usr/bin/env node
// "e o VALOR é" não fechava o nome do aluno (08/09/2026).
//
// 🔴 O DEFEITO, medido nas funções reais do runtime:
//
//    "a aluna é Soraia da Silveira Duarte e a PARCELA é 02/2026"  → "Soraia da Silveira Duarte" ✅
//    "a aluna é Soraia da Silveira Duarte e a FORMA é pix"        → "Soraia da Silveira Duarte" ✅
//    "a aluna é Soraia da Silveira Duarte e o VALOR é R$976,00"   → null ❌
//    "aluno: Soraia da Silveira Duarte e o VALOR é R$976,00"      → null ❌
//
//    `_limparAlunoRotulado` corta o nome onde começa OUTRO campo, e a lista
//    tinha parcela, competência, forma, categoria, fatura, mensalidade, turma
//    e data — **`valor` ficou de fora**. Sem o corte, o nome capturado vira
//    "Soraia da Silveira Duarte e o valor é", que o filtro de vocabulário de
//    operação (`_META_DEPOIS_DE_ALUNO`) rejeita inteiro. Resultado: `null`, e
//    a mensagem cai em `acao: "nada"` — a ADM ouve "não entendi".
//
//    Frase natural: quem corrige um card diz o nome E o valor na mesma frase.
//    Nem o rótulo com dois-pontos salvava.
//
// ⚠️ ISTO NÃO É REGRESSÃO NOVA: as duas suítes que apanham disso
//    (`rotulo-vence-casamento-fuzzy-e2e` e
//    `valor-da-legenda-e-correcao-de-valor-e2e`) falham em TODOS os backups do
//    runtime até 03/09 — foram escritas descrevendo o comportamento desejado e
//    o `valor` nunca entrou na lista. A dívida é antiga; o defeito é real.
//
// ⚠️ Acrescento também `total` e `desconto`, que são a MESMA família (campo de
//    dinheiro depois do nome, mesma construção "e o X é"). NÃO acrescento
//    `pix`/`dinheiro`/`cartão`: esses são VALORES do campo forma, não nomes de
//    campo, e a construção "e o pix é" não existe — regra sem caso é regra que
//    um dia corta um nome legítimo.
//
// ⚠️ Depois de aplicar é OBRIGATÓRIO reiniciar a bridge: ela faz `require` do
//    módulo no start, então editar o arquivo não muda nada até o respawn
//    (`kill <pid>`; o `hermes-gateway-sol.service` traz de volta em ~5s).
const fs = require('fs');

const alvo = process.argv[2] ||
  '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
let s = fs.readFileSync(alvo, 'utf8');

if (/parcela\|compet\[e\\u00ea\]ncia\|competencia\|forma\|categoria\|fatura\|mensalidade\|turma\|data\|valor/.test(s)
    || s.includes('|valores?|total|desconto)')) {
  console.log('ja aplicado');
  process.exit(0);
}

const VELHO = "n = n.replace(/\\s+e\\s+(?:a|o)\\s+(?:parcela|compet[eê]ncia|competencia|forma|categoria|fatura|mensalidade|turma|data)\\b[\\s\\S]*$/i, ' ');";
const NOVO  = "n = n.replace(/\\s+e\\s+(?:a|o)\\s+(?:parcela|compet[eê]ncia|competencia|forma|categoria|fatura|mensalidade|turma|data|valor(?:es)?|total|desconto)\\b[\\s\\S]*$/i, ' ');";

const n = s.split(VELHO).length - 1;
if (n !== 1) {
  console.error(`ANCORA da lista de campos: esperava 1, achei ${n}`);
  process.exit(1);
}

// backup antes de tocar no arquivo vivo (padrão da casa)
const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, `${alvo}.bak-${carimbo}-before-valor-fronteira`);

s = s.split(VELHO).join(NOVO);
fs.writeFileSync(alvo, s);
console.log('aplicado: `valor`, `total` e `desconto` entraram na fronteira de campo');
console.log('⚠️ REINICIE A BRIDGE — ela faz require no start e nao ve o arquivo novo sozinha');
