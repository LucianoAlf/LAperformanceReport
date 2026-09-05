/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { validarDataPrevistaAviso } from "./aviso-previo.ts";

Deno.test("preserva data prevista válida vinda do Emusys", () => {
  assertEquals(validarDataPrevistaAviso("2026-08-25", "2026-09-01"), {
    dataPrevista: "2026-09-01",
    fonteInvalida: false,
  });
});

Deno.test("quarentena data prevista anterior ao próprio aviso", () => {
  assertEquals(validarDataPrevistaAviso("2026-09-01", "2026-08-11"), {
    dataPrevista: null,
    fonteInvalida: true,
  });
});

Deno.test("não inventa data quando o Emusys não envia", () => {
  assertEquals(validarDataPrevistaAviso("2026-09-01", null), {
    dataPrevista: null,
    fonteInvalida: false,
  });
});
