// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1";
import {
  deveProcessarRespostaEvasao,
  deveIgnorarEcoAlertaPrivadoLia,
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

Deno.test("ignora somente eco fromMe da caixa 3 com provider ID exato na outbox", async () => {
  const consultados: string[] = [];
  const ignorar = await deveIgnorarEcoAlertaPrivadoLia({
    caixaId: 3,
    fromMe: true,
    providerMessageId: "3EB-ALERTA-EXATO",
    existeNaOutbox: (providerMessageId) => {
      consultados.push(providerMessageId);
      return Promise.resolve(providerMessageId === "3EB-ALERTA-EXATO");
    },
  });

  assertEquals(ignorar, true);
  assertEquals(consultados, ["3EB-ALERTA-EXATO"]);
});

Deno.test("mensagem real de responsavel nunca e filtrada mesmo com ID na outbox", async () => {
  let consultas = 0;
  const ignorar = await deveIgnorarEcoAlertaPrivadoLia({
    caixaId: 3,
    fromMe: false,
    providerMessageId: "3EB-ALERTA-EXATO",
    existeNaOutbox: () => {
      consultas += 1;
      return Promise.resolve(true);
    },
  });

  assertEquals(ignorar, false);
  assertEquals(consultas, 0);
});

Deno.test("saida manual da Jessica com ID desconhecido continua na inbox", async () => {
  const ignorar = await deveIgnorarEcoAlertaPrivadoLia({
    caixaId: 3,
    fromMe: true,
    providerMessageId: "3EB-SAIDA-MANUAL",
    existeNaOutbox: () => Promise.resolve(false),
  });

  assertEquals(ignorar, false);
});

Deno.test("fromMe isolado, outra caixa e ID ausente nunca bastam para filtrar", async () => {
  let consultas = 0;
  const existeNaOutbox = () => {
    consultas += 1;
    return Promise.resolve(true);
  };

  assertEquals(await deveIgnorarEcoAlertaPrivadoLia({
    caixaId: 3,
    fromMe: true,
    providerMessageId: null,
    existeNaOutbox,
  }), false);
  assertEquals(await deveIgnorarEcoAlertaPrivadoLia({
    caixaId: 2,
    fromMe: true,
    providerMessageId: "3EB-ALERTA-EXATO",
    existeNaOutbox,
  }), false);
  assertEquals(consultas, 0);
});

Deno.test("falha da consulta abre o fluxo normal para nao perder familia", async () => {
  const ignorar = await deveIgnorarEcoAlertaPrivadoLia({
    caixaId: 3,
    fromMe: true,
    providerMessageId: "3EB-ALERTA-EXATO",
    existeNaOutbox: () => Promise.reject(new Error("banco indisponivel")),
  });

  assertEquals(ignorar, false);
});
