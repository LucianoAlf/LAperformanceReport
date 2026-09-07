#!/usr/bin/env node
// REPLAY DO ROTEADOR V4 SOBRE AS MENSAGENS REAIS DE 15/08/2026.
//
// Frente 1, etapa (b). A sombra de 31/08-05/09 mediu o roteador ANTIGO e, pior,
// cego para aprovacoes (ver o laudo de 07/09). Este replay mede o roteador
// CORRIGIDO — transporte HTTPS direto, minimax-m3 — sobre entrada real.
//
// 🔴 O QUE ELE MEDE, E O QUE NAO MEDE. `sol_caixa_ingestao_recebimentos` e a
//    UNICA fonte com texto puro (as demais sao hash por desenho do V3), e tem
//    213 mensagens de 15/08 com 172 midias. Mas `movimentacao_id` e NULL nas
//    213 e `aluno_extraido` esta vazio: a tabela foi ligada um dia e o elo com
//    o lancamento nunca foi conectado. Entao:
//
//      MEDE ...... extracao de valor/forma/categoria, latencia, taxa de falha
//      NAO MEDE .. o fluxo de aprovacao ("pode"), que depende do preview
//                  pendente e do contexto daquele instante — irrecuperavel.
//
//    O fluxo de aprovacao so se mede com sombra NOVA, que voltou a rodar hoje.
//    Dizer que este replay valida o flip inteiro seria mentir sobre o escopo.
//
// ⚠️ CONTEXTO VAZIO, de proposito. Comprovante que chega nao tem preview
//    pendente sobre si mesmo — a pendencia nasce DEPOIS, do preview que a Sol
//    manda. Passar contexto inventado mediria uma situacao que nao existiu.
//
// ⚠️ NAO ESCREVE NADA. So le a tabela e chama o roteador. Nenhum lancamento,
//    nenhuma mensagem, nenhum registro no ledger.
//
//   node replay-v4-15ago.cjs [--limite N] [--concorrencia 4]
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RUNTIME = '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
const ENVS = ['/home/sol/.hermes/profiles/sol/.env',
              '/home/sol/.openclaw/secrets/mila-sdr-tools.env',
              '/home/sol/.openclaw/gateway.systemd.env'];

function carregarEnv() {
  for (const f of ENVS) {
    let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const linha of txt.split('\n')) {
      const l = linha.trim();
      if (!l || l.startsWith('#') || !l.includes('=')) continue;
      const i = l.indexOf('=');
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

async function buscarMensagens() {
  const url = (process.env.SUPABASE_LAREPORT_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_LAREPORT_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('sem credencial do Supabase no env');
  const q = '/rest/v1/sol_caixa_ingestao_recebimentos'
    + '?select=id,chat_id,status,raw_text,media_ref,valor_extraido,forma_extraida,categoria_extraida,criado_em'
    + '&order=criado_em.asc';
  const r = await fetch(url + q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// centavos, para comparar com `valor_extraido` (numeric em reais)
const cent = (v) => (v == null ? null : Math.round(Number(v) * 100));

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
  const LIM = arg('--limite', 0);
  const CONC = arg('--concorrencia', 4);

  carregarEnv();
  const { rotearMensagemV4 } = require(RUNTIME);
  if (typeof rotearMensagemV4 !== 'function') throw new Error('rotearMensagemV4 nao exportado');

  let msgs = await buscarMensagens();
  msgs = msgs.filter((m) => (m.raw_text || '').trim().length > 0);
  if (LIM) msgs = msgs.slice(0, LIM);
  console.log(`# ${msgs.length} mensagens de 15/08 · concorrencia ${CONC}\n`);

  const saida = [];
  let i = 0;
  async function trabalhador() {
    while (i < msgs.length) {
      const m = msgs[i++];
      const t0 = Date.now();
      let dec = null, erro = null;
      try {
        // ⚠️ contexto VAZIO — ver o cabecalho.
        dec = await rotearMensagemV4(m.raw_text, [], { timeout: 30000 });
      } catch (e) { erro = String(e && e.message).slice(0, 120); }
      saida.push({
        id: m.id, status_legado: m.status, chat: m.chat_id,
        texto_len: (m.raw_text || '').length, tinha_midia: !!m.media_ref,
        legado_valor: cent(m.valor_extraido), legado_forma: m.forma_extraida,
        legado_categoria: m.categoria_extraida,
        v4_intencao: dec && dec.intencao, v4_confianca: dec && dec.confianca,
        v4_valor: dec && dec.valor, v4_forma: dec && dec.forma,
        v4_categoria: dec && dec.categoria, v4_aluno: dec && dec.aluno_nome,
        ms: Date.now() - t0, erro,
      });
      if (saida.length % 25 === 0) console.error(`  ... ${saida.length}/${msgs.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, trabalhador));

  const dest = '/tmp/replay-v4-15ago.jsonl';
  fs.writeFileSync(dest, saida.map((x) => JSON.stringify(x)).join('\n') + '\n');
  console.log(`gravado em ${dest} (${saida.length} linhas)`);
}

main().catch((e) => { console.error('FALHOU:', e && e.message); process.exit(1); });
