import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  aplicarSnapshotsMetadados,
  chaveAulaPorUnidade,
  classificarErroSnapshot,
  executarModoExperimentais,
  horarioExperimentalParaBanco,
  montarPatchReconciliacaoExperimental,
  normalizarHorarioExperimental,
  selecionarIdsCancelamentoEstavel,
  selecionarIdsCancelamentoPorAula,
  SnapshotRequestError,
  SnapshotUpstreamError,
  validarParametrosExperimentais,
} from "../supabase/functions/_shared/sync-experimentais-mode.ts";

const UNIDADE = {
  id: "368d47f5-2d88-4475-bc14-ba084a9a348e",
  nome: "Barra",
};

const BODY = {
  modo: "experimentais",
  unidade_id: UNIDADE.id,
  data_inicio: "2026-07-01",
  data_fim: "2026-07-31",
};

function aula(overrides = {}) {
  return {
    id: 9001,
    categoria: "experimental",
    cancelada: false,
    data_hora_inicio: "2026-07-30 20:00:00",
    data_hora_fim: "2026-07-30 20:50:00",
    curso_id: 77,
    curso_nome: "Nome textual nao canonico",
    professores: [{ id: 88, nome: "Professor Emusys" }],
    alunos: [
      {
        id_lead: 501,
        id_aluno: null,
        nome_aluno: "Alice Exemplo",
        telefone_aluno: "21999999999",
        presenca: "presente",
      },
    ],
    ...overrides,
  };
}

function criarCenario(overrides = {}) {
  const chamadas = [];
  const capturas = {
    rpc: [],
    reconciliacao: [],
  };

  const deps = {
    criarExecucaoId: () => "11111111-1111-4111-8111-111111111111",
    agora: () => new Date("2026-07-31T12:00:00.000Z"),
    buscarTodasAulas: ({ unidade, dataInicio, dataFim }) => {
      chamadas.push("buscar");
      assert.equal(unidade.id, UNIDADE.id);
      assert.equal(dataInicio, BODY.data_inicio);
      assert.equal(dataFim, BODY.data_fim);
      return Promise.resolve([aula()]);
    },
    aplicarSnapshotRpc: (input) => {
      chamadas.push("rpc");
      capturas.rpc.push(input);
      return Promise.resolve({
        execucao_id: input.execucaoId,
        status: "completo",
        linhas_recebidas: input.linhas.length,
        linhas_ativas: input.linhas.length,
        linhas_inseridas: input.linhas.length,
        linhas_atualizadas: 0,
        linhas_versionadas: 0,
        linhas_inativadas: 0,
      });
    },
    carregarCursoDePara: (unidadeId) => {
      chamadas.push("curso");
      assert.equal(unidadeId, UNIDADE.id);
      return Promise.resolve(
        new Map([
          [77, { cursoId: 9, cursoNome: "Canto canonico" }],
        ]),
      );
    },
    carregarResolverProfessor: (unidadeId) => {
      chamadas.push("professor");
      assert.equal(unidadeId, UNIDADE.id);
      return Promise.resolve(() => 12);
    },
    reconciliar: (experimentais) => {
      chamadas.push("reconciliar");
      capturas.reconciliacao.push(experimentais);
      return Promise.resolve([{ status: "reconciliada_presente" }]);
    },
    onFluxoPresenca: () => {
      chamadas.push("presenca");
    },
    onAtualizarPercentual: () => {
      chamadas.push("percentual");
    },
    ...overrides,
  };

  return { chamadas, capturas, deps };
}

test("valida UUID, unidade conhecida e intervalo inclusivo de no maximo 45 dias", () => {
  const unidades = [UNIDADE];
  assert.deepEqual(
    validarParametrosExperimentais(BODY, unidades),
    {
      unidade: UNIDADE,
      dataInicio: "2026-07-01",
      dataFim: "2026-07-31",
    },
  );

  for (
    const body of [
      { ...BODY, unidade_id: "barra" },
      {
        ...BODY,
        unidade_id: "95553e96-971b-4590-a6eb-0201d013c14d",
      },
      { ...BODY, data_inicio: "2026-07-32" },
      {
        ...BODY,
        data_inicio: "2026-01-01",
        data_fim: "2026-03-01",
      },
      {
        ...BODY,
        data_inicio: "2026-08-01",
        data_fim: "2026-07-31",
      },
    ]
  ) {
    assert.throws(
      () => validarParametrosExperimentais(body, unidades),
      SnapshotRequestError,
    );
  }
});

