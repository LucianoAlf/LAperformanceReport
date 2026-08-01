// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import {
  alunoComPreposicao,
  assinaturaComArtigo,
  resolverTratamentoGramatical,
} from "./tratamentoGramatical.ts";
import {
  assertEquals,
  assertThrows,
} from "jsr:@std/assert@1";

Deno.test("artigo de operador", () => {
  assertEquals(assinaturaComArtigo("Luciano"), "o Luciano");
  assertEquals(assinaturaComArtigo("Fabi"), "a Fabi");
  assertEquals(assinaturaComArtigo("Jéssica"), "a Jéssica");
  assertEquals(assinaturaComArtigo("Jessyca"), "a Jessyca");
});

Deno.test("preposição de aluno", () => {
  assertEquals(alunoComPreposicao("Davi"), "do Davi");
  assertEquals(alunoComPreposicao("Maria"), "da Maria");
});

Deno.test("normaliza consulta e preserva grafia", () => {
  assertEquals(resolverTratamentoGramatical("  FABIÓLA  "), "feminino");
  assertEquals(assinaturaComArtigo("Fabíola"), "a Fabíola");
});

Deno.test("ambíguo e desconhecido ficam neutros", () => {
  assertEquals(resolverTratamentoGramatical("Jan"), "neutro");
  assertEquals(assinaturaComArtigo("Alex"), "Alex");
  assertEquals(alunoComPreposicao("Alex"), "de Alex");
  assertEquals(resolverTratamentoGramatical("NomeInventadoa"), "neutro");
});

Deno.test("nome vazio falha fechado", () => {
  assertThrows(() => assinaturaComArtigo(" "), Error, "NOME_AUSENTE");
});
