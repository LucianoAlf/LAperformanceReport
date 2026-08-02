// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
} from "jsr:@std/assert@1";
import {
  criarMaterialSegredoWebhook,
  provisionarWebhookUazapi,
} from "./contract.ts";

const endpoint =
  "https://example.supabase.co/functions/v1/webhook-whatsapp-inbox";

Deno.test("gera 32 bytes aleatorios, persiste SHA-256 e expoe somente URL redigida", async () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const material = await criarMaterialSegredoWebhook(endpoint, 3, () => bytes);

  assertEquals(material.secretBytes, 32);
  assertMatch(material.secretHashSha256, /^[0-9a-f]{64}$/);
  assertMatch(material.webhookUrl, /caixa_id=3&webhook_secret=[^&]+$/);
  const expectedDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material.rawSecret),
  );
  const expectedHash = Array.from(new Uint8Array(expectedDigest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  assertEquals(material.secretHashSha256, expectedHash);
  assertEquals(
    material.webhookUrlRedigida,
    `${endpoint}?caixa_id=3&webhook_secret=[REDACTED]`,
  );
  assert(!material.webhookUrlRedigida.includes(material.rawSecret));
  assert(!material.secretHashSha256.includes(material.rawSecret));
});

Deno.test("atualiza provider antes do hash com eventos e eco administrativo preservados", async () => {
  const calls: string[] = [];
  const providerBodies: Record<string, unknown>[] = [];
  let persistedHash = "";

  const result = await provisionarWebhookUazapi(
    {
      caixaId: 3,
      providerBaseUrl: "https://uazapi.example.com/",
      providerToken: "token-sintetico",
      inboundEndpoint: endpoint,
    },
    {
      randomBytes: () => new Uint8Array(32).fill(7),
      fetch: async (_input, init) => {
        const method = init?.method ?? "GET";
        calls.push(`provider:${method}`);
        if (method === "GET") {
          return Response.json([{
            id: "hook-3",
            enabled: true,
            url: `${endpoint}?caixa_id=3`,
            events: ["messages", "messages_update"],
            excludeMessages: [],
          }]);
        }

        providerBodies.push(JSON.parse(String(init?.body)));
        return Response.json([{ id: "hook-3", enabled: true }]);
      },
      persistHash: async (hash) => {
        calls.push("database:hash");
        persistedHash = hash;
      },
    },
  );

  assertEquals(calls, ["provider:GET", "provider:POST", "database:hash"]);
  assertEquals(providerBodies.length, 1);
  assertEquals(providerBodies[0].action, "update");
  assertEquals(providerBodies[0].id, "hook-3");
  assertEquals(providerBodies[0].events, ["messages", "messages_update"]);
  assertEquals(providerBodies[0].excludeMessages, []);
  assertEquals(providerBodies[0].addUrlEvents, false);
  assertEquals(providerBodies[0].addUrlTypesMessages, false);
  assertMatch(persistedHash, /^[0-9a-f]{64}$/);
  assertEquals(Object.keys(result).sort(), [
    "enabled",
    "providerWebhookId",
    "webhookUrlRedigida",
  ]);
  assertEquals(
    result.webhookUrlRedigida,
    `${endpoint}?caixa_id=3&webhook_secret=[REDACTED]`,
  );
  assert(!JSON.stringify(result).includes("BwcHBwcH"));
});

Deno.test("recusa configuracao ambigua sem alterar provider ou banco", async () => {
  let writes = 0;
  let persists = 0;

  await assertRejects(
    () =>
      provisionarWebhookUazapi(
        {
          caixaId: 3,
          providerBaseUrl: "https://uazapi.example.com",
          providerToken: "token-sintetico",
          inboundEndpoint: endpoint,
        },
        {
          randomBytes: () => new Uint8Array(32).fill(9),
          fetch: async (_input, init) => {
            if ((init?.method ?? "GET") !== "GET") writes += 1;
            return Response.json([
              { id: "hook-a", url: "https://old.example/a" },
              { id: "hook-b", url: "https://old.example/b" },
            ]);
          },
          persistHash: async () => {
            persists += 1;
          },
        },
      ),
    Error,
    "provider_webhooks_ambiguous",
  );

  assertEquals(writes, 0);
  assertEquals(persists, 0);
});

