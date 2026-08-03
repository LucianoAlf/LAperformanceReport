import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  autorizarServiceRole,
  CAIXA_LIA_ID,
  processarUmAlerta,
  validarPedidoDispatcher,
  type CaixaLia,
  type ClaimAlerta,
  type CodigoFalhaProvider,
  type DispatcherAdapters,
} from "./dispatcher.ts";

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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "configuracao_backend_indisponivel" }, 503);
  }

  if (!autorizarServiceRole(req.headers.get("Authorization"), serviceRoleKey)) {
    return json({ error: "service_role_required" }, 403);
  }

  let pedido: { alertaId: string | null };
  try {
    pedido = validarPedidoDispatcher(await req.json());
  } catch {
    return json({ error: "pedido_invalido" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
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
