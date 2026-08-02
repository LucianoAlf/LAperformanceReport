// Edge Function: configurar-webhook-caixa
// Rota administrativa autenticada para rotacionar o segredo inbound de uma caixa UAZAPI.
// O segredo bruto existe somente em memoria durante a chamada; banco e resposta recebem hash/redacao.
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { provisionarWebhookUazapi } from "./contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function caixaIdValido(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo nao permitido" }, 405);
  }

  const token = bearerToken(req.headers.get("Authorization"));
  if (!token) return json({ error: "Nao autenticado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: "Configuracao de autenticacao indisponivel" }, 503);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ error: "Nao autenticado" }, 401);
  }

  const { data: usuario, error: usuarioError } = await userClient
    .from("usuarios")
    .select("id, perfil, ativo")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (
    usuarioError || !usuario || usuario.ativo !== true ||
    usuario.perfil !== "admin"
  ) {
    return json({ error: "Operacao restrita a administrador ativo" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalido" }, 400);
  }
  const caixaId = (body as { caixa_id?: unknown })?.caixa_id;
  if (!caixaIdValido(caixaId)) return json({ error: "caixa_id invalido" }, 400);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return json({ error: "Configuracao backend indisponivel" }, 503);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caixa, error: caixaError } = await adminClient
    .from("whatsapp_caixas")
    .select("id, nome, provedor, ativo, uazapi_url, uazapi_token")
    .eq("id", caixaId)
    .maybeSingle();
  if (caixaError || !caixa) return json({ error: "Caixa nao encontrada" }, 404);
  if (caixa.ativo !== true) return json({ error: "Caixa inativa" }, 409);
  if ((caixa.provedor || "uazapi") !== "uazapi") {
    return json({
      error: "Provisionamento automatico indisponivel para este provedor",
    }, 409);
  }
  if (!caixa.uazapi_url || !caixa.uazapi_token) {
    return json({ error: "Credencial UAZAPI ausente" }, 409);
  }

  const { data: secretState, error: secretStateError } = await adminClient
    .from("whatsapp_caixa_webhook_secrets")
    .select("versao")
    .eq("caixa_id", caixaId)
    .maybeSingle();
  if (secretStateError) {
    return json({ error: "Estado do segredo indisponivel" }, 503);
  }

  try {
    const result = await provisionarWebhookUazapi(
      {
        caixaId,
        providerBaseUrl: caixa.uazapi_url,
        providerToken: caixa.uazapi_token,
        inboundEndpoint: `${supabaseUrl}/functions/v1/webhook-whatsapp-inbox`,
      },
      {
        persistHash: async (secretHashSha256) => {
          const { error } = await adminClient
            .from("whatsapp_caixa_webhook_secrets")
            .upsert({
              caixa_id: caixaId,
              secret_hash_sha256: secretHashSha256,
              ativo: true,
              versao: Number(secretState?.versao ?? 0) + 1,
              rotacionado_em: new Date().toISOString(),
            }, { onConflict: "caixa_id" });
          if (error) throw new Error("hash_persistence_failed");
        },
      },
    );

    return json({
      success: true,
      provedor: "uazapi",
      enabled: result.enabled,
      provider_webhook_id: result.providerWebhookId,
      webhook_url_redigida: result.webhookUrlRedigida,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "provisioning_failed";
    if (code === "provider_webhooks_ambiguous") {
      return json({
        error:
          "Instancia possui webhooks ambiguos; auditoria manual obrigatoria",
      }, 409);
    }
    if (code === "provider_webhook_unexpected_target") {
      return json({
        error:
          "Webhook aponta para destino inesperado; auditoria manual obrigatoria",
      }, 409);
    }
    if (code === "hash_persistence_failed_manual_intervention") {
      return json({
        error: "Falha critica de persistencia; intervencao manual obrigatoria",
      }, 500);
    }
    if (code === "hash_persistence_failed_compensated") {
      return json({
        error: "Persistencia falhou e configuracao anterior foi restaurada",
      }, 503);
    }
    return json({ error: "Falha ao provisionar webhook" }, 502);
  }
});