test("executa busca completa, uma RPC e somente depois reconcilia", async () => {
  const cenario = criarCenario();

  const resposta = await executarModoExperimentais({
    body: BODY,
    unidades: [UNIDADE],
    deps: cenario.deps,
  });

  assert.deepEqual(
    cenario.chamadas.filter((item) =>
      ["buscar", "rpc", "reconciliar"].includes(item)
    ),
    ["buscar", "rpc", "reconciliar"],
  );
  assert.equal(cenario.capturas.rpc.length, 1);
  assert.equal(cenario.capturas.rpc[0].linhas.length, 1);
  assert.equal(resposta.snapshot.experimentais_reconciliadas, 1);
});

test("execucao admitida usa UUID fornecido sem gerar outra versao", async () => {
  const execucaoId = "33333333-3333-4333-8333-333333333333";
  const cenario = criarCenario({
    criarExecucaoId: () => {
      throw new Error("nao deve gerar UUID");
    },
  });

  const resposta = await executarModoExperimentais({
    body: { ...BODY, execucao_id: execucaoId },
    unidades: [UNIDADE],
    deps: cenario.deps,
  });

  assert.equal(cenario.capturas.rpc[0].execucaoId, execucaoId);
  assert.equal(resposta.snapshot.execucao_id, execucaoId);
});

test("execucao admitida invalida falha antes de buscar o Emusys", async () => {
  const cenario = criarCenario();

  await assert.rejects(
    executarModoExperimentais({
      body: { ...BODY, execucao_id: "nao-e-uuid" },
      unidades: [UNIDADE],
      deps: cenario.deps,
    }),
    (error) =>
      error instanceof SnapshotRequestError &&
      error.message === "EXECUCAO_ID_INVALIDA",
  );
  assert.deepEqual(cenario.chamadas, []);
});

test("falha da RPC impede carregar contexto e reconciliar", async () => {
  const cenario = criarCenario({
    aplicarSnapshotRpc: () => {
      cenario.chamadas.push("rpc");
      return Promise.reject(new Error("falha banco"));
    },
  });

  await assert.rejects(
    executarModoExperimentais({
      body: BODY,
      unidades: [UNIDADE],
      deps: cenario.deps,
    }),
    /falha banco/,
  );
  assert.deepEqual(cenario.chamadas, ["buscar", "rpc"]);
});

test("falha da reconciliacao rejeita e e classificada como 500", async () => {
  const falha = new Error("falha reconciliacao");
  const cenario = criarCenario({
    reconciliar: () => {
      cenario.chamadas.push("reconciliar");
      return Promise.reject(falha);
    },
  });

  await assert.rejects(
    executarModoExperimentais({
      body: BODY,
      unidades: [UNIDADE],
      deps: cenario.deps,
    }),
    falha,
  );
  assert.deepEqual(classificarErroSnapshot(falha), {
    status: 500,
    mensagem: "ERRO_INTERNO",
  });
});

test("classifica request como 400 e falha upstream da busca como 502", async () => {
  let requestError;
  try {
    validarParametrosExperimentais(
      { ...BODY, unidade_id: "invalida" },
      [UNIDADE],
    );
  } catch (error) {
    requestError = error;
  }
  assert.ok(requestError instanceof SnapshotRequestError);
  assert.deepEqual(classificarErroSnapshot(requestError), {
    status: 400,
    mensagem: "UNIDADE_ID_INVALIDA",
  });

  const cenario = criarCenario({
    buscarTodasAulas: () =>
      Promise.reject(new Error("HTTP 503 com detalhes privados")),
  });
  let upstream;
  try {
    await executarModoExperimentais({
      body: BODY,
      unidades: [UNIDADE],
      deps: cenario.deps,
    });
  } catch (error) {
    upstream = error;
  }
  assert.ok(upstream instanceof SnapshotUpstreamError);
  assert.deepEqual(classificarErroSnapshot(upstream), {
    status: 502,
    mensagem: "FALHA_UPSTREAM_EMUSYS",
  });
});

