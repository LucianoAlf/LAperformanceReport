/// <reference lib="deno.ns" />
// Mutantes da matriz de decisao do escritor de presenca no Emusys.
// Cada teste e uma trava do desenho (docs/plans/2026-09-25-presenca-escrita-emusys-desenho.md).

import { assertEquals } from "jsr:@std/assert@1";
import {
  classificarMarcaEmusys,
  decisaoPrecoceAluno,
  decidirEscritaAluno,
  decidirEscritaProfessor,
} from "../_shared/presenca-escrita-decisao.ts";

const base = {
  linhaJustificada: false,
  linhaCancelada: false,
  aulaCancelada: false,
  identidadeOk: true,
  marca: "sem_resposta" as const,
  ultimaEscrita: null,
};

Deno.test("ausente sem horario = sem resposta; com horario = falta humana", () => {
  assertEquals(classificarMarcaEmusys("ausente", null), "sem_resposta");
  assertEquals(classificarMarcaEmusys("ausente", "10:00:00"), "ausente_marcada");
  assertEquals(classificarMarcaEmusys("presente", "10:00:00"), "presente");
});

Deno.test("mutante 1: secretaria corrige marca humana nos dois sentidos", () => {
  const falta = decidirEscritaAluno({
    ...base, estadoVigente: "falta", fonte: "agenda_secretaria", marca: "presente",
  });
  assertEquals(falta, { acao: "escrever", presente: false, motivo: "correcao_secretaria_sobre_marca" });

  const presente = decidirEscritaAluno({
    ...base, estadoVigente: "presente", fonte: "agenda_secretaria", marca: "ausente_marcada",
  });
  assertEquals(presente, { acao: "escrever", presente: true, motivo: "correcao_secretaria_sobre_marca" });
});

Deno.test("mutante 2: falta do professor NAO apaga presenca da secretaria", () => {
  const r = decidirEscritaAluno({
    ...base, estadoVigente: "falta", fonte: "professor_la_teacher", marca: "presente",
  });
  assertEquals(r, { acao: "pular", decisao: "conflito_marca_humana", motivo: "marca_humana_divergente" });
});

Deno.test("mutante 2b: presente do fabio NAO apaga falta humana la", () => {
  const r = decidirEscritaAluno({
    ...base, estadoVigente: "presente", fonte: "fabio_audio", marca: "ausente_marcada",
  });
  assertEquals(r, { acao: "pular", decisao: "conflito_marca_humana", motivo: "marca_humana_divergente" });
});

Deno.test("mutante 3: professor preenche so onde ninguem marcou", () => {
  const r = decidirEscritaAluno({
    ...base, estadoVigente: "presente", fonte: "professor_la_teacher", marca: "sem_resposta",
  });
  assertEquals(r, { acao: "escrever", presente: true, motivo: "preenche_sem_resposta" });
});

Deno.test("mutante 4: linha justificada/cancelada nunca recebe escrita", () => {
  for (const flags of [
    { linhaJustificada: true },
    { linhaCancelada: true },
    { aulaCancelada: true },
  ]) {
    const r = decidirEscritaAluno({
      ...base, ...flags, estadoVigente: "presente", fonte: "agenda_secretaria",
    });
    assertEquals(r.acao, "pular");
    if (r.acao === "pular") assertEquals(r.decisao, "pulado_linha_protegida");
  }
});

Deno.test("mutante 5: falta_justificada vigente nao tem canal (nunca vira ausente)", () => {
  const r = decisaoPrecoceAluno("falta_justificada", "agenda_secretaria");
  assertEquals(r, { acao: "pular", decisao: "pulado_sem_canal_justificada", motivo: "falta_justificada" });
});

Deno.test("mutante 6: anti-laco — respondido_por=emusys nunca escreve", () => {
  const r = decisaoPrecoceAluno("presente", "emusys");
  assertEquals(r, { acao: "pular", decisao: "pulado_fonte_emusys", motivo: "anti_laco" });
});

Deno.test("mutante 7: marca nossa igual = ja_coerente; divergente = corrige", () => {
  const igual = decidirEscritaAluno({
    ...base, estadoVigente: "presente", fonte: "professor_la_teacher",
    marca: "presente", ultimaEscrita: { presente: true },
  });
  assertEquals(igual, { acao: "pular", decisao: "ja_coerente", motivo: "marca_propria_igual" });

  // Escrevemos presente, vigente virou falta: a marca la e NOSSA, professor pode corrigir.
  const divergente = decidirEscritaAluno({
    ...base, estadoVigente: "falta", fonte: "professor_la_teacher",
    marca: "presente", ultimaEscrita: { presente: true },
  });
  assertEquals(divergente, { acao: "escrever", presente: false, motivo: "corrige_marca_propria" });
});

