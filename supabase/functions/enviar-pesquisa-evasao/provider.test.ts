// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertMatch } from "jsr:@std/assert@1";
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

Deno.test("4xx ou erro explicito e falha conhecida sanitizada", () => {
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

Deno.test("5xx e 2xx sem comprovante ficam incertos, nunca falha retryable", () => {
  assertEquals(
    classificarRespostaProvider(503, { message: "upstream timeout" }),
    { tipo: "incerto" },
  );
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
