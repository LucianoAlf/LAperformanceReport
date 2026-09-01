#!/usr/bin/env node
// Caso Jhon/CG 01/09 17:53 — a correção "falta o valor de R$432,00 referente a
// aluna Thyfany De Souza" trocou aluno (Davi→Thyfany) e valor (1.290→432),
// mas o card saiu com a FATURA DO DAVI grudada: "Pagamento composto — 4
// parcelas/cursos ... R$ 380+367+149+394". Recebimento de um, fatura de outro.
//
// N1  ALUNO MUDOU => ENRIQUECIMENTOS DO ALUNO ANTERIOR MORREM JUNTOS. O
//     caminho de correção mantinha composto/canonica/parcela/responsável via
//     `composto || alvoP.composto` — ressuscitava o do aluno trocado quando o
//     novo não tinha. Agora a troca de pessoa zera o que não foi recomputado.
//
// N2  "calma ai"/"pera"/"espera" são conversa, não completação de divisão — o
//     "calma ai" do Luciano levou a parede "Entendi a divisão, mas...".
//     (Extensão da lista existente de conversa-sem-comando, não gramática nova.)
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-troca-aluno-limpa-01set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── N1a: capturar o aluno de ANTES da correcao ───────────────────────────────
trocar(
  `        if (nomeTardio && alvoP) {
          // Evidencia explicita do humano no MESMO texto vence o que a pendencia`,
  `        if (nomeTardio && alvoP) {
          const _alunoAntesDaCorrecao = alvoP.aluno || null;
          // Evidencia explicita do humano no MESMO texto vence o que a pendencia`,
  'N1a aluno de antes');

// ── N1b: responsavel herdado morre na troca de pessoa ────────────────────────
trocar(
  `          let responsavelFinanceiro = alvoP.responsavelFinanceiro || null;
          if (_respDitado) {`,
  `          // Aluno MUDOU => nada do aluno anterior sobrevive por heranca
          // (01/09: card da Thyfany saiu com o composto e o responsavel do Davi).
          const _trocouAluno = !!(_alunoAntesDaCorrecao && alvoP.aluno && !_mesmaPessoa(_alunoAntesDaCorrecao, alvoP.aluno));
          let responsavelFinanceiro = _trocouAluno ? null : (alvoP.responsavelFinanceiro || null);
          if (_respDitado) {`,
  'N1b responsavel herdado morre na troca');

// ── N1c: composto/canonica/parcela do aluno anterior morrem na troca ─────────
trocar(
  `          alvoP.categoria = categoria;
          alvoP.competencia = competencia;
          alvoP.parcela = parcela;
          alvoP.composto = composto || alvoP.composto || null;
          alvoP.canonica = canonica || alvoP.canonica || null;`,
  `          alvoP.categoria = categoria;
          alvoP.competencia = competencia;
          alvoP.parcela = _trocouAluno ? (parcela === alvoP.parcela ? null : parcela) : parcela;
          alvoP.composto = _trocouAluno ? (composto || null) : (composto || alvoP.composto || null);
          alvoP.canonica = _trocouAluno ? (canonica || null) : (canonica || alvoP.canonica || null);`,
  'N1c enriquecimentos morrem na troca');

// ── N2: "calma ai" e afins sao conversa ──────────────────────────────────────
trocar(
  `  return /^(certinho|certo|ok|okay|blz|beleza|show|otimo|perfeito|isso|isso ai|top|valeu|vlw|obrigad[oa]|obg|brigad[oa]|maravilha|boa|massa|legal|entendi|ta bom|tudo certo|feito|combinado|bom dia|boa tarde|boa noite)( .{0,12})?$/.test(n);`,
  `  return /^(certinho|certo|ok|okay|blz|beleza|show|otimo|perfeito|isso|isso ai|top|valeu|vlw|obrigad[oa]|obg|brigad[oa]|maravilha|boa|massa|legal|entendi|ta bom|tudo certo|feito|combinado|bom dia|boa tarde|boa noite|calma|calma ai|pera|pera ai|peraí|espera|aguarda|um momento|so um minuto)( .{0,12})?$/.test(n);`,
  'N2 calma ai e conversa');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
