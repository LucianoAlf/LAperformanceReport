// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { autenticarWebhookInbound } from "./auth.ts";

const endpoint = "https://example.supabase.co/functions/v1/webhook-whatsapp-inbox";

function request(
  query = "",
  headers: Record<string, string> = {},
): Request {
  return new Request(`${endpoint}${query}`, {
    method: "POST",
    headers,
    body: "{}",
  });
}

function dependencies(
  validarHash: (caixaId: number, hash: string) => Promise<boolean> = () => Promise.resolve(true),
  healthSecret = "health-exclusivo",
  enforceProviderSecret = true,
) {
  return { validarHash, healthSecret, enforceProviderSecret };
}

Deno.test("modo compativel preserva inbound sem segredo ate provisionar a caixa", async () => {
  let validacoes = 0;
  const req = request("?caixa_id=3");

  assertEquals(
    await autenticarWebhookInbound(
      req,
      new URL(req.url),
      dependencies(() => {
        validacoes += 1;
        return Promise.resolve(false);
      }, "", false),
    ),
    { ok: true, kind: "provider", caixaId: 3 },
  );
  assertEquals(validacoes, 0);

  const health = request("?_health=1");
  assertEquals(
    await autenticarWebhookInbound(
      health,
      new URL(health.url),
      dependencies(undefined, "", false),
    ),
    { ok: true, kind: "health" },
  );
});

Deno.test("rejeita caixa_id ausente ou invalido com 400", async () => {
  for (const query of [
    "?webhook_secret=segredo",
    "?caixa_id=0&webhook_secret=segredo",
    "?caixa_id=-1&webhook_secret=segredo",
    "?caixa_id=3x&webhook_secret=segredo",
    "?caixa_id=1.5&webhook_secret=segredo",
  ]) {
    const req = request(query);
    assertEquals(
      await autenticarWebhookInbound(req, new URL(req.url), dependencies()),
      { ok: false, status: 400, code: "invalid_caixa_id" },
    );
  }
});

Deno.test("rejeita segredo ausente com 401", async () => {
  const req = request("?caixa_id=3");
  assertEquals(
    await autenticarWebhookInbound(req, new URL(req.url), dependencies()),
    { ok: false, status: 401, code: "missing_secret" },
  );
});

Deno.test("rejeita hash divergente ou pertencente a outra caixa com 403", async () => {
  const hashesPorCaixa = new Map<number, string>();
  const validarHash = (caixaId: number, hash: string) =>
    Promise.resolve(hashesPorCaixa.get(caixaId) === hash);

  const reqCaixa2 = request("?caixa_id=2&webhook_secret=segredo-da-caixa-2");
  let hashCaixa2 = "";
  await autenticarWebhookInbound(
    reqCaixa2,
    new URL(reqCaixa2.url),
    dependencies((_caixaId, hash) => {
      hashCaixa2 = hash;
      return Promise.resolve(true);
    }),
  );
  hashesPorCaixa.set(2, hashCaixa2);

  const divergente = request("?caixa_id=2&webhook_secret=segredo-incorreto");
  assertEquals(
    await autenticarWebhookInbound(
      divergente,
      new URL(divergente.url),
      dependencies(validarHash),
    ),
    { ok: false, status: 403, code: "invalid_secret" },
  );

  const outraCaixa = request("?caixa_id=3&webhook_secret=segredo-da-caixa-2");
  assertEquals(
    await autenticarWebhookInbound(
      outraCaixa,
      new URL(outraCaixa.url),
      dependencies(validarHash),
    ),
    { ok: false, status: 403, code: "invalid_secret" },
  );
});

