/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import {
  assertEquals,
  assertMatch,
  assertNotEquals,
  assertRejects,
} from "jsr:@std/assert@1";
import {
  type AulaEmusys,
  buscarTodasAulas,
  type ExperimentalAluno,
  type FetchAulasPageParams,
  montarLinhasSnapshot,
  normalizarSituacaoExperimental,
  participanteChave,
} from "./experimental-snapshot.ts";

function aluno(
  overrides: Partial<ExperimentalAluno> = {},
): ExperimentalAluno {
  return {
    id_lead: 101,
    id_aluno: null,
    nome_aluno: "Pessoa Experimental",
    telefone_aluno: "21999999999",
    email_aluno: "pessoa@example.com",
    presenca: "ausente",
    ...overrides,
  };
}

function aula(
  overrides: Partial<AulaEmusys> = {},
): AulaEmusys {
  return {
    id: 5001,
    categoria: "experimental",
    cancelada: false,
    data_hora_inicio: "2026-07-30 20:00:00",
    data_hora_fim: "2026-07-30 20:50:00",
    curso_id: 7,
    curso_nome: "Canto",
    alunos: [aluno()],
    ...overrides,
  };
}

Deno.test("participanteChave prefere id_lead a dados textuais e id_aluno", () => {
  assertEquals(
    participanteChave(aluno({
      id_lead: 123,
      id_aluno: 456,
      nome_aluno: "Nome que pode mudar",
      telefone_aluno: "21000000000",
    })),
    "lead:123",
  );
});

Deno.test("participanteChave usa id_aluno quando nao ha lead", () => {
  assertEquals(
    participanteChave(aluno({ id_lead: 0, id_aluno: 456 })),
    "aluno:456",
  );
});

Deno.test("participanteChave permanece estavel apos mudar nome e telefone com ID externo", () => {
  const antes = participanteChave(aluno({
    id_lead: 789,
    nome_aluno: "Nome Antigo",
    telefone_aluno: "21111111111",
  }));
  const depois = participanteChave(aluno({
    id_lead: 789,
    nome_aluno: "Nome Novo",
    telefone_aluno: "21222222222",
  }));

  assertEquals(antes, depois);
});

Deno.test("montarLinhasSnapshot distingue duas pessoas na mesma aula", () => {
  const rows = montarLinhasSnapshot({
    unidadeId: "barra",
    execucaoId: "exec-1",
    aulas: [
      aula({
        alunos: [
          aluno({ id_lead: 101, nome_aluno: "Pessoa A" }),
          aluno({ id_lead: 202, nome_aluno: "Pessoa B" }),
        ],
      }),
    ],
    agora: new Date("2026-07-30T18:00:00Z"),
  });

  assertEquals(rows.length, 2);
  assertNotEquals(rows[0].participante_chave, rows[1].participante_chave);
  assertNotEquals(rows[0].raw_key, rows[1].raw_key);
});

Deno.test("normaliza presencas passadas e faz cancelamento prevalecer", () => {
  const base = {
    cancelada: false,
    dataHoraInicio: "2026-07-30 10:00:00",
    agora: new Date("2026-07-30T18:00:00Z"),
  };

  assertEquals(
    normalizarSituacaoExperimental({ ...base, presenca: "presente" }),
    "presente",
  );
  assertEquals(
    normalizarSituacaoExperimental({ ...base, presenca: "matriculado" }),
    "presente",
  );
  assertEquals(
    normalizarSituacaoExperimental({ ...base, presenca: "faltou" }),
    "faltou",
  );
  assertEquals(
    normalizarSituacaoExperimental({ ...base, presenca: "ausente" }),
    "faltou",
  );
  assertEquals(
    normalizarSituacaoExperimental({
      ...base,
      presenca: "presente",
      cancelada: true,
    }),
    "cancelada",
  );
  assertEquals(
    normalizarSituacaoExperimental({ ...base, presenca: null }),
    "sem_status",
  );
});

Deno.test("participante futuro ausente continua agendado", () => {
  assertEquals(
    normalizarSituacaoExperimental({
      presenca: "ausente",
      cancelada: false,
      dataHoraInicio: "2026-07-30 20:00:00",
      agora: new Date("2026-07-30T22:30:00Z"),
    }),
    "agendada",
  );
});

Deno.test("aula futura cancelada continua cancelada", () => {
  assertEquals(
    normalizarSituacaoExperimental({
      presenca: "ausente",
      cancelada: true,
      dataHoraInicio: "2026-07-30 20:00:00",
      agora: new Date("2026-07-30T22:30:00Z"),
    }),
    "cancelada",
  );
});

Deno.test("compara horario sem offset em America/Sao_Paulo", () => {
  const dataHoraInicio = "2026-07-30 20:00:00";

  assertEquals(
    normalizarSituacaoExperimental({
      presenca: "ausente",
      cancelada: false,
      dataHoraInicio,
      agora: new Date("2026-07-30T22:30:00Z"),
    }),
    "agendada",
  );
  assertEquals(
    normalizarSituacaoExperimental({
      presenca: "ausente",
      cancelada: false,
      dataHoraInicio,
      agora: new Date("2026-07-30T23:30:00Z"),
    }),
    "faltou",
  );
});

