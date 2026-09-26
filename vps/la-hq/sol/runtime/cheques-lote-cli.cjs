#!/usr/bin/env node
'use strict';

// Roda a LEITURA e a DECISÃO de um lote de cheques FORA do grupo, com o mesmo
// código do runtime. Não abre card e não lança nada: o lançamento no caixa só
// acontece pelo grupo, com "pode" humano no card.
// Uso (na la-hq, como sol):
//   node cheques-lote-cli.cjs --arquivo /tmp/lote.pdf --unidade <uuid> --nome "Campo Grande" --texto "2 CH - 20SETEMBRO2026"
// Imprime a mensagem que iria ao grupo e um resumo SEM documento (o CPF lido vira
// hash dentro do módulo e nunca é impresso). Não apaga o arquivo.

const path = require('path');
const cf = require(process.env.SOL_CAIXA_CJS || path.join(__dirname, 'caixa-financeiro.cjs'));
const chq = require(path.join(__dirname, 'caixa-cheques.cjs'));

function arg(nome) { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : null; }

(async () => {
  const arquivo = arg('arquivo'); const unidadeId = arg('unidade');
  const nome = arg('nome') || 'unidade'; const texto = arg('texto') || '';
  if (!arquivo || !unidadeId) { console.error('uso: --arquivo <pdf> --unidade <uuid> [--nome] [--texto]'); process.exit(2); }
  const mod = chq.criarCheques({ carregarEnv: cf.carregarEnv, sendFn: async () => null, log: (o) => console.error(JSON.stringify(o)) });
  const t0 = Date.now();
  const r = await mod.processarArquivo({ arquivo, unidadeId, unidadeNome: nome, textoLote: texto + ' ' + path.basename(arquivo),
    modelo: process.env.SOL_CHEQUES_VISAO_MODELO || 'gemini-3.8-flash' });
  if (!r.ok) { console.log('FALHOU:', r.motivo); process.exit(1); }
  console.log(chq.montarMensagem({ unidadeNome: nome, loteData: r.loteData, itens: r.itens, sombra: true }));
  console.log('\n--- resumo (' + ((Date.now() - t0) / 1000).toFixed(1) + 's) ---');
  for (const it of r.itens) {
    console.log(JSON.stringify({ numero: it.cheque.numero, banco: it.cheque.banco, conta_final: it.cheque.conta_final,
      valor: it.cheque.valor, confiavel: it.cheque.confiavel, problemas: it.cheque.problemas,
      fatura: it.fatura ? it.fatura.emusys_fatura_id : null, escolha: it.escolha.motivo, decisao: it.decisao,
      item_caixa: it.decisao === 'lancar' ? chq.itemDoCaixa(it) : null }));
  }
})().catch((e) => { console.error('ERRO', e && e.message); process.exit(1); });
