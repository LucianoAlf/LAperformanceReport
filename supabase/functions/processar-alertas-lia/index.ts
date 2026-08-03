import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  CAIXA_LIA_ID,
  extrairServiceRoleToken,
  processarUmAlerta,
  validarPedidoDispatcher,
  type CaixaLia,
  type ClaimAlerta,
  type CodigoFalhaProvider,
  type DispatcherAdapters,
} from "./dispatcher.ts";

const PROJECT_REF = "ouqwbbermlzqqvtqwlul";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "metodo_nao_permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl) {
    return json({ error: "configuracao_backend_indisponivel" }, 503);
  }

  // verify_jwt=true valida a assinatura antes de o request chegar ao handler.
  // Aqui restringimos o JWT ja validado ao service_role deste projeto.
  const serviceRoleToken = extrairServiceRoleToken(
    req.headers.get("Authorization"),
    PROJECT_REF,
  );
  if (!serviceRoleToken) {
    return json({ error: "service_role_required" }, 403);
  }

  let pedido: { alertaId: string | null };
  try {
    pedido = validarPedidoDispatcher(await req.json());
  } catch {
    return json({ error: "pedido_invalido" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleToken, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${serviceRoleToken}` } },
  });

  const adapters: DispatcherAdapters = {
    async claim(workerId, alertaId) {
      const { data, error } = await supabase.rpc("claim_lia_alerta_privado", {
        p_worker_id: workerId,
        p_alerta_id: alertaId,
      });
      if (error) throw new Error("claim_indisponivel");
      const linha = Array.isArray(data) ? data[0] : null;
      return linha ? linha as ClaimAlerta : null;
    },

    async buscarCaixaExata(caixaId) {
      const { data, error } = await supabase
        .from("whatsapp_caixas")
        .select("id, nome, ativo, provedor, uazapi_url, uazapi_token")
        .eq("id", CAIXA_LIA_ID)
        .eq("id", caixaId)
        .maybeSingle();
      if (error) throw new Error("caixa_indisponivel");
      return data ? data as CaixaLia : null;
    },

    fetchProvider(url, init) {
      return fetch(url, init);
    },

    async concluir(alertaId, claimToken, messageId) {
      const { data, error } = await supabase.rpc(
        "concluir_lia_alerta_privado",
        {
          p_alerta_id: alertaId,
          p_claim_token: claimToken,
          p_provider_message_id: messageId,
        },
      );
      if (error) throw new Error("conclusao_indisponivel");
      return data === true;
    },

    async falhar(alertaId, claimToken, codigo, ambiguo) {
      const { data, error } = await supabase.rpc("falhar_lia_alerta_privado", {
        p_alerta_id: alertaId,
        p_claim_token: claimToken,
        p_erro_codigo: codigo satisfies CodigoFalhaProvider,
        p_resultado_ambiguo: ambiguo,
      });
      if (error) throw new Error("falha_indisponivel");
      return data === true;
    },

    log(evento) {
      console.log(JSON.stringify(evento));
    },

    agora() {
      return Date.now();
    },
  };

  try {
    return json(await processarUmAlerta(adapters, pedido.alertaId));
  } catch {
    console.error(JSON.stringify({
      evento: "lia_alerta_dispatcher",
      status: "erro",
      erro_codigo: "dispatcher_interno",
    }));
    return json({ error: "dispatcher_interno" }, 500);
  }
});
