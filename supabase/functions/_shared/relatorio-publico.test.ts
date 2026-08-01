/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import {
  assertEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  formatarDataHoraPublica,
  formatarDataPublica,
  validarTextoPublicoRelatorio,
} from "./relatorio-publico.ts";

Deno.test("formata data ISO somente para apresentacao", () => {
  assertEquals(formatarDataPublica("2026-08-01"), "01/08/2026");
  assertEquals(
    formatarDataHoraPublica("2026-08-01", "10:00"),
    "01/08/2026 às 10:00",
  );
  assertEquals(
    formatarDataHoraPublica("2026-08-01", null),
    "01/08/2026",
  );
});

Deno.test("rejeita data civil inexistente ou fora do contrato", () => {
  for (const data of ["2026-02-30", "2026-8-01", "01/08/2026", ""]) {
    assertThrows(
      () => formatarDataPublica(data),
      Error,
      "RELATORIO_DATA_PUBLICA_INVALIDA",
    );
  }
});

Deno.test("bloqueia nomenclatura interna no texto publico", () => {
  for (
    const termo of [
      "get_kpis_comercial_canonicos_v2",
      "snapshot vigente GET /aulas",
      "coorte detalhada",
      "fonte canônica",
      "fonte canonica",
      "canônico v2",
      "RPC get_relatorio",
      "POST /functions/v1/teste",
      "America/Sao_Paulo",
    ]
  ) {
    assertThrows(
      () => validarTextoPublicoRelatorio(`Relatório ${termo}`),
      Error,
      "RELATORIO_TEXTO_TECNICO",
    );
  }
});

Deno.test("aceita linguagem operacional e nome do sistema", () => {
  const texto = [
    "Experimentais realizadas no mês (Emusys): 32",
    "Informações atualizadas em: 31/07/2026 às 20:00",
  ].join("\n");
  assertEquals(validarTextoPublicoRelatorio(texto), texto);
});
