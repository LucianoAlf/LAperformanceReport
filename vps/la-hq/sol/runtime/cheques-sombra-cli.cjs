#!/usr/bin/env node
'use strict';

// SOMBRA DA CONVERSA SOBRE UM LOTE DE CHEQUES (06/10/2026). Roda o handler REAL do
// caixa, o módulo REAL de cheques e o executor REAL das ferramentas `cheques_*`
// contra o banco REAL, só com LEITURA: nada vai ao WhatsApp, nenhum preview V3 é
// registrado e o "pode" não grava (as funções de lançamento só GUARDAM o payload
// que seria enviado e devolvem recusa).
//
// Uso (na la-hq, como sol, com a versão nova num diretório À PARTE do runtime vivo):
//   node cheques-sombra-cli.cjs --unidade rec --pdf /tmp/malote.pdf --roteiro roteiro.json [--detalhe]
//   node cheques-sombra-cli.cjs --unidade cg  --leituras leituras.json --roteiro roteiro.json
// roteiro.json (as falas da equipe, na ordem):
//   [{ "fala": "texto exato", "cita": "card"|"nada", "chama_sol": true|false,
//      "ferramentas": [{ "nome": "cheques_atribuir", "args": { "itens": [...] } }] },
//    { "pode": true }]
// `ferramentas` é o que o agente chamaria; sem a lista, só a rota é mostrada.
// Sem --detalhe imprime só decisões, contagens e motivos — sem nomes nem valores.

