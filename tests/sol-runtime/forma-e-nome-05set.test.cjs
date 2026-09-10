#!/usr/bin/env node
// Trava as 4 correcoes da auditoria de 03-05/09/2026 com os TEXTOS REAIS dos
// grupos. Cada caso "antes" e um erro que aconteceu; cada caso "nao regride" e
// um comportamento que ja estava certo e nao pode quebrar.
//
//   node forma-e-nome-05set.test.cjs [caminho-do-caixa-financeiro.cjs]
const path = process.argv[2] || require('./_alvo.cjs').__alvo;
const M = require(path);

let falhas = 0;
function ok(cond, rotulo, detalhe) {
  console.log((cond ? '  ok  ' : '  XX  ') + rotulo + (cond || detalhe === undefined ? '' : '   -> ' + JSON.stringify(detalhe)));
  if (!cond) falhas++;
}

// ── F1 · forma de pagamento ─────────────────────────────────────────────────
console.log('\n=== F1 · PIX explicito vence "debito" solto ===');

// Comprovante de Pix de banco (o padrao que quebrou 6x em 3 dias).
const PIX_BANCO = [
  'Comprovante do Pix',
  '05/09/2026 - 13:28',
  'Valor R$ 377,00',
  'Debito em conta corrente',
  'Destino: ESCOLA DE MUSICA L A',
  'CPF/CNPJ 00.000.000/0001-00',
  'Instituicao BCO SANTANDER (BRASIL) S.A.',
].join('\n');
ok(M.extrairCartao(PIX_BANCO) === null, 'comprovante de Pix com "Debito em conta" NAO e cartao',
   M.extrairCartao(PIX_BANCO));
ok(M.extrairForma(PIX_BANCO, null) === 'pix', 'a forma continua sendo lida como pix',
   M.extrairForma(PIX_BANCO, null));

// Variante sem a palavra "conta": so "Pix" + "debito" soltos.
ok(M.extrairCartao('Pix enviado\nTipo: debito\nR$ 100,00') === null,
   'pix + palavra "debito" solta NAO e cartao');

// NAO REGRIDE: cupom de maquininha de verdade.
const CUPOM = 'PAGBANK\nVENDA DEBITO\nVISA ELECTRON\nNSU 004521\nVALOR R$ 500,00\nAUTORIZADO COM SENHA';
const c1 = M.extrairCartao(CUPOM);
ok(!!c1 && c1.forma === 'cartao' && c1.modalidade === 'debito', 'cupom PagBank continua cartao debito', c1);

const CREDITO = 'CIELO\nCREDITO A VISTA\nMASTERCARD\nNSU 8891\nR$ 400,00';
const c2 = M.extrairCartao(CREDITO);
ok(!!c2 && c2.modalidade === 'credito', 'cupom de credito continua credito', c2);

// NAO REGRIDE: legenda humana rotulando cartao, mesmo citando pix em outro lugar.
const c3 = M.extrairCartao('PG passaporte ( cartao de debito) Aluno: Hugo Sobrinho Carmo KIDS CG - R$500,00');
ok(!!c3 && c3.modalidade === 'debito', 'legenda "( cartao de debito)" continua cartao', c3);
const c4 = M.extrairCartao('pagou no cartao de credito, nao foi pix');
ok(!!c4 && c4.modalidade === 'credito', 'sinal FORTE vence mesmo com a palavra pix no texto', c4);

// ── F2 · multi-aluno: apostrofo e traco opcional ────────────────────────────
console.log('\n=== F2 · a linha "Nome R$ valor" (caso Vitoria/Recreio 05/09) ===');