Deno.test("montarLinhasSnapshot filtra categoria, ignora aluno sem nome e preserva o bruto", () => {
  const rows = montarLinhasSnapshot({
    unidadeId: "barra",
    execucaoId: "exec-1",
    aulas: [
      aula({
        id: 51,
        alunos: [
          aluno({ id_lead: 1, nome_aluno: "Pessoa Válida" }),
          aluno({ id_lead: 2, nome_aluno: "   " }),
        ],
      }),
      aula({ id: 52, categoria: "normal" }),
    ],
    agora: new Date("2026-07-30T22:30:00Z"),
  });

  assertEquals(rows.length, 1);
  assertEquals(rows[0].unidade_id, "barra");
  assertEquals(rows[0].emusys_aula_id, 51);
  assertEquals(rows[0].participante_chave, "lead:1");
  assertEquals(rows[0].data_aula, "2026-07-30");
  assertEquals(rows[0].horario_aula, "20:00:00");
  assertEquals(rows[0].cancelada, false);
  assertEquals(rows[0].situacao_operacional, "agendada");
  assertEquals(rows[0].payload_bruto.data_aula, "2026-07-30");
  assertEquals(rows[0].payload_bruto.horario_aula, "20:00:00");
  assertEquals(rows[0].payload_bruto.cancelada, false);
  assertMatch(rows[0].raw_key, /^barra:51:lead:1:exec-1$/);
});

Deno.test("buscarTodasAulas percorre duas paginas com cursores diferentes", async () => {
  const chamadas: FetchAulasPageParams[] = [];
  const paginas = [
    Response.json({
      items: [aula({ id: 1 })],
      paginacao: { tem_mais: true, proximo_cursor: "cursor-1" },
    }),
    Response.json({
      items: [aula({ id: 2 })],
      paginacao: { tem_mais: false, proximo_cursor: null },
    }),
  ];

  const result = await buscarTodasAulas({
    dataInicio: "2026-07-01",
    dataFim: "2026-08-06",
    fetchPage: (params) => {
      chamadas.push(params);
      return Promise.resolve(paginas[chamadas.length - 1]);
    },
  });

  assertEquals(result.map((item) => item.id), [1, 2]);
  assertEquals(chamadas, [
    {
      dataInicio: "2026-07-01",
      dataFim: "2026-08-06",
      cursor: null,
      limite: 100,
    },
    {
      dataInicio: "2026-07-01",
      dataFim: "2026-08-06",
      cursor: "cursor-1",
      limite: 100,
    },
  ]);
});

Deno.test("buscarTodasAulas falha se tem_mais vier sem proximo_cursor", async () => {
  await assertRejects(
    () =>
      buscarTodasAulas({
        dataInicio: "2026-07-01",
        dataFim: "2026-08-06",
        fetchPage: () =>
          Promise.resolve(Response.json({
            items: [aula()],
            paginacao: { tem_mais: true, proximo_cursor: "  " },
          })),
      }),
    Error,
    "EMUSYS_AULAS_CURSOR_AUSENTE",
  );
});

Deno.test("buscarTodasAulas falha se cursor se repetir", async () => {
  let chamada = 0;

  await assertRejects(
    () =>
      buscarTodasAulas({
        dataInicio: "2026-07-01",
        dataFim: "2026-08-06",
        fetchPage: () => {
          chamada += 1;
          return Promise.resolve(Response.json({
            items: [aula({ id: chamada })],
            paginacao: {
              tem_mais: true,
              proximo_cursor: "cursor-repetido",
            },
          }));
        },
      }),
    Error,
    "EMUSYS_AULAS_CURSOR_REPETIDO",
  );
  assertEquals(chamada, 2);
});

Deno.test("buscarTodasAulas rejeita o lote inteiro apos erro HTTP", async () => {
  let chamada = 0;

  await assertRejects(
    () =>
      buscarTodasAulas({
        dataInicio: "2026-07-01",
        dataFim: "2026-08-06",
        fetchPage: () => {
          chamada += 1;
          if (chamada === 1) {
            return Promise.resolve(Response.json({
              items: [aula({ id: 1 })],
              paginacao: { tem_mais: true, proximo_cursor: "cursor-1" },
            }));
          }
          return Promise.resolve(new Response("indisponivel", { status: 503 }));
        },
      }),
    Error,
    "EMUSYS_AULAS_HTTP:503",
  );
});

Deno.test("buscarTodasAulas rejeita o lote inteiro apos JSON invalido", async () => {
  let chamada = 0;

  await assertRejects(
    () =>
      buscarTodasAulas({
        dataInicio: "2026-07-01",
        dataFim: "2026-08-06",
        fetchPage: () => {
          chamada += 1;
          if (chamada === 1) {
            return Promise.resolve(Response.json({
              items: [aula({ id: 1 })],
              paginacao: { tem_mais: true, proximo_cursor: "cursor-1" },
            }));
          }
          return Promise.resolve(
            new Response("{", {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        },
      }),
    Error,
    "EMUSYS_AULAS_JSON_INVALIDO",
  );
});
