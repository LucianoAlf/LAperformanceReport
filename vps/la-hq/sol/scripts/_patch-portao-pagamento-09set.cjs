#!/usr/bin/env node
/**
 * O portão do multi-aluno deixa de ser só regex: o veredito do LLM entra junto.
 *
 * 🔴 ANTES:  if (detectarContextoMultiAluno(legenda)) { ...abre fluxo multi... }
 *    O regex era PORTEIRO. Legenda que ele não reconhecesse nem chegava perto
 *    do fluxo — foi assim que a Mayra gastou 19 minutos em 09/09 e o mesmo par
 *    de alunos que lançou em 01/09 falhou hoje.
 *
 *    DEPOIS: abre quando o regex viu **ou** quando o modelo listou 2+ pessoas.
 *    O regex vira atalho barato; o modelo vira a rede.
 *
 * ⚠️ A ORDEM IMPORTA: o interpretador roda ANTES deste ponto no fluxo (o valor
 *    e a categoria dele já são usados logo acima), então `interpretado` já está
 *    na mão — não há chamada nova nem espera nova.
 * ⚠️ FALSO POSITIVO CONTINUA BARRADO onde sempre esteve: quem monta os itens é
 *    `validarIntencaoMultiAluno` + `sol_caixa_resolver_pagamento_v1`, que só
 *    aceitam aluno que existe e fatura que bate. Abrir o fluxo não lança nada —
 *    lançar continua exigindo o "pode" humano.
 * ⚠️ Multi NUNCA nasce do OCR (regra de 28-29/08, dois falsos positivos reais):
 *    o modelo lê legenda + OCR juntos, então exigimos que os nomes que ele
 *    listou APAREÇAM na legenda humana. Sem isso, "pagador e favorecido" do
 *    recibo viram dois alunos.
 */
const fs = require('fs');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

const carimbo = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
const backup = `${ALVO}.bak-${carimbo}-antes-portao-pagamento`;

let src = fs.readFileSync(ALVO, 'utf8');
fs.writeFileSync(backup, src);
console.log('backup:', backup);

function troca(nome, alvo, novo, esperado = 1) {
  const n = src.split(alvo).length - 1;
  if (n !== esperado) {
    console.error(`🔴 ${nome}: ancora ${n}x, esperava ${esperado} — ABORTADO`);
    process.exit(1);
  }
  src = src.split(alvo).join(novo);
  console.log('  ok:', nome);
}

// ── helper: os nomes do modelo estão na legenda humana? ───────────────────
troca('helper pagamentosNaLegenda',
  'function detectarContextoMultiAluno(texto) {',
  `// 🔴 Multi-aluno so nasce do que o HUMANO escreveu — nunca do OCR (dois
// falsos positivos reais em 28 e 29/08). O modelo le legenda+OCR juntos, entao
// aqui conferimos que cada nome que ele listou aparece de fato na LEGENDA.
// Basta o primeiro nome bater: a legenda costuma abreviar ("Davi Guilherme"
// para "Davi Guilherme de Souza Chaves Ribeiro").
function pagamentosNaLegenda(pagamentos, legenda) {
  const leg = _normConf(legenda || '');
  if (!leg || !Array.isArray(pagamentos) || pagamentos.length < 2) return [];
  return pagamentos.filter((p) => {
    const nome = _normConf(p && p.aluno);
    if (!nome) return false;
    const primeiro = nome.split(/\\s+/)[0];
    return primeiro.length >= 3 && leg.includes(primeiro);
  });
}

function detectarContextoMultiAluno(texto) {`);

// ── portão: regex OU modelo ───────────────────────────────────────────────
troca('portao aceita o veredito do modelo',
  '      if (detectarContextoMultiAluno(legendaEfetiva)) {',
  `      // 🔴 O REGEX DEIXA DE SER PORTEIRO (09/09, decisao do Luciano).
      // Ele acerta quando os nomes estao colados no "e" e erra em toda variacao
      // de escrita — parenteses, virgula, "aluno X - 4 cursos". Quem entende
      // prosa e o modelo; o regex fica como atalho barato.
      const _pagLLM = pagamentosNaLegenda(
        (interpretado && interpretado.pagamentos) || [], legendaEfetiva);
      const _multiPorLLM = _pagLLM.length >= 2;
      if (_multiPorLLM && !detectarContextoMultiAluno(legendaEfetiva)) {
        log({ acao: 'multi_visto_pelo_modelo', chatId, itens: _pagLLM.length,
              nomes: _pagLLM.map((p) => p.aluno).slice(0, 4) });
      }
      if (detectarContextoMultiAluno(legendaEfetiva) || _multiPorLLM) {`);

// ── os itens do modelo alimentam o fluxo quando o parser não achou ────────
troca('itens do modelo entram no fluxo',
  `        } else {
          try { multiRaw = await interpretarMultiFn(textoClassificacao); }
          catch (e) { log({ acao: 'interpretar_multi_aluno_erro', chatId, erro: String(e && e.message) }); }
        }`,
  `        } else if (_multiPorLLM) {
          // O interpretador que ja rodou nesta midia listou as pessoas: usar o
          // que esta na mao em vez de pagar uma SEGUNDA chamada de LLM (30s) para
          // perguntar o mesmo. A resolucao das faturas e determinstica logo
          // abaixo (sol_caixa_resolver_pagamento_v1), entao o modelo aqui so diz
          // QUEM — nunca quanto o banco deve.
          multiRaw = { tipo_recebimento: 'multi_aluno',
                       itens: _pagLLM.map((p) => ({ aluno_nome: p.aluno, valor: p.valor })),
                       valor_total: undefined };
          log({ acao: 'multi_itens_do_modelo', chatId, itens: _pagLLM.length });
        } else {
          try { multiRaw = await interpretarMultiFn(textoClassificacao); }
          catch (e) { log({ acao: 'interpretar_multi_aluno_erro', chatId, erro: String(e && e.message) }); }
        }`);

fs.writeFileSync(ALVO, src);
console.log('aplicado');