// A legenda EXATA que a Vitoria mandou as 12:41 e que virou um card de R$395.
const VITORIA_1 = [
  'parcelas dos alunos:',
  "Márcio Sant'Anna R$395,00",
  'Valentina Cortes Santanna R$468,16',
  "Maria Luiza Cortes Sant'Anna R$385,00",
  '',
  'total: R$1.248,16 - pix',
].join('\n');
ok(M.detectarContextoMultiAluno(VITORIA_1) === true, 'legenda das 12:41 e reconhecida como multi-aluno');
const d1 = M.extrairItensNomeValor(VITORIA_1);
ok(d1.itens.length === 3, 'os 3 alunos sao extraidos (2 deles com apostrofo)', d1.itens);
ok(Math.abs(d1.itens.reduce((s, i) => s + i.valor, 0) - 1248.16) < 0.01,
   'a soma dos itens fecha com o total do comprovante', d1.itens.map((i) => i.valor));
ok(!d1.itens.some((i) => /^(total|parcelas?)\b/i.test(i.aluno_nome)),
   'nem "total:" nem "parcelas dos alunos:" viram aluno', d1.itens.map((i) => i.aluno_nome));

// A 2a tentativa dela, as 12:43, com o hifen que a Sol pediu.
const VITORIA_2 = [
  "sol, são pagamentos de 3 parcelas juntas, Márcio Sant'Anna - R$395,00",
  'Valentina Cortes Santanna - R$468,16',
  "Maria Luiza Cortes Sant'Anna - R$385,00",
].join('\n');
ok(M.detectarContextoMultiAluno(VITORIA_2) === true, 'a 2a tentativa (com hifen) tambem e reconhecida');

// O formato que a Sol ENSINA continua valendo (caso Jhon/CG 01/09).
const JHON = ['Davi Guilherme - R$ 1.290,00', 'Thuanny De Souza - R$ 432,00', 'LA CG - R$1.722,00'].join('\n');
const d2 = M.extrairItensNomeValor(JHON);
ok(d2.itens.length === 2 && d2.totalDeclarado === 1722, 'formato ensinado: 2 itens + total da unidade', d2);

// NAO REGRIDE: uma linha so nunca vira multi.
ok(M.detectarContextoMultiAluno('Parcela 09/2026 aluno Arthur Martins R$ 400,00') === false,
   'um aluno so nao vira multi');
ok(M.detectarContextoMultiAluno('Passaporte do Canto R$400\nPassaporte do Violao R$400') === false,
   'duas linhas de PRODUTO nao viram dois alunos');

// ── F3 · plural nao rotula nome, frase nao e nome ───────────────────────────
console.log('\n=== F3 · o que a Sol aceita como nome de aluno ===');

const RUINS = [
  ['sol, são 3 parcelas de alunos diferente mas o valor esta unificado. os alunos e parcela de cada são:',
   'prosa depois de "alunos" (Recreio 05/09 12:45)'],
  ['São dois alunos curso teclado e violao', 'plural + descricao de curso (Recreio 03/09)'],
  ['o aluno e a parcela é de setembro', 'frase de operacao depois de "aluno"'],
  ['muda o aluno, a forma esta errada', 'pedido de correcao nao e nome'],
];
for (const [txt, rotulo] of RUINS) {
  const r = M._alunoRotulado(txt);
  ok(r === null, 'recusa: ' + rotulo, r);
}

const BONS = [
  ['PG parcela 09/26\nAluno: Heiton Fernando Alves Da Paixão\nLA CG - R$387,00', 'Heiton Fernando Alves da Paixão'],
  ['aluno Arthur Martins Teixeira', 'Arthur Martins Teixeira'],
  ['Aluno foi Arthur Vargas Caldas', 'Arthur Vargas Caldas'],
  ['aluna Maria Luzia Marinho da Silva Delgado e a parcela é de setembro', 'Maria Luzia Marinho da Silva Delgado'],
];
for (const [txt, esperado] of BONS) {
  const r = M._alunoRotulado(txt);
  const bate = r && r.toLowerCase() === esperado.toLowerCase();
  ok(!!bate, 'aceita: ' + esperado, r);
}

console.log('\n' + (falhas ? 'RESULTADO: ' + falhas + ' FALHA(S)' : 'RESULTADO: PASSOU'));
process.exit(falhas ? 1 : 0);
