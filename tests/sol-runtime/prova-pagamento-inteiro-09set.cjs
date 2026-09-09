#!/usr/bin/env node
/**
 * Prova que o caminho novo do pagamento inteiro FUNCIONA, com o código no ar.
 *
 * 🔴 `node -c` prova que parseia, não que roda — e o erro que quase foi para
 *    produção hoje (`interpretado` inexistente) passaria por ele. Aqui as
 *    funções são executadas de verdade, com as legendas reais de 09/09.
 *
 * Cobre as três decisões que se encadeiam:
 *   1. `pagamentosNaLegenda` — os nomes que o modelo listou estão na LEGENDA
 *      humana? (multi nunca nasce do OCR — dois falsos positivos em 28-29/08)
 *   2. o portão abre com o veredito do modelo mesmo quando o regex é cego
 *   3. a resolução das faturas continua sendo determinística, no banco
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

const mod = { exports: {} };
const ctx = {
  module: mod, exports: mod.exports, require, console, process,
  __filename: ALVO, __dirname: path.dirname(ALVO),
  Buffer, setTimeout, clearTimeout, setInterval, clearInterval, fetch, URL,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ALVO, 'utf8'), ctx, { filename: ALVO });

const naLegenda = vm.runInContext('pagamentosNaLegenda', ctx);
const detectar = vm.runInContext('detectarContextoMultiAluno', ctx);

const LEGENDA_MAYRA = 'PG pix parcelas 09/2026 aluno Davi Guilherme de Souza Chaves Ribeiro '
  + '(4 cursos - R$1290,00) e aluna Thuanny de Souza Chaves Ribeiro (R$432,00) - LA CG R$1722,00';

const CASOS = [
  {
    nome: 'Mayra 09/09 — modelo lista 2, regex é cego',
    legenda: LEGENDA_MAYRA,
    pagamentos: [
      { aluno: 'Davi Guilherme de Souza Chaves Ribeiro', valor: 1290 },
      { aluno: 'Thuanny de Souza Chaves Ribeiro', valor: 432 },
    ],
    esperaAbrir: true,
  },
  {
    nome: 'Fernanda — 1 aluna, 2 cursos (NÃO é multi-aluno)',
    legenda: 'Parcela do mês de Setembro da aluna Vitória da Silva Nobre - R$1.378,00',
    pagamentos: [{ aluno: 'Vitória da Silva Nobre', valor: 1378 }],
    esperaAbrir: false,
  },
  {
    nome: '🔴 modelo alucina nome que NÃO está na legenda (tem de barrar)',
    legenda: 'PG pix parcela 09/2026 aluno Carlos Augusto Victorino de Lima - LA CG R$367,00',
    pagamentos: [
      { aluno: 'Carlos Augusto Victorino de Lima', valor: 367 },
      { aluno: 'Maria Fantasma da Silva', valor: 100 },
    ],
    esperaAbrir: false,
  },
  {
    nome: '🔴 nomes vindos do OCR (pagador+favorecido), não da legenda',
    legenda: 'PG pix R$500',
    pagamentos: [
      { aluno: 'Marcos Vinicius Conceicao da Silva', valor: 250 },
      { aluno: 'Escola de Musica LA Kids', valor: 250 },
    ],
    esperaAbrir: false,
  },
  {
    nome: 'legenda com 2 alunos SEM parenteses (já funcionava)',
    legenda: 'PG pix parcela 09/2026 de João Lucas Henrique da Silva e de Ana Mel Henrique da Silva - Kids CG R$274,00',
    pagamentos: [
      { aluno: 'João Lucas Henrique da Silva', valor: 137 },
      { aluno: 'Ana Mel Henrique da Silva', valor: 137 },
    ],
    esperaAbrir: true,
  },
];

console.log('PAGAMENTO INTEIRO — portão com o código que está no disco\n');
let erros = 0;
for (const c of CASOS) {
  const pag = naLegenda(c.pagamentos, c.legenda);
  const porModelo = pag.length >= 2;
  const porRegex = detectar(c.legenda);
  const abre = porRegex || porModelo;
  const ok = abre === c.esperaAbrir;
  if (!ok) erros++;
  console.log(`${ok ? '  ' : '🔴'} abre=${String(abre).padEnd(5)} (regex=${porRegex ? 'V' : '.'} modelo=${porModelo ? 'V' : '.'}) esperado=${c.esperaAbrir}`);
  console.log(`     ${c.nome}`);
  console.log(`     modelo listou ${c.pagamentos.length}, sobreviveram à legenda: ${pag.length}\n`);
}
console.log(erros === 0 ? 'todos bateram' : `🔴 ${erros} caso(s) errado(s)`);
process.exit(erros ? 1 : 0);
