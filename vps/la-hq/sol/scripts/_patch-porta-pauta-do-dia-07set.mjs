#!/usr/bin/env node
// A 13a PORTA: a pauta do dia (07/09/2026 — Fatia 2, 2o andar).
//
// ⚠️ Descricao com CASO, como as outras 12: ela carrega o numero medido e o
//    nome da irma, porque e a descricao — nao o prompt — que o agente da Maria
//    diz ser o que conserta a escolha errada de ferramenta.
//
// ⚠️ O peso das descricoes segue sob controle: "tudo visivel E cabe". As 12
//    somavam ~4,9 KB; com esta, ~5,4 KB — bem abaixo dos 17 KB das 66 da Maria.
//    Se um dia passar disso, cortar descricao, nunca esconder ferramenta atras
//    de roteador (foi o que quebrou o TOM).
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-porta-pauta-do-dia-07set.mjs <sol-portas-mcp.mjs>'); process.exit(2); }
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes("name: 'pauta_do_dia'")) { console.log('ja aplicado'); process.exit(0); }

const ANC = "  { name: 'agenda_do_dia', fn: 'sol_porta_agenda_do_dia_v1',";
const n = s.split(ANC).length - 1;
if (n !== 1) { console.error(`ANCORA agenda_do_dia: esperava 1, achei ${n}`); process.exit(1); }

const NOVA = `  { name: 'pauta_do_dia', fn: 'sol_porta_pauta_do_dia_v1',
    description: 'Quem merece um telefonema HOJE na unidade: quem sumiu das aulas, quem avisou que sai e ainda dá para reverter, quem renova com sinal aceso, família com mais de um em risco. Use para "tenho alguém para olhar?", "quem está em risco?", "o que eu faço primeiro hoje?". 🔴 Entregue a mensagem pronta que ela devolve, agrupada por assunto — não reescreva nem reordene: a ordem é por urgência real (dias até vencer, não data de detecção). ⚠️ Mostra só o que AINDA VALE: o sinal só entra se o detector o reemitiu na última rodada. Sem isso, 31% dos alunos da lista de "frequência despencando" eram gente que já tinha voltado e vinha a TODAS as aulas — foi por ruído assim que a equipe parou de ler a lista antes. ⚠️ A mesma pessoa com dois cursos é UMA linha (Pérola Madeira tem Canto e Violão e avisou uma vez só). ⚠️ Semáforo de professor NÃO vem aqui: aquilo se resolve falando com o professor, é da coordenação.',
    schema: { ...U, p_limite: { type: 'integer', description: '1 a 20 itens. Padrão 8 — o resto fica na fila e vem depois.' } } },

`;

s = s.replace(ANC, NOVA + ANC);
fs.writeFileSync(alvo, s);

const peso = [...s.matchAll(/description: '([^']*)'/g)].reduce((a, m) => a + m[1].length, 0);
const qtd = (s.match(/\{ name: '/g) || []).length;
console.log(`porta pauta_do_dia acrescentada — ${qtd} portas, ${peso} chars de descricao (~${(peso/1024).toFixed(1)} KB)`);
