/// <reference lib="deno.ns" />
// ALICERCE (camadas estratégica + tática) — gêmeo de `capturar-meta-ads-diario`.
//
// PARA QUE EXISTE: em 03/09 medimos que o Google converte MELHOR que o
// Instagram por lead (3,7% × 2,7%, 1.178 leads → 43 matrículas na coorte
// madura) e não tínhamos NENHUM custo dele. `radar_trafego_canal_v1` devolvia
// `gasto NULL` para Google e a pergunta "Google ou Instagram" ficava sem
// resposta pelo lado do dinheiro.
//
// ⚠️ GRÃO = CAMPANHA, não anúncio (diferente do Meta, de propósito).
// Performance Max não expõe anúncio como Search; campanha atravessa os dois. O
// equivalente do PC6 no Google é termo de busca — outra consulta, outra rodada.
//
// ⚠️ `cost_micros` é convertido AQUI (÷ 1e6). Micro vazando para um consumidor
// vira gasto um milhão de vezes maior sem ninguém notar a escala.
//
// ⚠️ REESCREVE a janela inteira a cada execução (upsert por dia+campanha). O
// Google revisa conversão por dias (janela de atribuição) — gravar uma vez e
// nunca mais seria congelar o número errado.
//
// ⚠️ Idempotente por PK. Neste ambiente 1 disparo de cron vira 2-4 execuções.
//
// ⚠️ Foto vazia ABORTA com 422 sem escrever: zero campanha numa janela é
// sintoma de token/permissão, não de "não houve investimento".

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OAUTH = "https://oauth2.googleapis.com/token";
const DIAS_PADRAO = 7;
// A API do Google Ads sunseta versões. Tentar em ordem evita que a captura
// morra em silêncio quando a versão fixada é aposentada — o sintoma seria
// "gasto parou de atualizar", que ninguém percebe olhando o pg_cron.
const VERSOES = (Deno.env.get("GOOGLE_ADS_API_VERSIONS") ?? "v25,v24,v23,v22")
  .split(",").map((v) => v.trim()).filter(Boolean);

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
const soDigitos = (s: string) => String(s ?? "").replace(/\D/g, "");
const iso = (d: Date) => d.toISOString().slice(0, 10);

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
  const t = await r.text();
  if (!r.ok) throw new Error(`oauth_${r.status}: ${t.slice(0, 200)}`);
  const j = JSON.parse(t);
  if (!j.access_token) throw new Error("oauth_sem_access_token");
  return j.access_token as string;
}

type Linha = Record<string, Record<string, unknown>>;

