#!/usr/bin/env node
// Rótulo humano manda, e correção de aluno funciona mesmo quando a Sol errou a pessoa.
//
// CASO (Jhon/CG, 25/08): legenda "PG Passaporte (Pix) / aluno: Rafael Magalhães Barbosa /
// LA CG - R$300,00". A Sol montou o card com **Marcos Gabriel Fonseca Santo**, deduzido do
// pagador do PIX (Marcos Lazaro Santo). O Jhon corrigiu e a resposta caiu no LLM, que
// inventou "R$ 53,00" — o Rafael não tem UMA fatura no sistema.
//
// POR QUE O RÓTULO PERDEU: `aluno` recebe `_alunoRotulado(legenda)` com prioridade (ok),
// mas se a fatura canônica não CONFIRMA esse nome, `alunoConfirmado` fica false e o bloco
// do pagador sobrescreve `aluno`. E aluno novo — que é justamente quem paga passaporte —
// não tem fatura para confirmar. Ou seja: quanto mais novo o aluno, mais fácil a dedução
// atropelar o que o humano escreveu.
//
// POR QUE A CORREÇÃO NÃO PEGOU: o fluxo de nome-tardio só olha pendências sem aluno
// (`!x.aluno || _alunoSuspeito(x.aluno)`). "Marcos Gabriel Fonseca Santo" é nome plausível,
// então a pendência ficava fora — quando a Sol acerta o formato e erra a PESSOA, não havia
// caminho determinístico para consertar.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-rotulo-humano-manda.cjs <arquivo>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── 1. marca que o nome veio de rótulo humano ────────────────────────────────────────
trocar(
  `      aluno = _alunoRotulado(legendaEfetiva) || aluno || _alunoFromCaption(legendaEfetiva) || alunoVis;
      if (!nomePlausivel(aluno)) aluno = null;`,
  `      const _rotuloHumano = _alunoRotulado(legendaEfetiva);
      aluno = _rotuloHumano || aluno || _alunoFromCaption(legendaEfetiva) || alunoVis;
      if (!nomePlausivel(aluno)) aluno = null;
      // "aluno: Fulano" escrito por gente e' DECISAO, nao palpite. Sem isto, quando a
      // fatura canonica nao confirma o nome (aluno novo nao TEM fatura), o bloco do
      // pagador sobrescrevia — foi assim que o passaporte do Rafael virou Marcos.
      const _alunoVeioDoRotulo = !!(_rotuloHumano && nomePlausivel(_rotuloHumano));`,
  'marca nome vindo de rotulo humano');

// ── 2. o pagador nao sobrescreve rótulo humano ───────────────────────────────────────
trocar(
  `              } else {
                aluno = idp.alunos[0].aluno_nome;
                alunoViaPagador = idp.via;`,
  `              } else if (_alunoVeioDoRotulo) {
                // o humano ja disse quem e; o pagador do comprovante nao vota contra
                log({ acao: 'pagador_ignorado_rotulo_humano', chatId, aluno, pagador: pagadorNome });
              } else {
                aluno = idp.alunos[0].aluno_nome;
                alunoViaPagador = idp.via;`,
  'pagador nao sobrescreve rotulo humano');

// ── 3. correção de aluno alcança pendência com nome errado, se CITAR o card ──────────
trocar(
  `        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)
          && (!x.aluno || _alunoSuspeito(x.aluno))
          && (event.quotedMessageId || (agora - x.ts) <= 5 * 60 * 1000));`,
  `        // ⚠️ Saida operacional fica FORA (nasce com aluno null de proposito).
        // ⚠️ Com CITACAO do preview, aceita corrigir mesmo com aluno ja preenchido: quando
        // a Sol acerta o formato e erra a PESSOA, o nome e plausivel, nao entra no
        // filtro de suspeito, e antes nao havia como consertar — a correcao vazava pro LLM,
        // que respondeu com valor inventado (caso Rafael/CG 25/08). Exigir a citacao
        // mantem o alvo inequivoco: sem ela, a regra antiga vale.
        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)
          && (
            (event.quotedMessageId && x.previewId === event.quotedMessageId)
            || ((!x.aluno || _alunoSuspeito(x.aluno)) && (agora - x.ts) <= 5 * 60 * 1000)
          ));`,
  'correcao citada alcanca aluno errado');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
