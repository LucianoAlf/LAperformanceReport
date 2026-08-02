// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1";
import {
  deveProcessarRespostaEvasao,
  encaminharPesquisaPrimeiraAula,
} from "./routing.ts";

Deno.test("encaminha buttonOrListid exatamente uma vez antes dos demais fluxos", async () => {
  const invocacoes: Array<{ nome: string; body: unknown }> = [];
  const diagnosticos: string[] = [];
  const payload = { message: { buttonOrListid: "amei" } };

  const resultado = await encaminharPesquisaPrimeiraAula({
    payload,
    mensagem: { buttonOrListid: "amei" },
    invocar: (nome, body) => {
      invocacoes.push({ nome, body });
      return Promise.resolve({ error: null });
    },
    diagnosticar: (resultado) => diagnosticos.push(resultado),
  });

  assertEquals(resultado, { handled: true, processado: true });
  assertEquals(invocacoes, [{
    nome: "processar-resposta-pesquisa",
    body: payload,
  }]);
  assertEquals(diagnosticos, ["accepted"]);
});

Deno.test("falha do processador gera diagnostico e nao interrompe a inbox", async () => {
  const diagnosticos: string[] = [];

  const resultado = await encaminharPesquisaPrimeiraAula({
    payload: { message: { buttonOrListid: "amei" } },
    mensagem: { buttonOrListid: "amei" },
    invocar: () => Promise.resolve({ error: new Error("falha interna") }),
    diagnosticar: (estado) => diagnosticos.push(estado),
  });

  assertEquals(resultado, { handled: true, processado: false });
  assertEquals(diagnosticos, ["error"]);
});

Deno.test("mensagem sem buttonOrListid nao chama processador", async () => {
  let invocacoes = 0;

  const resultado = await encaminharPesquisaPrimeiraAula({
    payload: { message: { text: "oi" } },
    mensagem: {},
    invocar: () => {
      invocacoes += 1;
      return Promise.resolve({ error: null });
    },
    diagnosticar: () => undefined,
  });

  assertEquals(resultado, { handled: false, processado: false });
  assertEquals(invocacoes, 0);
});

Deno.test("botao de primeira aula nunca entra no fluxo de resposta de evasao", () => {
  assertEquals(deveProcessarRespostaEvasao({ buttonOrListid: "amei" }), false);
  assertEquals(deveProcessarRespostaEvasao({}), true);
});
