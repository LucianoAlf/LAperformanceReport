/// <reference lib="deno.ns" />
// T3 do checkpoint de 03/09 — ALICERCE (camadas estratégica + tática).
//
// PARA QUE EXISTE: o Tráfego Pago é 100% ao vivo. O número de gasto de hoje
// deixa de existir amanhã, e a matrícula acontece semanas depois — então o 2º
// andar sabe qual criativo traz CONVERSA e nunca saberá qual traz MATRÍCULA.
// Esta edge é a memória: grava uma linha por (dia, anúncio).
//
// ⚠️ NÃO substitui a leitura ao vivo. A tela continua chamando
// `meta-ads-insights`; aqui é o histórico para aprendizado.
//
// ⚠️ `conversas` usa a MESMA ação da edge de leitura
// (`onsite_conversion.messaging_conversation_started_7d`). Dois números com o
// mesmo nome e origens diferentes é o padrão que gerou as duplicatas de
// renovação neste projeto — a definição fica em UM lugar.
//
// ⚠️ REESCREVE a janela inteira a cada execução (upsert por dia+ad_id). A Meta
// REVISA número: gasto e conversões de ontem mudam nas 24-72h seguintes. Gravar
// uma vez e nunca mais seria guardar o número errado para sempre.
//
// ⚠️ Idempotente por construção (PK dia+ad_id). Neste ambiente 1 disparo de
// cron vira 2-4 execuções — rodar 4× é o mesmo que rodar 1×.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";
const ACAO_CONVERSA = "onsite_conversion.messaging_conversation_started_7d";
const DIAS_PADRAO = 7;

type Action = { action_type: string; value: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokensBatem(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

function conversasDe(actions?: Action[]): number {
  if (!Array.isArray(actions)) return 0;
  const a = actions.find((x) => x.action_type === ACAO_CONVERSA);
  return a ? Number(a.value) || 0 : 0;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`graph_${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const url = new URL(req.url);

  const { data: cofre } = await sb.from("integracao_tokens")
    .select("token").eq("nome", "meta_ads_captura").maybeSingle();
  const oferecido = req.headers.get("x-radar-token") ?? "";
  if (!cofre?.token) return json({ error: "token_nao_configurado" }, 500);
  if (!tokensBatem(oferecido, cofre.token)) {
    return new Response("unauthorized", { status: 401 });
  }

  const token = Deno.env.get("META_ADS_TOKEN");
  const account = Deno.env.get("META_AD_ACCOUNT_ID") ?? "act_899158124847003";
  if (!token) return json({ error: "META_ADS_TOKEN nao configurado" }, 500);

  const dias = Math.min(Math.max(Number(url.searchParams.get("dias") ?? DIAS_PADRAO) || DIAS_PADRAO, 1), 90);
  const hoje = new Date();
  const desde = new Date(hoje.getTime() - dias * 86400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const range = encodeURIComponent(JSON.stringify({ since: iso(desde), until: iso(hoje) }));

  // level=ad + time_increment=1 -> uma linha por (dia, anuncio)
  const campos = [
    "ad_id", "ad_name", "campaign_id", "campaign_name", "adset_id", "adset_name",
    "spend", "impressions", "clicks", "ctr", "cpm", "reach", "frequency", "actions",
    "date_start", "account_currency",
  ].join(",");

  let linhas: Record<string, unknown>[] = [];
  try {
    let proxima: string | null =
      `${GRAPH}/${account}/insights?level=ad&time_increment=1&time_range=${range}` +
      `&fields=${campos}&limit=500&access_token=${token}`;
    // pagina ate o fim: foto parcial viraria "o anuncio nao rodou naquele dia"
    while (proxima) {
      const p: Record<string, unknown> = await getJson(proxima);
      linhas = linhas.concat((p.data as Record<string, unknown>[]) ?? []);
      proxima = ((p.paging as Record<string, string>)?.next) ?? null;
    }
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 502);
  }

  if (linhas.length === 0) {
    // Foto vazia ABORTA sem escrever. Zero anuncios numa janela de 7 dias e
    // sintoma de token/permissao, nao de "nao houve investimento" — mesma
    // guarda de atualizar-inadimplencia-emusys.
    return json({ error: "foto_vazia", nota: "nada gravado de proposito", dias }, 422);
  }

  const registros = linhas.map((l) => ({
    dia: String(l.date_start),
    ad_id: String(l.ad_id),
    ad_name: (l.ad_name as string) ?? null,
    campaign_id: (l.campaign_id as string) ?? null,
    campaign_name: (l.campaign_name as string) ?? null,
    adset_id: (l.adset_id as string) ?? null,
    adset_name: (l.adset_name as string) ?? null,
    gasto: num(l.spend),
    impressoes: num(l.impressions),
    cliques: num(l.clicks),
    ctr: num(l.ctr),
    cpm: num(l.cpm),
    alcance: l.reach != null ? num(l.reach) : null,
    frequencia: l.frequency != null ? num(l.frequency) : null,
    conversas: conversasDe(l.actions as Action[]),
    moeda: (l.account_currency as string) ?? "BRL",
    capturado_em: new Date().toISOString(),
  }));

  const { error, count } = await sb.from("meta_ads_metricas_diarias")
    .upsert(registros, { onConflict: "dia,ad_id", count: "exact" });
  if (error) return json({ error: error.message }, 500);

  const gastoTotal = registros.reduce((s, r) => s + r.gasto, 0);
  const conversasTotal = registros.reduce((s, r) => s + r.conversas, 0);
  return json({
    ok: true,
    janela: { de: iso(desde), ate: iso(hoje), dias },
    linhas: registros.length,
    gravadas: count ?? registros.length,
    anuncios_distintos: new Set(registros.map((r) => r.ad_id)).size,
    gasto_total: Math.round(gastoTotal * 100) / 100,
    conversas_total: conversasTotal,
  });
});
