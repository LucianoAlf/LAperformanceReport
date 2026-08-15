/// <reference lib="deno.ns" />

import {
  assertEquals,
  assertNotMatch,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { previsualizarReconciliacaoGrade } from "./previsualizacao-reconciliacao-grade.ts";

Deno.test("previsualizacao classifica somente candidatos seguros e omite chaves de aluno", () => {
  const resultado = previsualizarReconciliacaoGrade({
    snapshot: [
      { emusys_id: 100, aluno_chaves: ["emusys:10", "emusys:14"] },
    ],
    aulas: [
      { id: 1, emusys_id: 100 },
      { id: 2, emusys_id: 101 },
      { id: 3, emusys_id: 102 },
      { id: 4, emusys_id: 103 },
      { id: 5, emusys_id: 104 },
    ],
    vinculos: [
      {
        id: 301,
        aula_emusys_id: 1,
        aluno_id: 1,
        aluno_emusys_id: 10,
        aluno_chave: "emusys:10",
      },
      {
        id: 302,
        aula_emusys_id: 1,
        aluno_id: 2,
        aluno_emusys_id: 11,
        aluno_chave: "emusys:11",
      },
      {
        id: 303,
        aula_emusys_id: 1,
        aluno_id: 3,
        aluno_emusys_id: 12,
        aluno_chave: "emusys:12",
      },
      {
        id: 304,
        aula_emusys_id: 1,
        aluno_id: null,
        aluno_emusys_id: 13,
        aluno_chave: "emusys:13",
      },
      {
        id: 305,
        aula_emusys_id: 1,
        aluno_id: 7,
        aluno_emusys_id: 14,
        aluno_chave: "local:7",
      },
    ],
    presencas: [
      // Fallback legado: presença humana fecha a chamada e impede cancelamento.
      {
        aula_emusys_id: 3,
        aluno_id: 30,
        status: "presente",
        status_presenca: null,
        respondido_por: "agenda_secretaria",
      },
      // Emusys ausente é evidência bruta: não protege a remoção.
      {
        aula_emusys_id: 4,
        aluno_id: 40,
        status: "ausente",
        status_presenca: null,
        respondido_por: "emusys",
      },
      // Emusys presente fecha a chamada conforme a função canônica remota.
      {
        aula_emusys_id: 5,
        aluno_id: 50,
        status: "presente",
        status_presenca: null,
        respondido_por: "emusys",
      },
      {
        aula_emusys_id: 1,
        aluno_id: 3,
        status: "presente",
        status_presenca: null,
        respondido_por: "manual",
      },
      {
        aula_emusys_id: 1,
        aluno_id: 2,
        status: "ausente",
        status_presenca: null,
        respondido_por: "emusys",
      },
    ],
  });

  assertEquals(resultado.candidatas.aulas_cancelar, [
    { aula_local_id: 2, emusys_aula_id: 101, vinculo_id: null },
    { aula_local_id: 4, emusys_aula_id: 103, vinculo_id: null },
  ]);
  assertEquals(resultado.candidatas.vinculos_remover, [
    { aula_local_id: 1, emusys_aula_id: 100, vinculo_id: 302 },
  ]);
  assertEquals(resultado.protegidas.marcacao_fechada_aula, [
    { aula_local_id: 3, emusys_aula_id: 102, vinculo_id: null },
    { aula_local_id: 5, emusys_aula_id: 104, vinculo_id: null },
  ]);
  assertEquals(resultado.protegidas.marcacao_fechada_vinculo, [
    { aula_local_id: 1, emusys_aula_id: 100, vinculo_id: 303 },
  ]);
  assertEquals(resultado.protegidas.identidade_ambigua, [
    { aula_local_id: 1, emusys_aula_id: 100, vinculo_id: 304 },
  ]);

  const serializado = JSON.stringify(resultado);
  assertNotMatch(serializado, /aluno_chave|emusys:|local:/u);
});
