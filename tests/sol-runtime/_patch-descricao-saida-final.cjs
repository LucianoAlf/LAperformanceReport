#!/usr/bin/env node
// Fecha a descrição da saída: sobrava "PG Semana Seguranca - - segurança 25/08".
//
// Dois resíduos, os dois do mesmo tema — comparação/limpeza que ignora acento:
//   1. hífen órfão: a frase original tinha "dinheiro - PG segurança", o limpador tira as
//      palavras e deixa o "-" solto.
//   2. "segurança" repetido: a função só evita repetir a categoria quando
//      `t.includes(cat)`, mas `cat` é "seguranca" (sem acento, como está no enum) e o
//      texto traz "segurança". Sem normalizar, nunca casa.
const fs = require('fs');
const alvo = process.argv[2];
let src = fs.readFileSync(alvo, 'utf8');

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

trocar(
  `    .replace(/[^\\p{L}\\d\\s./-]/gu, ' ')
    .replace(/\\s+/g, ' ')
    .trim();`,
  `    .replace(/[^\\p{L}\\d\\s./-]/gu, ' ')
    // hifen que sobrou depois de tirar as palavras em volta ("dinheiro - PG seguranca")
    .replace(/(^|\\s)-+(?=\\s|$)/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();`,
  'hifen orfao');

trocar(
  `  return \`PG Semana \${cap(cat)}\${t.toLowerCase().includes(cat) ? '' : ' - ' + t}\`;`,
  `  // sem normalizar acento, "segurança" no texto nunca casa com "seguranca" do enum e a
  // categoria aparece duas vezes na descricao do caixa.
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  return \`PG Semana \${cap(cat)}\${semAcento(t).includes(semAcento(cat)) ? '' : ' - ' + t}\`;`,
  'compara categoria sem acento');

fs.writeFileSync(alvo, src, 'utf8');
console.log('  descricao fechada');
