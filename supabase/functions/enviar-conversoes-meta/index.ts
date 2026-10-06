/// <reference lib="deno.ns" />
// Edge Function: enviar-conversoes-meta  (LAPE-62, 06/10/2026)
//
// Devolve ao Meta, pelo pixel, quem fez experimental e quem se matriculou -- casando pelo
// TELEFONE em hash. Da ao Gerenciador de Anuncios matricula por campanha e permite publico de
// matriculados. NAO muda a otimizacao dos conjuntos atuais (otimizam para CONVERSATIONS): isso
// so viria com o retorno pelo ctwa_clid, que exige os numeros das Milas na Cloud API (ver a
// migration 20261006140000_meta_conversoes.sql).
//
//   POST {"diagnostico": true}                -> confere token, pixel e fila. NAO envia.
//   POST {}  ou {"dry_run": true}             -> monta os eventos (em hash) e devolve. NAO envia.
//   POST {"teste": true, "test_event_code": "TEST123"}
//                                             -> envia com test_event_code: aparece SO em
//                                                "Eventos de teste" do Gerenciador, nao conta
//                                                em relatorio nem otimizacao. Nao grava a fila.
//   POST {"enviar": true}                     -> envia de verdade e grava cada evento.
//
// ⚠️ O PADRAO E DRY RUN. Evento enviado ao Meta nao se apaga.
// ⚠️ Acesso: so x-sync-token (cron) ou service_role. Nenhum usuario do app dispara isto.
// ⚠️ Nada de dado pessoal em claro: telefone, nome e e-mail vao em SHA-256 (meta-capi.ts).
// Carimbo de cada chamada: public.meta_conversoes_execucao.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ACTION_SOURCE, JANELA_DIAS, montarEvento, triar, type ItemFila } from './meta-capi.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';
// Pixel da conta "CA - L.A | Oficial" (act_899158124847003), conferido pela API em 06/10/2026.
const PIXEL_ID = Deno.env.get('META_PIXEL_ID')?.trim() || '1151255353279807';
const LOTE = 200;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function autorizado(req: Request): boolean {
  const sync = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_TOKEN && sync === SYNC_TOKEN) return true;
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return !!bearer && bearer === SERVICE_ROLE;
}

type Modo = 'diagnostico' | 'dry_run' | 'teste' | 'enviar';

async function carimbar(supabase: SupabaseClient, linha: Record<string, unknown>) {
  const { error } = await supabase.from('meta_conversoes_execucao').insert(linha);
  // O carimbo nao pode derrubar o envio, mas a falha dele tem de aparecer em algum lugar.
  if (error) console.error('[meta/conversoes] carimbo NAO gravado', JSON.stringify({ run_id: linha.run_id, erro: error.message }));
}

async function lerFila(supabase: SupabaseClient): Promise<ItemFila[]> {
  const { data, error } = await supabase
    .from('meta_conversoes_fila')
    .select('lead_id, aluno_id, tipo, event_name, ocorrido_em, valor, nome, telefone, email, marca')
    .order('ocorrido_em', { ascending: true })
    .limit(2000);
  if (error) throw new Error(`fila: ${error.code} ${error.message}`);
  return (data ?? []) as ItemFila[];
}

function contarMotivos(descartes: { motivo: string }[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const d of descartes) {
    const chave = d.motivo.startsWith('fora da janela') ? 'fora da janela'
      : d.motivo.startsWith('matricula do aluno') ? 'aluno repetido no lote' : d.motivo;
    c[chave] = (c[chave] ?? 0) + 1;
  }
  return c;
}

