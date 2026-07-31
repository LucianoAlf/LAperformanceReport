/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  formatarResumoMatriculasAdmin,
  formatarTrancamentosAdmin,
  parseDataReferenciaAdminBrt,
} from "./relatorio-admin-canonico.ts";

Deno.test("resumo distingue matriculas adicionais e pessoas com dois ou tres cursos", () => {
  const texto = formatarResumoMatriculasAdmin({
    matriculasAtivas: 429,
    matriculasBase: 343,
    matriculasBanda: 59,
    matriculasAdicionais: 27,
    matriculasCoral: 0,
    alunosComExatamente2Cursos: 25,
    alunosComExatamente3Cursos: 1,
    alunosCom4OuMaisCursos: 0,
  });

  assertStringIncludes(texto, "Matrículas Ativas: *429*");
  assertStringIncludes(texto, "343 base + 59 banda + 27 adicionais");
  assertStringIncludes(texto, "Matrículas adicionais: *27*");
  assertStringIncludes(texto, "Alunos com 2 cursos: *25*");
  assertStringIncludes(texto, "Alunos com 3 cursos: *1*");
  assertStringIncludes(texto, "Alunos com 4 ou mais cursos: *0*");
});

Deno.test("trancamentos exibem cada matricula e priorizam excecoes da politica", () => {
  const texto = formatarTrancamentosAdmin({
    totalAlunos: 3,
    totalMatriculas: 3,
    itens: [
      {
        alunoNome: "Pessoa Contratual",
        cursoNome: "Canto",
        dataInicio: "2026-07-15",
        dataFinal: "2026-08-15",
        diasTrancado: 16,
        faixaPolitica: "contratual",
        motivo: "Viagem",
      },
      {
        alunoNome: "Pessoa Sem Data",
        cursoNome: "Violão",
        dataInicio: null,
        dataFinal: null,
        diasTrancado: null,
        faixaPolitica: "data_ausente",
        motivo: null,
      },
      {
        alunoNome: "Pessoa Fora",
        cursoNome: "Teclado",
        dataInicio: "2026-04-01",
        dataFinal: "2026-05-01",
        diasTrancado: 120,
        faixaPolitica: "fora_da_politica",
        motivo: "Saúde",
      },
    ],
  });

  assertStringIncludes(texto, "TRANCAMENTOS ATUAIS (3 alunos / 3 matrículas)");
  assertStringIncludes(texto, "FORA DA POLÍTICA");
  assertStringIncludes(texto, "DATA DE INÍCIO AUSENTE");
  assertStringIncludes(texto, "PERÍODO CONTRATUAL");
  assertStringIncludes(texto, "Tempo trancado: *120 dias*");
  assertStringIncludes(texto, "Motivo: Não informado");
  assertEquals(
    texto.indexOf("Pessoa Fora") < texto.indexOf("Pessoa Sem Data"),
    true,
  );
  assertEquals(
    texto.indexOf("Pessoa Sem Data") < texto.indexOf("Pessoa Contratual"),
    true,
  );
});

Deno.test("data de referencia administrativa aceita somente YYYY-MM-DD real", () => {
  assertEquals(parseDataReferenciaAdminBrt("2026-07-30"), "2026-07-30");

  for (
    const value of [
      undefined,
      "",
      "2026-02-30",
      "2026-7-30",
      "2026-07-30T00:00:00Z",
    ]
  ) {
    assertThrows(
      () => parseDataReferenciaAdminBrt(value),
      Error,
      "DATA_REFERENCIA_ADMIN_INVALIDA",
    );
  }
});