test("resposta publica somente unidade, intervalo e agregados sem PII", async () => {
  const cenario = criarCenario();
  const resposta = await executarModoExperimentais({
    body: BODY,
    unidades: [UNIDADE],
    deps: cenario.deps,
  });
  const serializada = JSON.stringify(resposta);

  assert.deepEqual(Object.keys(resposta), [
    "success",
    "modo",
    "unidade",
    "intervalo",
    "snapshot",
  ]);
  for (
    const pii of [
      "Alice",
      "21999999999",
      "aluno_nome",
      "telefone",
      "payload",
      "raw_key",
    ]
  ) {
    assert.doesNotMatch(serializada, new RegExp(pii, "i"));
  }
});

test("modo experimentais retorna sem callbacks de presenca ou percentual", async () => {
  const cenario = criarCenario();
  await executarModoExperimentais({
    body: BODY,
    unidades: [UNIDADE],
    deps: cenario.deps,
  });

  assert.equal(cenario.chamadas.includes("presenca"), false);
  assert.equal(cenario.chamadas.includes("percentual"), false);
});

test("metadados aplica os mesmos arrays coletados sem contrato de segundo fetch", async () => {
  const aulasBarra = [aula()];
  const aulasRecreio = [aula({ id: 9002 })];
  const lotes = [
    {
      unidade: UNIDADE,
      dataInicio: BODY.data_inicio,
      dataFim: BODY.data_fim,
      aulas: aulasBarra,
    },
    {
      unidade: {
        id: "95553e96-971b-4590-a6eb-0201d013c14d",
        nome: "Recreio",
      },
      dataInicio: BODY.data_inicio,
      dataFim: BODY.data_fim,
      aulas: aulasRecreio,
    },
  ];
  const recebidos = [];

  const respostas = await aplicarSnapshotsMetadados({
    lotes,
    aplicarSnapshot: (lote) => {
      recebidos.push(lote.aulas);
      return Promise.resolve({ execucao_id: `exec-${recebidos.length}` });
    },
  });

  assert.equal(recebidos[0], aulasBarra);
  assert.equal(recebidos[1], aulasRecreio);
  assert.equal(respostas.length, 2);
});

test("metadados rejeita o lote inteiro quando uma aplicacao falha", async () => {
  const lotes = [
    {
      unidade: UNIDADE,
      dataInicio: BODY.data_inicio,
      dataFim: BODY.data_fim,
      aulas: [aula()],
    },
    {
      unidade: {
        id: "95553e96-971b-4590-a6eb-0201d013c14d",
        nome: "Recreio",
      },
      dataInicio: BODY.data_inicio,
      dataFim: BODY.data_fim,
      aulas: [aula({ id: 9002 })],
    },
  ];
  let chamadas = 0;

  await assert.rejects(
    aplicarSnapshotsMetadados({
      lotes,
      aplicarSnapshot: () => {
        chamadas += 1;
        if (chamadas === 2) {
          return Promise.reject(new Error("falha segundo lote"));
        }
        return Promise.resolve({ execucao_id: "exec-1" });
      },
    }),
    /falha segundo lote/,
  );
  assert.equal(chamadas, 2);
});

test("normaliza horario com segundos sem duplicar o sufixo do banco", async () => {
  assert.equal(
    normalizarHorarioExperimental("2026-07-30 20:00:00"),
    "20:00",
  );
  assert.equal(horarioExperimentalParaBanco("20:00"), "20:00:00");
  assert.equal(horarioExperimentalParaBanco("20:00:00"), "20:00:00");

  const cenario = criarCenario();
  await executarModoExperimentais({
    body: BODY,
    unidades: [UNIDADE],
    deps: cenario.deps,
  });
  const item = cenario.capturas.reconciliacao[0][0];
  assert.equal(item.horario, "20:00");
  assert.equal(item.horarioBanco, "20:00:00");
});

test("de-para canonico projeta curso e evita inserir duplicata por curso null", async () => {
  const cenario = criarCenario();
  let insercoes = 0;
  cenario.deps.reconciliar = (experimentais) => {
    cenario.capturas.reconciliacao.push(experimentais);
    const item = experimentais[0];
    const encontrouExistente = item.alunos[0].id_lead === 501 &&
      item.dataAula === "2026-07-30" &&
      item.horarioBanco === "20:00:00" &&
      item.cursoId === 9;
    if (!encontrouExistente) insercoes += 1;
    return Promise.resolve(
      encontrouExistente ? [{ status: "reconciliada_presente" }] : [],
    );
  };

  await executarModoExperimentais({
    body: BODY,
    unidades: [UNIDADE],
    deps: cenario.deps,
  });
  const item = cenario.capturas.reconciliacao[0][0];

  assert.equal(item.cursoId, 9);
  assert.equal(item.cursoNome, "Canto canonico");
  assert.notEqual(item.cursoNome, "Nome textual nao canonico");
  assert.equal(insercoes, 0);
});

