#!/usr/bin/env node
// Bancada de repeticao: caixa da Sol — caminho LEGADO (parser + canonica/casar)
// contra o caminho V4 (envelope + sol_caixa_resolver_envelope_v1).
//
// SOMENTE LEITURA. Nada e gravado em producao:
//   - os logs da VPS sao LIDOS por `ssh lahq cat` (ou passados por env);
//   - no banco, cada caso roda em BEGIN ... ROLLBACK; as copias "as_of" das
//     RPCs que usam now() sao criadas em pg_temp dentro da transacao e somem
//     com o rollback. Nada e criado no schema public.
//
// Uso:
//   node scripts/bancada-sol-v4-vs-legado.mjs              # tudo
//   CAIXA_LOG=/tmp/caixa.log OBSERVE_LOG=/tmp/obs.jsonl node scripts/...
//   SAIDA_JSON=/tmp/bancada.json  (resultado caso a caso; contem nomes -> fora do repo)
//
// Conexao: mesmas credenciais do `npm run mapa:banco` (.env.local, pooler).
// O relatorio (docs/auditorias/2026-09-28-bancada-v4-vs-legado.md) e escrito
// SEM nome de aluno, telefone ou valor: casos citados pelo id curto da
// movimentacao.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = require(path.join(RAIZ, 'vps/la-hq/sol/runtime/caixa-financeiro.cjs'));

// ------------------------------------------------------------------ fontes
function lerLog(envVar, remoto, nomeLocal) {
  let arq = process.env[envVar];
  if (!arq) {
    arq = path.join(os.tmpdir(), nomeLocal);
    if (!fs.existsSync(arq) || process.env.REBAIXAR === '1') {
      fs.writeFileSync(arq, execSync(`ssh lahq 'cat ${remoto}'`, { maxBuffer: 1 << 30 }));
    }
  }
  return fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const CAIXA = lerLog('CAIXA_LOG', '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa.log', 'bancada-caixa.log');
const OBS = lerLog('OBSERVE_LOG', '/home/sol/.hermes/profiles/sol/logs/whatsapp-group-observe.jsonl', 'bancada-observe.jsonl');

function lerEnv() {
  const texto = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8');
  const pegar = (k) => (texto.match(new RegExp(`^${k}=(.*)$`, 'm')) || [, ''])[1].trim();
  return { password: pegar('SUPABASE_DB_PASSWORD') };
}
async function conectar() {
  const { password } = lerEnv();
  const url = fs.readFileSync(path.join(RAIZ, 'supabase/.temp/pooler-url'), 'utf8').trim()
    .replace('[YOUR-PASSWORD]', encodeURIComponent(password))
    .replace('${POSTGRES_PASSWORD}', encodeURIComponent(password));
  // query_timeout do lado do cliente: o pooler as vezes derruba a conexao em
  // silencio e o `await` ficaria pendurado para sempre.
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, query_timeout: 180000 });
  c.on('error', () => {});
  await c.connect();
  return c;
}

