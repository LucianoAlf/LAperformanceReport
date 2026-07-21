/// <reference lib="deno.ns" />

import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  assertCatalogosDisjuntos,
  hashPayloadAllowlist,
  parseDisciplinasCatalogo,
  parseProfessoresDisciplina,
  waitForRateLimit,
} from "./emusys-professor-disciplinas.ts";

Deno.test("disciplinas aceitam array no topo, envelope e IDs numericos", () => {
  assertEquals(
    parseDisciplinasCatalogo([
      { id: "11", nome: "Canto" },
      { id: 11, nome: "Canto duplicado" },
      { disciplina_id: 12 },
    ], "turma"),
    [
      {
        emusysDisciplinaId: 11,
        nomeEmusys: "Canto",
        modalidade: "turma",
        payloadSnapshot: { id: 11, nome: "Canto", tipo: "turma" },
      },
      {
        emusysDisciplinaId: 12,
        nomeEmusys: "Disciplina 12",
        modalidade: "turma",
        payloadSnapshot: { id: 12, nome: "Disciplina 12", tipo: "turma" },
      },
    ],
  );

  assertEquals(
    parseDisciplinasCatalogo({
      disciplinas: [{ curso_id: "31", nome_disciplina: "Bateria" }],
    }, "individual")[0]?.payloadSnapshot,
    { id: 31, nome: "Bateria", tipo: "individual" },
  );
});

Deno.test("professores usam allowlist, nomes opcionais e deduplicacao", () => {
  assertEquals(
    parseProfessoresDisciplina({
      professores: [
        { id: "21", nome: "Professor A", telefone: "nao deve sair" },
        { id: 21, nome: "Duplicado" },
        { professor_id: 22 },
      ],
    }),
    [
      {
        emusysProfessorId: 21,
        nomeEmusys: "Professor A",
        payloadSnapshot: { id: 21, nome: "Professor A" },
      },
      {
        emusysProfessorId: 22,
        nomeEmusys: "Professor 22",
        payloadSnapshot: { id: 22, nome: "Professor 22" },
      },
    ],
  );
});

Deno.test("payload invalido e conflito entre modalidades bloqueiam o lote", () => {
  assertThrows(
    () => parseDisciplinasCatalogo({ disciplinas: [{ id: "x" }] }, "turma"),
    Error,
    "DISCIPLINAS_EMUSYS_INVALIDAS",
  );
  assertThrows(
    () => parseProfessoresDisciplina({ professores: [{ id: 0 }] }),
    Error,
    "PROFESSORES_EMUSYS_INVALIDOS",
  );

  const turma = parseDisciplinasCatalogo([{ id: 7, nome: "Canto T" }], "turma");
  const individual = parseDisciplinasCatalogo(
    [{ id: 7, nome: "Canto IND" }],
    "individual",
  );
  assertThrows(
    () => assertCatalogosDisjuntos(turma, individual),
    Error,
    "7",
  );
});

Deno.test("hash e estavel para snapshots equivalentes", async () => {
  const first = await hashPayloadAllowlist({
    id: 1,
    nome: "Canto",
    tipo: "turma",
  });
  const second = await hashPayloadAllowlist({
    tipo: "turma",
    nome: "Canto",
    id: 1,
  });
  assertEquals(first, second);
  assertEquals(first.length, 64);
});

Deno.test("rate limit respeita retry-after sem impor espera quando zero", async () => {
  const headers = new Headers({
    "retry-after": "0",
    "x-ratelimit-remaining": "0",
  });
  const delay = await waitForRateLimit(headers, 0);
  assertEquals(delay, 0);

  await assertRejects(
    () => waitForRateLimit(headers, -1),
    RangeError,
  );
});
