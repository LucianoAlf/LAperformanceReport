/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { resolverPublicoPesquisa } from "./publico.ts";

const HOJE = new Date("2026-08-01T12:00:00.000Z");

Deno.test("menor usa responsável", () => {
  assertEquals(
    resolverPublicoPesquisa("2010-08-02", HOJE),
    "responsavel",
  );
});

Deno.test("quem completa 18 anos na data usa direto", () => {
  assertEquals(resolverPublicoPesquisa("2008-08-01", HOJE), "direto");
});

Deno.test("quem ainda não completou 18 anos usa responsável", () => {
  assertEquals(
    resolverPublicoPesquisa("2008-08-02", HOJE),
    "responsavel",
  );
});

Deno.test("data ausente bloqueia", () => {
  assertThrows(
    () => resolverPublicoPesquisa(null, HOJE),
    Error,
    "DATA_NASCIMENTO_AUSENTE",
  );
});

Deno.test("data de calendário inválida bloqueia", () => {
  assertThrows(
    () => resolverPublicoPesquisa("2026-02-31", HOJE),
    Error,
    "DATA_NASCIMENTO_INVALIDA",
  );
});
