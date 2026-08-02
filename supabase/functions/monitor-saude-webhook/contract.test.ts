// deno-lint-ignore-file no-import-prefix require-await
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1";
import {
  avaliarCoberturaWebhook,
  type CaixaWebhookMonitorada,
  inspecionarWebhookProvider,
} from "./contract.ts";

const inboundEndpoint =
  "https://example.supabase.co/functions/v1/webhook-whatsapp-inbox";

function caixa(
  overrides: Partial<CaixaWebhookMonitorada> = {},
): CaixaWebhookMonitorada {
  return {
    id: 3,
    nome: "Lia - Sucesso do Aluno",
    provedor: "uazapi",
    ativo: true,
    uazapi_url: "https://uazapi.example.com",
    uazapi_token: "token-sintetico",
    waha_url: null,
    waha_session: null,
    waha_api_key: null,
    ...overrides,
  };
}

Deno.test("alerta quando o provedor tem webhook efetivo e o banco nao tem hash ativo", async () => {
  const inspecao = await inspecionarWebhookProvider(
    caixa(),
    inboundEndpoint,
    async () =>
      Response.json([{
        id: "hook-3",
        enabled: true,
        url: `${inboundEndpoint}?caixa_id=3`,
      }]),
  );

  assertEquals(
    avaliarCoberturaWebhook(caixa(), inspecao, false, inboundEndpoint),
    [{
      caixaId: 3,
      caixaNome: "Lia - Sucesso do Aluno",
      code: "provider_webhook_sem_hash",
    }],
  );
});

Deno.test("hash ativo cobre webhook efetivo", async () => {
  const inspecao = await inspecionarWebhookProvider(
    caixa(),
    inboundEndpoint,
    async () =>
      Response.json([{
        id: "hook-3",
        enabled: true,
        url: `${inboundEndpoint}?caixa_id=3&webhook_secret=redigido`,
      }]),
  );

  assertEquals(
    avaliarCoberturaWebhook(caixa(), inspecao, true, inboundEndpoint),
    [],
  );
});

Deno.test("hash ativo nao mascara URL do provedor sem query secret", async () => {
  const inspecao = await inspecionarWebhookProvider(
    caixa(),
    inboundEndpoint,
    async () =>
      Response.json([{
        id: "hook-3",
        enabled: true,
        url: `${inboundEndpoint}?caixa_id=3`,
      }]),
  );

  assertEquals(
    avaliarCoberturaWebhook(caixa(), inspecao, true, inboundEndpoint),
    [{
      caixaId: 3,
      caixaNome: "Lia - Sucesso do Aluno",
      code: "provider_webhook_sem_segredo",
    }],
  );
});

Deno.test("hash orfao alerta quando o webhook deixa de existir", async () => {
  const inspecao = await inspecionarWebhookProvider(
    caixa(),
    inboundEndpoint,
    async () => Response.json([]),
  );

  assertEquals(
    avaliarCoberturaWebhook(caixa(), inspecao, true, inboundEndpoint),
    [{
      caixaId: 3,
      caixaNome: "Lia - Sucesso do Aluno",
      code: "provider_webhook_ausente",
    }],
  );
});

Deno.test("caixas futuras desconectadas nao geram falso alerta de hash", async () => {
  const mila = caixa({ id: 1, nome: "Mila teste" });
  const milaInspecao = await inspecionarWebhookProvider(
    mila,
    inboundEndpoint,
    async () => new Response("unauthorized", { status: 401 }),
  );
  assertEquals(
    avaliarCoberturaWebhook(mila, milaInspecao, false, inboundEndpoint),
    [],
  );

  const sol = caixa({
    id: 2,
    nome: "Sol",
    provedor: "waha",
    uazapi_url: null,
    uazapi_token: null,
    waha_url: "https://waha.example.com",
    waha_session: "sol",
    waha_api_key: "chave-sintetica",
  });
  const solInspecao = await inspecionarWebhookProvider(
    sol,
    inboundEndpoint,
    async () => new Response("not found", { status: 404 }),
  );
  assertEquals(
    avaliarCoberturaWebhook(sol, solInspecao, false, inboundEndpoint),
    [],
  );
});

Deno.test("flag ativo nao substitui evidencia de webhook no provedor", async () => {
  const futura = caixa({ id: 1, nome: "Mila teste", ativo: false });
  const inspecao = await inspecionarWebhookProvider(
    futura,
    inboundEndpoint,
    async () =>
      Response.json([{
        id: "hook-futuro",
        enabled: true,
        url: `${inboundEndpoint}?caixa_id=1`,
      }]),
  );

  assertEquals(
    avaliarCoberturaWebhook(futura, inspecao, false, inboundEndpoint),
    [{
      caixaId: 1,
      caixaNome: "Mila teste",
      code: "provider_webhook_sem_hash",
    }],
  );
});

Deno.test("le configuracao de webhook da sessao WAHA", async () => {
  const sol = caixa({
    id: 2,
    nome: "Sol",
    provedor: "waha",
    uazapi_url: null,
    uazapi_token: null,
    waha_url: "https://waha.example.com/",
    waha_session: "sol",
    waha_api_key: "chave-sintetica",
  });
  let requestUrl = "";
  let apiKey = "";
  const inspecao = await inspecionarWebhookProvider(
    sol,
    inboundEndpoint,
    async (input, init) => {
      requestUrl = String(input);
      apiKey = String(new Headers(init?.headers).get("X-Api-Key"));
      return Response.json({
        name: "sol",
        status: "WORKING",
        config: {
          webhooks: [{
            url: `${inboundEndpoint}?caixa_id=2`,
            events: ["message"],
          }],
        },
      });
    },
  );

  assertEquals(requestUrl, "https://waha.example.com/api/sessions/sol");
  assertEquals(apiKey, "chave-sintetica");
  assertEquals(
    avaliarCoberturaWebhook(sol, inspecao, false, inboundEndpoint),
    [{
      caixaId: 2,
      caixaNome: "Sol",
      code: "provider_webhook_sem_hash",
    }],
  );
});

Deno.test("destino inesperado ou duplicado e alertado sem expor URL", async () => {
  const inspecao = await inspecionarWebhookProvider(
    caixa(),
    inboundEndpoint,
    async () =>
      Response.json([
        {
          id: "hook-staging",
          enabled: true,
          url:
            "https://staging.example.supabase.co/functions/v1/webhook-whatsapp-inbox?caixa_id=3",
        },
        {
          id: "hook-errado",
          enabled: true,
          url: `${inboundEndpoint}?caixa_id=2`,
        },
      ]),
  );

  assertEquals(
    avaliarCoberturaWebhook(caixa(), inspecao, false, inboundEndpoint),
    [{
      caixaId: 3,
      caixaNome: "Lia - Sucesso do Aluno",
      code: "provider_webhook_destino_inesperado",
    }],
  );
});
