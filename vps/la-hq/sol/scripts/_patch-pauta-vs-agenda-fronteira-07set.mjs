#!/usr/bin/env node
// A FRONTEIRA ENTRE `pauta_do_dia` E `agenda_do_dia` (07/09/2026).
//
// 🔴 MEDIDO, nao suposto: perguntei a Sol "tenho alguem para olhar hoje?" com o
//    telefone do Arthur e ela chamou **`agenda_do_dia`**, respondendo "hoje nao
//    aparece ninguem agendado para olhar". A palavra "hoje" casou com a grade.
//
//    Nao e erro do modelo — e descricao minha sem fronteira. As duas portas
//    respondem "o que tem hoje", e nenhuma dizia onde uma acaba e a outra
//    comeca. E o padrao que o agente da Maria descreve: quando ela erra de
//    ferramenta, o que conserta e a DESCRICAO da que ela deveria ter escolhido,
//    nao o prompt.
//
// ⚠️ A fronteira vai nas DUAS: so na nova, `agenda_do_dia` continuaria atraindo
//    a pergunta; so na antiga, a nova nao se venderia. Cada uma cita a irma
//    pelo nome.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-pauta-vs-agenda-fronteira-07set.mjs <arquivo>'); process.exit(2); }
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('não é a grade de aulas')) { console.log('ja aplicado'); process.exit(0); }

const trocas = [
  // a nova abre pelas palavras que a ADM usa de verdade, e nega a grade
  ['description: \'Quem merece um telefonema HOJE na unidade:',
   'description: \'A LISTA DE QUEM PRECISA DE ATENÇÃO hoje — não é a grade de aulas (essa é `agenda_do_dia`). Quem merece um telefonema hoje na unidade:', 1],

  ['Use para "tenho alguém para olhar?", "quem está em risco?", "o que eu faço primeiro hoje?".',
   'Use para "tenho alguém para olhar?", "quem está em risco?", "o que eu faço primeiro?", "tem alguém para eu ligar?", "como está a retenção?".', 1],

  // a irma aponta de volta
  ['description: \'A grade do dia: aulas, professores, salas, alunos, canceladas e experimentais.',
   'description: \'A GRADE DE AULAS do dia: horários, professores, salas, alunos, canceladas e experimentais. ⚠️ Isto é o calendário, NÃO a lista de quem precisa de atenção — se a pergunta for "tenho alguém para olhar/ligar hoje?", a irmã é `pauta_do_dia`.', 1],
];

for (const [de, para, esperado] of trocas) {
  const n = s.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA esperava ${esperado}, achei ${n}: ${de.slice(0,60)}`); process.exit(1); }
  s = s.split(de).join(para);
}

fs.writeFileSync(alvo, s);
const peso = [...s.matchAll(/description: '([^']*)'/g)].reduce((a, m) => a + m[1].length, 0);
console.log(`fronteira aplicada — ${(peso/1024).toFixed(1)} KB de descricao no total`);
