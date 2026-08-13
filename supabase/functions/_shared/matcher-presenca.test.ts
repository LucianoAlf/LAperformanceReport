/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import { assertEquals } from "jsr:@std/assert@1";
import {
  diaSemanaDeDataHora,
  horarioDeDataHora,
  horarioHHMM,
  normalizarDiaSemana,
  resolverAlunoLocal,
  type ContextoAulaMatcher,
  type JornadaContrato,
} from "./matcher-presenca.ts";

// ---------- cenario real: Vinicius Lopa (emusys 282), Campo Grande ----------
// 5 matriculas ativas simultaneas, cada uma com dia/horario proprio:
//   410 Contrabaixo (qui 16:00) | 1433 PK qui 15:00 | 1434 PK ter 17:00
//   1695 Banda (seg 17:00)      | 1788 PK sab 10:00
function cenarioVinicius() {
  const mapaAlunosEmusys = new Map<string, number[]>([
    ["282", [410, 1433, 1434, 1695, 1788]],
  ]);
  const mapaAlunosComposto = new Map<string, number[]>([
    ["vinicius lopa mendes rezende de macedo|2011-11-22|25", [1433, 1434, 1788]],
  ]);
  const mapaAlunos = new Map<string, number>([
    ["vinicius lopa mendes rezende de macedo", 410],
  ]);
  const mapaContratos = new Map<number, JornadaContrato>([
    [3510, { alunoId: 1434, diaSemana: "terca", horario: "17:00" }],
    [3511, { alunoId: 1788, diaSemana: "sabado", horario: "10:00" }],
    [4169, { alunoId: 1433, diaSemana: "quinta", horario: "15:00" }],
    [4185, { alunoId: 410, diaSemana: "quinta", horario: "16:00" }],
  ]);
  const mapaJornadaPorAluno = new Map<number, JornadaContrato[]>([
    [410, [{ alunoId: 410, diaSemana: "quinta", horario: "16:00" }]],
    [1433, [{ alunoId: 1433, diaSemana: "quinta", horario: "15:00" }]],
    [1434, [{ alunoId: 1434, diaSemana: "terca", horario: "17:00" }]],
    [1695, [{ alunoId: 1695, diaSemana: "segunda", horario: "17:00" }]],
    [1788, [{ alunoId: 1788, diaSemana: "sabado", horario: "10:00" }]],
  ]);
  const aluno = {
    id_aluno: 282,
    nome_aluno: "Vinícius Lopa Mendes Rezende de Macedo",
    data_nascimento_aluno: "2011-11-22",
  };
  return { mapaAlunosEmusys, mapaAlunosComposto, mapaAlunos, mapaContratos, mapaJornadaPorAluno, aluno };
}

Deno.test("resolverAlunoLocal: contrato da aula desempata 5 matriculas do mesmo aluno", () => {
  const c = cenarioVinicius();
  // Linha do contrato PK_Ter_17 (matricula_disciplina_id 3510 -> aluno 1434)
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: 3510,
    dataHoraInicio: "2026-08-04 17:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    c.aluno, 25, contexto, c.mapaAlunosEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 1434);
});

Deno.test("resolverAlunoLocal: contrato aponta a matricula certa mesmo em outro curso", () => {
  const c = cenarioVinicius();
  // Linha do contrato de Contrabaixo (4185 -> aluno 410), aula de curso 21
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: 4185,
    dataHoraInicio: "2026-08-13 16:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    c.aluno, 21, contexto, c.mapaAlunosEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 410);
});

Deno.test("resolverAlunoLocal: container (sem contrato) desempata por dia/horario", () => {
  const c = cenarioVinicius();
  // Linha container PK_Ter_17 ter 17:00 -> unica matricula com essa grade e a 1434
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: null,
    dataHoraInicio: "2026-08-04 17:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    c.aluno, 25, contexto, c.mapaAlunosEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 1434);
});

Deno.test("resolverAlunoLocal: container PK_Qui_15 desempata para a matricula de quinta 15:00", () => {
  const c = cenarioVinicius();
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: null,
    dataHoraInicio: "2026-08-13 15:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    c.aluno, 25, contexto, c.mapaAlunosEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 1433);
});

Deno.test("resolverAlunoLocal: aula reagendada usa o horario original para desempatar", () => {
  const c = cenarioVinicius();
  // Reagendada para sexta 18:00, mas o contrato e ter 17:00
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: null,
    dataHoraInicio: "2026-08-07 18:00",
    dataHoraInicioOriginal: "2026-08-04 17:00",
  };
  const id = resolverAlunoLocal(
    c.aluno, 25, contexto, c.mapaAlunosEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 1434);
});

