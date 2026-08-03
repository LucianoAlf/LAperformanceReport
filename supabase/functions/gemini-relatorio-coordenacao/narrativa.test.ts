/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1/equals";
import { filtrarSinaisParaNarrativa } from "./narrativa.ts";

Deno.test("capacidade estimada permanece auditavel mas nao entra na narrativa prescritiva", () => {
  const sinais = [
    {
      professor: "Professora Estimada",
      sinal: "capacidade_estimada_conferir",
      severidade: "medio",
      evidencias: { fonte: "estimada_segmento" },
    },
    {
      professor: "Professor com Evidencia",
      sinal: "possivel_sobrecarga",
      severidade: "alto",
      evidencias: { capacidade_fisica: true },
    },
  ];

  assertEquals(filtrarSinaisParaNarrativa(sinais), [sinais[1]]);
  assertEquals(sinais.length, 2, "o mapa auditavel original nao deve ser alterado");
});
