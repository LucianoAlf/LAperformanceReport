/// <reference lib="deno.ns" />

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fetchJsonWithDeadline } from "./fetchJsonDeadline.ts";

Deno.test("o prazo cobre tambem a leitura do corpo JSON", async () => {
  const inicio = Date.now();

  await assertRejects(
    () => fetchJsonWithDeadline(
      "https://example.test/slow-body",
      {},
      {
        timeoutMs: 30,
        fetchImpl: async (_input, init) => {
          const signal = init?.signal as AbortSignal;
          return {
            ok: true,
            status: 200,
            json: () => new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => reject(new DOMException("aborted", "AbortError")),
                { once: true },
              );
            }),
          } as Response;
        },
      },
    ),
    Error,
    "Tempo limite da requisicao JSON excedido.",
  );

  assertEquals(Date.now() - inicio < 500, true);
});

Deno.test("429 pode repetir sem ultrapassar o mesmo prazo total", async () => {
  let tentativas = 0;
  const resultado = await fetchJsonWithDeadline(
    "https://example.test/retry",
    {},
    {
      timeoutMs: 500,
      maxRetries: 1,
      sleepImpl: () => Promise.resolve(),
      fetchImpl: () => {
        tentativas += 1;
        return Promise.resolve(new Response(
          tentativas === 1 ? JSON.stringify({ retry: true }) : JSON.stringify({ value: 42 }),
          {
            status: tentativas === 1 ? 429 : 200,
            headers: { "content-type": "application/json" },
          },
        ));
      },
    },
  );

  assertEquals(tentativas, 2);
  assertEquals(resultado, { ok: true, status: 200, payload: { value: 42 } });
});
