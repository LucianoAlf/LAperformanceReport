#!/usr/bin/env node
// "Aluna Soraia da Silveira Duarte" virou card da Laura Sobreira da Silveira.
// (Mayra/CG, 29/08 14:38-14:40)
//
// CASO: legenda "PG Parcelas 02/2026 e 05/2026 - Aluna Soraia da Silveira Duarte -
// LA CG - R$976,00". O card saiu com OUTRA pessoa: Laura Sobreira da Silveira,
// responsavel Rayanne do Nascimento Sobreira, fatura 09/2026 de Musicalizacao
// Infantil (R$377). Word_similarity casou Silveira~Sobreira~Silveira e pronto.
//
// RAIZ: a flag _alunoVeioDoRotulo (criada no #230) protege o rotulo humano APENAS
// contra o bloco do PAGADOR. O casador fuzzy (aplicarCasamento), a canonica
// (tentarCanonica) e o composto sobrescrevem o nome sem checar a flag — linha
// `if (m.aluno_nome) aluno = m.aluno_nome;` e irmas.
//
// FIX R1-R3: com rotulo humano, casamento que devolve OUTRA pessoa (_mesmaPessoa
// falso) e REJEITADO por inteiro — nem nome, nem fatura, nem responsavel da
// familia errada. Melhor card sem fatura confirmada do que card de outra familia.
//
// FIX R4: correcao com ROTULO explicito ("a aluna e Soraia...") + UM card aberto
// corrige SEM exigir citacao. A exigencia de citacao (25/08) era para nome solto
// plausivel; rotulo explicito com card unico e inequivoco — e foi exatamente o
// que a Mayra mandou e levou "Nao entendi essa".
//
// FIX R5: os dois pontos de citacao do nome-tardio passam a aceitar QUALQUER
// mensagem da Sol ligada a pendencia (msgIds/origem), como o "pode" ja aceita.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-rotulo-vence-casamento-fuzzy.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── R1: casador fuzzy nao passa por cima do rotulo ───────────────────────────
trocar(
  "      const aplicarCasamento = (m) => {\n        if (!m || !m.ok) return false;\n        if (m.aluno_nome) aluno = m.aluno_nome;",
  "      const aplicarCasamento = (m) => {\n" +
  "        if (!m || !m.ok) return false;\n" +
  "        // Rotulo humano MANDA: casador fuzzy que devolve OUTRA pessoa nao pode\n" +
  "        // sobrescrever nem trazer a fatura dela. Caso Soraia->Laura (CG 29/08):\n" +
  "        // word_similarity casou Silveira~Sobreira e o card saiu com aluna, fatura\n" +
  "        // e responsavel de outra familia.\n" +
  "        if (_alunoVeioDoRotulo && m.aluno_nome && !_mesmaPessoa(m.aluno_nome, aluno)) {\n" +
  "          log({ acao: 'casamento_rejeitado_nome_diverge', chatId, rotulo: aluno, casado: m.aluno_nome });\n" +
  "          return false;\n" +
  "        }\n" +
  "        if (m.aluno_nome) aluno = m.aluno_nome;",
  'R1 casador respeita rotulo');

// ── R2: canonica idem ────────────────────────────────────────────────────────
trocar(
  "          if (c && c.ok) { canonica = c; if (c.aluno_nome) aluno = c.aluno_nome; return true; }",
  "          if (c && c.ok && _alunoVeioDoRotulo && c.aluno_nome && !_mesmaPessoa(c.aluno_nome, aluno)) {\n" +
  "            log({ acao: 'canonica_rejeitada_nome_diverge', chatId, rotulo: aluno, casado: c.aluno_nome });\n" +
  "            return false;\n" +
  "          }\n" +
  "          if (c && c.ok) { canonica = c; if (c.aluno_nome) aluno = c.aluno_nome; return true; }",
  'R2 canonica respeita rotulo');

// ── R3: composto idem ────────────────────────────────────────────────────────
// ⚠️ A âncora inclui a linha do faturasMesFn: o `if` idêntico existe em TRÊS
// lugares (fluxo principal, nome-tardio e correção) — só o principal tem
// `_alunoVeioDoRotulo` em escopo; os outros dois já partem de nome dado pelo
// humano. A 1ª tentativa com a âncora curta achou 3 e a guarda abortou.
trocar(
  "          const compMes = await faturasMesFn(grp.unidade_id, aluno, competenciaComposto, valor);\n          if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2) {",
  "          const compMes = await faturasMesFn(grp.unidade_id, aluno, competenciaComposto, valor);\n" +
  "          if (compMes && compMes.ok && Array.isArray(compMes.partes) && compMes.partes.length >= 2\n" +
  "              && !(_alunoVeioDoRotulo && compMes.aluno_nome && !_mesmaPessoa(compMes.aluno_nome, aluno))) {",
  'R3 composto respeita rotulo (fluxo principal)');

// ── R4+R5: correcao com rotulo explicito nao exige citacao (card unico) ──────
trocar(
  "        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)\n" +
  "          && (\n" +
  "            (event.quotedMessageId && x.previewId === event.quotedMessageId)\n" +
  "            || ((!x.aluno || _alunoSuspeito(x.aluno)) && (agora - x.ts) <= 5 * 60 * 1000)\n" +
  "          ));\n" +
  "        let alvoP = null;\n" +
  "        if (event.quotedMessageId) alvoP = semAluno.find((p) => p.previewId === event.quotedMessageId) || null;",
  "        // ⚠️ Correcao com ROTULO explicito (\"a aluna e Soraia...\") + card UNICO nao\n" +
  "        // exige citacao: e inequivoca. A exigencia de citacao (25/08) era para nome\n" +
  "        // solto plausivel. Caso Mayra/CG 29/08: a frase mais explicita possivel\n" +
  "        // levou \"Nao entendi essa\" porque o card ja tinha um aluno (errado).\n" +
  "        const _cita = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));\n" +
  "        const _rotuloNaCorrecao = _alunoRotulado(txt);\n" +
  "        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)\n" +
  "          && (\n" +
  "            (event.quotedMessageId && _cita(x, event.quotedMessageId))\n" +
  "            || ((!x.aluno || _alunoSuspeito(x.aluno)) && (agora - x.ts) <= 5 * 60 * 1000)\n" +
  "            || (!!_rotuloNaCorrecao && arrP.length === 1)\n" +
  "          ));\n" +
  "        let alvoP = null;\n" +
  "        if (event.quotedMessageId) alvoP = semAluno.find((p) => _cita(p, event.quotedMessageId)) || null;",
  'R4+R5 rotulo explicito corrige sem citacao; citacao ampla');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