// Copias as_of em pg_temp. Guarda de ancora: aborta se o texto da funcao
// viva nao tiver exatamente UMA ocorrencia do trecho substituido.
const SQL_TEMP = `
do $$ declare d text; n int; a text; begin
  a := $q$v_as_of   date    := (now() at time zone 'America/Sao_Paulo')::date;$q$;
  d := pg_get_functiondef('public.sol_caixa_resolver_envelope_v1(uuid,jsonb)'::regprocedure);
  n := (length(d) - length(replace(d, a, ''))) / length(a);
  if n <> 1 then raise exception 'ancora as_of resolver: %', n; end if;
  d := replace(d, a, 'v_as_of date := p_as_of;');
  d := replace(d, 'FUNCTION public.sol_caixa_resolver_envelope_v1(p_unidade_id uuid, p_envelope jsonb)',
                  'FUNCTION pg_temp.resolver_envelope_asof(p_unidade_id uuid, p_envelope jsonb, p_as_of date)');
  if position('pg_temp.resolver_envelope_asof' in d) = 0 then raise exception 'ancora header resolver'; end if;
  d := replace(d, $q$not in ('ok', 'partial')$q$, $q$not in ('ok', 'partial', 'stale')$q$);
  execute d;

  a := $q$v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;$q$;
  d := pg_get_functiondef('public.sol_caixa_casar_parcela(uuid,text,numeric,text)'::regprocedure);
  n := (length(d) - length(replace(d, a, ''))) / length(a);
  if n <> 1 then raise exception 'ancora v_hoje casar: %', n; end if;
  d := replace(d, a, 'v_hoje date := p_as_of;');
  d := replace(d, 'FUNCTION public.sol_caixa_casar_parcela(p_unidade_id uuid, p_aluno text, p_valor numeric DEFAULT NULL::numeric, p_competencia text DEFAULT NULL::text)',
                  'FUNCTION pg_temp.casar_parcela_asof(p_unidade_id uuid, p_aluno text, p_valor numeric, p_competencia text, p_as_of date)');
  if position('pg_temp.casar_parcela_asof' in d) = 0 then raise exception 'ancora header casar'; end if;
  execute d;

  -- Canonica: ja recebe p_as_of, mas o "frescor" da fonte e julgado HOJE (sync_runs
  -- de agora). Replay de agosto sai 'stale' por construcao (competencias antigas nao
  -- sincronizam mais) e nao por defeito do legado. A copia de replay aceita 'stale'
  -- como se a fonte estivesse fresca naquele dia. So muda o portao de frescor.
  d := pg_get_functiondef('public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)'::regprocedure);
  a := $q$('ok','partial')$q$;
  n := (length(d) - length(replace(d, a, ''))) / length(a);
  if n < 1 then raise exception 'ancora frescor canonica: %', n; end if;
  d := replace(d, a, $q$('ok','partial','stale')$q$);
  d := replace(d, 'FUNCTION public.sol_caixa_parcela_canonica_env_v1(', 'FUNCTION pg_temp.canonica_env_replay(');
  if position('pg_temp.canonica_env_replay' in d) = 0 then raise exception 'ancora header canonica'; end if;
  execute d;
end $$;`;

const SQL_GABARITO = `
select a.movimentacao_id::text mov, left(a.movimentacao_id::text,8) mid, a.chat_id, a.origem_message_id om,
       a.preview_message_id pm, a.unidade_id::text u, a.data_caixa::text d, a.criado_em t,
       a.payload->>'aluno' aluno, coalesce(m.aluno_id::text, a.payload->>'aluno_id') aluno_id,
       a.payload->>'valor' valor, a.payload->>'categoria' cat,
       (a.payload ? 'itens') lote,
       (a.payload ? 'descricao_antes' or a.payload ? 'movimento_estorno' or a.payload ? 'forma_anterior'
          or a.payload ? 'aluno_id_antes') corr,
       m.id is not null viva, m.tipo,
       exists (select 1 from audit_log l where l.tabela='caixa_movimentacoes' and l.acao='DELETE'
                and coalesce(l.registro_id_text, l.registro_id::text) = a.movimentacao_id::text) deletada,
       exists (select 1 from sol_caixa_operacoes_auditoria_v1 o where o.movimentacao_id = a.movimentacao_id
                and o.operacao ilike '%estorn%') estornada,
       (select array_agg(l.fatura_id::text) from vw_caixa_movimentacao_fatura_links l
         where l.movimentacao_id = a.movimentacao_id) fats
  from sol_caixa_lancamento_auditoria a
  left join caixa_movimentacoes m on m.id = a.movimentacao_id
 where a.movimentacao_id is not null
 order by a.criado_em`;

// ------------------------------------------------------------ texto humano
const PLACEHOLDER = /^\[(image|document|video|audio|sticker)[^\]]*\]$/i;
const APROVACAO = /^\s*(pode|ok|sim|isso|confirmo|confirmado)\b/i;
const obsPorId = new Map(OBS.map((o) => [o.messageId, o]));
const SHADOW = CAIXA.filter((x) => x.acao === 'roteador_v4_shadow' && x.texto);

