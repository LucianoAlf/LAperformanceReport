/// <reference lib="deno.ns" />

// O total de saídas do relatório Gerencial com IA somava banda.
//
// CASO (Clayton, gerência do Recreio, 08/09/2026): print do "Relatório Gerencial com IA"
// mostrando, no MESMO bloco, "Churn: 8,68%" e "Total de saídas: 37" — sendo que 8,68% é
// 29 ÷ 334 pagantes. O bloco se contradizia na própria tela.
//
// O defeito não era do payload: `indicadores_retencao.total_evasoes` = 37 é a soma bruta
// e tem esse significado de propósito (o relatório do WhatsApp a publica rotulada, como
// "Saídas totais: 37 (29 pagantes + 8 banda)", e valida a lista contra ela). O defeito era
// o Gerencial imprimir a soma bruta sob o rótulo "Total de saídas", que a regra da casa
// define como o número sem bolsista, atividade extra, 2º curso e transferência.
//
// Números deste teste medidos em produção (Recreio, ago/2026): 23 interrompidos + 8 de
// banda na lista, 6 não renovações, 334 pagantes, churn 8,68%.
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classificarSaida,
  composicaoDeSaidas,
  entraNoTotal,
} from "./composicao-saidas-mensais.ts";

const recreioAgosto2026 = [
  ...Array.from({ length: 23 }, () => ({ tipo_evasao: "interrompido" })),
  ...Array.from({ length: 8 }, () => ({ tipo_evasao: "interrompido_banda" })),
];

Deno.test("Recreio/ago-2026: o total publicado é o mesmo que o churn usa", () => {
  const c = composicaoDeSaidas(recreioAgosto2026, 6, 37);

  assertEquals(c.totalQueConta, 29);
  assertEquals(c.foraDoTotal, 8);
  assertEquals(c.interrompido, 23);
  assertEquals(c.banda, 8);
  assertEquals(c.naoRenovacoes, 6);
  assertEquals(c.avisos, []);

  // O churn que o payload traz precisa sair do mesmo número que publicamos.
  assertEquals(Number((c.totalQueConta / 334 * 100).toFixed(2)), 8.68);
});

Deno.test("a soma bruta continua disponível e fecha com a composição", () => {
  const c = composicaoDeSaidas(recreioAgosto2026, 6, 37);
  assertEquals(c.totalBruto, 37);
  assertEquals(c.totalQueConta + c.foraDoTotal, c.totalBruto);
});

Deno.test("os quatro tipos da regra ficam fora; interrompido e não renovou entram", () => {
  assertEquals(entraNoTotal("interrompido"), true);
  assertEquals(entraNoTotal("nao_renovou"), true);
  for (
    const tipo of [
      "interrompido_2_curso",
      "interrompido_bolsista",
      "interrompido_banda",
      "transferencia",
    ] as const
  ) {
    assertEquals(entraNoTotal(tipo), false, tipo);
  }
});

Deno.test("classificação aceita as variações de texto que o banco entrega", () => {
  assertEquals(classificarSaida({ tipo_evasao: "INTERROMPIDO_BANDA" }), "interrompido_banda");
  assertEquals(classificarSaida({ tipo_evasao: " bolsista " }), "interrompido_bolsista");
  assertEquals(classificarSaida({ tipo_evasao: "não_renovou" }), "nao_renovou");
  assertEquals(classificarSaida({ tipo_evasao: "interrompido_2_curso" }), "interrompido_2_curso");
  assertEquals(classificarSaida({ tipo_evasao: "transferencia_unidade" }), "transferencia");
  // Tipo ausente conta como saída comum: aparecer a mais é o erro seguro — some do total
  // seria esconder aluno perdido de verdade.
  assertEquals(classificarSaida({}), "interrompido");
});

Deno.test("total que não fecha com a soma bruta vira aviso, não silêncio", () => {
  const c = composicaoDeSaidas(recreioAgosto2026, 6, 40);
  assertEquals(c.avisos.length, 1);
  assertStringIncludes(c.avisos[0], "nao fecha com o total bruto");
});

Deno.test("não-renovação dentro da lista de evasões não é contada duas vezes", () => {
  const c = composicaoDeSaidas(
    [...recreioAgosto2026, { tipo_evasao: "nao_renovou" }],
    6,
    37,
  );
  assertEquals(c.naoRenovacoes, 6);
  assertEquals(c.totalQueConta, 29);
  assertStringIncludes(c.avisos[0], "nao contar a mesma pessoa duas vezes");
});

Deno.test("mês sem saída fora da regra não inventa bloco nem quebra a conta", () => {
  const c = composicaoDeSaidas(
    Array.from({ length: 5 }, () => ({ tipo_evasao: "interrompido" })),
    2,
    7,
  );
  assertEquals(c.foraDoTotal, 0);
  assertEquals(c.totalQueConta, 7);
  assertEquals(c.avisos, []);
});
