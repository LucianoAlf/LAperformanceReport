#!/usr/bin/env node
'use strict';

// Roda o fluxo do lote de cheques FORA do grupo, com o mesmo código do runtime.
// Uso (na la-hq, como sol):
//   node cheques-lote-cli.cjs --arquivo /tmp/lote.pdf --unidade <uuid> --nome "Campo Grande" --texto "2 CH - 20SETEMBRO2026"
//   ... --registrar --autorizado "Alf"      (grava no Super Folha; só com OK humano)
// Imprime a mensagem que iria ao grupo e um resumo SEM documento (o CPF lido vira
// hash dentro do módulo e nunca é impresso). Não apaga o arquivo.

const path = require('path');
const cf = require(process.env.SOL_CAIXA_CJS || path.join(__dirname, 'caixa-financeiro.cjs'));
const chq = require(path.join(__dirname, 'caixa-cheques.cjs'));

function arg(nome) { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : null; }

(async () => {
  const arquivo = arg('arquivo'); const unidadeId = arg('unidade');
  const nome = arg('nome') || 'unidade'; const texto = arg('texto') || '';
  if (!arquivo || !unidadeId) { console.error('uso: --arquivo <pdf> --unidade <uuid> [--nome] [--texto] [--registrar --autorizado <nome>]'); process.exit(2); }
  const mod = chq.criarCheques({ carregarEnv: cf.carregarEnv, sendFn: async () => null, log: (o) => console.error(JSON.stringify(o)) });
  const t0 = Date.now();
  const r = await mod.processarArquivo({ arquivo, unidadeId, unidadeNome: nome, textoLote: texto + ' ' + path.basename(arquivo),
    modelo: process.env.SOL_CHEQUES_VISAO_MODELO || 'gemini-3.8-flash' });
  if (!r.ok) { console.log('FALHOU:', r.motivo); process.exit(1); }
  console.log(chq.montarMensagem({ unidadeNome: nome, loteData: r.loteData, itens: r.itens, sombra: !process.argv.includes('--registrar') }));
  console.log('\n--- resumo (' + ((Date.now() - t0) / 1000).toFixed(1) + 's) ---');
  for (const it of r.itens) {
    console.log(JSON.stringify({ numero: it.cheque.numero, banco: it.cheque.banco, conta_final: it.cheque.conta_final,
      valor: it.cheque.valor, confiavel: it.cheque.confiavel, problemas: it.cheque.problemas, doc_hash: !!it.docHash,
      fatura: it.escolha.fatura ? it.escolha.fatura.emusys_fatura_id : null, escolha: it.escolha.motivo,
      suspeitos: it.escolha.suspeitos, sf_acao: it.acao, avisos: (it.avisos || []).map((a) => a.codigo) }));
  }
  console.log('super_folha_conferir:', r.conferencia ? (r.conferencia.success ? 'ok' : JSON.stringify(r.conferencia).slice(0, 300)) : 'nao_chamado');
  if (process.argv.includes('--registrar')) {
    const autorizado = arg('autorizado');
    if (!autorizado) { console.log('registrar exige --autorizado'); process.exit(2); }
    const regs = r.itens.filter((it) => it.cheque.confiavel).map((it) => mod.payloadCheque(it, r.sigla, r.loteData,
      { situacao: it.acao === 'retirar_do_malote' ? 'retirado' : 'a_depositar' }));
    const reg = await mod.superFolha({ acao: 'registrar', cheques: regs, ator: { tipo: 'sol', ref: 'cli-' + Date.now(), autorizado_por: autorizado } });
    console.log('registrar:', JSON.stringify({ success: reg && reg.success, error: reg && reg.error, ligados_ao_banco: reg && reg.ligados_ao_banco,
      gravados: reg && Array.isArray(reg.cheques) ? reg.cheques.map((c) => ({ id: c.id, gravado: c.gravado, acao: c.acao })) : null }));
  }
})().catch((e) => { console.error('ERRO', e && e.message); process.exit(1); });
