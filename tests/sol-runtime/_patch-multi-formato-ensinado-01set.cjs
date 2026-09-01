#!/usr/bin/env node
// Caso Jhon/CG 01/09 17:51 — o detector de multi-aluno NAO RECONHECIA O
// FORMATO QUE A PROPRIA SOL ENSINA ("Manda cada aluno com seu valor: João — R$
// 360 / Pedro — R$ 360"). O Jhon mandou a legenda exatamente assim ("Davi
// Guilherme - R$ 1.290,00 / Thuanny De Souza - R$ 432,00 / LA CG - R$1.722,00")
// e o fluxo caiu no SINGLE: pegou o primeiro valor (1.290), o composto fechou
// 4 parcelas do Davi e o card saiu dizendo "soma confere com o comprovante" —
// com o PIX valendo 1.722 e a Thuanny ignorada. Se o "pode" viesse, sumiam
// R$ 432. (Shadow: lancamento_multi_aluno conf 0.99 — roteador acertou de novo.)
//
// F1  detector ganha o sinal "2+ linhas Nome — R$ valor" (o formato ensinado),
//     descontando a linha da unidade ("LA CG - R$...") via _UNIDADE_TAG.
// F2  aviso de PAGAMENTO PARCIAL: quando a propria legenda traz um valor MAIOR
//     que o do card, o card avisa — nunca mais "confere" cobrindo so um pedaco.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-multi-formato-ensinado-01set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;
const BS = String.fromCharCode(92);

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── F1: o formato ensinado entra no detector ─────────────────────────────────
trocar(
  `  return categoriaComDoisNomes
    || nomesLigados
    || valorPorCabeca
    || (pluralidade && (nomesEmConjunto || /\\b(?:dois|2|ambos|mais de um)\\b/.test(t)));`,
  `  // O FORMATO QUE A PROPRIA SOL ENSINA ("João — R$ 360 / Pedro — R$ 360"):
  // duas ou mais linhas "Nome — R$ valor". Em 01/09 o Jhon mandou exatamente
  // assim e o detector nao reconhecia — o fluxo caiu no single e ignorou o
  // segundo aluno e o total do PIX. A linha da unidade ("LA CG - R$...") nao
  // conta como pessoa.
  const linhasNomeValor = (String(texto || '').split(/` + BS + `n/)
    .map((l) => l.match(/^` + BS + `s*([a-zà-ÿA-ZÀ-ÿ]{2,}(?:` + BS + `s+[a-zà-ÿA-ZÀ-ÿ]{2,}){1,4})` + BS + `s*[-–—]` + BS + `s*r?` + BS + `$?` + BS + `s*` + BS + `d[` + BS + `d.,]*` + BS + `s*$/i))
    .filter((m) => m && !_UNIDADE_TAG.test(m[1]))
  ).length >= 2;

  return linhasNomeValor
    || categoriaComDoisNomes
    || nomesLigados
    || valorPorCabeca
    || (pluralidade && (nomesEmConjunto || /\\b(?:dois|2|ambos|mais de um)\\b/.test(t)));`,
  'F1 formato ensinado no detector');

// ── F2: aviso de pagamento parcial (valor maior na propria legenda) ──────────
trocar(
  `      const somaLegenda = extrairSomaAditivaPagamento(legendaEfetiva);`,
  `      // F2 (01/09): a legenda trazia 1.290, 432 E o total 1.722; o card saiu
      // com 1.290 dizendo "confere". Se a propria legenda tem um valor MAIOR
      // que o do card, e' sinal de pagamento de mais gente/parcial — avisa.
      let valorMaiorNaLegenda = null;
      {
        const _vals = (String(legendaEfetiva || '').match(/r?` + BS + `$` + BS + `s*` + BS + `d{1,3}(?:` + BS + `.` + BS + `d{3})*(?:,` + BS + `d{2})?|` + BS + `b` + BS + `d{2,6},` + BS + `d{2}` + BS + `b/gi) || [])
          .map((s) => parseBRMoney(s)).filter((v) => v && v > 0);
        const _max = _vals.length ? Math.max.apply(null, _vals) : 0;
        if (valor && _max > Number(valor) + 0.01) valorMaiorNaLegenda = _max;
      }
      const somaLegenda = extrairSomaAditivaPagamento(legendaEfetiva);`,
  'F2 detecta valor maior na legenda');

trocar(
  `      let texto = montarPreview({ unidadeNome: grp.nome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel: canonicaIndisponivel, composto, bloqueiaLancamento, itemLojinha: lojinhaInfo && lojinhaInfo.item });`,
  `      let texto = montarPreview({ unidadeNome: grp.nome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel: canonicaIndisponivel, composto, bloqueiaLancamento, itemLojinha: lojinhaInfo && lojinhaInfo.item, valorMaiorNaLegenda });`,
  'F2 passa ao preview');

trocar(
  `function montarPreview({ unidadeNome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel, composto, bloqueiaLancamento, itemLojinha, semAlunoDeclarado, entidade }) {`,
  `function montarPreview({ unidadeNome, valor, forma, categoria, aluno, competencia, parcela, confiancaBaixa, alunoNovoOrigem, responsavelFinanceiro, formaIncerta, cartaoModalidade, cartaoParcelas, multiplas, alunoViaPagador, pagadorNome, candidatosAluno, canonica, duplicata, quitacao, faturaIndisponivel, composto, bloqueiaLancamento, itemLojinha, semAlunoDeclarado, entidade, valorMaiorNaLegenda }) {`,
  'F2 assinatura do preview');

trocar(
  `  blocos.push([
    ehSaidaPreview ? '*PAGAMENTO (saída)*' : '*RECEBIMENTO*',
    \`\${valor ? '*' + fmtBRL(valor) + '*' : '❓ valor não identificado'} · \${formaTxt}\`,
  ]);`,
  `  blocos.push([
    ehSaidaPreview ? '*PAGAMENTO (saída)*' : '*RECEBIMENTO*',
    \`\${valor ? '*' + fmtBRL(valor) + '*' : '❓ valor não identificado'} · \${formaTxt}\`,
    ...(valorMaiorNaLegenda ? [\`⚠️ A mensagem cita \${fmtBRL(valorMaiorNaLegenda)} — este card cobre só \${fmtBRL(Number(valor) || 0)}. Se é pagamento de mais de um aluno, manda cada um: *Nome — R$ valor*.\`] : []),
  ]);`,
  'F2 aviso no card');

// ── F3: o TOTAL do multi e' o do COMPROVANTE, nao o primeiro valor da legenda ─
// Com a divisao na legenda ("Davi - 1.290 / Thuanny - 432 / LA CG - 1.722"),
// extrairValor pegava 1.290 como "valor" e a soma dos itens (1.722) nunca
// fechava — manual review eterno. Para multi, o total certo e' o maior entre
// valor, maior-da-legenda e OCR do comprovante; se a escolha estiver errada, a
// soma nao fecha e o fail-closed pergunta (nao ha risco de lancar errado).
trocar(
  `        const intentMulti = validarIntencaoMultiAluno(multiRaw, valor, { forma, categoria, competencia });`,
  `        const _totalMulti = Math.max(Number(valor) || 0, Number(valorMaiorNaLegenda) || 0, Number(extrairValorOcr(ocrText)) || 0) || valor;
        const intentMulti = validarIntencaoMultiAluno(multiRaw, _totalMulti, { forma, categoria, competencia });`,
  'F3 total do multi vem do comprovante');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