function textoHumano(o) {
  const t0 = Date.parse(o.ts);
  const cap = PLACEHOLDER.test(String(o.body || '').trim()) ? '' : String(o.body || '').trim();
  const irmas = OBS.filter((m) => m.chatId === o.chatId && m.senderId === o.senderId && !m.hasMedia
    && m.messageId !== o.messageId && Date.parse(m.ts) >= t0 - 150000 && Date.parse(m.ts) <= t0 + 120000
    && !APROVACAO.test(m.body || '') && !PLACEHOLDER.test(String(m.body || '').trim()))
    .sort((a, b) => Math.abs(Date.parse(a.ts) - t0) - Math.abs(Date.parse(b.ts) - t0));
  const texto = cap || (irmas[0] ? irmas[0].body : '');
  return { cap, irmas, texto: String(texto || '').trim(), fonte: cap ? 'legenda' : (irmas[0] ? 'mensagem_irma' : 'nenhum') };
}

function shadowDoCaso(o, th) {
  const cands = [o.hasMedia ? null : o.body, th.cap, ...th.irmas.map((m) => m.body)].filter(Boolean).map((s) => s.trim());
  const t0 = Date.parse(o.ts);
  return SHADOW.find((s) => s.chatId === o.chatId && /lancamento/.test(s.intencao || '')
    && Math.abs(Date.parse(s.ts) - t0) < 300000 && cands.includes(String(s.texto).trim())) || null;
}

// ------------------------------------------------------------ montar casos
async function montarCasos(db) {
  const { rows } = await db.query(SQL_GABARITO);
  const vistos = new Set();
  const gab = rows.filter((r) => (vistos.has(r.mov) ? false : vistos.add(r.mov)));
  const casos = [];
  const fora = {};
  const marca = (k) => { fora[k] = (fora[k] || 0) + 1; };
  for (const g of gab) {
    if (!g.viva || g.deletada) { marca('apagada_depois'); continue; }
    if (g.estornada) { marca('estornada'); continue; }
    if (g.corr) { marca('registro_de_correcao'); continue; }
    if (g.tipo !== 'entrada') { marca('saida_ou_sem_tipo'); continue; }
    if (!['parcela', 'passaporte'].includes(g.cat)) { marca(`categoria_${g.cat}`); continue; }
    if (g.lote) { marca('item_de_lote_multi_aluno'); continue; }
    const o = obsPorId.get(g.om);
    if (!o) { marca('mensagem_de_origem_nao_recuperavel'); continue; }
    const th = textoHumano(o);
    const valor = Number(g.valor);
    const multiplas = !!(R.pagamentoMultiplo(th.texto) || R.extrairPeriodoMeses(th.texto));
    const rot = R._alunoRotulado(th.texto);
    let nomeA = rot || R._alunoFromCaption(th.texto);
    if (!R.nomePlausivel(nomeA)) nomeA = null;
    const compHumana = th.texto ? R.extrairCompetenciaTexto(th.texto) : null;
    const sh = shadowDoCaso(o, th);
    let envShadow = null;
    if (sh) {
      const c = sh.campos || {};
      const m = R.montarEnvelopeV4({ intencao: sh.intencao, aluno_nome: c.aluno, valor: R.valorDoModelo(c.valor),
        forma: c.forma, categoria: c.categoria, competencia: c.competencia });
      envShadow = m.ok ? m.envelope : { erro_montagem: m.motivo };
    }
    // O shadow so loga os campos SINGULARES (nao loga itens[]). Em varios casos o
    // modelo pos o rotulo da unidade ("LA CG", "Kids CG") em `categoria`. Variante
    // normalizada: categoria fora do vocabulario do banco vira filtro vazio.
    const CATS = ['parcela', 'passaporte', 'lojinha', 'venda', 'outro'];
    const envShadowNorm = envShadow && envShadow.itens ? { ...envShadow, itens: envShadow.itens.map((it) => ({
      ...it, categorias: it.categorias.filter((x) => CATS.includes(x)) })) } : null;
    const envMesma = nomeA ? { pagador: null, valor_total: valor, forma: null,
      itens: [{ aluno: nomeA, categorias: [g.cat], competencias: compHumana ? [compHumana] : [] }] } : null;
    const envCanon = g.aluno ? { pagador: null, valor_total: valor, forma: null,
      itens: [{ aluno: g.aluno, categorias: [g.cat], competencias: compHumana ? [compHumana] : [] }] } : null;
    casos.push({ ...g, valorN: valor, origemTs: o.ts, hasMedia: o.hasMedia, textoFonte: th.fonte, temTexto: !!th.texto,
      multiplas, nomeA, nomeDoRotulo: !!(rot && R.nomePlausivel(rot)), compHumana, shadow: sh ? { ts: sh.ts, intencao: sh.intencao } : null,
      envShadow, envShadowNorm, envMesma, envCanon });
  }
  return { casos, fora, totalGabarito: gab.length };
}