async function postarEventos(token: string, eventos: unknown[], testCode?: string) {
  const corpo: Record<string, unknown> = { data: eventos };
  if (testCode) corpo.test_event_code = testCode;
  const r = await fetch(`${GRAPH}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  let parsed: any = null;
  try { parsed = JSON.parse(texto); } catch { /* corpo nao-JSON: segue com o texto */ }
  return { ok: r.ok, status: r.status, corpo: parsed, texto };
}

async function diagnostico(supabase: SupabaseClient, runId: string) {
  const token = Deno.env.get('META_ADS_TOKEN');
  const saida: Record<string, unknown> = { modo: 'diagnostico', pixel_id: PIXEL_ID, action_source: ACTION_SOURCE, janela_dias: JANELA_DIAS };
  if (!token) {
    saida.token = 'META_ADS_TOKEN nao configurado';
  } else {
    const r = await fetch(`${GRAPH}/${PIXEL_ID}?fields=id,name,last_fired_time&access_token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    saida.pixel = r.ok ? j : { erro: `HTTP ${r.status}`, detalhe: j?.error?.message ?? null };
  }
  const fila = await lerFila(supabase);
  const { elegiveis, descartes } = triar(fila, Date.now());
  saida.na_fila = fila.length;
  saida.elegiveis = { experimental: elegiveis.filter((e) => e.tipo === 'experimental').length, matricula: elegiveis.filter((e) => e.tipo === 'matricula').length };
  saida.descartes = contarMotivos(descartes);
  await carimbar(supabase, {
    run_id: runId, modo: 'diagnostico', terminado_em: new Date().toISOString(),
    na_fila: fila.length, elegiveis: elegiveis.length, enviados: 0, falhas: 0,
    descartes: saida.descartes, desfecho: 'ok',
  });
  return json({ ok: true, ...saida });
}

