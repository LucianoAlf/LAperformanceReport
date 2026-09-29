#!/usr/bin/env node
'use strict';

// BATERIA DE REGRESSÃO DO CAIXA DA SOL (V3), derivada do catálogo de incidentes.
//
// Cada caso de `casos-regressao.json` vira uma conversa no handler REAL
// (`criarHandlerFinanceiro`), com banco, envio, OCR, visão, LLM e ledger falsos.
// Status de cada caso:
//   passa           — comportamento certo hoje; se quebrar, a suíte fica vermelha.
//   falha_conhecida — defeito ABERTO (id do incidente). Esperado falhar: é reportado,
//                     não derruba a suíte. Se passar, o runner avisa para promover.
//   requer_banco    — a prova depende de RPC/tabela real. Só é listado, com a consulta
//                     descrita; NÃO é executado aqui.
//
// Garantias de "sem efeito em produção":
//   • exige SOL_CAIXA_V3_LEDGER_FAKE=1 (sem isso, recusa rodar);
//   • todas as dependências de E/S do handler são falsas;
//   • https.request e child_process ficam bloqueados antes do require: qualquer
//     tentativa de rede/processo é ERRO do caso (fake faltando), nunca chamada real;
//   • V4 desligada (SOL_CAIXA_V4_CANARIO/TOOLS vazios), como em produção desde 29/09.
//
// Uso: SOL_CAIXA_V3_LEDGER_FAKE=1 node bateria-regressao.test.cjs [--so SOL-131] [-v]
// Saída termina com "BATERIA: VERDE|VERMELHA"; exit 1 só com regressão ou erro.

if (process.env.SOL_CAIXA_V3_LEDGER_FAKE !== '1') {
  console.error('✗ recusado: rode com SOL_CAIXA_V3_LEDGER_FAKE=1 (a suíte nunca grava ledger real).');
  process.exit(1);
}
process.env.SOL_CAIXA_V3_LEDGER_MODE = process.env.SOL_CAIXA_V3_LEDGER_MODE || 'production';
process.env.SOL_CAIXA_V4_CANARIO = '';
process.env.SOL_CAIXA_TOOLS_CANARIO = '';
process.env.SOL_CAIXA_V4_SHADOW = '0';

// ---- trava de rede/processo ANTES de carregar o runtime --------------------
const tentativasProibidas = [];
const https = require('https');
const http = require('http');
const cp = require('child_process');
const bloquear = (nome) => function () {
  tentativasProibidas.push(nome);
  throw new Error(`bateria: ${nome} bloqueado (dependência sem fake)`);
};
https.request = bloquear('https.request'); https.get = bloquear('https.get');
http.request = bloquear('http.request'); http.get = bloquear('http.get');
cp.execFile = bloquear('child_process.execFile'); cp.spawn = bloquear('child_process.spawn');
cp.exec = bloquear('child_process.exec');
cp.execFileSync = bloquear('child_process.execFileSync'); cp.execSync = bloquear('child_process.execSync');
// Única exceção: a "segunda chance" do OCR (ocrSegundaChance) chama spawnSync com um
// script local e não é injetável. Ela não toca banco nem rede; aqui responde "não li",
// que é o que acontece fora da VPS.
cp.spawnSync = () => ({ status: 1, stdout: '', stderr: 'bateria: ocr segunda chance desligada' });
if (typeof globalThis.fetch === 'function') globalThis.fetch = async () => { tentativasProibidas.push('fetch'); throw new Error('bateria: fetch bloqueado'); };

const path = require('path');
const fs = require('fs');
const mod = require('../_alvo.cjs');

const CASOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos-regressao.json'), 'utf8'));
const GRUPOS = {
  CG: { chat: '5521981278047-1544204225@g.us', unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande' },
  Recreio: { chat: '5521973870998-1583848991@g.us', unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Recreio' },
  Barra: { chat: '120363263030561835@g.us', unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra' },
};
const REMETENTES = { A: '5521900000001', B: '5521900000002', C: '5521900000003' };
const args = process.argv.slice(2);
const SO = args.includes('--so') ? args[args.indexOf('--so') + 1] : null;
const VERBOSO = args.includes('-v');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Fake de tabela: [{se_nome: "regex", resposta: {...}}] -> fn(unidade, nome, ...)
function porNome(regras, padrao) {
  return async (_u, nome) => {
    for (const r of regras || []) if (new RegExp(r.se_nome, 'i').test(String(nome || ''))) return clone(r.resposta);
    return clone(padrao);
  };
}
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
// Fake por mensagem: {"padrao": {...}, "por_mensagem": {"M2": {...}}}; o handler passa o
// caminho da mídia, que a bateria monta como /bateria/<messageId>.
function porMensagem(spec) {
  if (spec == null) return async () => null;
  if (!spec.por_mensagem && !('padrao' in spec)) return async () => clone(spec);
  return async (media) => {
    const s = String((media && (media.path || media.mediaPath || media)) || '');
    const id = (s.match(/\/bateria\/([^/.]+)/) || [])[1];
    if (id && spec.por_mensagem && id in spec.por_mensagem) return clone(spec.por_mensagem[id]);
    return clone(spec.padrao == null ? null : spec.padrao);
  };
}

function montar(caso) {
  const g = GRUPOS[caso.contexto.unidade || 'CG'];
  const f = caso.contexto.fakes || {};
  const reg = { enviadas: [], lancados: [], lotes: [], saidas: [], estornos: [], correcoes: [], logs: [], buscas: [] };
  let seq = 0;
  let passoAtual = 0;
  // Espelho da RPC sol_caixa_ja_lancado_hoje: mesmo valor + mesmo aluno no caixa de hoje.
  const duplicata = f.duplicata === 'nunca'
    ? async () => ({ ja_lancado: false })
    : f.duplicata === 'indisponivel'
      ? async () => { throw new Error('rpc_indisponivel'); }
      : async (_u, valor, aluno) => {
        const it = reg.lancados.find((p) => Math.abs(Number(p.valor) - Number(valor)) < 0.01 && aluno && norm(p.aluno) === norm(aluno));
        return it ? { ja_lancado: true, itens: [{ valor: Number(it.valor), hora: '10:00', descricao: it.descricao }] } : { ja_lancado: false };
      };
  const resultadoLancar = f.lancar && typeof f.lancar === 'object' ? f.lancar : null;
  const lancar = async (p) => {
    if (resultadoLancar) return clone(resultadoLancar);
    reg.lancados.push(p);
    return { ok: true, movimentacao_id: 'MOV-' + reg.lancados.length, valor: Number(p.valor), forma: p.forma };
  };
  const h = mod.criarHandlerFinanceiro({
    grupos: { [g.chat]: { grupo_jid: g.chat, unidade_id: g.unidade_id, nome: g.nome } },
    sendFn: async (_c, t) => { const id = 'MSG' + (++seq); reg.enviadas.push({ passo: passoAtual, id, texto: String(t) }); return id; },
    ocrFn: porMensagem(f.ocr === undefined ? { text: '', status: 'texto_vazio' } : f.ocr),
    visaoFn: porMensagem(f.visao === undefined ? null : f.visao),
    // `interpretar_atraso_ms`: a interpretação demora (CG 29/09 14:36: ~34 s), para
    // reproduzir mensagens que chegam com a mídia ainda em processamento.
    interpretarFn: async () => { if (f.interpretar_atraso_ms) await sleep(f.interpretar_atraso_ms); return clone(f.interpretar === undefined ? null : f.interpretar); },
    interpretarMultiFn: async () => clone(f.interpretar_multi === undefined ? null : f.interpretar_multi),
    resolverMultiFn: async () => clone(f.resolver_multi === undefined ? { ok: false, motivo: 'fake_sem_resolucao' } : f.resolver_multi),
    resolverEnvelopeFn: async () => ({ ok: false, motivo: 'v4_desligada_na_bateria' }),
    casarFn: porNome(f.casar, { ok: false, motivo: 'aluno_nao_encontrado' }),
    canonicaFn: porNome(f.canonica, { ok: false, motivo: 'aluno_nao_encontrado' }),
    responsavelFn: porNome(f.responsavel, { ok: false }),
    pagadorFn: porNome(f.pagador, { ok: false }),
    identificarAlunoNovoFn: porNome(f.aluno_novo, { ok: false }),
    faturasMesFn: async () => clone(f.faturas_mes === undefined ? null : f.faturas_mes),
    faturasQuitacaoFn: async () => clone(f.faturas_quitacao === undefined ? { ok: false, motivo: 'fake' } : f.faturas_quitacao),
    duplicataFn: duplicata,
    identidadeFn: async (tel) => ({ identificado: true, nome: 'Equipe ' + (Object.keys(REMETENTES).find((k) => REMETENTES[k] === tel) || 'X'), pode_consultar: true }),
    resumoFn: async () => null,
    classificarCorrecaoFn: async () => clone(f.classificar_correcao === undefined ? null : f.classificar_correcao),
    listarPreviewsAbertosFn: async () => [],
    rotearV4Fn: async () => null,
    chequesFn: null,
    lancarFn: lancar,
    lancarSaidaFn: async (p) => { reg.saidas.push(p); reg.lancados.push(p); return { ok: true, movimentacao_id: 'SAI-' + reg.saidas.length, valor: Number(p.valor), forma: p.forma }; },
    lancarLoteFn: async (p) => {
      reg.lotes.push(p);
      for (const it of p.itens || []) reg.lancados.push({ ...it, forma: p.forma, lote: true });
      return { ok: true, lote_id: 'LOTE-' + reg.lotes.length, movimentacoes: (p.itens || []).map((i, n) => ({ aluno_nome: i.aluno_nome, valor: i.valor, movimentacao_id: 'LM-' + n })) };
    },
    buscarMovimentosFn: async (q) => { reg.buscas.push(q); return clone(f.buscar_movimentos === undefined ? { items: [] } : f.buscar_movimentos); },
    buscarCorrecaoFn: async () => clone(f.buscar_correcao === undefined ? { ok: false } : f.buscar_correcao),
    estornarMovimentoFn: async (p) => { reg.estornos.push(p); return { ok: true, valor: Number(p.valor), movimentacao_estorno_id: 'EST-' + reg.estornos.length }; },
    corrigirMovimentoFn: async (p) => { reg.correcoes.push(p); return { ok: true, depois: {} }; },
    log: (o) => reg.logs.push({ passo: passoAtual, ...o }),
  });
  return { h, g, reg, setPasso: (i) => { passoAtual = i; } };
}

function evento(g, passo, i, reg) {
  const e = passo.evento;
  const id = e.id || ('M' + (i + 1));
  const ev = {
    chatId: g.chat, messageId: id, senderPhone: REMETENTES[e.remetente || 'A'],
    senderId: REMETENTES[e.remetente || 'A'] + '@c.us', body: e.body || '', hasMedia: !!e.midia,
    timestamp: Math.floor(Date.now() / 1000),
  };
  if (e.midia) { ev.mediaType = e.midia; ev.mediaPath = `/bateria/${id}.${e.midia === 'document' ? 'pdf' : 'jpg'}`; ev.mediaUrls = [ev.mediaPath]; }
  if (e.cita) {
    // "ultimo_envio" = última mensagem da Sol; "envio:N" = N-ésima (1-based); "msg:ID" = mensagem humana
    if (e.cita === 'ultimo_envio') ev.quotedMessageId = (reg.enviadas[reg.enviadas.length - 1] || {}).id;
    else if (/^envio:\d+$/.test(e.cita)) ev.quotedMessageId = (reg.enviadas[Number(e.cita.split(':')[1]) - 1] || {}).id;
    else if (/^msg:/.test(e.cita)) ev.quotedMessageId = e.cita.slice(4);
    if (e.cita_texto) ev.quotedBody = e.cita_texto;
    else if (ev.quotedMessageId) ev.quotedBody = ((reg.enviadas.find((m) => m.id === ev.quotedMessageId)) || {}).texto;
  }
  return ev;
}

async function executar(caso) {
  const ctx = montar(caso);
  const base = Date.now();
  const resultados = [];
  const passos = caso.passos || [];
  let emVoo = [];
  for (let i = 0; i < passos.length; i++) {
    const p = passos[i];
    ctx.setPasso(i);
    const ev = evento(ctx.g, p, i, ctx.reg);
    const agora = base + Math.round((p.t_s || 0) * 1000);
    const run = ctx.h.handle(ev, agora).then((r) => { resultados[i] = r; }, (e) => { resultados[i] = { acao: 'EXCECAO', erro: String(e && e.stack || e) }; });
    const prox = passos[i + 1];
    if (prox && prox.simultaneo_ms != null) {
      // Próximo evento chega com o atual AINDA em processamento (ex.: texto e mídia a 46 ms).
      emVoo.push(run);
      await sleep(prox.simultaneo_ms);
    } else {
      emVoo.push(run);
      await Promise.all(emVoo); emVoo = [];
    }
  }
  await Promise.all(emVoo);
  return { ...ctx, resultados };
}

function avaliar(caso, ex) {
  const falhas = [];
  const { reg, resultados } = ex;
  const pend = () => (ex.h._pendentes.get(ex.g.chat) || []);
  const envios = (passo) => reg.enviadas.filter((m) => passo === undefined || passo === 'todos' || m.passo === passo);
  for (const c of caso.esperado || []) {
    const rot = c.porque ? ` (${c.porque})` : '';
    switch (c.check) {
      case 'acao': {
        const a = String(resultados[c.passo] && resultados[c.passo].acao);
        const ok = new RegExp(c.regex).test(a);
        if (ok === !!c.nega) falhas.push(`passo ${c.passo}: ação "${a}" ${c.nega ? 'não devia' : 'devia'} casar /${c.regex}/${rot}`);
        break;
      }
      case 'envio': {
        const ms = envios(c.passo);
        const ok = ms.some((m) => new RegExp(c.regex, 'i').test(m.texto));
        if (ok === !!c.nega) falhas.push(`passo ${c.passo}: ${c.nega ? 'enviou' : 'não enviou'} mensagem /${c.regex}/${rot}`);
        break;
      }
      case 'contagem_envios': {
        const n = envios(c.passo).filter((m) => new RegExp(c.regex, 'i').test(m.texto)).length;
        if (c.max != null && n > c.max) falhas.push(`${n} mensagens /${c.regex}/, máximo ${c.max}${rot}`);
        if (c.min != null && n < c.min) falhas.push(`${n} mensagens /${c.regex}/, mínimo ${c.min}${rot}`);
        break;
      }
      case 'fala': {
        if (!envios(c.passo).length) falhas.push(`passo ${c.passo}: silêncio (nenhuma mensagem)${rot}`);
        break;
      }
      case 'lancamentos': {
        const n = reg.lancados.length;
        if (c.max != null && n > c.max) falhas.push(`${n} lançamento(s) gravado(s), máximo ${c.max}${rot}`);
        if (c.min != null && n < c.min) falhas.push(`${n} lançamento(s) gravado(s), mínimo ${c.min}${rot}`);
        break;
      }
      case 'lancamento': {
        const p = reg.lancados[c.indice || 0];
        const v = p ? p[c.campo] : undefined;
        if (!p) { falhas.push(`lançamento #${c.indice || 0} não existe${rot}`); break; }
        if ('igual' in c && String(v) !== String(c.igual)) falhas.push(`lançamento.${c.campo} = ${JSON.stringify(v)}, esperado ${JSON.stringify(c.igual)}${rot}`);
        if (c.regex && new RegExp(c.regex, 'i').test(String(v)) === !!c.nega) falhas.push(`lançamento.${c.campo} = ${JSON.stringify(v)} ${c.nega ? 'não devia' : 'devia'} casar /${c.regex}/${rot}`);
        break;
      }
      case 'nenhum_lancamento_valor': {
        const p = reg.lancados.find((x) => Math.abs(Number(x.valor) - Number(c.valor)) < 0.01);
        if (p) falhas.push(`gravou R$ ${c.valor} (${p.categoria || ''} ${p.fatura_id || 'sem fatura'})${rot}`);
        break;
      }
      case 'fatura_sem_duplo': {
        const ids = reg.lancados.flatMap((p) => [p.fatura_id, p.canonical_fatura_id, ...(p.fatura_ids || [])]).filter(Boolean);
        const dup = ids.find((x, i) => ids.indexOf(x) !== i);
        if (dup) falhas.push(`fatura ${dup} recebeu dois lançamentos${rot}`);
        break;
      }
      case 'cards_aprovaveis': {
        const n = pend().filter((p) => p.tipoOperacao !== 'manual_review_multi_student' && p.tipoOperacao !== 'aguardando_forma_saida').length;
        if (c.max != null && n > c.max) falhas.push(`${n} cards aprovaveis abertos, máximo ${c.max}${rot}`);
        if (c.min != null && n < c.min) falhas.push(`${n} cards aprovaveis abertos, mínimo ${c.min}${rot}`);
        break;
      }
      case 'estornos': {
        const n = reg.estornos.length;
        if (c.max != null && n > c.max) falhas.push(`${n} estorno(s), máximo ${c.max}${rot}`);
        if (c.min != null && n < c.min) falhas.push(`${n} estorno(s), mínimo ${c.min}${rot}`);
        if (c.movimentacao_id && !reg.estornos.some((e) => String(e.movimentacao_id) === c.movimentacao_id)) falhas.push(`estorno não foi no movimento ${c.movimentacao_id}${rot}`);
        break;
      }
      default: falhas.push(`check desconhecido: ${c.check}`);
    }
  }
  for (const [i, r] of resultados.entries()) if (r && r.acao === 'EXCECAO') falhas.push(`passo ${i} lançou exceção: ${r.erro.split('\n')[0]}`);
  return falhas;
}

(async () => {
  const placar = { passa: 0, regressao: [], falha_confirmada: [], consertado: [], requer_banco: [], erro: [] };
  const alvo = CASOS.casos.filter((c) => !SO || c.id === SO || c.incidente === SO);
  for (const caso of alvo) {
    if (caso.status === 'requer_banco') {
      placar.requer_banco.push(caso);
      console.log(`  🗄  ${caso.id} [${caso.incidente}] requer_banco — ${caso.titulo}`);
      continue;
    }
    const antes = tentativasProibidas.length;
    let falhas; let ex;
    try { ex = await executar(caso); falhas = avaliar(caso, ex); }
    catch (e) { falhas = ['erro no runner: ' + (e && e.stack || e)]; }
    if (tentativasProibidas.length > antes) {
      placar.erro.push(caso);
      console.log(`  ✗  ${caso.id} [${caso.incidente}] ERRO — tentou E/S real: ${tentativasProibidas.slice(antes).join(', ')}`);
      continue;
    }
    if (VERBOSO && ex) {
      console.log(`     ${caso.id} ações: ${ex.resultados.map((r) => r && r.acao).join(' → ')}`);
      ex.reg.enviadas.forEach((m) => console.log(`       [p${m.passo}] ${m.texto.replace(/\n/g, ' ¶ ').slice(0, 220)}`));
      console.log(`       lançados: ${JSON.stringify(ex.reg.lancados.map((p) => ({ valor: p.valor, cat: p.categoria, aluno: p.aluno || p.aluno_nome, fatura: p.fatura_id || p.canonical_fatura_id })))}`);
    }
    if (caso.status === 'passa') {
      if (!falhas.length) { placar.passa++; console.log(`  ✓  ${caso.id} [${caso.incidente}] ${caso.titulo}`); }
      else { placar.regressao.push(caso); console.log(`  ✗  ${caso.id} [${caso.incidente}] REGRESSÃO — ${caso.titulo}`); falhas.forEach((f) => console.log('       ✗ ' + f)); }
    } else if (caso.status === 'falha_conhecida') {
      if (falhas.length) { placar.falha_confirmada.push(caso); console.log(`  ◐  ${caso.id} [${caso.incidente}] falha conhecida — ${caso.titulo}`); falhas.slice(0, 3).forEach((f) => console.log('       · ' + f)); }
      else { placar.consertado.push(caso); console.log(`  ★  ${caso.id} [${caso.incidente}] falha conhecida PASSOU — conferir e promover a "passa"`); }
    } else {
      placar.erro.push(caso); console.log(`  ✗  ${caso.id} status inválido: ${caso.status}`);
    }
  }
  const ids = (l) => l.map((c) => c.id).join(', ') || '—';
  console.log('');
  console.log(`casos: ${alvo.length} · passam: ${placar.passa} · falha conhecida: ${placar.falha_confirmada.length} · consertados?: ${placar.consertado.length} · requer banco: ${placar.requer_banco.length} · regressões: ${placar.regressao.length} · erros: ${placar.erro.length}`);
  console.log(`falhas conhecidas: ${ids(placar.falha_confirmada)}`);
  if (placar.consertado.length) console.log(`promover a "passa": ${ids(placar.consertado)}`);
  console.log(`requer banco (não executados): ${ids(placar.requer_banco)}`);
  const vermelho = placar.regressao.length || placar.erro.length;
  console.log(vermelho ? 'BATERIA: VERMELHA' : 'BATERIA: VERDE');
  process.exit(vermelho ? 1 : 0);
})().catch((e) => { console.error('ERRO NO RUNNER:', e && e.stack); process.exit(1); });
