// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1";
import {
  persistirOuConfirmarResultadoEnviado,
  prepararCapturaRespostaBestEffort,
} from "./flow.ts";

Deno.test("captura de resposta preparada retorna sucesso explicito", async () => {
  assertEquals(
    await prepararCapturaRespostaBestEffort(() =>
      Promise.resolve({ error: null })
    ),
    { capturaRespostaPreparada: true },
  );
});

Deno.test("erro retornado no upsert vira warning sem falhar o envio", async () => {
  assertEquals(
    await prepararCapturaRespostaBestEffort(() =>
      Promise.resolve({ error: { message: "constraint" } })
    ),
    {
      capturaRespostaPreparada: false,
      warning: "Mensagem enviada, mas a captura da resposta nao foi preparada",
    },
  );
});

Deno.test("excecao no upsert vira warning sem falhar o envio", async () => {
  assertEquals(
    await prepararCapturaRespostaBestEffort(() =>
      Promise.reject(new TypeError("network"))
    ),
    {
      capturaRespostaPreparada: false,
      warning: "Mensagem enviada, mas a captura da resposta nao foi preparada",
    },
  );
});

Deno.test("resposta perdida do registro consulta o banco e recupera sucesso", async () => {
  let registros = 0;
  let confirmacoes = 0;
  const confirmado = await persistirOuConfirmarResultadoEnviado({
    registrar: () => {
      registros += 1;
      return Promise.reject(new TypeError("resposta perdida"));
    },
    confirmarPersistido: () => {
      confirmacoes += 1;
      return Promise.resolve(true);
    },
  });

  assertEquals(confirmado, true);
  assertEquals(registros, 1);
  assertEquals(confirmacoes, 1);
});

Deno.test("divergencia na releitura permanece incerta", async () => {
  let confirmacoes = 0;
  const confirmado = await persistirOuConfirmarResultadoEnviado({
    registrar: () => Promise.reject(new TypeError("resposta perdida")),
    confirmarPersistido: () => {
      confirmacoes += 1;
      return Promise.resolve(false);
    },
  });

  assertEquals(confirmado, false);
  assertEquals(confirmacoes, 1);
});

Deno.test("registro confirmado nao executa releitura desnecessaria", async () => {
  let confirmacoes = 0;
  const confirmado = await persistirOuConfirmarResultadoEnviado({
    registrar: () => Promise.resolve(),
    confirmarPersistido: () => {
      confirmacoes += 1;
      return Promise.resolve(true);
    },
  });

  assertEquals(confirmado, true);
  assertEquals(confirmacoes, 0);
});
