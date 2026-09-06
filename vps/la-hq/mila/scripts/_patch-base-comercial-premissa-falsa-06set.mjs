#!/usr/bin/env node
// CORRIGE UMA PREMISSA FALSA na descricao de `consultar_base_comercial` (06/09/2026).
//
// A descricao dizia: "Se vier vazio com motivo_vazio=nenhum_bloco_casou_com_a_
// situacao, NAO invente: diga que a base ainda nao cobre isso".
//
// 🔴 Essa condicao praticamente NUNCA acontece. A busca e um OR dos lexemas
//    sobre blocos de 6-7 KB de prosa — qualquer palavra de conteudo casa com
//    algum bloco. Ou seja: a tool SEMPRE devolve 3 blocos, inclusive para
//    pergunta que a base nao cobre. E a instrucao, ao amarrar "nao cobre" a um
//    flag que nao acende, ensina o oposto do pretendido: "voltou com 3 blocos,
//    entao esta coberto".
//
// ⚠️ MEDIDO ANTES DE ESCREVER (e a medicao matou a correcao obvia). Eu ia por
//    um piso de `ts_rank`. Os numeros reais, com o publico do consultor:
//
//      lead pediu preco e sumiu ............ 0,0812  (coberta)
//      devolutiva pos-experimental ......... 0,0628  (coberta)
//      MEU CARRO QUEBROU NA ESTRADA ........ 0,0497  (absurda!)
//      parcelar em 18x no boleto ........... 0,0427  (nao coberta)
//      reposicao de falta .................. 0,0393  (nao coberta)
//
//    A pergunta sem sentido pontua ACIMA de duas perguntas legitimas — nenhum
//    piso separa. Cobertura lexical tambem nao: "trocar professor de bateria"
//    (nao coberta) da 0,80 contra 0,67 de "devolutiva" (coberta).
//
// ✅ O que FUNCIONA ja esta acontecendo: o modelo le o conteudo que voltou e
//    julga. No ensaio de 06/09 ela respondeu certo — "a base nao tem um bloco
//    especifico sobre 18x no boleto". O que ela NAO fez foi registrar a lacuna,
//    porque a instrucao condicionava isso a um flag que nunca acende.
//
//    Entao a correcao e de INSTRUCAO, nao de query: dizer a verdade sobre a
//    busca e mover a obrigacao de registrar para o momento em que ela mesma
//    reconhece que a base nao cobre.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-base-comercial-premissa-falsa-06set.mjs <mila-gestao-tools-mcp.mjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

const DE = 'Se `envelhecido` for true, diga que o bloco venceu a revisao. Se vier vazio com motivo_vazio=nenhum_bloco_casou_com_a_situacao, NAO invente: diga que a base ainda nao cobre isso e use registrar_lacuna_base.';

const PARA = 'Se `envelhecido` for true, diga que o bloco venceu a revisao. 🔴 A BUSCA E POR PALAVRA E SEMPRE DEVOLVE BLOCOS, inclusive quando NENHUM serve — voltar com 3 blocos NAO significa que a base cobre o assunto. LEIA o conteudo antes de usar: se o bloco nao responde a pergunta que te fizeram, diga com todas as letras que a base ainda nao cobre isso, rotule o que voce disser como opiniao sua, e chame registrar_lacuna_base NO MESMO TURNO. O campo motivo_vazio so acende no caso raro de nada casar; nao espere por ele.';

const n = src.split(DE).length - 1;
if (n !== 1) { console.error(`ANCORA da premissa falsa: esperava 1, achei ${n}`); process.exit(1); }
src = src.split(DE).join(PARA);
console.log('  ok  descricao de consultar_base_comercial');

fs.writeFileSync(alvo, src);
console.log(`\nescrito ${alvo}  (${antes} -> ${src.length} bytes)`);
