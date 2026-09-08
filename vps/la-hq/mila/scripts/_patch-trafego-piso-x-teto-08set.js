#!/usr/bin/env node
// AS DUAS RESSALVAS APONTAM PARA LADOS OPOSTOS, E ELA JUNTOU AS DUAS (08/09/2026).
//
// 🔴 Ao responder agosto, ela escreveu: *"Como a cobertura de gasto ainda não
//    fechou 100% nos dois, esse custo por matrícula ainda é TETO e pode cair um
//    pouco."*
//
//    Está invertido. Faltando dias de gasto, o gasto está **subestimado** —
//    quando 01, 02 e 03 de agosto entrarem, o gasto SOBE e o custo por matrícula
//    SOBE junto. Aquilo é um **piso**, não um teto.
//
//      · `leads_imaturos` > 0            → faltam MATRÍCULAS por chegar
//                                          → custo é TETO e vai CAIR
//      · `gasto_dias_cobertos` < janela  → falta GASTO por entrar
//                                          → custo é PISO e vai SUBIR
//
//    Uma mexe no denominador, a outra no numerador. Chamar as duas de "teto"
//    faz o leitor achar que o número só melhora — e ele pode piorar. Num
//    relatório que decide verba, essa inversão é cara.
//
// ⚠️ Não é erro de cálculo: os dois campos estavam certos na resposta (28/31 e
//    30/31). É erro de LEITURA, e leitura se conserta na descrição da tool —
//    mesma lição do "(imaturo)" entre parênteses que ela ignorou.
const fs = require('fs');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('PISO que ainda vai subir')) { console.log('ja aplicado'); process.exit(0); }

// ⚠️ O arquivo usa aspas SIMPLES na description, então as aspas duplas do texto
//    estão cruas — nada de `\"` aqui (a 1ª versão errou isso e a âncora deu 0).
const VELHO = '⚠️ `gasto` NULL com `gasto_dias_cobertos`=0 = NÃO SEI (nunca "de graça"); '
  + 'canal orgânico é "sem mídia", não "custo zero"; e se `gasto_dias_cobertos` < `janela_dias`, '
  + 'diga que a foto de gasto está incompleta.';

const NOVO = '🔴 AS DUAS RESSALVAS APONTAM PARA LADOS OPOSTOS — nunca junte as duas: '
  + '`leads_imaturos` > 0 significa que faltam MATRÍCULAS por chegar, então `custo_matricula` '
  + 'é TETO e vai CAIR; `gasto_dias_cobertos` < `janela_dias` significa que falta GASTO por '
  + 'entrar, então é um PISO que ainda vai subir. Uma mexe no denominador, a outra no numerador. '
  + 'Em 08/09 ela disse que a cobertura incompleta fazia o custo ser "teto e pode cair" — está '
  + 'invertido, e faz quem lê achar que o número só melhora. ⚠️ `gasto` NULL com '
  + '`gasto_dias_cobertos`=0 = NÃO SEI (nunca "de graça"); canal orgânico é "sem mídia", '
  + 'não "custo zero".';

const n = s.split(VELHO).length - 1;
if (n !== 1) { console.error('ANCORA da ressalva: esperava 1, achei ' + n); process.exit(1); }

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-antes-piso-x-teto');
fs.writeFileSync(alvo, s.split(VELHO).join(NOVO));
console.log('ok: piso e teto passam a ser ressalvas distintas');