test("curso fica null sem de-para e nunca usa nome textual como vinculo", async () => {
  const cenario = criarCenario({
    carregarCursoDePara: () => Promise.resolve(new Map()),
  });
  await executarModoExperimentais({
    body: BODY,
    unidades: [UNIDADE],
    deps: cenario.deps,
  });
  const item = cenario.capturas.reconciliacao[0][0];

  assert.equal(item.cursoId, null);
  assert.equal(item.cursoNome, null);
});

test("cancelamento encontra webhook com id de evento divergente por identidade estavel", () => {
  const ids = selecionarIdsCancelamentoEstavel({
    identidade: {
      unidadeId: UNIDADE.id,
      dataAula: "2026-07-30",
      horarioBanco: "20:00:00",
      cursoId: 9,
      emusysLeadId: 501,
      leadId: 41,
      alunoId: null,
    },
    candidatos: [
      {
        id: 10,
        status: "experimental_agendada",
        unidadeId: UNIDADE.id,
        emusysAulaId: 7001,
        dataAula: "2026-07-30",
        horarioBanco: "20:00:00",
        cursoId: 9,
        emusysLeadId: 501,
        leadId: 41,
        alunoId: null,
        nomeAluno: "Nome alterado no webhook",
        telefone: "00000000000",
      },
      {
        id: 11,
        status: "experimental_agendada",
        unidadeId: UNIDADE.id,
        emusysAulaId: 8001,
        dataAula: "2026-07-30",
        horarioBanco: "20:00:00",
        cursoId: 9,
        emusysLeadId: 999,
        leadId: 99,
        alunoId: null,
        nomeAluno: "Alice Exemplo",
        telefone: "21999999999",
      },
      {
        id: 12,
        status: "experimental_agendada",
        unidadeId: "95553e96-971b-4590-a6eb-0201d013c14d",
        emusysAulaId: 7001,
        dataAula: "2026-07-30",
        horarioBanco: "20:00:00",
        cursoId: 9,
        emusysLeadId: 501,
        leadId: 41,
        alunoId: null,
      },
    ],
  });

  assert.deepEqual(ids, [10]);
  assert.notEqual(7001, 9001, "webhook e /aulas podem ter IDs diferentes");
});

test("cancelamento nao usa nome ou telefone quando IDs estaveis nao batem", () => {
  const ids = selecionarIdsCancelamentoEstavel({
    identidade: {
      unidadeId: UNIDADE.id,
      dataAula: "2026-07-30",
      horarioBanco: "20:00:00",
      cursoId: 9,
      emusysLeadId: 501,
      leadId: 41,
      alunoId: null,
    },
    candidatos: [{
      id: 20,
      status: "experimental_agendada",
      unidadeId: UNIDADE.id,
      emusysAulaId: 7001,
      dataAula: "2026-07-30",
      horarioBanco: "20:00:00",
      cursoId: 9,
      emusysLeadId: 999,
      leadId: 99,
      alunoId: null,
      nomeAluno: "Alice Exemplo",
      telefone: "21999999999",
    }],
  });

  assert.deepEqual(ids, []);
});

test("cancelamento encontra participante por id de aluno local resolvido", () => {
  const ids = selecionarIdsCancelamentoEstavel({
    identidade: {
      unidadeId: UNIDADE.id,
      dataAula: "2026-07-30",
      horarioBanco: "20:00:00",
      cursoId: 9,
      emusysLeadId: null,
      leadId: null,
      alunoId: 77,
    },
    candidatos: [{
      id: 21,
      status: "experimental_agendada",
      unidadeId: UNIDADE.id,
      emusysAulaId: 7001,
      dataAula: "2026-07-30",
      horarioBanco: "20:00:00",
      cursoId: 9,
      emusysLeadId: null,
      leadId: null,
      alunoId: 77,
    }],
  });

  assert.deepEqual(ids, [21]);
});