// searchStream devolve um ARRAY de chunks `{results:[...]}`; `search` pagina.
// Usamos o stream: a resposta inteira cabe de sobra neste volume e evita a
// paginação parcial, que produziria foto incompleta (= "a campanha não rodou").
async function consultar(
  versao: string, token: string, dev: string, customer: string,
  loginCustomer: string, query: string,
): Promise<{ ok: true; linhas: Linha[] } | { ok: false; status: number; erro: string }> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "developer-token": dev,
    "Content-Type": "application/json",
  };
  if (loginCustomer) headers["login-customer-id"] = loginCustomer;
  const r = await fetch(
    `https://googleads.googleapis.com/${versao}/customers/${customer}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query }) },
  );
  const texto = await r.text();
  if (!r.ok) return { ok: false, status: r.status, erro: texto.slice(0, 400) };
  const chunks = JSON.parse(texto) as { results?: Linha[] }[];
  const linhas: Linha[] = [];
  for (const c of chunks ?? []) for (const l of c.results ?? []) linhas.push(l);
  return { ok: true, linhas };
}

serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const url = new URL(req.url);

  const { data: cofre } = await sb.from("integracao_tokens")
    .select("token").eq("nome", "google_ads_captura").maybeSingle();
  const oferecido = req.headers.get("x-radar-token") ?? "";
  if (!cofre?.token) return json({ error: "token_nao_configurado" }, 500);
  if (!tokensBatem(oferecido, cofre.token)) {
    return new Response("unauthorized", { status: 401 });
  }

  const dev = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
  const customer = soDigitos(Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "");
  // ⚠️ NAO mandar `login-customer-id` por padrao. Medido em 03/09: o usuario
  // OAuth alcanca a conta 717-909-7170 DIRETO (`listAccessibleCustomers` devolve
  // so ela) e NAO e membro do MCC 164-091-0901 — mandar o MCC no header fazia a
  // API responder 403 USER_PERMISSION_DENIED, com uma mensagem que sugere
  // exatamente o contrario ("o customer id do gerenciador DEVE estar no header").
  // Só preencher a env se um dia a conta passar a ser acessada via gerenciadora.
  const loginCustomer = soDigitos(Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "");
  if (!dev) return json({ error: "GOOGLE_ADS_DEVELOPER_TOKEN nao configurado" }, 500);
  if (!customer) return json({ error: "GOOGLE_ADS_CUSTOMER_ID nao configurado" }, 500);

  const dias = Math.min(
    Math.max(Number(url.searchParams.get("dias") ?? DIAS_PADRAO) || DIAS_PADRAO, 1),
    90,
  );
  const hoje = new Date();
  const desde = new Date(hoje.getTime() - dias * 86400_000);

  const query = `
    SELECT segments.date, campaign.id, campaign.name, campaign.status,
           campaign.advertising_channel_type,
           customer.currency_code, customer.id,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.ctr, metrics.average_cpc,
           metrics.conversions, metrics.all_conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${iso(desde)}' AND '${iso(hoje)}'
  `.trim();

  let token: string;
  try {
    token = await accessToken();
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 502);
  }

  let linhas: Linha[] | null = null;
  const tentativas: { versao: string; status: number; erro: string }[] = [];
  for (const versao of VERSOES) {
    const r = await consultar(versao, token, dev, customer, loginCustomer, query);
    if (r.ok) { linhas = r.linhas; tentativas.push({ versao, status: 200, erro: "" }); break; }
    tentativas.push({ versao, status: r.status, erro: r.erro });
    // 404 = versão aposentada -> tenta a próxima. Qualquer outro erro é do
    // pedido (token, permissão, GAQL) e repetir noutra versão só esconde a causa.
    if (r.status !== 404) break;
  }
  if (linhas === null) return json({ error: "google_ads_indisponivel", tentativas }, 502);

  if (linhas.length === 0) {
    return json({
      error: "foto_vazia",
      nota: "nada gravado de proposito",
      janela: { de: iso(desde), ate: iso(hoje), dias },
    }, 422);
  }

  const registros = linhas.map((l) => {
    const seg = l.segments ?? {}, camp = l.campaign ?? {},
      met = l.metrics ?? {}, cli = l.customer ?? {};
    return {
      dia: String(seg.date),
      campanha_id: String(camp.id),
      campanha_nome: (camp.name as string) ?? null,
      canal_tipo: (camp.advertisingChannelType as string) ?? null,
      status: (camp.status as string) ?? null,
      // micros -> reais AQUI. Nunca deixar micro chegar a consumidor.
      gasto: Math.round(num(met.costMicros) / 1e6 * 100) / 100,
      impressoes: num(met.impressions),
      cliques: num(met.clicks),
      ctr: num(met.ctr),
      cpc_medio: Math.round(num(met.averageCpc) / 1e6 * 10000) / 10000,
      conversoes: num(met.conversions),
      conversoes_todas: num(met.allConversions),
      valor_conversoes: num(met.conversionsValue),
      moeda: (cli.currencyCode as string) ?? "BRL",
      conta_id: cli.id ? String(cli.id) : customer,
      capturado_em: new Date().toISOString(),
    };
  });

  const { error, count } = await sb.from("google_ads_metricas_diarias")
    .upsert(registros, { onConflict: "dia,campanha_id", count: "exact" });
  if (error) return json({ error: error.message }, 500);

  const gastoTotal = registros.reduce((s, r) => s + r.gasto, 0);
  return json({
    ok: true,
    versao_api: tentativas.at(-1)?.versao,
    janela: { de: iso(desde), ate: iso(hoje), dias },
    linhas: registros.length,
    gravadas: count ?? registros.length,
    campanhas_distintas: new Set(registros.map((r) => r.campanha_id)).size,
    gasto_total: Math.round(gastoTotal * 100) / 100,
    conversoes_total: Math.round(registros.reduce((s, r) => s + r.conversoes, 0) * 100) / 100,
    moeda: registros[0]?.moeda ?? null,
  });
});