// ------------------------------------------------------------ rodar no banco
async function rodar(db, c, prev = {}) {
  const out = { ...prev };
  delete out.erro;
  try {
    await db.query('begin');
    await db.query("set local statement_timeout = '120s'");
    await db.query(SQL_TEMP);
    const q1 = async (sql, p) => (await db.query(sql, p)).rows[0].r;
    if (c.nomeA && !c.multiplas && !('canonica' in out)) {
      out.canonica = await q1('select pg_temp.canonica_env_replay(null, $1::uuid, $2, $3::numeric, $4::date) r',
        [c.u, c.nomeA, c.valorN, c.d]);
      out.casar = await q1('select pg_temp.casar_parcela_asof($1::uuid, $2, $3::numeric, $4, $5::date) r',
        [c.u, c.nomeA, c.valorN, c.compHumana, c.d]);
    }
    for (const [k, env] of [['bShadow', c.envShadow], ['bShadowNorm', c.envShadowNorm], ['bMesma', c.envMesma], ['bCanon', c.envCanon]]) {
      if (env && !env.erro_montagem && !(k in out)) {
        out[k] = await q1('select pg_temp.resolver_envelope_asof($1::uuid, $2::jsonb, $3::date) r', [c.u, JSON.stringify(env), c.d]);
      }
    }
  } catch (e) {
    out.erro = String(e.message || e);
  } finally {
    await db.query('rollback').catch(() => {});
  }
  return out;
}

// ------------------------------------------------------------ classificar
const faturaDaCanonica = (r) => r && r.ok && r.fatura ? r.fatura.canonical_fatura_id : null;
const indisponivel = (r) => r && r.ok === false && /indispon|stale/i.test(String(r.motivo || ''));

// Reproduz a decisao do legado (bloco tentarCanonica + casar de caixa-financeiro.cjs),
// SEM pagador do OCR e sem aluno novo (nao reproduziveis).
function decidirA(c, out) {
  if (out.erro) return { classe: 'erro', det: out.erro };
  if (c.multiplas) return { classe: 'fora_escopo_multi' };
  if (!c.nomeA) return { classe: 'nao_achou', det: 'sem_nome_no_texto' };
  const querParcela = true; // categoria do gabarito ja filtrada para parcela/passaporte
  const taxa = c.cat === 'passaporte';
  const can = out.canonica;
  const rejeitaRotulo = (nome) => c.nomeDoRotulo && nome && !R._mesmaPessoa(nome, c.nomeA);
  let fat = null, aluno = null, via = null;
  if (c.compHumana && querParcela) {
    const fc = can && can.ok && can.fatura ? String(can.fatura.competencia || '') : '';
    const compCan = fc ? `${fc.slice(5, 7)}/${fc.slice(0, 4)}` : null;
    if (can && can.ok && !rejeitaRotulo(can.aluno_nome) && compCan === c.compHumana) {
      fat = faturaDaCanonica(can); aluno = can.aluno_nome; via = 'canonica';
    } else if (!indisponivel(can)) {
      const m = out.casar;
      if (m && m.ok && m.parcela && !rejeitaRotulo(m.aluno_nome)) { fat = m.parcela.fatura_id; aluno = m.aluno_nome; via = 'casar_competencia'; }
    }
  } else {
    if (can && can.ok && !rejeitaRotulo(can.aluno_nome)) { fat = faturaDaCanonica(can); aluno = can.aluno_nome; via = 'canonica'; }
    else if (!indisponivel(can) && !taxa) {
      const m = out.casar;
      if (m && m.ok && m.parcela && !rejeitaRotulo(m.aluno_nome)) { fat = m.parcela.fatura_id; aluno = m.aluno_nome; via = 'casar'; }
    }
  }
  return compara(c, fat ? [fat] : [], aluno, via, can && !can.ok ? can.motivo : null);
}

