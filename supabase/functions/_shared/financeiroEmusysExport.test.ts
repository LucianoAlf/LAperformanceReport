/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { agruparDiasVarreduraPorUnidade } from "./financeiroEmusysExport.ts";

Deno.test("export agrupa e ordena os dias da competência sem campos extras", () => {
  const agrupados = agruparDiasVarreduraPorUnidade([
    {
      unidade_id: "barra",
      data: "2026-09-03",
      status: "erro",
      concluido_em: null,
      ultimo_erro: "não deve atravessar o contrato",
    },
    {
      unidade_id: "barra",
      data: "2026-09-01",
      status: "completo",
      concluido_em: "2026-09-20T01:10:00.000Z",
    },
    {
      unidade_id: "cg",
      data: "2026-09-02",
      status: "completo",
      concluido_em: "2026-09-20T01:11:00.000Z",
    },
  ]);

  assertEquals(agrupados.get("barra"), [
    {
      data: "2026-09-01",
      status: "completo",
      concluido_em: "2026-09-20T01:10:00.000Z",
    },
    { data: "2026-09-03", status: "erro", concluido_em: null },
  ]);
  assertEquals(agrupados.get("cg"), [
    {
      data: "2026-09-02",
      status: "completo",
      concluido_em: "2026-09-20T01:11:00.000Z",
    },
  ]);
});
