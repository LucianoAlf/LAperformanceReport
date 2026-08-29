#!/usr/bin/env node
// Rabiolas da auditoria de 29/08 (fluxo Soraia + fechamento CG) — 2 fixes JS.
// (O 3o fix, do "(Response formatting failed, plain text:)", e' no base.py do
// gateway python — script proprio, _patch-gateway-fallback-vazio.py.)
//
// R8 — RESPONSAVEL DA FAMILIA ERRADA. O card da Soraia saiu com "Resp.
//      financeiro: Rayanne do Nascimento Sobreira" — que e' responsavel da LAURA
//      Sobreira da Silveira (confirmado no banco; a Soraia esta SEM responsavel).
//      A RPC sol_caixa_responsavel_aluno busca por word_similarity SO entre
//      alunos ATIVOS; a Soraia e' lead — o melhor ativo parecido era a Laura, e o
//      runtime usava o responsavel sem conferir o campo `aluno_nome` que a
//      PROPRIA RPC devolve dizendo com quem casou. O dado sujo foi ate o
//      lancamento ("resp. Rayanne" na linha do fechamento).
//
// G2 — DESPEDIDAS NAO ENTRAVAM NO GATE. "Fechado pessoal" / "Bom final de
//      semana" passaram ao LLM, que respondeu VAZIO, e o fallback do gateway
//      postou "(Response formatting failed, plain text:)" 2x no grupo.
//      encerraTurnoDaSol ganha as despedidas de fim de expediente.
const fs = require('fs');

const alvoFin = process.argv[2];
const alvoGate = process.argv[3];
if (!alvoFin || !alvoGate) { console.error('uso: node _patch-auditoria-rabiolas-29ago.cjs <caixa-financeiro.cjs> <group-engagement.cjs>'); process.exit(2); }

function trocarEm(arquivo, de, para, rotulo, esperado = 1) {
  let s = fs.readFileSync(arquivo, 'utf8');
  const n = s.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  fs.writeFileSync(arquivo, s.split(de).join(para), 'utf8');
  console.log(`  ok  ${rotulo}`);
}

// ── R8 ponto 1: fluxo principal ──────────────────────────────────────────────
trocarEm(alvoFin,
  "          const rr = await responsavelFn(grp.unidade_id, aluno);\n" +
  "          if (rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, aluno)) responsavelFinanceiro = rr.responsavel_nome;",
  "          const rr = await responsavelFn(grp.unidade_id, aluno);\n" +
  "          // A RPC devolve em `aluno_nome` com QUEM o fuzzy casou (so busca ativos).\n" +
  "          // Pessoa diferente = responsavel de OUTRA familia (caso Rayanne/Soraia\n" +
  "          // 29/08: Soraia e' lead, o melhor ativo parecido era a Laura).\n" +
  "          if (rr && rr.aluno_nome && !_mesmaPessoa(rr.aluno_nome, aluno)) {\n" +
  "            log({ acao: 'responsavel_rejeitado_nome_diverge', chatId, aluno, casado: rr.aluno_nome });\n" +
  "          } else if (rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, aluno)) responsavelFinanceiro = rr.responsavel_nome;",
  'R8 responsavel respeita quem o fuzzy casou (fluxo principal)');

// ── R8 ponto 2: nome-tardio ──────────────────────────────────────────────────
trocarEm(alvoFin,
  "            const rr = await responsavelFn(alvoP.unidade_id, alvoP.aluno);\n" +
  "            if (rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, alvoP.aluno)) responsavelFinanceiro = rr.responsavel_nome;",
  "            const rr = await responsavelFn(alvoP.unidade_id, alvoP.aluno);\n" +
  "            if (rr && rr.aluno_nome && !_mesmaPessoa(rr.aluno_nome, alvoP.aluno)) {\n" +
  "              log({ acao: 'responsavel_rejeitado_nome_diverge', chatId, aluno: alvoP.aluno, casado: rr.aluno_nome });\n" +
  "            } else if (rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, alvoP.aluno)) responsavelFinanceiro = rr.responsavel_nome;",
  'R8 responsavel respeita quem o fuzzy casou (nome-tardio)');

// ── G2: despedidas encerram o turno em silencio ──────────────────────────────
trocarEm(alvoGate,
  "  return /(obrigad[ao]|valeu|vlw|tchau|ate mais|ate logo|resolvido|ta resolvido|nao precisa|nao sera necessario|nao e mais necessario|pode sair|pode ir|encerrar|encerra|dispensad[ao])/.test(n);",
  "  // Despedidas de fim de expediente entram aqui: em 29/08 \"Fechado pessoal\" e\n" +
  "  // \"Bom final de semana\" foram parar no LLM, que respondeu VAZIO, e o fallback\n" +
  "  // do gateway postou \"(Response formatting failed, plain text:)\" no grupo 2x.\n" +
  "  return /(obrigad[ao]|valeu|vlw|tchau|ate mais|ate logo|resolvido|ta resolvido|nao precisa|nao sera necessario|nao e mais necessario|pode sair|pode ir|encerrar|encerra|dispensad[ao]|bom (final|fim) de semana|boa semana|bom descanso|ate segunda|ate amanha|bom feriado)/.test(n);",
  'G2 despedidas encerram turno');

console.log('\npatches aplicados');
