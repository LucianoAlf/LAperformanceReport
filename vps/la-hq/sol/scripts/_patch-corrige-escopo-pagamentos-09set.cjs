#!/usr/bin/env node
/**
 * Corrige o escopo: os pagamentos do modelo precisam sair do `try`.
 *
 * 🔴 O ERRO QUE ISTO CONSERTA ERA MEU, e teria derrubado o caixa. O patch do
 *    portão escreveu `interpretado.pagamentos`, mas essa variável NÃO EXISTE:
 *    o resultado do interpretador é `const it`, declarado DENTRO do `try` e
 *    morto na linha seguinte — os campos dele são copiados um a um para
 *    `categoria`, `aluno`, `competencia`, `forma`.
 *
 *    `ReferenceError: interpretado is not defined` em toda mídia com legenda.
 *    Peguei conferindo o nome antes de reiniciar; `node -c` não pega, porque
 *    sintaxe estava correta.
 *
 * ⚠️ A lição: `node -c` prova que PARSEIA, não que RODA. Variável inexistente
 *    é erro de execução, não de sintaxe — e num `try/catch` genérico ela vira
 *    falha silenciosa em vez de estouro visível.
 */
const fs = require('fs');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

const carimbo = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
fs.writeFileSync(`${ALVO}.bak-${carimbo}-antes-escopo-pagamentos`, fs.readFileSync(ALVO, 'utf8'));

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

troca('declara pagamentosLLM ao lado dos outros campos',
  '      let categoria = null, aluno = null, competencia = null;',
  `      let categoria = null, aluno = null, competencia = null;
      // ⚠️ fora do try de proposito: \`it\` morre no fim do bloco, e o portao do
      //    pagamento inteiro (mais abaixo) precisa da lista de pessoas.
      let pagamentosLLM = [];`);

troca('copia os pagamentos junto com os outros campos',
  '        if (it) { categoria = it.categoria; aluno = it.aluno; competencia = it.competencia; if (!forma && it.forma) forma = it.forma; }',
  `        if (it) { categoria = it.categoria; aluno = it.aluno; competencia = it.competencia; if (!forma && it.forma) forma = it.forma;
          pagamentosLLM = Array.isArray(it.pagamentos) ? it.pagamentos : []; }`);

troca('portao usa a variavel que existe',
  `      const _pagLLM = pagamentosNaLegenda(
        (interpretado && interpretado.pagamentos) || [], legendaEfetiva);`,
  '      const _pagLLM = pagamentosNaLegenda(pagamentosLLM, legendaEfetiva);');

fs.writeFileSync(ALVO, src);
console.log('aplicado');
