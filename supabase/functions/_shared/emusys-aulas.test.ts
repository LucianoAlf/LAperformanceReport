/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  buscarPaginaAulasEmusys,
  EmusysApiError,
  montarVinculosAulaAlunos,
} from "./emusys-aulas.ts";

async function comFetchMock<T>(
  response: () => Response | Promise<Response>,
  callback: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(response())) as typeof fetch;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("buscarPaginaAulasEmusys devolve pagina tipada valida", async () => {
  const result = await comFetchMock(
    () =>
      Response.json({
        items: [{
          id: 1,
          categoria: "experimental",
          data_hora_inicio: "2026-07-30 20:00:00",
          alunos: [],
        }],
        paginacao: { tem_mais: false, proximo_cursor: null },
      }),
    () =>
      buscarPaginaAulasEmusys({
        token: "token-teste",
        dataInicio: "2026-07-30",
        dataFim: "2026-07-30",
      }),
  );

  assertEquals(result.items[0].id, 1);
  assertEquals(result.paginacao, {
    tem_mais: false,
    proximo_cursor: null,
  });
});

Deno.test("buscarPaginaAulasEmusys preserva EmusysApiError e Retry-After", async () => {
  const error = await assertRejects(
    () =>
      comFetchMock(
        () =>
          new Response("limite", {
            status: 429,
            headers: { "Retry-After": "30" },
          }),
        () =>
          buscarPaginaAulasEmusys({
            token: "token-teste",
            dataInicio: "2026-07-30",
            dataFim: "2026-07-30",
          }),
      ),
    EmusysApiError,
    "429",
  );

  assertEquals(error.status, 429);
  assertEquals(error.retryAfter, "30");
});

Deno.test("buscarPaginaAulasEmusys diferencia JSON invalido", async () => {
  await assertRejects(
    () =>
      comFetchMock(
        () =>
          new Response("{", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        () =>
          buscarPaginaAulasEmusys({
            token: "token-teste",
            dataInicio: "2026-07-30",
            dataFim: "2026-07-30",
          }),
      ),
    Error,
    "EMUSYS_AULAS_JSON_INVALIDO",
  );
});

Deno.test("buscarPaginaAulasEmusys rejeita payload estruturalmente invalido", async () => {
  const payloadsInvalidos = [
    { items: {}, paginacao: { tem_mais: false } },
    { items: [null], paginacao: { tem_mais: false } },
    { items: [], paginacao: null },
    { items: [], paginacao: { tem_mais: "false" } },
  ];

  for (const payload of payloadsInvalidos) {
    await assertRejects(
      () =>
        comFetchMock(
          () => Response.json(payload),
          () =>
            buscarPaginaAulasEmusys({
              token: "token-teste",
              dataInicio: "2026-07-30",
              dataFim: "2026-07-30",
            }),
        ),
      Error,
      "EMUSYS_AULAS_PAYLOAD_INVALIDO",
    );
  }
});

Deno.test("montarVinculosAulaAlunos monta os vinculos aula-aluno", () => {
  const UNIDADE = "95553e96-971b-4590-a6eb-0201d013c14d";
  const mapa = new Map<number, number>([[900, 1], [901, 2]]);

  // Aula individual com 1 aluno.
  const individual = montarVinculosAulaAlunos(
    [{
      id: 900,
      alunos: [{
        id_aluno: 55,
        id_lead: 0,
        nome_aluno: "Hugo Penedo Amorim",
        telefone_aluno: "(21) 99914-3430",
      }],
    }],
    mapa,
    UNIDADE,
  );
  assertEquals(individual.length, 1, "aula individual gera 1 vinculo");
  assertEquals(individual[0].aula_emusys_id, 1, "usa o id interno, nao o emusys_id");
  assertEquals(individual[0].emusys_aluno_id, 55);
  assertEquals(individual[0].lead_id, null, "id_lead 0 vira null");

  // Aula de turma: 1 vinculo por aluno.
  const turma = montarVinculosAulaAlunos(
    [{
      id: 901,
      alunos: [
        { id_aluno: 1, id_lead: 0, nome_aluno: "Daniel Cardoso", telefone_aluno: null },
        { id_aluno: 2, id_lead: 0, nome_aluno: "Guilherme Varjao", telefone_aluno: null },
      ],
    }],
    mapa,
    UNIDADE,
  );
  assertEquals(turma.length, 2, "turma com 2 alunos gera 2 vinculos");

  // Experimental: aluno ainda e lead, id_aluno null.
  const experimental = montarVinculosAulaAlunos(
    [{
      id: 900,
      alunos: [{
        id_aluno: null,
        id_lead: 987,
        nome_aluno: "Lead Novo",
        telefone_aluno: "(21) 97777-6666",
      }],
    }],
    mapa,
    UNIDADE,
  );
  assertEquals(experimental[0].emusys_aluno_id, null, "experimental nao tem emusys_aluno_id");
  assertEquals(experimental[0].lead_id, 987, "experimental carrega o lead_id");

  // Aula que nao esta no mapa (nao foi gravada) e ignorada, sem quebrar.
  const foraDoMapa = montarVinculosAulaAlunos(
    [{
      id: 999,
      alunos: [{ id_aluno: 1, id_lead: 0, nome_aluno: "Fantasma", telefone_aluno: null }],
    }],
    mapa,
    UNIDADE,
  );
  assertEquals(foraDoMapa, [], "aula fora do mapa nao gera vinculo");

  // Aluno sem nome e descartado: nome e a chave do upsert.
  const semNome = montarVinculosAulaAlunos(
    [{
      id: 900,
      alunos: [{ id_aluno: 1, id_lead: 0, nome_aluno: "", telefone_aluno: null }],
    }],
    mapa,
    UNIDADE,
  );
  assertEquals(semNome, [], "aluno sem nome nao gera vinculo");

  // Aula sem a chave alunos nao quebra.
  assertEquals(
    montarVinculosAulaAlunos([{ id: 900 }], mapa, UNIDADE),
    [],
    "aula sem alunos[] nao quebra",
  );
});
