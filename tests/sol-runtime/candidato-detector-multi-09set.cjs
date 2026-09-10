#!/usr/bin/env node
/**
 * Candidato para o ramo `nomesLigados` do detector de multi-aluno.
 *
 * 🔴 O FATO (09/09/2026). O MESMO caso — Davi R$1.290 + Thuanny R$432 = R$1.722,
 *    Campo Grande — foi lançado com sucesso em 01/09 e falhou hoje. A diferença
 *    não está no código: está na LEGENDA. Em 01/09 a Mayra escreveu os nomes
 *    ligados por "e"; hoje ela acrescentou o valor de cada um entre parênteses,
 *    para ajudar, e o parêntese entre o nome e o "e" cegou o detector.
 *
 *    A Sol entendeu MENOS porque a pessoa escreveu MAIS.
 *
 * ⚠️ O ramo atual foi calibrado contra falsos positivos REAIS (camisa PagBank
 *    29/08, sobrenome com "e", datas somadas com "+"). Afrouxar sem discriminador
 *    reabre justamente isso — a primeira tentativa passou a ler "curso de canto
 *    e curso de harmonia" (UM aluno) como dois alunos.
 *
 * A ideia: tolerar um parêntese curto ANTES do conectivo, e RECUSAR quando o
 * que vem DEPOIS dele é coisa (curso, parcela, taxa) em vez de gente.
 */

// como está hoje no runtime
const ATUAL = /\b[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\s*(?:\be\b|\+|&)\s*[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\b/;

// candidato
const CAND = /\b[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\s*(?:\([^)]{0,40}\)\s*)?(?:\be\b|\+|&)\s*(?!(?:curso|cursos|parcela|parcelas|mensalidade|mensalidades|taxa|taxas|matricula|matriculas|aula|aulas|material|materiais|passaporte|passaportes)\b)(?:alun[oa]\s+)?(?!(?:curso|cursos|parcela|parcelas|mensalidade|mensalidades|taxa|taxas|matricula|matriculas|aula|aulas|material|materiais|passaporte|passaportes)\b)[a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){1,4}\b/;

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CASOS = [
  // ── casos que PRECISAM virar multi ────────────────────────────────────
  [true, 'Mayra 09/09 — 2 alunos, valores entre parenteses (o que falhou)',
   'PG pix parcelas 09/2026 aluno Davi Guilherme de Souza Chaves Ribeiro (4 cursos - R$1290,00) e aluna Thuanny de Souza Chaves Ribeiro (R$432,00) - LA CG R$1722,00'],
  [true, 'Mayra 01/09 — mesmos 2 alunos, sem parenteses (funcionou)',
   'PG pix parcelas 08/2026 aluno Davi Guilherme de Souza Chaves Ribeiro e aluna Thuanny de Souza Chaves Ribeiro - LA CG R$1722,00'],
  [true, 'Joao e Ana 08/09 — 2 alunos (legado ignorou)',
   'PG pix parcela 09/2026 de João Lucas Henrique da Silva e de Ana Mel Henrique da Silva - Kids CG R$274,00'],
  [true, 'Mayra 11:37 — explicitou tudo e ouviu "nao entendi"',
   'Sol, são dois alunos diferentes Davi Guilherme de Souza Chaves Ribeiro (4 cursos R$1290,00) e Thuanny de Souza Chaves Ribeiro (1 curso R$432,00) total do comprovante R$1722,00'],

  // ── falsos positivos REAIS que a trava existe para barrar ─────────────
  [false, 'camisa PagBank 29/08 (lojinha, 1 pessoa)',
   'Pagamento camisa PagBank Lhays Marinho e Silva R$65,00'],
  [false, 'sobrenome com "e"',
   'João Pedro de Almeida e Souza'],
  [false, 'datas somadas com "+"',
   'Parcela 07/26 + 08/26 aluno Arthur Martins'],
  [false, '1 aluno, varios cursos (legenda real de 09/09 13:31)',
   'PG pix parcelas 09/2026 aluno Davi Guilherme de Souza Chaves Ribeiro curso de canto (R$394,00) e curso de harmonia (R$149,00)'],
  [false, '1 aluna, 2 cursos (Fernanda/Recreio)',
   'Parcela do mês de Setembro da aluna Vitória da Silva Nobre - R$1.378,00'],
  [false, 'taxa e mensalidade do mesmo aluno',
   'PG pix taxa de matricula e mensalidade do aluno Carlos Augusto Victorino de Lima R$500,00'],
];

console.log('RAMO `nomesLigados` — atual x candidato\n');
console.log('caso'.padEnd(58) + 'atual  cand  esperado');
let piora = 0, melhora = 0;
for (const [esp, nome, texto] of CASOS) {
  const a = ATUAL.test(norm(texto));
  const c = CAND.test(norm(texto));
  if (c !== esp && a === esp) piora++;
  if (c === esp && a !== esp) melhora++;
  const marca = c !== esp ? '  🔴 ERRA' : '';
  console.log(nome.padEnd(58) + `${a ? 'V' : '.'}      ${c ? 'V' : '.'}     ${esp ? 'V' : '.'}${marca}`);
}
console.log(`\nmelhora: ${melhora}   piora: ${piora}`);
process.exit(piora ? 1 : 0);
