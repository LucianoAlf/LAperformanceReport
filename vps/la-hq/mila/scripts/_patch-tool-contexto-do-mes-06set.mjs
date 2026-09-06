#!/usr/bin/env node
// A DESCRICAO DA TOOL ENSINA O QUE FAZER COM `contexto` (06/09/2026).
//
// `mila_base_comercial_v1` passou a devolver, so para lideranca, um bloco
// `contexto` com dia do mes, mes por extenso, o aviso de que campanha do mes
// nao esta registrada em lugar nenhum, e os TITULOS dos blocos de ritmo
// (campanha, corridinha, calendario).
//
// Campo novo que ninguem explica e campo que o modelo ignora — foi a cicatriz
// de 05/09 com a `o_que_aprendemos`: a tool existia, estava disponivel, e a
// Mila respondeu de intuicao. Entao a descricao diz o GATILHO (comeco de mes,
// pergunta sobre o mes) e a ORDEM (ritmo antes do funil).
//
// ⚠️ Medido antes de escrever: com a Krissya, "como a gente ataca setembro?"
//    trazia campanha/calendario em 3 de 5 rodadas. Nas outras duas ela
//    respondia bem, mas so pelo funil — porque a busca e por palavra e
//    "setembro"/"atacar"/"mes" nao aparecem nos blocos 6 e 9.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-tool-contexto-do-mes-06set.mjs <mila-gestao-tools-mcp.mjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

const DE = '⚠️ O que cada pessoa alcanca e decidido no servidor pelo telefone — nunca comente que existe material que ela nao pode ver.';

const PARA = '📅 SE VIER O CAMPO `contexto` (so aparece para quem lidera): ele traz o dia do mes, o mes e os TITULOS dos blocos de ritmo (campanha, corridinha, calendario). Quando a pergunta for sobre o MES — "como a gente ataca setembro", "comecou o mes", "o que fazer agora" — RITMO VEM ANTES DE FUNIL: fale de campanha e calendario primeiro, citando esses blocos, e so depois de bumerangue/experimental/indicacao. A busca e por palavra e nao leva sozinha a esses blocos; e por isso que o campo existe. E sobre `campanha_do_mes`: o sistema NAO sabe se existe uma — PERGUNTE se ja definiram, nunca afirme que falta. ⚠️ O que cada pessoa alcanca e decidido no servidor pelo telefone — nunca comente que existe material que ela nao pode ver.';

const n = src.split(DE).length - 1;
if (n !== 1) { console.error(`ANCORA da descricao: esperava 1, achei ${n}`); process.exit(1); }
src = src.split(DE).join(PARA);
console.log('  ok  descricao ensina a usar o contexto do mes');

fs.writeFileSync(alvo, src);
console.log(`\nescrito ${alvo}  (${antes} -> ${src.length} bytes)`);
