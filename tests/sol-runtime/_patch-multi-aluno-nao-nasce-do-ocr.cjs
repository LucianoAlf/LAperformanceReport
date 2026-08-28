#!/usr/bin/env node
// Multi-aluno e decisao de QUEM ESCREVEU, nao do OCR do comprovante.
//
// CASO (Mayra/CG, 28/08/2026, 16:43): comprovante PIX de R$ 380,00 com a legenda
//   "PG pix parcela 08/2026 aluno Arthur de Jesus Lindo Braga - Kids CG R$380,00"
// -- UM aluno, rotulado com todas as letras. A Sol respondeu:
//   "Entendi que este comprovante e de mais de um aluno. Nao vou escolher um deles
//    nem dividir o total sozinho. Manda cada aluno com seu valor"
// e ficou presa nisso, repetindo o pedido.
//
// CAUSA: `detectarContextoMultiAluno` roda sobre `legendaEfetiva + OCR`. A regra
// NOMES_LIGADOS procura dois grupos de nomes proprios unidos por "e"/"+"/"&" -- e
// TODO comprovante PIX traz o nome do PAGADOR, que quase nunca e o do aluno. Basta
// uma linha do recibo casar ("SELMA DE MATTOS LINDO BRAGA e LA MUSIK KIDS", medido:
// true) para o comprovante inteiro virar "multi-aluno". A legenda sozinha da false.
//
// ⚠️ Nao e regressao das mudancas de 28/08: `detectarContextoMultiAluno` esta byte
// a byte identico antes e depois (mesmo md5). E defeito antigo, exposto agora.
//
// CORRECAO: quando a legenda rotula UM aluno e ela propria nao tem sinal de multi,
// o humano ja respondeu a pergunta -- o OCR nao pode contradizer. Mesma doutrina
// que ja rege a categoria de saida ("so pode nascer do que a PESSOA escreveu, nunca
// do OCR") e o rotulo humano do #230.
//
// ⚠️ O que NAO muda: legenda com sinal de multi ("Thiago e Matheus", "350 cada",
// "2 alunos") continua roteando para revisao. Sem rotulo na legenda, idem. A
// protecao contra dividir dinheiro sozinha fica intacta -- ela so deixa de ser
// acionada por nome de terceiro impresso no recibo.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-multi-aluno-nao-nasce-do-ocr.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

const de = `      if (detectarContextoMultiAluno(textoClassificacao)) {`;
const para = `      // ⚠️ Multi-aluno e' decisao de QUEM ESCREVEU, nunca do OCR: todo comprovante
      // PIX traz o nome do PAGADOR, e qualquer linha do recibo com dois grupos de
      // nomes ligados por "e" dispara o detector (medido: "SELMA DE MATTOS LINDO
      // BRAGA e LA MUSIK KIDS" -> true). Quando a legenda rotula UM aluno e nao tem
      // sinal de multi, o humano ja respondeu -- o recibo nao pode contradizer.
      // Caso Mayra/CG 28/08: "aluno Arthur de Jesus Lindo Braga" virou "mais de um
      // aluno" e o lancamento travou.
      const _rotuloUnicoNaLegenda = !!_alunoRotulado(legendaEfetiva)
        && !detectarContextoMultiAluno(legendaEfetiva);
      if (detectarContextoMultiAluno(textoClassificacao) && !_rotuloUnicoNaLegenda) {`;

const n = src.split(de).length - 1;
if (n !== 1) { console.error(`ANCORA multi-aluno: esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
src = src.split(de).join(para);
console.log('  ok  multi-aluno nao nasce do OCR quando a legenda rotula um aluno');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
