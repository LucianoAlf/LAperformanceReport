#!/usr/bin/env node
// Saída de caixa deixa de se apresentar como RECEBIMENTO e de pedir aluno.
//
// CASO (Mayra/CG, 25/08): "Sol, teve uma saída em dinheiro - PG segurança semana 25/08
// R$100,00". A LÓGICA ACERTOU — o log diz `saida_texto_preview_enviado`, ela reconheceu
// como saída. O que saiu errado foi o CARD: `montarPreview` só sabe escrever recebimento,
// então mostrou "*RECEBIMENTO*" e a seção "*ALUNO* ❓ Não identifiquei — me diz de quem é".
//
// E daí nasceu o segundo defeito, pior: a Mayra respondeu "Sol, foi saída" para corrigir,
// e o fluxo de nome-tardio engoliu a frase como NOME DE ALUNO — o card seguinte trazia
// "• foi saída · Resp. financeiro: não encontrado no cadastro".
//
// Uso: node _patch-saida-nao-e-recebimento.cjs <caminho-do-caixa-financeiro.cjs>

const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-saida-nao-e-recebimento.cjs <arquivo>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── 1. o cabeçalho do dinheiro muda conforme a direção ───────────────────────────────
trocar(
  `  const blocos = [];
  blocos.push([\`📄 *Comprovante recebido — \${unidadeNome}*\`]);

  // ---- RECEBIMENTO: o dinheiro que entrou
  blocos.push(['*RECEBIMENTO*', \`\${valor ? '*' + fmtBRL(valor) + '*' : '❓ valor não identificado'} · \${formaTxt}\`]);`,
  `  // Saida operacional (seguranca, despesa, retirada, troco) NAO e recebimento e NAO tem
  // aluno. Ate 25/08 o preview so sabia escrever recebimento, entao uma saida de R$100 do
  // seguranca aparecia como "*RECEBIMENTO*" pedindo "me diz de quem e" (caso Mayra/CG).
  const ehSaidaPreview = categoriaEhSaida(categoria);

  const blocos = [];
  blocos.push([\`📄 *\${ehSaidaPreview ? 'Saída de caixa' : 'Comprovante recebido'} — \${unidadeNome}*\`]);

  // ---- o dinheiro: entrou ou saiu
  blocos.push([
    ehSaidaPreview ? '*PAGAMENTO (saída)*' : '*RECEBIMENTO*',
    \`\${valor ? '*' + fmtBRL(valor) + '*' : '❓ valor não identificado'} · \${formaTxt}\`,
  ]);`,
  'cabecalho distingue saida de recebimento');

// ── 2. saída não tem aluno: a seção inteira sai do card ──────────────────────────────
trocar(
  `  blocos.push(bAluno);

  let fecho = null;`,
  `  // Pedir aluno numa saida operacional e o que induziu a Mayra a "corrigir" o nome —
  // e a correcao virou nome de aluno. Saida nao tem aluno: a secao nao entra.
  if (!ehSaidaPreview) blocos.push(bAluno);

  let fecho = null;`,
  'saida nao mostra secao ALUNO');

// ── 3. correção de nome tardio não pode alcançar uma saída ───────────────────────────
trocar(
  `        const semAluno = arrP.filter((x) => (!x.aluno || _alunoSuspeito(x.aluno)) && (event.quotedMessageId || (agora - x.ts) <= 5 * 60 * 1000));`,
  `        // ⚠️ Saida operacional fica FORA: ela nasce com aluno null de proposito, entao
        // caia neste filtro e qualquer frase virava nome. Foi assim que "Sol, foi saída"
        // — uma correcao de TIPO — foi gravada como o nome do aluno (Mayra/CG 25/08).
        const semAluno = arrP.filter((x) => !categoriaEhSaida(x.categoria)
          && (!x.aluno || _alunoSuspeito(x.aluno))
          && (event.quotedMessageId || (agora - x.ts) <= 5 * 60 * 1000));`,
  'correcao de nome nao alcanca saida');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
