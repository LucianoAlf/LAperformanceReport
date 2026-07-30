// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1";
import {
  classificarRespostaProvider,
  deveAbrirConversaReal,
  estadoPersistidoParaResultado,
  extrairProviderMessageId,
  providerSuportaChaveIdempotente,
  sanitizarErroProvider,
} from "./provider.ts";

Deno.test("extrai message id das formas conhecidas sem inventar identificador", () => {
  assertEquals(extrairProviderMessageId({ id: "uaz-1" }), "uaz-1");
  assertEquals(extrairProviderMessageId({ messageid: "uaz-2" }), "uaz-2");
  assertEquals(extrairProviderMessageId({ messageId: "waha-1" }), "waha-1");
  assertEquals(extrairProviderMessageId({ key: { id: "uaz-3" } }), "uaz-3");
  assertEquals(extrairProviderMessageId({ ok: true }), null);
});

Deno.test("2xx com message id e sucesso confirmado", () => {
  assertEquals(
    classificarRespostaProvider(200, { id: "msg-1" }),
    { tipo: "sucesso", providerMessageId: "msg-1" },
  );
});

Deno.test("4xx ou erro explicito em 2xx e falha conhecida sanitizada", () => {
  assertEquals(
    classificarRespostaProvider(400, {
      error: "telefone invalido 5521999990000",
    }),
    { tipo: "falha_conhecida", statusHttp: 400 },
  );
  assertEquals(
    classificarRespostaProvider(200, { error: "sessao desconectada" }),
    { tipo: "falha_conhecida", statusHttp: 200 },
  );
  assertEquals(
    sanitizarErroProvider(400),
    "Falha conhecida no provedor (HTTP 400)",
  );
  assertMatch(sanitizarErroProvider(400), /HTTP 400/);
});

Deno.test("todo 5xx fica incerto mesmo quando o payload declara error ou erro", () => {
  for (
    const [status, payload] of [
      [500, { error: "internal error" }],
      [503, { erro: "indisponivel" }],
      [504, { error: true }],
    ] as const
  ) {
    assertEquals(
      classificarRespostaProvider(status, payload),
      { tipo: "incerto" },
    );
  }
});

Deno.test("2xx sem comprovante fica incerto, nunca falha retryable", () => {
  assertEquals(
    classificarRespostaProvider(202, { queued: true }),
    { tipo: "incerto" },
  );
  assertEquals(estadoPersistidoParaResultado("incerto"), "incerto");
  assertEquals(
    estadoPersistidoParaResultado("falha_conhecida"),
    "falhou",
  );
  assertEquals(estadoPersistidoParaResultado("sucesso"), "enviado");
});

Deno.test("fetch do provider expira e faz uma unica tentativa", async () => {
  const modulo = await import("./provider.ts") as unknown as {
    fetchProviderComTimeout?: (
      input: string,
      init: RequestInit,
      opcoes: {
        timeoutMs: number;
        fetchImpl: typeof fetch;
      },
    ) => Promise<Response>;
  };
  assertEquals(typeof modulo.fetchProviderComTimeout, "function");

  let chamadas = 0;
  const fetchPendente = ((
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    chamadas += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason ?? new DOMException("AbortError")),
        { once: true },
      );
    });
  }) as typeof fetch;

  await assertRejects(
    () =>
      modulo.fetchProviderComTimeout!(
        "https://provider.invalid/send",
        { method: "POST" },
        { timeoutMs: 5, fetchImpl: fetchPendente },
      ),
    DOMException,
  );
  assertEquals(chamadas, 1);
});

Deno.test("excecao de transporte propaga sem retry", async () => {
  const modulo = await import("./provider.ts") as unknown as {
    fetchProviderComTimeout?: (
      input: string,
      init: RequestInit,
      opcoes: {
        timeoutMs: number;
        fetchImpl: typeof fetch;
      },
    ) => Promise<Response>;
  };
  assertEquals(typeof modulo.fetchProviderComTimeout, "function");

  let chamadas = 0;
  const fetchComErro = (() => {
    chamadas += 1;
    return Promise.reject(new TypeError("network down"));
  }) as typeof fetch;

  await assertRejects(
    () =>
      modulo.fetchProviderComTimeout!(
        "https://provider.invalid/send",
        { method: "POST" },
        { timeoutMs: 50, fetchImpl: fetchComErro },
      ),
    TypeError,
    "network down",
  );
  assertEquals(chamadas, 1);
});

Deno.test("WAHA e UAZAPI nao prometem idempotencia de transporte", () => {
  assertEquals(providerSuportaChaveIdempotente("uazapi"), false);
  assertEquals(providerSuportaChaveIdempotente("waha"), false);
});

Deno.test("conversa real abre apenas depois de sucesso produtivo", () => {
  assertEquals(deveAbrirConversaReal(false, "enviado"), true);
  assertEquals(deveAbrirConversaReal(true, "enviado"), false);
  assertEquals(deveAbrirConversaReal(false, "incerto"), false);
  assertEquals(deveAbrirConversaReal(false, "falhou"), false);
});