Deno.test("mutante 7b: marca la divergente do nosso livro = humana (professor nao pisa)", () => {
  // Escrevemos presente, mas la esta ausente+horario: alguem marcou falta depois.
  const r = decidirEscritaAluno({
    ...base, estadoVigente: "presente", fonte: "professor_la_teacher",
    marca: "ausente_marcada", ultimaEscrita: { presente: true },
  });
  assertEquals(r, { acao: "pular", decisao: "conflito_marca_humana", motivo: "marca_humana_divergente" });
});

Deno.test("mutante 7c: ausente nosso SEM carimbo rele sem_resposta — nao repete PATCH", () => {
  // A API nao carimba horario_presenca em ausente (medido 25/09): uma falta
  // que escrevemos volta como 'sem_resposta'. O livro prova que a marca e
  // nossa; sem este atalho o sweeper re-PATCHaria a mesma linha a cada 5 min.
  const r = decidirEscritaAluno({
    ...base, estadoVigente: "falta", fonte: "agenda_secretaria",
    marca: "sem_resposta", ultimaEscrita: { presente: false },
  });
  assertEquals(r, { acao: "pular", decisao: "ja_coerente", motivo: "ausente_proprio_sem_carimbo" });
  // Vigente virou presente: a ausente nossa precisa ser corrigida, nao assumida.
  const corrige = decidirEscritaAluno({
    ...base, estadoVigente: "presente", fonte: "agenda_secretaria",
    marca: "sem_resposta", ultimaEscrita: { presente: false },
  });
  assertEquals(corrige, { acao: "escrever", presente: true, motivo: "preenche_sem_resposta" });
  // Sem linha no livro nao ha prova — escreve normal.
  const semLivro = decidirEscritaAluno({
    ...base, estadoVigente: "falta", fonte: "agenda_secretaria",
    marca: "sem_resposta", ultimaEscrita: null,
  });
  assertEquals(semLivro, { acao: "escrever", presente: false, motivo: "preenche_sem_resposta" });
});

Deno.test("mutante 8: marca humana ja igual ao vigente = ja_coerente", () => {
  const r = decidirEscritaAluno({
    ...base, estadoVigente: "falta", fonte: "professor_la_teacher", marca: "ausente_marcada",
  });
  assertEquals(r, { acao: "pular", decisao: "ja_coerente", motivo: "marca_humana_igual" });
});

Deno.test("mutante 9: identidade divergente na linha bloqueia escrita", () => {
  const r = decidirEscritaAluno({
    ...base, identidadeOk: false, estadoVigente: "presente", fonte: "agenda_secretaria",
  });
  assertEquals(r, { acao: "pular", decisao: "pulado_identidade_divergente", motivo: "id_aluno_divergente" });
});

Deno.test("mutante 10: sem estado vigente nao avalia nem escreve", () => {
  assertEquals(decisaoPrecoceAluno(null, "agenda_secretaria"), {
    acao: "pular", decisao: "pulado_sem_estado", motivo: "sem_resposta_vigente",
  });
  assertEquals(decisaoPrecoceAluno("trancado", "agenda_secretaria"), {
    acao: "pular", decisao: "pulado_sem_estado", motivo: "vigente_trancado",
  });
});

Deno.test("professor: ficha confirmada escreve so em sem_resposta", () => {
  const baseProf = { aulaCancelada: false, identidadeOk: true, ultimaEscrita: null };
  assertEquals(decidirEscritaProfessor({ ...baseProf, marca: "sem_resposta" }), {
    acao: "escrever", presente: true, motivo: "preenche_sem_resposta",
  });
  assertEquals(decidirEscritaProfessor({ ...baseProf, marca: "presente" }), {
    acao: "pular", decisao: "ja_coerente", motivo: "professor_ja_presente",
  });
  // Falta do professor marcada pela equipe: nunca desmarca.
  assertEquals(decidirEscritaProfessor({ ...baseProf, marca: "ausente_marcada" }), {
    acao: "pular", decisao: "conflito_marca_humana", motivo: "marca_humana_divergente",
  });
  // Marca NOSSA de ausente pode ser corrigida para presente pela ficha.
  assertEquals(decidirEscritaProfessor({
    ...baseProf, marca: "ausente_marcada", ultimaEscrita: { presente: false },
  }), { acao: "escrever", presente: true, motivo: "corrige_marca_propria" });
  // Aula cancelada e identidade divergente bloqueiam.
  assertEquals(decidirEscritaProfessor({ ...baseProf, aulaCancelada: true, marca: "sem_resposta" }), {
    acao: "pular", decisao: "pulado_linha_protegida", motivo: "aula_cancelada",
  });
  assertEquals(decidirEscritaProfessor({ ...baseProf, identidadeOk: false, marca: "sem_resposta" }), {
    acao: "pular", decisao: "pulado_identidade_divergente", motivo: "professor_id_divergente",
  });
});
