/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  buscarTodasAulasEmusys,
  buscarPaginaAulasEmusys,
  criarAlunoChave,
  EmusysApiError,
  montarVinculosAulaAlunos,
} from "./emusys-aulas.ts";

/** Mesma normalizacao usada pelas duas edges. */
function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

Deno.test("buscarTodasAulasEmusys so entrega fotografia apos todas as paginas", async () => {
  const cursores: Array<string | null | undefined> = [];
  const aulas = await buscarTodasAulasEmusys<{ id: number }>({
    dataInicio: "2026-08-15",
    dataFim: "2026-08-15",
    fetchPage: async ({ cursor }) => {
      cursores.push(cursor);
      if (!cursor) {
        return {
          items: [{ id: 1 }],
          paginacao: { tem_mais: true, proximo_cursor: "pagina-2" },
        };
      }
      return {
        items: [{ id: 2 }],
        paginacao: { tem_mais: false, proximo_cursor: null },
      };
    },
  });

  assertEquals(aulas, [{ id: 1 }, { id: 2 }]);
  assertEquals(cursores, [null, "pagina-2"]);

  await assertRejects(
    () => buscarTodasAulasEmusys<{ id: number }>({
      dataInicio: "2026-08-15",
      dataFim: "2026-08-15",
      fetchPage: async () => ({
        items: [{ id: 3 }],
        paginacao: { tem_mais: true, proximo_cursor: null },
      }),
    }),
    Error,
    "EMUSYS_AULAS_CURSOR_AUSENTE",
  );
});

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

Deno.test("criarAlunoChave segue a precedencia emusys > local > nome", () => {
  assertEquals(
    criarAlunoChave({ id_aluno: 55, nome_aluno: "Hugo" }, 7, normalizarNome),
    "emusys:55",
    "id_aluno valido sempre vence",
  );
  assertEquals(
    criarAlunoChave({ id_aluno: 0, nome_aluno: "Hugo" }, 7, normalizarNome),
    "local:7",
    "id_aluno 0 nao e id valido: cai para o aluno local",
  );
  assertEquals(
    criarAlunoChave(
      { id_aluno: null, nome_aluno: "  Joao   DA Silva (kids) ", data_nascimento_aluno: "2010-05-02" },
      undefined,
      normalizarNome,
    ),
    "nome:joao da silva:2010-05-02",
    "sem id, a chave e nome normalizado + nascimento",
  );
  assertEquals(
    criarAlunoChave({ nome_aluno: "Sem Nada" }, null, normalizarNome),
    "nome:sem nada:",
    "sem nascimento a chave termina em ':'",
  );
});

Deno.test("montarVinculosAulaAlunos monta os vinculos aula-aluno", () => {
  const UNIDADE = "95553e96-971b-4590-a6eb-0201d013c14d";
  const mapa = new Map<number, number>([[900, 1], [901, 2]]);
  const AGORA = "2026-08-01T12:00:00.000Z";

  // Aula individual com 1 aluno.
  const individual = montarVinculosAulaAlunos(
    [{
      id: 900,
      alunos: [{
        id_aluno: 55,
        id_lead: 0,
        nome_aluno: " Hugo Penedo Amorim ",
        telefone_aluno: "(21) 99914-3430",
      }],
    }],
    mapa,
    UNIDADE,
    normalizarNome,
    AGORA,
  );
  assertEquals(individual.length, 1, "aula individual gera 1 vinculo");
  assertEquals(individual[0].aula_emusys_id, 1, "usa o id interno, nao o emusys_id");
  assertEquals(individual[0].unidade_id, UNIDADE);
  assertEquals(individual[0].aluno_emusys_id, 55);
  assertEquals(individual[0].aluno_chave, "emusys:55");
  assertEquals(individual[0].aluno_nome, "Hugo Penedo Amorim", "nome vai trimado");
  assertEquals(individual[0].aluno_nome_normalizado, "hugo penedo amorim");
  assertEquals(individual[0].sincronizado_em, AGORA);
  assertEquals(individual[0].updated_at, AGORA);

  // O payload NAO pode carregar aluno_id: o upsert com ignoreDuplicates:false
  // atualiza as colunas presentes, e um aluno_id null aqui apagaria o que o
  // sync de presenca ja resolveu. Quem preenche e o trigger before insert.
  assertEquals(
    Object.keys(individual[0]).includes("aluno_id"),
    false,
    "aluno_id nunca entra no payload",
  );

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
    normalizarNome,
    AGORA,
  );
  assertEquals(turma.length, 2, "turma com 2 alunos gera 2 vinculos");

  // Homonimos com id_aluno diferente: a chave antiga (nome) colapsava os dois
  // em 1 linha; (aula_emusys_id, aluno_chave) mantem os dois.
  const homonimos = montarVinculosAulaAlunos(
    [{
      id: 900,
      alunos: [
        { id_aluno: 10, id_lead: 0, nome_aluno: "Maria Silva", telefone_aluno: null },
        { id_aluno: 11, id_lead: 0, nome_aluno: "Maria Silva", telefone_aluno: null },
      ],
    }],
    mapa,
    UNIDADE,
    normalizarNome,
    AGORA,
  );
  assertEquals(homonimos.length, 2, "dois homonimos geram duas linhas");
  assertEquals(
    new Set(homonimos.map((v) => v.aluno_chave)).size,
    2,
    "as chaves dos homonimos sao distintas",
  );
  assertEquals(homonimos.map((v) => v.aluno_chave), ["emusys:10", "emusys:11"]);

  // Experimental: aluno ainda e lead, id_aluno null -> chave por nome.
  const experimental = montarVinculosAulaAlunos(
    [{
      id: 900,
      alunos: [{
        id_aluno: null,
        id_lead: 987,
        nome_aluno: "Lead Novo",
        data_nascimento_aluno: "2001-03-04",
        telefone_aluno: "(21) 97777-6666",
      }],
    }],
    mapa,
    UNIDADE,
    normalizarNome,
    AGORA,
  );
  assertEquals(experimental[0].aluno_emusys_id, null, "experimental nao tem aluno_emusys_id");
  assertEquals(experimental[0].aluno_chave, "nome:lead novo:2001-03-04");

  // Aula que nao esta no mapa (nao foi gravada) e ignorada, sem quebrar.
  const foraDoMapa = montarVinculosAulaAlunos(
    [{
      id: 999,
      alunos: [{ id_aluno: 1, id_lead: 0, nome_aluno: "Fantasma", telefone_aluno: null }],
    }],
    mapa,
    UNIDADE,
    normalizarNome,
    AGORA,
  );
  assertEquals(foraDoMapa, [], "aula fora do mapa nao gera vinculo");

  // Aluno sem nome e descartado: aluno_nome e NOT NULL na tabela.
  const semNome = montarVinculosAulaAlunos(
    [{
      id: 900,
      alunos: [{ id_aluno: 1, id_lead: 0, nome_aluno: "   ", telefone_aluno: null }],
    }],
    mapa,
    UNIDADE,
    normalizarNome,
    AGORA,
  );
  assertEquals(semNome, [], "aluno sem nome nao gera vinculo");

  // Aula sem a chave alunos nao quebra.
  assertEquals(
    montarVinculosAulaAlunos([{ id: 900 }], mapa, UNIDADE, normalizarNome, AGORA),
    [],
    "aula sem alunos[] nao quebra",
  );
});