for (const statusTerminal of ["convertido", "matriculado"]) {
  test(`cancelamento por unidade e aula preserva ${statusTerminal}`, () => {
    const ids = selecionarIdsCancelamentoPorAula({
      unidadeId: UNIDADE.id,
      emusysAulaId: 9001,
      candidatos: [
        {
          id: 30,
          status: statusTerminal,
          unidadeId: UNIDADE.id,
          emusysAulaId: 9001,
        },
        {
          id: 31,
          status: "experimental_agendada",
          unidadeId: UNIDADE.id,
          emusysAulaId: 9001,
        },
      ],
    });

    assert.deepEqual(ids, [31]);
  });

  test(`cancelamento por identidade estavel preserva ${statusTerminal}`, () => {
    const ids = selecionarIdsCancelamentoEstavel({
      identidade: {
        unidadeId: UNIDADE.id,
        dataAula: "2026-07-30",
        horarioBanco: "20:00:00",
        cursoId: 9,
        emusysLeadId: 501,
        leadId: 41,
        alunoId: null,
      },
      candidatos: [
        {
          id: 40,
          status: statusTerminal,
          unidadeId: UNIDADE.id,
          emusysAulaId: 7001,
          dataAula: "2026-07-30",
          horarioBanco: "20:00:00",
          cursoId: 9,
          emusysLeadId: 501,
          leadId: 41,
          alunoId: null,
        },
        {
          id: 41,
          status: "experimental_agendada",
          unidadeId: UNIDADE.id,
          emusysAulaId: 7002,
          dataAula: "2026-07-30",
          horarioBanco: "20:00:00",
          cursoId: 9,
          emusysLeadId: 501,
          leadId: 41,
          alunoId: null,
        },
      ],
    });

    assert.deepEqual(ids, [41]);
  });
}

for (const statusTerminal of ["convertido", "matriculado"]) {
  test(`preserva status terminal ${statusTerminal} e atualiza demais vinculos`, () => {
    const resultado = montarPatchReconciliacaoExperimental({
      atual: {
        status: statusTerminal,
        cursoId: null,
        professorId: null,
        emusysAulaId: null,
        emusysLeadId: null,
        alunoId: null,
      },
      desejado: {
        status: "experimental_faltou",
        etapaPipelineId: 9,
        cursoId: 9,
        professorId: 12,
        emusysAulaId: 9001,
        emusysLeadId: 501,
        alunoId: 77,
      },
      atualizadoEm: "2026-07-31T12:00:00.000Z",
    });

    assert.equal(resultado.statusMudou, false);
    assert.equal("status" in resultado.patch, false);
    assert.equal("etapa_pipeline_id" in resultado.patch, false);
    assert.deepEqual(resultado.patch, {
      updated_at: "2026-07-31T12:00:00.000Z",
      curso_interesse_id: 9,
      professor_experimental_id: 12,
      emusys_aula_id: 9001,
      emusys_lead_id: 501,
      aluno_id: 77,
    });
  });
}

test("mesmo ID de aula pertence a chaves distintas em unidades diferentes", () => {
  assert.notEqual(
    chaveAulaPorUnidade(UNIDADE.id, 9001),
    chaveAulaPorUnidade(
      "95553e96-971b-4590-a6eb-0201d013c14d",
      9001,
    ),
  );

  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731133000_lead_experimentais_aula_unica_por_unidade.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /drop index if exists public\.uq_lead_exp_aula/i);
  assert.match(
    migration,
    /create unique index uq_lead_exp_aula[\s\S]*\(unidade_id, emusys_aula_id\)/i,
  );
  assert.doesNotMatch(
    migration,
    /create unique index uq_lead_exp_aula\s+on[^;]+\(emusys_aula_id\)/i,
  );
});

test("edge usa o modulo puro e o horario de banco projetado", () => {
  const source = readFileSync(
    new URL(
      "../supabase/functions/sync-presenca-emusys/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /from '\.\.\/_shared\/sync-experimentais-mode\.ts'/);
  assert.match(source, /await executarModoExperimentais\(/);
  assert.match(
    source,
    /\.eq\('horario_experimental',\s*exp\.horarioBanco\)/,
  );
  assert.match(source, /horario_experimental:\s*exp\.horarioBanco/);
  assert.match(source, /selecionarIdsCancelamentoEstavel\(/);
  assert.match(source, /selecionarIdsCancelamentoPorAula\(/);
  assert.match(source, /montarPatchReconciliacaoExperimental\(/);
  assert.match(
    source,
    /\.from\('curso_emusys_depara'\)[\s\S]{0,200}\.eq\('unidade_id', unidadeId\)/,
  );
});
