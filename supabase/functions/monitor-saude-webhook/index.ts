// monitor-saude-webhook
// Chamado pelo pg_cron e autenticado no health do inbound por segredo dedicado.
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NUMERO_ALERTA = "5521966583325";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const healthToken = Deno.env.get("WEBHOOK_HEALTH_TOKEN")?.trim() ?? "";
  if (!healthToken) {
    return json({ ok: false, code: "health_auth_unavailable" }, 503);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: caixas, error: caixasError } = await supabase
    .from("whatsapp_caixas")
    .select("id, nome")
    .eq("ativo", true)
    .not("webhook_url", "is", null)
    .order("id");
  if (caixasError) return json({ ok: false, code: "boxes_unavailable" }, 503);

  const problemas: string[] = [];
  for (const caixa of caixas ?? []) {
    const healthUrl =
      `${SUPABASE_URL}/functions/v1/webhook-whatsapp-inbox?caixa_id=${caixa.id}&_health=1`;
    let status = 0;
    try {
      const response = await fetch(healthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-health-secret": healthToken,
        },
        body: "{}",
      });
      status = response.status;
    } catch {
      status = 0;
    }

    if (status !== 200) {
      problemas.push(
        `*${caixa.nome}* (caixa_id=${caixa.id}): HTTP ${status || "timeout"}`,
      );
    }
  }

  if (problemas.length > 0) {
    const mensagem =
      `Alerta: health autenticado do webhook de recebimento falhou.\n\n` +
      problemas.join("\n") +
      `\n\nMensagens podem nao estar chegando. Verifique WEBHOOK_HEALTH_TOKEN, ` +
      `segredos por caixa e o roteamento/deploy do inbound.`;

    const { data: caixaAlerta } = await supabase
      .from("whatsapp_caixas")
      .select("uazapi_url, uazapi_token")
      .eq("funcao", "administrativo")
      .eq("provedor", "uazapi")
      .eq("ativo", true)
      .not("uazapi_url", "is", null)
      .not("uazapi_token", "is", null)
      .limit(1)
      .maybeSingle();

    if (caixaAlerta?.uazapi_url && caixaAlerta?.uazapi_token) {
      try {
        await fetch(
          `${String(caixaAlerta.uazapi_url).replace(/\/+$/, "")}/send/text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              token: caixaAlerta.uazapi_token,
            },
            body: JSON.stringify({ phone: NUMERO_ALERTA, message: mensagem }),
          },
        );
      } catch {
        // O retorno do monitor continua indicando a falha; nenhum segredo vai para log.
      }
    }
  }

  return json({
    ok: problemas.length === 0,
    problemas,
    checadas: caixas?.length ?? 0,
  });
});
