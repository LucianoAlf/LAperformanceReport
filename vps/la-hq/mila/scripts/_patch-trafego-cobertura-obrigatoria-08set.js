#!/usr/bin/env node
// A RESSALVA DO GASTO INCOMPLETO VIRA OBRIGAÇÃO, NÃO PARÁGRAFO (08/09/2026).
//
// 🔴 ACHADO DA BATERIA DE CONVERSA. Perguntando agosto ao Alf e à Krissya, a
//    Mila respondeu tudo certo — e **não disse que o gasto do Meta cobre 28 dos
//    31 dias**. A captura só nasceu em 04/08, então R$ 4.474,94 é um PISO: os
//    dias 01, 02 e 03 vão entrar e o custo por matrícula vai SUBIR.
//
//    Quem lê aquele número como o gasto do mês está subestimando a mídia — e é
//    com esse número que se decide verba.
//
// ⚠️ A instrução JÁ EXISTIA na descrição, mas dentro de um parágrafo de ~2 mil
//    caracteres sobre "as duas ressalvas apontam para lados opostos", e
//    condicionada a não confundir com a de imaturidade. Em agosto
//    `leads_imaturos` é 0, então o trecho inteiro parecia não se aplicar e ela
//    pulou os dois.
//
//    **Regra que fica: o que a resposta TEM de conter vira uma frase curta com
//    gatilho explícito ("SEMPRE que citar X, diga Y"), no começo — não uma
//    explicação longa no meio.** Foi assim que a ressalva de imaturidade passou
//    a funcionar hoje de manhã; a de cobertura ficou como prosa e não pegou.
//
// ⚠️ Este patch NÃO repete a explicação (ela continua adiante, e é ela que
//    impede a Mila de inverter piso e teto). Acrescenta só o gatilho.
const fs = require('fs');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('CONFIRA `gasto_dias_cobertos`')) { console.log('ja aplicado'); process.exit(0); }

// âncora: o gatilho que JÁ funciona (o de imaturidade), logo no começo
const VELHO = 'description: \'DIRETORIA. Desempenho por canal: leads, agendamentos, matrículas, gasto, custo por lead e por matrícula, retorno em LTV. 🔴 SEMPRE que citar `custo_matricula` ou `conv_pct`';

const NOVO = 'description: \'DIRETORIA. Desempenho por canal: leads, agendamentos, matrículas, gasto, custo por lead e por matrícula, retorno em LTV. '
  + '🔴 SEMPRE que citar `gasto` ou `custo_matricula`, CONFIRA `gasto_dias_cobertos` contra `janela_dias` e, se faltar dia, diga na MESMA frase quantos dias faltam e que o custo é PISO — em 08/09 ela deu o agosto certo e omitiu que o Meta cobre só 28 dos 31 dias (a captura nasceu em 04/08), e quem leu aquilo como o gasto do mês subestimou a mídia. '
  + '🔴 SEMPRE que citar `custo_matricula` ou `conv_pct`';

const n = s.split(VELHO).length - 1;
if (n !== 1) { console.error('ANCORA da descricao: esperava 1, achei ' + n); process.exit(1); }

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-antes-cobertura-obrigatoria');
fs.writeFileSync(alvo, s.split(VELHO).join(NOVO));
console.log('ok: a cobertura de gasto virou gatilho explicito');
