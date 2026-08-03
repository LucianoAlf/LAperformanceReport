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

Deno.test("prioridades deduplicam professor, limitam cinco e ordenam por evidência", () => {
  const risco = (id: number, presenca: number, carteira: number) => ({
    professor_id: id,
    professor: `Professor ${id}`,
    sinal: "possivel_sobrecarga",
    severidade: "medio",
    evidencias: {
      carteira,
      p75_unidade: 24,
      retencao: 100,
      meta_retencao: 90,
      presenca,
      meta_presenca: 80,
      capacidade_fisica_excedida: false,
    },
  });
  const sinais = [
    ...[1, 2, 3, 4, 5, 6].map((id) => risco(id, 70 - id, 24 + id)),
    {
      professor_id: 3,
      professor: "Professor 3",
      sinal: "concentracao_operacional",
      severidade: "alto",
      evidencias: { capacidade_fisica_excedida: true, turmas: [{ turma_id: 10 }, { turma_id: 11 }] },
    },
  ];
  const prioridades = projetarMapaSinaisPublico(sinais).prioridades;
  assertEquals(prioridades.length, 5);
  assertEquals(prioridades[0].professor, "Professor 3");
  assertEquals(prioridades[0].agrupamentos_fisicos, 2);
  assertEquals(new Set(prioridades.map((item) => item.professor_id)).size, 5);
});

Deno.test("possível sobrecarga sem correlação canônica não vira prioridade", () => {
  const resultado = projetarMapaSinaisPublico([{
    professor_id: 1,
    professor: "Professor sem correlação",
    sinal: "possivel_sobrecarga",
    severidade: "medio",
    evidencias: {
      carteira: 20,
      p75_unidade: 24,
      presenca: 90,
      meta_presenca: 80,
      retencao: 100,
      meta_retencao: 90,
    },
  }]);
  assertEquals(resultado.prioridades, []);
});
