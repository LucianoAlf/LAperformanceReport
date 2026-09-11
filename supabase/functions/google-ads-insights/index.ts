/// <reference lib="deno.ns" />
// Edge Function: google-ads-insights
// Proxy read-only da API do Google Ads para o módulo Tráfego Pago — gêmeo de
// `meta-ads-insights`. As credenciais ficam em secret; o frontend NUNCA as vê.
//
// ⚠️ NÃO CONFUNDIR com `capturar-google-ads-diario`, que é outra coisa de propósito:
// aquela GRAVA custo diário por campanha em `google_ads_metricas_diarias` (memória,
// para dividir gasto por leads no radar de tráfego). Esta aqui não grava NADA —
// pergunta ao Google na hora, como o Meta faz na mesma tela. Os dois padrões
// convivem porque respondem perguntas diferentes: "quanto está rendendo agora" ×
// "quanto gastamos em cada dia". Reusam os MESMOS secrets — não há credencial
// duplicada, e trocar o refresh token num lugar conserta os dois.
//
// ⚠️ Custo de mídia é sensível: gate de e-mail além do verify_jwt do gateway,
// igual ao Meta. Sem isso, a anon key (que é pública, vai no bundle do front)
// daria acesso ao gasto.
//
// ⚠️ `cost_micros` e `average_cpc` são convertidos AQUI (÷ 1e6). Micro vazando
// para a tela vira número um milhão de vezes maior sem ninguém notar a escala.
//
// ⚠️ As versões da API são tentadas em ordem: o Google aposenta versão e o sintoma
// seria "a aba do Google parou", sem dizer por quê. Medido em 11/09/2026: v22-v25
// vivas, v17-v21 devolvem 404.
//
// ⚠️ As 3 campanhas são Performance Max e têm a UNIDADE no nome (`[CG]`, `[BARRA]`,
// `[RECREIO]`) — é daí que sai o recorte por unidade, porque a conta do Google é
// uma só e não existe separação estrutural por unidade nela.

const OAUTH = "https://oauth2.googleapis.com/token";
const VERSOES = (Deno.env.get("GOOGLE_ADS_API_VERSIONS") ?? "v25,v24,v23,v22")
  .split(",").map((v) => v.trim()).filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Espelha o guard do frontend e o da edge do Meta. Custo de mídia é restrito.
const EMAILS_AUTORIZADOS = new Set(["hugo@gmail.com", "lucianoalf.la@gmail.com"]);

function emailDoJwt(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return (payload.email ?? payload.user_metadata?.email ?? null)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const micros = (v: unknown) => num(v) / 1e6;
const soDigitos = (s: string) => String(s ?? "").replace(/\D/g, "");

// "Hoje" tem de ser em BRT: com UTC, das 21h à meia-noite a janela pularia para o
// dia seguinte e o dia corrente sairia da conta. Mesma armadilha do `CURRENT_DATE`
// já documentada nas views deste projeto.
const hojeBRT = () => new Date(Date.now() - 3 * 3_600_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Preset = "last_7d" | "last_30d" | "last_90d" | "maximum";
const PRESETS: Preset[] = ["last_7d", "last_30d", "last_90d", "maximum"];
const DIAS_POR_PRESET: Record<Preset, number> = {
  last_7d: 7,
  last_30d: 30,
  last_90d: 90,
  // A campanha mais antiga da conta é de 15/02/2025; 800 dias cobre tudo com folga.
  maximum: 800,
};

function janela(preset: Preset) {
  const ate = hojeBRT();
  const de = new Date(ate.getTime() - DIAS_POR_PRESET[preset] * 86_400_000);
  return { de: iso(de), ate: iso(ate) };
}

async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? "",
    refresh_token: Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") ?? "",
    grant_type: "refresh_token",
  });
  const r = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    // `invalid_grant` aqui = refresh token expirado ou revogado. Dizer isso na
    // mensagem poupa a caça que este projeto já fez uma vez (10-11/09/2026).
    const extra = j.error === "invalid_grant"
      ? " (refresh token expirado/revogado — refazer o consentimento OAuth)"
      : "";
    throw new Error(`oauth ${r.status}: ${j.error ?? "sem access_token"}${extra}`);
  }
  return j.access_token as string;
}

