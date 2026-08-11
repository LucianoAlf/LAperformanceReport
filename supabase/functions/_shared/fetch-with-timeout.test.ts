/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import { assert, assertRejects } from "jsr:@std/assert@1";
import { runWithTimeout } from "./fetch-with-timeout.ts";

Deno.test("aborta a operacao quando o prazo da narrativa expira", async () => {
  let abortado = false;

  await assertRejects(
    () =>
      runWithTimeout(
        (signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              abortado = true;
              reject(new Error("operacao abortada"));
            }, { once: true });
          }),
        5,
      ),
    Error,
    "Tempo limite excedido",
  );

  assert(abortado, "a operacao deve receber o sinal de abort antes do fallback");
});

