#!/usr/bin/env node
// Complemento do rotulo-vence-fuzzy: mais dois furos da MESMA doutrina, expostos
// pelo proprio teste do caso Soraia->Laura (a rejeicao R1/R2 funcionou e o fluxo
// caiu nos vizinhos).
//
// R6 — o ramo AMBIGUO do pagador zerava o rotulo humano. O ramo nao-ambiguo ja
//      tinha a guarda `else if (_alunoVeioDoRotulo)` (do #230); o ambiguo fazia
//      `aluno = null` + candidatos sem checar nada. Com rotulo, "de qual aluno e?"
//      e pergunta que o humano JA respondeu na legenda.
//
// R7 — o NOME-TARDIO (correcao "a aluna e Soraia...") readotava a pessoa errada:
//      `alvoP.aluno = c.aluno_nome || nomeTardio` deixava a canonica/casador
//      trocar o nome que o humano ACABOU de ditar. Foi por isso que a correcao da
//      Mayra, mesmo alcancando a pendencia, remontava o card com Laura de novo.
//      Nome de correcao e rotulo por definicao: pessoa diferente no retorno =
//      enriquecimento rejeitado, fica o nome ditado (confianca baixa, sem fatura
//      da familia errada).
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-rotulo-fuzzy-r6-r7.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── R6: pagador ambiguo nao apaga rotulo humano ──────────────────────────────
trocar(
  "              if (idp.ambiguo) {\n" +
  "                candidatosAluno = idp.alunos.map((x) => x.aluno_nome).slice(0, 4);\n" +
  "                aluno = null;\n" +
  "              } else if (_alunoVeioDoRotulo) {",
  "              if (idp.ambiguo && _alunoVeioDoRotulo) {\n" +
  "                // \"de qual aluno e?\" e pergunta que o humano JA respondeu na legenda.\n" +
  "                log({ acao: 'pagador_ambiguo_ignorado_rotulo_humano', chatId, aluno });\n" +
  "              } else if (idp.ambiguo) {\n" +
  "                candidatosAluno = idp.alunos.map((x) => x.aluno_nome).slice(0, 4);\n" +
  "                aluno = null;\n" +
  "              } else if (_alunoVeioDoRotulo) {",
  'R6 pagador ambiguo respeita rotulo');

// ── R7a: canonica do nome-tardio nao troca a pessoa ditada ───────────────────
trocar(
  "            if (c && c.ok) {\n" +
  "              canonica = c;\n" +
  "              alvoP.aluno = c.aluno_nome || nomeTardio;\n" +
  "              alunoConfirmado = true;\n" +
  "              if (c.parcela && querParcela) {",
  "            // Nome de correcao e ROTULO por definicao: retorno com OUTRA pessoa =\n" +
  "            // enriquecimento rejeitado (caso Mayra 29/08: a correcao remontava o\n" +
  "            // card com a Laura do fuzzy de novo).\n" +
  "            if (c && c.ok && c.aluno_nome && !_mesmaPessoa(c.aluno_nome, nomeTardio)) {\n" +
  "              log({ acao: 'canonica_tardia_rejeitada_nome_diverge', chatId, ditado: nomeTardio, casado: c.aluno_nome });\n" +
  "              c = null;\n" +
  "            }\n" +
  "            if (c && c.ok) {\n" +
  "              canonica = c;\n" +
  "              alvoP.aluno = c.aluno_nome || nomeTardio;\n" +
  "              alunoConfirmado = true;\n" +
  "              if (c.parcela && querParcela) {",
  'R7a canonica tardia respeita nome ditado');

// ── R7b: casador do nome-tardio idem ─────────────────────────────────────────
trocar(
  "              const m = await casarFn(alvoP.unidade_id, nomeTardio, alvoP.valor, competencia);\n" +
  "              if (m && m.ok) {\n" +
  "                alvoP.aluno = m.aluno_nome || nomeTardio;",
  "              const m = await casarFn(alvoP.unidade_id, nomeTardio, alvoP.valor, competencia);\n" +
  "              if (m && m.ok && m.aluno_nome && !_mesmaPessoa(m.aluno_nome, nomeTardio)) {\n" +
  "                log({ acao: 'casamento_tardio_rejeitado_nome_diverge', chatId, ditado: nomeTardio, casado: m.aluno_nome });\n" +
  "              } else if (m && m.ok) {\n" +
  "                alvoP.aluno = m.aluno_nome || nomeTardio;",
  'R7b casador tardio respeita nome ditado');

// ── R7c: composto do nome-tardio idem ────────────────────────────────────────
trocar(
  "              const compMes = await faturasMesFn(alvoP.unidade_id, alvoP.aluno, competencia, alvoP.valor);\n" +
  "              if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2) {",
  "              const compMes = await faturasMesFn(alvoP.unidade_id, alvoP.aluno, competencia, alvoP.valor);\n" +
  "              if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2\n" +
  "                  && !(compMes.aluno_nome && !_mesmaPessoa(compMes.aluno_nome, alvoP.aluno))) {",
  'R7c composto tardio respeita nome ditado');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