type Row = Record<string, Record<string, unknown>>;
type Agregado = { chave: string; gasto: number; impressoes: number; cliques: number; conversoes: number };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const email = emailDoJwt(req.headers.get("authorization"));
  if (!email || !EMAILS_AUTORIZADOS.has(email)) {
    return json({ ok: false, error: "acesso não autorizado" }, 403);
  }

  try {
    const customer = soDigitos(Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "");
    const dev = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
    if (!customer) return json({ ok: false, error: "GOOGLE_ADS_CUSTOMER_ID nao configurado" }, 500);
    if (!dev) return json({ ok: false, error: "GOOGLE_ADS_DEVELOPER_TOKEN nao configurado" }, 500);

    const body = await req.json().catch(() => ({}));
    const preset: Preset = PRESETS.includes(body?.date_preset) ? body.date_preset : "last_30d";
    const { de, ate } = janela(preset);

    const token = await accessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": dev,
      "Content-Type": "application/json",
    };
    // Só enviar quando existir: header com MCC que não gerencia a conta devolve 403.
    // Nesta conta ele NÃO deve existir — ela é alcançada direto (medido em 11/09/2026).
    const login = soDigitos(Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "");
    if (login) headers["login-customer-id"] = login;

    // A versão viva é descoberta na primeira consulta e reusada nas demais — sem
    // isso, cada uma das 9 queries pagaria o custo de redescobrir a versão.
    let versaoOk: string | null = null;
    const falhas: string[] = [];

    async function gaql(rotulo: string, query: string): Promise<Row[]> {
      for (const v of versaoOk ? [versaoOk] : VERSOES) {
        const r = await fetch(
          `https://googleads.googleapis.com/${v}/customers/${customer}/googleAds:search`,
          { method: "POST", headers, body: JSON.stringify({ query }) },
        );
        if (r.ok) {
          versaoOk = v;
          const j = await r.json();
          return (j.results ?? []) as Row[];
        }
        const txt = await r.text();
        // 404 = versão aposentada, vale tentar a próxima. Qualquer outro status é
        // erro real da consulta, e insistir noutra versão só esconderia a causa.
        if (r.status !== 404) {
          falhas.push(`${rotulo}: HTTP ${r.status} ${txt.slice(0, 200)}`);
          return [];
        }
      }
      falhas.push(`${rotulo}: nenhuma versao da API respondeu (${VERSOES.join(",")})`);
      return [];
    }

    const P = `segments.date BETWEEN '${de}' AND '${ate}'`;
    const M = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.all_conversions";

    const [
      totalRows, campRows, tendRows, convRows, devRows, redeRows, idadeRows, generoRows, grupoRows,
    ] = await Promise.all([
      gaql("conta", `SELECT customer.currency_code, ${M}, metrics.ctr, metrics.average_cpc FROM customer WHERE ${P}`),
      gaql("campanhas", `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, ${M}, metrics.ctr, metrics.average_cpc FROM campaign WHERE ${P}`),
      gaql("tendencia", `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions FROM campaign WHERE ${P}`),
      gaql("conversoes", `SELECT segments.conversion_action_name, metrics.all_conversions, metrics.all_conversions_value FROM campaign WHERE ${P}`),
      gaql("dispositivo", `SELECT segments.device, ${M} FROM campaign WHERE ${P}`),
      gaql("rede", `SELECT segments.ad_network_type, ${M} FROM campaign WHERE ${P}`),
      gaql("idade", `SELECT ad_group_criterion.age_range.type, ${M} FROM age_range_view WHERE ${P}`),
      gaql("genero", `SELECT ad_group_criterion.gender.type, ${M} FROM gender_view WHERE ${P}`),
      gaql("grupos_ativos", `SELECT asset_group.name, asset_group.status, ${M} FROM asset_group WHERE ${P}`),
    ]);

    // Falha na consulta da CONTA é fatal: sem total não há tela. Falha num recorte
    // é degradação — devolvemos o resto e dizemos o que faltou, em vez de esconder
    // tudo atrás de um 502 (e em vez de servir seção vazia sem explicação).
    if (!totalRows.length && falhas.length) {
      console.error("[google-ads-insights] falha fatal:", falhas);
      return json({ ok: false, error: falhas[0], falhas }, 502);
    }

    function agrupar(rows: Row[], chave: (r: Row) => string): Agregado[] {
      const mapa = new Map<string, Agregado>();
      for (const r of rows) {
        const k = chave(r) || "NAO_INFORMADO";
        const m = r.metrics ?? {};
        const acc = mapa.get(k) ?? { chave: k, gasto: 0, impressoes: 0, cliques: 0, conversoes: 0 };
        acc.gasto += micros(m.costMicros);
        acc.impressoes += num(m.impressions);
        acc.cliques += num(m.clicks);
        acc.conversoes += num(m.conversions);
        mapa.set(k, acc);
      }
      return [...mapa.values()].sort((a, b) => b.gasto - a.gasto);
    }

    const t = totalRows[0] ?? {};
    const tm = t.metrics ?? {};
    const conta = {
      moeda: (t.customer?.currencyCode as string) ?? "BRL",
      gasto: micros(tm.costMicros),
      impressoes: num(tm.impressions),
      cliques: num(tm.clicks),
      conversoes: num(tm.conversions),
      todas_conversoes: num(tm.allConversions),
      ctr: num(tm.ctr) * 100,
      cpc: micros(tm.averageCpc),
    };

    // Tendência: o Google devolve uma linha por (campanha, dia) — somamos por dia.
    const porDia = new Map<string, { data: string; gasto: number; cliques: number; conversoes: number }>();
    for (const r of tendRows) {
      const d = String(r.segments?.date ?? "");
      if (!d) continue;
      const m = r.metrics ?? {};
      const acc = porDia.get(d) ?? { data: d, gasto: 0, cliques: 0, conversoes: 0 };
      acc.gasto += micros(m.costMicros);
      acc.cliques += num(m.clicks);
      acc.conversoes += num(m.conversions);
      porDia.set(d, acc);
    }

    // Por AÇÃO de conversão: é o recorte que o Meta não dá — separa
    // "Contato - Botão Whatsapp" de "Inscrição - Formulário LP".
    // ⚠️ Usa all_conversions porque o breakdown por ação não existe em `conversions`
    // (que conta só as metas primárias), então a soma daqui NÃO fecha com
    // `conta.conversoes` de propósito — são universos diferentes.
    const porAcao = new Map<string, { acao: string; conversoes: number; valor: number }>();
    for (const r of convRows) {
      const k = (r.segments?.conversionActionName as string) ?? "NAO_INFORMADO";
      const m = r.metrics ?? {};
      const acc = porAcao.get(k) ?? { acao: k, conversoes: 0, valor: 0 };
      acc.conversoes += num(m.allConversions);
      acc.valor += num(m.allConversionsValue);
      porAcao.set(k, acc);
    }

    return json({
      ok: true,
      date_preset: preset,
      janela: { de, ate },
      versao_api: versaoOk,
      // Recorte que falhou aparece aqui em vez de virar seção vazia sem explicação.
      falhas: falhas.length ? falhas : undefined,
      conta,
      campanhas: campRows.map((r) => {
        const c = r.campaign ?? {}, m = r.metrics ?? {};
        return {
          id: String(c.id ?? ""),
          nome: (c.name as string) ?? "",
          status: (c.status as string) ?? "",
          canal: (c.advertisingChannelType as string) ?? "",
          orcamento_diario: micros((r.campaignBudget ?? {}).amountMicros),
          gasto: micros(m.costMicros),
          impressoes: num(m.impressions),
          cliques: num(m.clicks),
          conversoes: num(m.conversions),
          ctr: num(m.ctr) * 100,
          cpc: micros(m.averageCpc),
        };
      }).sort((a, b) => b.gasto - a.gasto),
      tendencia: [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)),
      conversoes_por_acao: [...porAcao.values()].sort((a, b) => b.conversoes - a.conversoes),
      dispositivo: agrupar(devRows, (r) => String(r.segments?.device ?? "")),
      rede: agrupar(redeRows, (r) => String(r.segments?.adNetworkType ?? "")),
      idade: agrupar(idadeRows, (r) => String((r.adGroupCriterion?.ageRange as Record<string, unknown>)?.type ?? "")),
      genero: agrupar(generoRows, (r) => String((r.adGroupCriterion?.gender as Record<string, unknown>)?.type ?? "")),
      grupos_ativos: agrupar(grupoRows, (r) => String(r.assetGroup?.name ?? "")),
    });
  } catch (e) {
    console.error("[google-ads-insights]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});
