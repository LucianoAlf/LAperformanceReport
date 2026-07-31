/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { buscarPaginaAulasEmusys, EmusysApiError } from "./emusys-aulas.ts";

async function comFetchMock<T>(
  response: () => Response | Promise<Response>,
  callback: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(response())) as typeof fetch;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("buscarPaginaAulasEmusys devolve pagina tipada valida", async () => {
  const result = await comFetchMock(
    () =>
      Response.json({
        items: [{
          id: 1,
          categoria: "experimental",
          data_hora_inicio: "2026-07-30 20:00:00",
          alunos: [],
        }],
        paginacao: { tem_mais: false, proximo_cursor: null },
      }),
    () =>
      buscarPaginaAulasEmusys({
        token: "token-teste",
        dataInicio: "2026-07-30",
        dataFim: "2026-07-30",
      }),
  );

  assertEquals(result.items[0].id, 1);
  assertEquals(result.paginacao, {
    tem_mais: false,
    proximo_cursor: null,
  });
});

Deno.test("buscarPaginaAulasEmusys preserva EmusysApiError e Retry-After", async () => {
  const error = await assertRejects(
    () =>
      comFetchMock(
        () =>
          new Response("limite", {
            status: 429,
            headers: { "Retry-After": "30" },
          }),
        () =>
          buscarPaginaAulasEmusys({
            token: "token-teste",
            dataInicio: "2026-07-30",
            dataFim: "2026-07-30",
          }),
      ),
    EmusysApiError,
    "429",
  );

  assertEquals(error.status, 429);
  assertEquals(error.retryAfter, "30");
});

Deno.test("buscarPaginaAulasEmusys diferencia JSON invalido", async () => {
  await assertRejects(
    () =>
      comFetchMock(
        () =>
          new Response("{", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        () =>
          buscarPaginaAulasEmusys({
            token: "token-teste",
            dataInicio: "2026-07-30",
            dataFim: "2026-07-30",
          }),
      ),
    Error,
    "EMUSYS_AULAS_JSON_INVALIDO",
  );
});

Deno.test("buscarPaginaAulasEmusys rejeita payload estruturalmente invalido", async () => {
  const payloadsInvalidos = [
    { items: {}, paginacao: { tem_mais: false } },
    { items: [null], paginacao: { tem_mais: false } },
    { items: [], paginacao: null },
    { items: [], paginacao: { tem_mais: "false" } },
  ];

  for (const payload of payloadsInvalidos) {
    await assertRejects(
      () =>
        comFetchMock(
          () => Response.json(payload),
          () =>
            buscarPaginaAulasEmusys({
              token: "token-teste",
              dataInicio: "2026-07-30",
              dataFim: "2026-07-30",
            }),
        ),
      Error,
      "EMUSYS_AULAS_PAYLOAD_INVALIDO",
    );
  }
});
