/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  montarSnapshotGradeEmusys,
  verificarIntegridadeMapaAulas,
} from "./reconciliacao-grade-snapshot.ts";

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.test("montarSnapshotGradeEmusys agrupa linhas repetidas de turma por aula", () => {
  const snapshot = montarSnapshotGradeEmusys([
    {
      id: 20,
      alunos: [{ id_aluno: 200, nome_aluno: "Bruno" }],
    },
    {
      id: 10,
      alunos: [{ id_aluno: 101, nome_aluno: "Ana" }],
    },
    {
      id: 10,
      alunos: [{ id_aluno: 102, nome_aluno: "Caio" }],
    },
  ], normalizarNome);

  assertEquals(snapshot, [
    { emusys_id: 10, aluno_chaves: ["emusys:101", "emusys:102"] },
    { emusys_id: 20, aluno_chaves: ["emusys:200"] },
  ]);
});

Deno.test("montarSnapshotGradeEmusys falha fechada para fotografia incompleta", () => {
  assertThrows(
    () => montarSnapshotGradeEmusys([{ id: 0, alunos: [] }], normalizarNome),
    Error,
    "EMUSYS_SNAPSHOT_AULA_INVALIDA",
  );
  assertThrows(
    () => montarSnapshotGradeEmusys([{ id: 10 }], normalizarNome),
    Error,
    "EMUSYS_SNAPSHOT_ROSTER_AUSENTE",
  );
  assertThrows(
    () => montarSnapshotGradeEmusys([{
      id: 10,
      alunos: [{ id_aluno: null, nome_aluno: " " }],
    }], normalizarNome),
    Error,
    "EMUSYS_SNAPSHOT_ALUNO_SEM_IDENTIDADE",
  );
  assertEquals(
    montarSnapshotGradeEmusys([{
      id: 10,
      alunos: [{ id_aluno: 321, nome_aluno: "" }],
    }], normalizarNome),
    [{ emusys_id: 10, aluno_chaves: ["emusys:321"] }],
  );
});

Deno.test("verificarIntegridadeMapaAulas deduplica a origem e bloqueia mapa parcial", () => {
  const linhas = [
    { emusys_id: 10 },
    { emusys_id: 10 },
    { emusys_id: 20 },
  ];

  assertEquals(
    verificarIntegridadeMapaAulas(
      linhas,
      new Map<number, number>([[10, 100], [20, 200]]),
    ),
    {
      completo: true,
      aulas_esperadas: 2,
      aulas_mapeadas: 2,
      emusys_ids_ausentes: [],
    },
  );

  assertEquals(
    verificarIntegridadeMapaAulas(
      linhas,
      new Map<number, number>([[10, 100]]),
    ),
    {
      completo: false,
      aulas_esperadas: 2,
      aulas_mapeadas: 1,
      emusys_ids_ausentes: [20],
    },
  );
});