Deno.test("resolverAlunoLocal: emusys_student_id unico continua resolvendo (regressao)", () => {
  const c = cenarioVinicius();
  const mapaEmusys = new Map<string, number[]>([["999", [555]]]);
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: null,
    dataHoraInicio: "2026-08-04 17:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    { id_aluno: 999, nome_aluno: "Fulano", data_nascimento_aluno: null },
    25, contexto, mapaEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 555);
});

Deno.test("resolverAlunoLocal: composto nome+nasc+curso unico continua resolvendo (regressao)", () => {
  const c = cenarioVinicius();
  const mapaComposto = new Map<string, number[]>([
    ["beltrano|2010-01-01|16", [777]],
  ]);
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: null,
    dataHoraInicio: "2026-08-04 17:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    { id_aluno: 100, nome_aluno: "Beltrano", data_nascimento_aluno: "2010-01-01" },
    16, contexto, c.mapaAlunosEmusys, mapaComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 777);
});

Deno.test("resolverAlunoLocal: dia/horario ambiguo (2 matriculas no mesmo slot) cai no fallback", () => {
  const c = cenarioVinicius();
  // Duas matriculas com ter 17:00 — nao ha como desempatar por grade
  const mapaJornada = new Map<number, JornadaContrato[]>([
    [10, [{ alunoId: 10, diaSemana: "terca", horario: "17:00" }]],
    [20, [{ alunoId: 20, diaSemana: "terca", horario: "17:00" }]],
  ]);
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: null,
    dataHoraInicio: "2026-08-04 17:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    { id_aluno: 500, nome_aluno: "Duplo", data_nascimento_aluno: null },
    25, contexto,
    new Map([["500", [10, 20]]]), c.mapaAlunosComposto,
    new Map([["duplo", 20]]), c.mapaContratos, mapaJornada,
  );
  assertEquals(id, 20);
});

Deno.test("resolverAlunoLocal: sem contrato, sem dia/horario e sem matches -> fallback por nome", () => {
  const c = cenarioVinicius();
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: null,
    dataHoraInicio: null,
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    c.aluno, 25, contexto, c.mapaAlunosEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  assertEquals(id, 410);
});

Deno.test("resolverAlunoLocal: contrato desconhecido na jornada nao quebra (cai nas camadas seguintes)", () => {
  const c = cenarioVinicius();
  const contexto: ContextoAulaMatcher = {
    matriculaDisciplinaId: 999999,
    dataHoraInicio: "2026-08-04 17:00",
    dataHoraInicioOriginal: null,
  };
  const id = resolverAlunoLocal(
    c.aluno, 25, contexto, c.mapaAlunosEmusys, c.mapaAlunosComposto, c.mapaAlunos, c.mapaContratos, c.mapaJornadaPorAluno,
  );
  // sem contrato conhecido, o desempate por dia/horario ainda encontra 1434
  assertEquals(id, 1434);
});

// ---------- helpers ----------

Deno.test("normalizarDiaSemana: lida com acentos, sufixo -feira e nulos", () => {
  assertEquals(normalizarDiaSemana("Terça-feira"), "terca");
  assertEquals(normalizarDiaSemana("Sábado"), "sabado");
  assertEquals(normalizarDiaSemana("segunda-feira"), "segunda");
  assertEquals(normalizarDiaSemana(null), null);
  assertEquals(normalizarDiaSemana(""), null);
});

Deno.test("diaSemanaDeDataHora: devolve o dia em BRT", () => {
  assertEquals(diaSemanaDeDataHora("2026-08-04 17:00"), "terca");
  assertEquals(diaSemanaDeDataHora("2026-08-08 10:00"), "sabado");
  assertEquals(diaSemanaDeDataHora("2026-08-13 15:00"), "quinta");
  assertEquals(diaSemanaDeDataHora(null), null);
  assertEquals(diaSemanaDeDataHora("invalida"), null);
});

Deno.test("horarioDeDataHora: extrai HH:MM do data_hora_inicio", () => {
  assertEquals(horarioDeDataHora("2026-08-04 17:00"), "17:00");
  assertEquals(horarioDeDataHora("2026-08-04 17:00:00"), "17:00");
  assertEquals(horarioDeDataHora(null), null);
  assertEquals(horarioDeDataHora("invalida"), null);
});

Deno.test("horarioHHMM: normaliza horarios da jornada", () => {
  assertEquals(horarioHHMM("17:00"), "17:00");
  assertEquals(horarioHHMM("17:00:00"), "17:00");
  assertEquals(horarioHHMM(null), null);
  assertEquals(horarioHHMM(""), null);
});