function decidirB(c, r, k) {
  if (!r) return { classe: k === 'bShadow' ? 'sem_extracao_do_modelo' : 'nao_achou', det: 'sem_envelope' };
  if (r.ok !== true) return { classe: 'nao_achou', det: r.motivo };
  const fats = (r.itens || []).map((i) => i.canonical_fatura_id).filter(Boolean);
  return compara(c, fats, (r.itens || [])[0] && r.itens[0].aluno_nome, 'resolver', null);
}

function compara(c, fats, aluno, via, motivo) {
  const gab = c.fats || [];
  if (!fats.length) return { classe: gab.length ? 'nao_achou' : 'sem_vinculo_coerente', det: motivo || 'sem_fatura', via };
  if (!gab.length) return { classe: 'vinculou_gabarito_sem_vinculo', via, aluno };
  const iguais = fats.length === gab.length && fats.every((f) => gab.includes(f));
  if (iguais) return { classe: 'acertou', via };
  const algumaCerta = fats.some((f) => gab.includes(f));
  return { classe: algumaCerta ? 'parcial' : 'outra_fatura', via, aluno };
}

// ------------------------------------------------------------ latencia
function periodo(ts) {
  if (ts < '2026-09-01') return 'ate_31/08';
  if (ts < '2026-09-15') return '01-14/09';
  if (ts < '2026-09-28') return '15-27/09';
  return '28/09';
}
const mediana = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (v, p) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function latencias(casos) {
  const previews = CAIXA.filter((x) => x.acao === 'preview_enviado' || x.acao === 'preview_multi_aluno_enviado');
  const pvPorId = new Map(previews.filter((p) => p.previewId).map((p) => [p.previewId, p]));
  const AF = CAIXA.filter((x) => ['agent_first_resolveu', 'preview_agent_first_singular', 'agent_first_midia_estruturada'].includes(x.acao));
  // (i) casos aprovados: mensagem de origem -> card
  const porCaso = [];
  for (const c of casos) {
    const pv = pvPorId.get(c.pm);
    if (!pv) continue;
    const ms = Date.parse(pv.ts) - Date.parse(c.origemTs);
    if (ms < 0 || ms > 30 * 60000) continue;
    const af = AF.some((a) => a.chatId === pv.chatId && a.ts >= c.origemTs && a.ts <= pv.ts);
    porCaso.push({ mid: c.mid, periodo: periodo(c.origemTs), trilho: af ? 'agent_first' : 'legado', ms });
  }
  // (ii) todo card do log: ultimo `msg` do mesmo chat antes do card
  const msgs = CAIXA.filter((x) => x.step === 'msg');
  const geral = [];
  for (const pv of previews) {
    let ult = null;
    for (const m of msgs) { if (m.chatId !== pv.chatId) continue; if (m.ts > pv.ts) break; ult = m; }
    if (!ult) continue;
    const ms = Date.parse(pv.ts) - Date.parse(ult.ts);
    if (ms < 0 || ms > 10 * 60000) continue;
    const af = AF.some((a) => a.chatId === pv.chatId && a.ts >= ult.ts && a.ts <= pv.ts);
    geral.push({ periodo: periodo(pv.ts), trilho: af ? 'agent_first' : 'legado', ms, media: ult.hasMedia });
  }
  const afMs = CAIXA.filter((x) => x.acao === 'agent_first_resolveu' && x.ms).map((x) => ({ periodo: periodo(x.ts), ms: x.ms }));
  return { porCaso, geral, afMs };
}