async function processar(supabase: SupabaseClient, runId: string, modo: Exclude<Modo, 'diagnostico'>, testCode?: string) {
  const fila = await lerFila(supabase);
  const { elegiveis: todos, descartes } = triar(fila, Date.now());
  // Teste so precisa provar o formato: 5 eventos bastam.
  const elegiveis = todos.slice(0, modo === 'teste' ? 5 : LOTE);
  const motivos = contarMotivos(descartes);
  const eventos = await Promise.all(elegiveis.map(montarEvento));
  const ids = elegiveis.map((e) => e.lead_id);
  const base = {
    run_id: runId, modo, na_fila: fila.length, elegiveis: todos.length,
    descartes: motivos, lead_ids: ids,
  };

  if (modo === 'dry_run' || eventos.length === 0) {
    await carimbar(supabase, { ...base, terminado_em: new Date().toISOString(), enviados: 0, falhas: 0, desfecho: 'ok' });
    return json({
      ok: true, modo, run_id: runId, pixel_id: PIXEL_ID, na_fila: fila.length, elegiveis: todos.length,
      neste_lote: eventos.length, descartes: motivos,
      descartes_detalhe: descartes.slice(0, 50).map((d) => ({ lead_id: d.item.lead_id, tipo: d.item.tipo, motivo: d.motivo })),
      aviso: modo === 'dry_run' ? 'DRY RUN -- nada foi enviado ao Meta nem gravado na fila.' : 'nada elegivel',
      amostra_eventos: eventos.slice(0, 3),
    });
  }

  const token = Deno.env.get('META_ADS_TOKEN');
  if (!token) {
    await carimbar(supabase, { ...base, terminado_em: new Date().toISOString(), enviados: 0, falhas: eventos.length, desfecho: 'erro', erro: 'META_ADS_TOKEN nao configurado' });
    return json({ ok: false, error: 'META_ADS_TOKEN nao configurado' }, 500);
  }

  const r = await postarEventos(token, eventos, modo === 'teste' ? testCode : undefined);
  const recebidos = Number(r.corpo?.events_received ?? 0);
  const erroMeta = r.ok ? null : `HTTP ${r.status} ${r.corpo?.error?.message ?? r.texto.slice(0, 300)}`;

  if (modo === 'teste') {
    await carimbar(supabase, {
      ...base, terminado_em: new Date().toISOString(), enviados: r.ok ? recebidos : 0,
      falhas: r.ok ? eventos.length - recebidos : eventos.length, resposta_meta: r.corpo,
      desfecho: r.ok ? 'ok' : 'erro', erro: erroMeta,
    });
    return json({
      ok: r.ok, modo, run_id: runId, test_event_code: testCode, enviados: eventos.length,
      events_received: recebidos, resposta_meta: r.corpo, descartes: motivos,
      aviso: 'Eventos de TESTE: aparecem so em Gerenciador de Eventos > Eventos de teste. Nada gravado na fila.',
    }, r.ok ? 200 : 502);
  }

  // Envio real. A Conversions API recusa o LOTE INTEIRO quando um evento e invalido (nao ha
  // falha parcial como no Google), entao o desfecho e o mesmo para todos os itens do lote.
  const agora = new Date().toISOString();
  let gravados = 0;
  const errosGravacao: string[] = [];
  for (let i = 0; i < elegiveis.length; i++) {
    const it = elegiveis[i];
    const ev = eventos[i] as Record<string, unknown>;
    const { data: anterior } = await supabase.from('meta_conversoes')
      .select('tentativas').eq('lead_id', it.lead_id).eq('tipo', it.tipo).maybeSingle();
    const { error } = await supabase.from('meta_conversoes').upsert({
      lead_id: it.lead_id, aluno_id: it.aluno_id, tipo: it.tipo, event_name: it.event_name,
      event_id: ev.event_id, valor: it.valor, ocorrido_em: it.ocorrido_em,
      tentativas: (anterior?.tentativas ?? 0) + 1,
      enviado_em: r.ok ? agora : null,
      ultimo_erro: erroMeta,
      resposta: r.ok ? { events_received: recebidos, fbtrace_id: r.corpo?.fbtrace_id ?? null } : r.corpo,
      updated_at: agora,
    }, { onConflict: 'lead_id,tipo' });
    if (error) {
      // Se o Meta ja recebeu e a linha nao gravou, a proxima rodada reenvia. O event_id fixo
      // faz o Meta deduplicar dentro de 48h; depois disso contaria duas vezes -- por isso grita.
      errosGravacao.push(`lead ${it.lead_id} ${it.tipo}: ${r.ok ? 'ENVIADO ao Meta mas ' : ''}NAO gravado (${error.code}: ${error.message})`);
    } else {
      gravados++;
    }
  }

  const desfecho = !r.ok ? 'erro' : (errosGravacao.length || recebidos !== eventos.length) ? 'parcial' : 'ok';
  const erroFinal = [erroMeta, ...errosGravacao, recebidos !== eventos.length && r.ok ? `Meta recebeu ${recebidos} de ${eventos.length}` : null]
    .filter(Boolean).join(' | ') || null;
  await carimbar(supabase, {
    ...base, terminado_em: new Date().toISOString(), enviados: r.ok ? recebidos : 0,
    falhas: r.ok ? errosGravacao.length : eventos.length, resposta_meta: r.corpo, desfecho, erro: erroFinal,
  });
  const log = JSON.stringify({ run_id: runId, enviados: recebidos, lote: eventos.length, gravados, desfecho, erro: erroFinal });
  if (desfecho === 'ok') console.log('[meta/conversoes]', log); else console.error('[meta/conversoes]', log);

  return json({
    ok: desfecho === 'ok', modo, run_id: runId, enviados: r.ok ? recebidos : 0, lote: eventos.length,
    restam_elegiveis: todos.length - elegiveis.length, descartes: motivos, desfecho, erro: erroFinal,
  }, desfecho === 'erro' ? 502 : 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!autorizado(req)) return json({ ok: false, error: 'acesso negado' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const runId = crypto.randomUUID();
  const body = await req.json().catch(() => ({}));
  const modo: Modo = body?.diagnostico === true ? 'diagnostico'
    : body?.enviar === true ? 'enviar'
    : body?.teste === true ? 'teste'
    : 'dry_run';

  try {
    if (modo === 'diagnostico') return await diagnostico(supabase, runId);
    if (modo === 'teste') {
      const code = String(body?.test_event_code ?? '').trim();
      if (!code) return json({ ok: false, error: 'modo teste exige test_event_code (Gerenciador de Eventos > Eventos de teste)' }, 400);
      return await processar(supabase, runId, 'teste', code);
    }
    return await processar(supabase, runId, modo);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[meta/conversoes] excecao', JSON.stringify({ run_id: runId, modo, erro: msg }));
    await carimbar(supabase, { run_id: runId, modo, terminado_em: new Date().toISOString(), desfecho: 'erro', erro: msg });
    return json({ ok: false, run_id: runId, error: msg }, 500);
  }
});
