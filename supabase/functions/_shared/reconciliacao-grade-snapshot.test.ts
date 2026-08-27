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
    {
      emusys_id: 10,
      estado: "completo",
      qtd_esperada: 2,
      qtd_recebida: 2,
      aluno_chaves: ["emusys:101", "emusys:102"],
    },
    {
      emusys_id: 20,
      estado: "completo",
      qtd_esperada: 1,
      qtd_recebida: 1,
      aluno_chaves: ["emusys:200"],
    },
  ]);
});

Deno.test("montarSnapshotGradeEmusys classifica vazio, incompleto e ambiguo sem inventar nomes", () => {
  assertThrows(
    () => montarSnapshotGradeEmusys([{ id: 0, alunos: [] }], normalizarNome),
    Error,
    "EMUSYS_SNAPSHOT_AULA_INVALIDA",
  );
  assertEquals(
    montarSnapshotGradeEmusys([
      { id: 10, alunos: [], qtd_alunos: 0 },
      { id: 20, qtd_alunos: 2 },
      {
        id: 30,
        qtd_alunos: 2,
        alunos: [{ id_aluno: 301, nome_aluno: "Aluno parcial" }],
      },
      {
        id: 40,
        alunos: [{ id_aluno: null, nome_aluno: "Aluno sem id" }],
      },
      {
        id: 50,
        alunos: [{ id_aluno: null, nome_aluno: " " }],
      },
    ], normalizarNome),
    [
      { emusys_id: 10, estado: "vazio_confirmado", qtd_esperada: 0, qtd_recebida: 0, aluno_chaves: [] },
      { emusys_id: 20, estado: "incompleto", qtd_esperada: 2, qtd_recebida: 0, aluno_chaves: [] },
      { emusys_id: 30, estado: "incompleto", qtd_esperada: 2, qtd_recebida: 1, aluno_chaves: ["emusys:301"] },
      { emusys_id: 40, estado: "ambiguo", qtd_esperada: 1, qtd_recebida: 1, aluno_chaves: ["nome:aluno sem id:"] },
      { emusys_id: 50, estado: "incompleto", qtd_esperada: 0, qtd_recebida: 0, aluno_chaves: [] },
    ],
  );
  assertEquals(
    montarSnapshotGradeEmusys([{
      id: 10,
      qtd_alunos: 1,
      alunos: [{ id_aluno: 321, nome_aluno: "" }],
    }], normalizarNome),
    [{ emusys_id: 10, estado: "completo", qtd_esperada: 1, qtd_recebida: 1, aluno_chaves: ["emusys:321"] }],
  );
});

Deno.test("linha individual cancelada e container vazio permanecem aulas distintas", () => {
  assertEquals(
    montarSnapshotGradeEmusys([
      { id: 60, cancelada: true, alunos: [{ id_aluno: 601, nome_aluno: "Historico" }] },
      { id: 61, cancelada: false, qtd_alunos: 0, alunos: [] },
    ], normalizarNome),
    [
      { emusys_id: 60, estado: "completo", qtd_esperada: 1, qtd_recebida: 1, aluno_chaves: ["emusys:601"] },
      { emusys_id: 61, estado: "vazio_confirmado", qtd_esperada: 0, qtd_recebida: 0, aluno_chaves: [] },
    ],
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
