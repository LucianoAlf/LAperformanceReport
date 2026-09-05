#!/usr/bin/env node
// DOIS AJUSTES depois da bancada nos 5 modelos que a conta alcanca (05/09/2026).
//
// A1  MODELO PADRAO: `deepseek-v4-flash` -> `minimax-m3`.
//     Medido, 25 casos rotulados dos grupos:
//       deepseek-v4-pro   24/25   mediana 4,7s   p90  7,7s   0 falhas
//       deepseek-v4-flash 24/25   mediana 7,6s   p90 19,6s   1 falha
//       minimax-m3        23/25   mediana 2,0s   p90  4,2s   0 falhas   <-
//       glm-5.3-flash     23/25   mediana 4,2s   p90 16,3s   2 falhas
//       ling-3.0-flash    13/25   mediana 1,6s   p90  4,1s  11 falhas (cota)
//     A escolha e' pela CAUDA, nao pela mediana: p90 de 4,2s e' o unico do
//     conjunto que um dia pode ficar na FRENTE do usuario. A diferenca de
//     acerto para o topo e' UM caso — e e' o mesmo caso que 4 dos 5 erram (A2).
//
// A2  `corrigir_competencia` x `contestar_fatura`: a fronteira nao existia no
//     prompt. "e a parcela de 08/26 e 09/26 juntas" virava `contestar_fatura`
//     em deepseek-v4-pro, minimax-m3 e glm — a descricao de contestar_fatura
//     ("dizem que a fatura do card esta errada") cobre literalmente o caso.
//     A regra que faltava e' simples: quem DIZ QUAL e a certa esta corrigindo;
//     quem so diz que esta errada esta contestando.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-roteador-v4-minimax-e-competencia-05set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error('ANCORA "' + rotulo + '": esperava ' + esperado + ', achei ' + n); process.exit(1); }
  src = src.split(de).join(para);
  console.log('  ok  ' + rotulo);
}

trocar(
  String.raw`function _v4Modelo() { return process.env.SOL_CAIXA_V4_MODELO || 'deepseek-v4-flash'; }`,
  String.raw`// Escolhido pela CAUDA (p90 4,2s, zero falhas em 25 casos), nao pela mediana:
// e' a unica cauda do conjunto compativel com um dia ficar na frente do usuario.
// Alternativa de maior acerto: deepseek-v4-pro (24/25, p90 7,7s).
function _v4Modelo() { return process.env.SOL_CAIXA_V4_MODELO || 'minimax-m3'; }`,
  'A1 modelo padrao vira minimax-m3');

trocar(
  String.raw`      + '"contestar_fatura" quando dizem que a fatura/parcela do card esta errada ou desatualizada. '`,
  String.raw`      + '"contestar_fatura" quando dizem que a fatura/parcela do card esta errada ou desatualizada SEM dizer qual e a certa ("essa parcela nao esta vencida", "ja foi corrigido no sistema"). '
      + 'Se a pessoa DIZ QUAL e a competencia certa ("e a parcela de 08/26 e 09/26 juntas", "e de setembro"), e "corrigir_competencia", nao contestacao — quem aponta o valor certo esta corrigindo, quem so aponta o erro esta contestando. '`,
  'A2 fronteira entre corrigir_competencia e contestar_fatura');

fs.writeFileSync(alvo, src);
console.log('\nescrito ' + alvo + '  (' + antes + ' -> ' + src.length + ' bytes)');