const fs = require('fs');
const path = require('path');
const DIR = process.env.SOL_SOMBRA_RUNTIME || __dirname;
process.env.SOL_CHEQUES_MODO = 'grupo';
process.env.SOL_CHEQUES_AGENTE = '1';
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '0';
const cf = require(path.join(DIR, 'caixa-financeiro.cjs'));
const chq = require(path.join(DIR, 'caixa-cheques.cjs'));
const exec = require(path.join(DIR, 'caixa-tool-executor.cjs'));

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const tem = (n) => process.argv.includes('--' + n);
const UNI = { cg: ['2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'Campo Grande'], rec: ['95553e96-971b-4590-a6eb-0201d013c14d', 'Recreio'],
  bar: ['368d47f5-2d88-4475-bc14-ba084a9a348e', 'Barra'] };
const ACAO = { cheques_lote_estado: 'cheques_estado', cheques_atribuir: 'cheques_atribuir',
  cheques_confirmar_leitura: 'cheques_confirmar_leitura', cheques_marcar_conferencia: 'cheques_marcar_conferencia' };

(async () => {
  const [unidadeId, nome] = UNI[arg('unidade')] || [];
  const pdf = arg('pdf'); const leit = arg('leituras'); const detalhe = tem('detalhe');
  if (!unidadeId || (!pdf && !leit)) { console.error('uso: --unidade cg|rec|bar (--pdf <arquivo> | --leituras <json>) [--roteiro <json>] [--detalhe]'); process.exit(2); }
  const roteiro = arg('roteiro') ? JSON.parse(fs.readFileSync(arg('roteiro'), 'utf8')) : [];
  const CHAT = 'sombra-' + arg('unidade') + '@g.us';
  const enviadas = []; const payloads = []; let seq = 0;
  const send = async (c, t) => { const id = 'SOMBRA' + (++seq); enviadas.push({ id, t }); exec.registrarEnvio(t); return id; };
  const log = (e) => { exec.registrarEvento(e); if (detalhe) console.error(JSON.stringify(e)); };
  const cheques = chq.criarCheques({ carregarEnv: cf.carregarEnv, sendFn: send, log,
    ...(leit ? { lerLoteFn: async () => ({ ok: true, cheques: JSON.parse(fs.readFileSync(leit, 'utf8')) }) } : {}) });
  const grupos = { [CHAT]: { grupo_jid: CHAT, unidade_id: unidadeId, nome } };
  let led = 0;
  const recusaGravar = async (p) => { payloads.push(p); return { ok: false, motivo: 'sombra_nao_grava' }; };
  const h = cf.criarHandlerFinanceiro({ grupos, sendFn: send, chequesFn: cheques, log,
    identidadeFn: async () => ({ identificado: true, nome: 'Sombra' }),
    registrarPreviewV3Fn: async () => ({ ok: true, preview_id: 'SOMBRA-LED-' + (++led), preview_hash: 'H' + led }),
    finalizarPreviewV3Fn: async () => ({ ok: true }),
    registrarApprovalV3Fn: async () => ({ ok: true, approval_id: 'SOMBRA-AP-' + led, approval_event_hash: 'EH', actor_id_hash: 'AH' }),
    lancarFn: recusaGravar, lancarLoteFn: recusaGravar,
    lancarSaidaFn: recusaGravar, corrigirMovimentoFn: recusaGravar, estornarMovimentoFn: recusaGravar,
    governanceFn: async () => ({ ok: false, disabled: true }) });
  const ex = exec.criarExecutorCaixaTool({ obterHandler: async () => h, obterAbf: async () => ({ tratarConfirmacao: async () => false }),
    grupos, enviar: async () => null });
  const ctx = { ok: true, _chat: CHAT, _ator_numero: '550000000000', quem: 'Equipe (sombra)', unidade_id: unidadeId };
  const ev = (o) => ({ chatId: CHAT, senderPhone: '550000000000', senderId: '550000000000@lid', hasMedia: false, ...o });
  const decisoes = () => { const l = (cheques._lotes.get(CHAT) || []).slice(-1)[0]; return l ? l.itens.map((it) => it.decisao) : []; };
  const cardVivo = () => (h._pendentes.get(CHAT) || []).filter((p) => p.forma === 'cheque').map((p) => p.previewId).slice(-1)[0] || null;
  const mostrar = (rot) => {
    const ult = enviadas[enviadas.length - 1];
    console.log(`\n== ${rot}\n   decisões: [${decisoes().join(', ')}] · card aprovável: ${cardVivo() ? 'sim' : 'não'}`);
    if (detalhe && ult) console.log(ult.t.split('\n').map((x) => '   │ ' + x).join('\n'));
  };

  let arquivo = pdf;
  if (pdf) { arquivo = path.join(fs.mkdtempSync('/tmp/sol-sombra-'), 'doc_000000000000_' + path.basename(pdf)); fs.copyFileSync(pdf, arquivo); }
  else { arquivo = path.join(fs.mkdtempSync('/tmp/sol-sombra-'), 'doc_000000000000_lote_CH.pdf'); fs.writeFileSync(arquivo, 'leituras'); }
  const t0 = Date.now();
  const r = await h.handle(ev({ messageId: 'SOMBRA-PDF', body: '', hasMedia: true, mediaType: 'document', mediaUrls: [arquivo] }));
  mostrar(`malote lido em ${((Date.now() - t0) / 1000).toFixed(1)}s → ${r && r.acao}`);

  for (const [k, passo] of roteiro.entries()) {
    if (passo.pode) {
      const card = cardVivo();
      const rp = card ? await h.handle(ev({ messageId: 'SOMBRA-PODE-' + k, body: 'pode', quotedMessageId: card })) : null;
      const p = payloads[payloads.length - 1];
      console.log(`\n== "pode" no card → ${rp ? rp.acao : 'sem card'} (sombra: nada gravado)`);
      if (p) {
        const itens = Array.isArray(p.itens) ? p.itens : [p];
        console.log(`   payload: ${itens.length} item(ns) · forma ${p.forma} · ${itens.filter((i) => i.cheque_numero).length} com nº de cheque · `
          + `${itens.filter((i) => Array.isArray(i.fatura_ids) && i.fatura_ids.length > 1).length} com várias faturas`
          + (detalhe ? `\n   ${JSON.stringify(itens.map((i) => ({ valor: i.valor, cheque: i.cheque_numero, fatura_ids: i.fatura_ids || null, fatura: i.canonical_fatura_id || i.fatura_id || null })))}` : ''));
      }
      continue;
    }
    const quoted = passo.cita === 'card' ? (cardVivo() || (enviadas.slice(-1)[0] || {}).id) : null;
    const e = ev({ messageId: 'SOMBRA-FALA-' + k, body: passo.fala, quotedMessageId: quoted });
    const rota = h.chequesConversa(e, { chamouASol: !!passo.chama_sol });
    console.log(`\n== fala ${k + 1}${detalhe ? ': ' + JSON.stringify(passo.fala) : ''}\n   rota: ${rota ? 'AGENTE (ferramentas cheques_*)' : 'caminho determinístico'}`);
    if (!rota) {
      const n0 = enviadas.length; const rh = await h.handle(e);
      console.log(`   handler: ${rh && rh.acao} · respondeu no grupo: ${enviadas.length > n0 ? 'sim' : 'não'}`);
      continue;
    }
    for (const f of passo.ferramentas || []) {
      const out = await ex.executar({ tool: { name: f.nome, action: ACAO[f.nome] }, ctx,
        args: { p_texto_original: passo.fala, ...(f.args || {}) } });
      console.log(`   ${f.nome} → estado ${out.estado}${out.motivo ? ' · ' + out.motivo : ''}`);
      for (const x of out.resultados || []) console.log(`     cheque ${x.cheque}: ${x.ok ? 'ok' : 'recusado · ' + x.motivo + (detalhe ? ' · ' + x.motivo_humano : '')}`);
    }
    mostrar('depois da fala ' + (k + 1));
  }
  try { fs.rmSync(path.dirname(arquivo), { recursive: true, force: true }); } catch (_) { /* melhor esforço */ }
})().catch((e) => { console.error('ERRO', e && e.stack || e); process.exit(1); });