// ------------------------------------------------------------ relatorio
function tabelaLat(lista, rotulo) {
  const per = ['ate_31/08', '01-14/09', '15-27/09', '28/09'];
  let s = `| ${rotulo} | trilho | n | mediana (s) | p90 (s) |\n|---|---|---:|---:|---:|\n`;
  for (const p of per) for (const t of ['legado', 'agent_first']) {
    const v = lista.filter((x) => x.periodo === p && x.trilho === t).map((x) => x.ms / 1000);
    if (!v.length) continue;
    s += `| ${p} | ${t} | ${v.length} | ${mediana(v).toFixed(1)} | ${pct(v, 0.9).toFixed(1)} |\n`;
  }
  return s;
}

async function main() {
  let db = await conectar();
  const { casos, fora, totalGabarito } = await montarCasos(db);
  console.error(`[bancada] gabarito ${totalGabarito}; casos ${casos.length}; fora`, fora);
  // Cache por caso (fora do repo): permite retomar sem refazer o que ja rodou.
  const CACHE = process.env.CACHE_JSON || path.join(os.tmpdir(), 'bancada-cache.json');
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  let i = 0;
  for (const c of casos) {
    const prev = cache[c.mov] && !cache[c.mov].erro ? cache[c.mov] : {};
    const falta = (c.nomeA && !c.multiplas && !('canonica' in prev))
      || [['bShadow', c.envShadow], ['bShadowNorm', c.envShadowNorm], ['bMesma', c.envMesma], ['bCanon', c.envCanon]]
        .some(([k, e]) => e && !e.erro_montagem && !(k in prev));
    if (!falta) {
      c.res = prev;
    } else {
      c.res = await rodar(db, c, prev);
      if (c.res.erro) { // reconecta e tenta uma vez
        try { await db.end(); } catch {}
        db = await conectar();
        c.res = await rodar(db, c, prev);
      }
      cache[c.mov] = c.res;
      fs.writeFileSync(CACHE, JSON.stringify(cache));
    }
    c.A = decidirA(c, c.res);
    c.Bs = decidirB(c, c.res.bShadow, 'bShadow');
    c.Bn = decidirB(c, c.res.bShadowNorm, 'bShadow');
    c.Bm = c.nomeA ? decidirB(c, c.res.bMesma, 'bMesma') : { classe: 'nao_achou', det: 'sem_nome_no_texto' };
    c.Bc = decidirB(c, c.res.bCanon, 'bCanon');
    if (++i % 25 === 0) console.error(`[bancada] ${i}/${casos.length}`);
  }
  await db.end();
  const lat = latencias(casos);
  if (process.env.SAIDA_JSON) fs.writeFileSync(process.env.SAIDA_JSON, JSON.stringify({ casos, fora, lat }, null, 1));
  fs.writeFileSync(path.join(os.tmpdir(), 'bancada-resumo.json'), JSON.stringify({
    totalGabarito, fora, n: casos.length,
    casos: casos.map((c) => ({ mid: c.mid, d: c.d, cat: c.cat, fonte: c.textoFonte, comp: !!c.compHumana, gabFats: (c.fats || []).length,
      temNomeA: !!c.nomeA, multiplas: c.multiplas, shadow: !!c.shadow, A: c.A, Bs: c.Bs, Bn: c.Bn, Bm: c.Bm, Bc: c.Bc,
      mesmoAlunoA: c.A.aluno ? R._mesmaPessoa(c.A.aluno, c.aluno || '') : null,
      mesmoAlunoBm: c.Bm.aluno ? R._mesmaPessoa(c.Bm.aluno, c.aluno || '') : null,
      mesmoAlunoBs: c.Bs.aluno ? R._mesmaPessoa(c.Bs.aluno, c.aluno || '') : null })),
    lat: { tabelaCaso: tabelaLat(lat.porCaso, 'período (origem→card, casos aprovados)'),
           tabelaGeral: tabelaLat(lat.geral, 'período (último msg→card, todos os cards)'),
           afMs: lat.afMs },
  }, null, 1));
  console.error('[bancada] resumo em', path.join(os.tmpdir(), 'bancada-resumo.json'));
}

main().catch((e) => { console.error(e); process.exit(1); });