Deno.test("recusa webhook unico que aponta para outro ambiente", async () => {
  let writes = 0;
  await assertRejects(
    () =>
      provisionarWebhookUazapi(
        {
          caixaId: 3,
          providerBaseUrl: "https://uazapi.example.com",
          providerToken: "token-sintetico",
          inboundEndpoint: endpoint,
        },
        {
          randomBytes: () => new Uint8Array(32).fill(10),
          fetch: async (_input, init) => {
            if ((init?.method ?? "GET") !== "GET") writes += 1;
            return Response.json([{
              id: "hook-staging",
              url:
                "https://staging.example.supabase.co/functions/v1/webhook-whatsapp-inbox?caixa_id=3",
            }]);
          },
          persistHash: () => Promise.resolve(),
        },
      ),
    Error,
    "provider_webhook_unexpected_target",
  );
  assertEquals(writes, 0);
});

Deno.test("restaura configuracao anterior quando persistencia do hash falha", async () => {
  const providerBodies: Record<string, unknown>[] = [];
  let postCount = 0;

  await assertRejects(
    () =>
      provisionarWebhookUazapi(
        {
          caixaId: 3,
          providerBaseUrl: "https://uazapi.example.com",
          providerToken: "token-sintetico",
          inboundEndpoint: endpoint,
        },
        {
          randomBytes: () => new Uint8Array(32).fill(11),
          fetch: async (_input, init) => {
            if ((init?.method ?? "GET") === "GET") {
              return Response.json([{
                id: "hook-3",
                enabled: false,
                url: `${endpoint}?caixa_id=3`,
                events: ["messages"],
                excludeMessages: ["isGroupYes"],
                addUrlEvents: false,
                addUrlTypesMessages: false,
              }]);
            }

            postCount += 1;
            providerBodies.push(JSON.parse(String(init?.body)));
            return Response.json([{ id: "hook-3" }]);
          },
          persistHash: () => Promise.reject(new Error("db indisponivel")),
        },
      ),
    Error,
    "hash_persistence_failed_compensated",
  );

  assertEquals(postCount, 2);
  assertMatch(String(providerBodies[0].url), /webhook_secret=/);
  assertEquals(providerBodies[1], {
    action: "update",
    id: "hook-3",
    enabled: false,
    url: `${endpoint}?caixa_id=3`,
    events: ["messages"],
    excludeMessages: ["isGroupYes"],
    addUrlEvents: false,
    addUrlTypesMessages: false,
  });
});

Deno.test("remove webhook recem-criado quando o primeiro hash nao persiste", async () => {
  const providerBodies: Record<string, unknown>[] = [];
  let desiredUrl = "";

  await assertRejects(
    () =>
      provisionarWebhookUazapi(
        {
          caixaId: 4,
          providerBaseUrl: "https://uazapi.example.com",
          providerToken: "token-sintetico",
          inboundEndpoint: endpoint,
        },
        {
          randomBytes: () => new Uint8Array(32).fill(12),
          fetch: async (_input, init) => {
            if ((init?.method ?? "GET") === "GET") return Response.json([]);
            const body = JSON.parse(String(init?.body));
            providerBodies.push(body);
            if (body.action === "add") {
              desiredUrl = body.url;
              return Response.json([{ id: "hook-new", url: body.url }]);
            }
            return Response.json([]);
          },
          persistHash: () => Promise.reject(new Error("db indisponivel")),
        },
      ),
    Error,
    "hash_persistence_failed_compensated",
  );

  assertMatch(desiredUrl, /caixa_id=4&webhook_secret=/);
  assertEquals(providerBodies[0].action, "add");
  assertEquals(providerBodies[1], { action: "delete", id: "hook-new" });
});
