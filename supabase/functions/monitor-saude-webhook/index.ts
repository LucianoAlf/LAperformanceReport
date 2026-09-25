// monitor-saude-webhook
// Chamado pelo pg_cron e autenticado no health do inbound por segredo dedicado.
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { autorizarEquipe } from "../_shared/equipeAuthorization.ts";
import {
  avaliarCoberturaWebhook,
  type CaixaWebhookMonitorada,
  inspecionarWebhookProvider,
  temWebhookEfetivoEsperado,
} from "./contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SYNC_ADMIN_TOKEN = Deno.env.get("SYNC_MATRICULAS_ADMIN_TOKEN")?.trim() ?? "";
const NUMERO_ALERTA = "5521966583325";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  // 25/09/2026: o endpoint era aberto — qualquer chamada disparava a inspeção dos
  // provedores e, havendo problema, um alerta no WhatsApp do admin. Agora exige
  // x-sync-token do cron, service_role ou usuario de equipe (admin/unidade).
  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const acesso = await autorizarEquipe(req, {
    syncAdminToken: SYNC_ADMIN_TOKEN,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    getUser: async (token) => {
      const { data, error } = await authClient.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    buscarUsuario: async (authUserId) => {
      const { data } = await authClient
        .from("usuarios")
        .select("perfil, ativo")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      return data;
    },
  });
  if (acesso.ok === false) return json({ ok: false, erro: acesso.erro }, acesso.status);

  const healthToken = Deno.env.get("WEBHOOK_HEALTH_TOKEN")?.trim() ?? "";
  if (!healthToken) {
    return json({ ok: false, code: "health_auth_unavailable" }, 503);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: caixas, error: caixasError } = await supabase
    .from("whatsapp_caixas")
    .select(
      "id, nome, provedor, ativo, uazapi_url, uazapi_token, waha_url, waha_session, waha_api_key, webhook_url",
    )
    .order("id");
  if (caixasError) return json({ ok: false, code: "boxes_unavailable" }, 503);

  const { data: hashes, error: hashesError } = await supabase
    .from("whatsapp_caixa_webhook_secrets")
    .select("caixa_id")
    .eq("ativo", true);
  if (hashesError) return json({ ok: false, code: "hashes_unavailable" }, 503);

  const caixasComHash = new Set(
    (hashes ?? []).map((row: { caixa_id: number }) => row.caixa_id),
  );
  const inboundEndpoint = `${SUPABASE_URL}/functions/v1/webhook-whatsapp-inbox`;

  const problemas: string[] = [];
  let webhooksEfetivos = 0;
  for (const row of caixas ?? []) {
    const caixa = row as CaixaWebhookMonitorada;
    const inspecao = await inspecionarWebhookProvider(
      caixa,
      inboundEndpoint,
    );
    const cobertura = avaliarCoberturaWebhook(
      caixa,
      inspecao,
      caixasComHash.has(caixa.id),
      inboundEndpoint,
    );
    for (const problema of cobertura) {
      problemas.push(
        `*${problema.caixaNome}* (caixa_id=${problema.caixaId}): ${problema.code}`,
      );
    }

    if (
      !temWebhookEfetivoEsperado(caixa, inspecao, inboundEndpoint) ||
      !caixasComHash.has(caixa.id)
    ) {
      continue;
    }
    webhooksEfetivos += 1;

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
      `Alerta: cobertura ou health do webhook de recebimento falhou.\n\n` +
      problemas.join("\n") +
      `\n\nMensagens podem nao estar chegando. Verifique a configuracao efetiva ` +
      `do provedor, o hash da caixa, WEBHOOK_HEALTH_TOKEN e o deploy do inbound.`;

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
    webhooks_efetivos: webhooksEfetivos,
  });
});
