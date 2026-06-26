/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1";
import {
  analisarFinanceiroContrato,
  deveIgnorarStatusFinanceiroPorTipo,
} from "../supabase/functions/sync-matriculas-emusys/financeiro.ts";

Deno.test("bolsista integral sem faturas nao transforma preco de tabela em parcela", () => {
  const analise = analisarFinanceiroContrato({
    contrato_atual: {
      valor_mensalidade: 520,
      valor_total: 0,
      desconto_fixo: 0,
      desconto_condicional: 0,
      bolsa: true,
      nr_faturas: 0,
      forma_pagamento: "",
    },
    cobranca_automatica: null,
  });

  assertEquals(analise.valorCheio, 520);
  assertEquals(analise.parcelaTabela, 520);
  assertEquals(analise.parcelaCanonica, 0);
  assertEquals(analise.statusPagamentoCanonico, "sem_parcela");
  assertEquals(analise.tipoSugerido, "BOLSISTA_INT");
  assertEquals(analise.bloqueiaValorAutomatico, false);
});

Deno.test("matricula regular sem fatura e sem cobranca fica bloqueada para revisao", () => {
  const analise = analisarFinanceiroContrato({
    contrato_atual: {
      valor_mensalidade: 380,
      valor_total: 0,
      desconto_fixo: 0,
      desconto_condicional: 0,
      bolsa: false,
      nr_faturas: 0,
    },
    cobranca_automatica: null,
  });

  assertEquals(analise.parcelaTabela, 380);
  assertEquals(analise.parcelaCanonica, null);
  assertEquals(analise.statusPagamentoCanonico, "sem_parcela");
  assertEquals(analise.tipoSugerido, null);
  assertEquals(analise.bloqueiaValorAutomatico, true);
});

Deno.test("matricula regular com cobranca usa mensalidade menos desconto condicional", () => {
  const analise = analisarFinanceiroContrato({
    contrato_atual: {
      valor_mensalidade: 445,
      valor_total: 5340,
      desconto_fixo: 0,
      desconto_condicional: 9,
      bolsa: false,
      nr_faturas: 12,
    },
    cobranca_automatica: { status: "ativa", forma_pagamento: "Cartao" },
  });

  assertEquals(analise.parcelaTabela, 436);
  assertEquals(analise.parcelaCanonica, 436);
  assertEquals(analise.statusPagamentoCanonico, null);
  assertEquals(analise.tipoSugerido, null);
  assertEquals(analise.bloqueiaValorAutomatico, false);
});

Deno.test("banda e bolsista integral com sem_parcela nao geram divergencia por status em dia do Emusys", () => {
  assertEquals(deveIgnorarStatusFinanceiroPorTipo("BANDA", "sem_parcela", "em_dia"), true);
  assertEquals(deveIgnorarStatusFinanceiroPorTipo("BOLSISTA_INT", "sem_parcela", "em_dia"), true);
  assertEquals(deveIgnorarStatusFinanceiroPorTipo("REGULAR", "sem_parcela", "em_dia"), false);
  assertEquals(deveIgnorarStatusFinanceiroPorTipo("BOLSISTA_PARC", "em_dia", "inadimplente"), false);
});
