/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  listarCodigosSinaisDesconhecidos,
  projetarMapaSinaisPublico,
} from "./mapaSinaisPublico.ts";

Deno.test("capacidade estimada aparece somente na qualidade dos dados", () => {
  const sinais = [
    {
      professor_id: 1,
      professor: "Professora A",
      sinal: "capacidade_estimada_conferir",
      severidade: "medio",
      evidencias: { fonte: "estimada_segmento", turmas: [{ chave: "a" }, { chave: "b" }] },
    },
    {
      professor_id: 2,
      professor: "Professor B",
      sinal: "capacidade_estimada_conferir",
      severidade: "medio",
      evidencias: { fonte: "estimada_segmento", turmas: [{ chave: "c" }] },
    },
    {
      professor_id: 1,
      professor: "Professora A",
      sinal: "maturacao",
      severidade: "baixo",
      evidencias: { motivo: "professor_ou_base_em_maturacao" },
    },
  ] as const;
  const antes = structuredClone(sinais);
  const resultado = projetarMapaSinaisPublico(sinais);
  assertEquals(resultado.prioridades, []);
  assertEquals(resultado.oportunidades, []);
  assertEquals(resultado.qualidade_capacidade, {
    professores_afetados: 2,
    agrupamentos_estimados: 3,
  });
  assertEquals(resultado.total_sinais_publicos, 0);
  assertEquals(sinais, antes, "o mapa bruto deve permanecer imutável");
});

Deno.test("fixture auditada do Recreio resume cinco professores e nove agrupamentos", () => {
  const sinais = Array.from({ length: 5 }, (_, indice) => ({
    professor_id: indice + 1,
    professor: `Professor ${indice + 1}`,
    sinal: "capacidade_estimada_conferir",
    severidade: "medio",
    evidencias: {
      fonte: "estimada_segmento",
      turmas: Array.from({ length: indice < 4 ? 2 : 1 }, (__, turma) => ({ turma })),
    },
  }));
  assertEquals(projetarMapaSinaisPublico(sinais).qualidade_capacidade, {
    professores_afetados: 5,
    agrupamentos_estimados: 9,
  });
});

Deno.test("sinal conhecido sem evidência obrigatória falha fechado", () => {
  assertThrows(
    () => projetarMapaSinaisPublico([{
      professor_id: 1,
      professor: "Professora sem evidência",
      sinal: "capacidade_estimada_conferir",
      severidade: "medio",
      evidencias: { fonte: "estimada_segmento" },
    }]),
    Error,
    "agrupamentos de capacidade estimada",
  );
});

Deno.test("códigos desconhecidos ficam disponíveis somente para log de auditoria", () => {
  assertEquals(listarCodigosSinaisDesconhecidos([{
    professor_id: 1,
    professor: "Professor",
    sinal: "novo_sinal_interno",
    severidade: "baixo",
    evidencias: {},
  }]), ["novo_sinal_interno"]);
});