Deno.test("segredo valido devolve somente contexto autenticado e envia apenas SHA-256 ao banco", async () => {
  const rawSecret = "segredo-super-secreto-da-caixa-3";
  let recebido: { caixaId: number; hash: string } | null = null;
  const req = request(`?caixa_id=3&webhook_secret=${rawSecret}`);

  const result = await autenticarWebhookInbound(
    req,
    new URL(req.url),
    dependencies((caixaId, hash) => {
      recebido = { caixaId, hash };
      return Promise.resolve(true);
    }),
  );

  assertEquals(result, { ok: true, kind: "provider", caixaId: 3 });
  assertEquals(recebido?.caixaId, 3);
  assertMatch(recebido?.hash ?? "", /^[0-9a-f]{64}$/);
  assertEquals(JSON.stringify(result).includes(rawSecret), false);
  assertEquals(JSON.stringify(recebido).includes(rawSecret), false);
});

Deno.test("header tem prioridade sobre segredo da query, inclusive se estiver vazio", async () => {
  const chamadas: string[] = [];
  const validarHash = (_caixaId: number, hash: string) => {
    chamadas.push(hash);
    return Promise.resolve(false);
  };
  const req = request(
    "?caixa_id=3&webhook_secret=segredo-valido-na-query",
    { "x-webhook-secret": "segredo-invalido-no-header" },
  );

  assertEquals(
    await autenticarWebhookInbound(req, new URL(req.url), dependencies(validarHash)),
    { ok: false, status: 403, code: "invalid_secret" },
  );
  assertEquals(chamadas.length, 1);

  const vazio = request(
    "?caixa_id=3&webhook_secret=segredo-valido-na-query",
    { "x-webhook-secret": "" },
  );
  assertEquals(
    await autenticarWebhookInbound(vazio, new URL(vazio.url), dependencies()),
    { ok: false, status: 401, code: "missing_secret" },
  );
});

Deno.test("falha do validador fecha o acesso sem vazar detalhes", async () => {
  const rawSecret = "nao-vazar-este-segredo";
  const req = request(`?caixa_id=3&webhook_secret=${rawSecret}`);
  const result = await autenticarWebhookInbound(
    req,
    new URL(req.url),
    dependencies(() => Promise.reject(
      new Error(`banco indisponivel: ${rawSecret}`),
    )),
  );

  assertEquals(result, { ok: false, status: 503, code: "auth_unavailable" });
  assertEquals(JSON.stringify(result).includes(rawSecret), false);
});

Deno.test("health exige x-health-secret e nao aceita segredo de caixa", async () => {
  const semHeader = request("?_health=1");
  assertEquals(
    await autenticarWebhookInbound(
      semHeader,
      new URL(semHeader.url),
      dependencies(),
    ),
    { ok: false, status: 401, code: "missing_health_secret" },
  );

  const segredoCaixa = request("?_health=1", {
    "x-health-secret": "segredo-da-caixa-3",
  });
  assertEquals(
    await autenticarWebhookInbound(
      segredoCaixa,
      new URL(segredoCaixa.url),
      dependencies(),
    ),
    { ok: false, status: 403, code: "invalid_health_secret" },
  );

  const health = request("?_health=1", {
    "x-health-secret": "health-exclusivo",
  });
  assertEquals(
    await autenticarWebhookInbound(health, new URL(health.url), dependencies()),
    { ok: true, kind: "health" },
  );
});

Deno.test("health token nao autentica mensagem do provedor", async () => {
  let chamadas = 0;
  const req = request("?caixa_id=3", {
    "x-webhook-secret": "health-exclusivo",
  });
  assertEquals(
    await autenticarWebhookInbound(
      req,
      new URL(req.url),
      dependencies(() => {
        chamadas += 1;
        return Promise.resolve(false);
      }),
    ),
    { ok: false, status: 403, code: "invalid_secret" },
  );
  assertEquals(chamadas, 1);
});

Deno.test("health falha fechado quando o segredo do servidor nao esta configurado", async () => {
  const req = request("?_health=1", {
    "x-health-secret": "qualquer-valor",
  });
  assertEquals(
    await autenticarWebhookInbound(
      req,
      new URL(req.url),
      dependencies(undefined, ""),
    ),
    { ok: false, status: 503, code: "health_auth_unavailable" },
  );
});
