#!/usr/bin/env node
'use strict';

// Atualiza a constituição operacional da Sol sem afrouxar o cofre: a LLM
// escolhe a ferramenta; código/RPC continuam donos de escopo, preview e escrita.
const fs = require('fs');
const alvo = process.argv[2] || '/home/sol/.hermes/profiles/sol/AGENTS.md';
let src = fs.readFileSync(alvo, 'utf8');
if (src.includes('skills/sol-caixa-agent-first/SKILL.md')) {
  console.log('ja aplicado');
  process.exit(0);
}

const antiga = 'Rota aprovada, estreita e **determinística** (o LLM NÃO decide nada de dinheiro; o fluxo roda em código no bridge):';
const nova = [
  'Rota aprovada, estreita e **agent-first com execução determinística**:',
  '',
  '- Nos grupos do canário `SOL_CAIXA_TOOLS_CANARIO`, a LLM interpreta o pedido e escolhe uma ferramenta nomeada do Caixa. A ferramenta valida crachá + grupo, chama o Core/RPC e publica o card; a LLM não escolhe unidade, permissão, fatura nem escreve diretamente.',
  '- Dinheiro só muda depois de um **“pode” humano atual**. Preview/hash/ator/grupo/idade, consumo único, atomicidade e recibo continuam no código e no cofre V3.',
  '- Mídia sem texto continua no extrator determinístico do bridge nesta etapa. Fora do canário, o fluxo anterior permanece como fallback seguro.',
  '- Para qualquer caso coberto pelas ferramentas do Caixa, é proibido contornar por SQL genérico.',
  '- Carregar e seguir `skills/sol-caixa-agent-first/SKILL.md`.',
].join('\n');
const n1 = src.split(antiga).length - 1;
if (n1 !== 1) {
  console.error(`ancora principal: esperava 1 ocorrencia, achei ${n1}`);
  process.exit(1);
}
src = src.replace(antiga, nova);

const antigaConsulta = /Quando perguntarem sobre o \*\*caixa do dia\*\*[\s\S]*?Vale para as três\. Lançar\/abrir\/fechar continua sendo o fluxo determinístico com "pode" humano \(não é esta skill\)\./;
const novaConsulta = 'Quando perguntarem sobre o **caixa do dia** ou qualquer lançamento, recibo, correção, estorno, abertura, fechamento, aprovação ou descarte, carregar e seguir `skills/sol-caixa-agent-first/SKILL.md`. O número vem da ferramenta viva; nunca da memória, estimativa ou SQL genérico.';
if (!antigaConsulta.test(src)) {
  console.error('ancora da consulta nao encontrada');
  process.exit(1);
}
src = src.replace(antigaConsulta, novaConsulta);
fs.writeFileSync(alvo, src, 'utf8');
console.log('AGENTS da Sol atualizado para Caixa agent-first');
