/// <reference lib="deno.ns" />

import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  montarSnapshotGradeEmusys,
  reconciliarGradeSnapshotEmusys,
  reconciliarGradeSnapshotEmusysV1,
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

const PARAMS_RECONCILIACAO = {
  syncRunId: "30000000-0000-4000-8000-000000000001",
  unidadeId: "368d47f5-2d88-4475-bc14-ba084a9a348e",
  dataInicio: "2026-08-27",
  dataFim: "2026-08-27",
  snapshot: [{
    emusys_id: 10,
    estado: "completo" as const,
    qtd_esperada: 1,
    qtd_recebida: 1,
    aluno_chaves: ["emusys:101"],
  }],
};

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
      {
        emusys_id: 10,
        estado: "vazio_confirmado",
        qtd_esperada: 0,
        qtd_recebida: 0,
        aluno_chaves: [],
      },
      {
        emusys_id: 20,
        estado: "incompleto",
        qtd_esperada: 2,
        qtd_recebida: 0,
        aluno_chaves: [],
      },
      {
        emusys_id: 30,
        estado: "incompleto",
        qtd_esperada: 2,
        qtd_recebida: 1,
        aluno_chaves: ["emusys:301"],
      },
      {
        emusys_id: 40,
        estado: "ambiguo",
        qtd_esperada: 1,
        qtd_recebida: 1,
        aluno_chaves: ["nome:aluno sem id:"],
      },
      {
        emusys_id: 50,
        estado: "incompleto",
        qtd_esperada: 0,
        qtd_recebida: 0,
        aluno_chaves: [],
      },
    ],
  );
  assertEquals(
    montarSnapshotGradeEmusys([{
      id: 10,
      qtd_alunos: 1,
      alunos: [{ id_aluno: 321, nome_aluno: "" }],
    }], normalizarNome),
    [{
      emusys_id: 10,
      estado: "completo",
      qtd_esperada: 1,
      qtd_recebida: 1,
      aluno_chaves: ["emusys:321"],
    }],
  );
});

Deno.test("linha individual cancelada e container vazio permanecem aulas distintas", () => {
  assertEquals(
    montarSnapshotGradeEmusys([
      {
        id: 60,
        cancelada: true,
        alunos: [{ id_aluno: 601, nome_aluno: "Historico" }],
      },
      { id: 61, cancelada: false, qtd_alunos: 0, alunos: [] },
    ], normalizarNome),
    [
      {
        emusys_id: 60,
        estado: "completo",
        qtd_esperada: 1,
        qtd_recebida: 1,
        aluno_chaves: ["emusys:601"],
      },
      {
        emusys_id: 61,
        estado: "vazio_confirmado",
        qtd_esperada: 0,
        qtd_recebida: 0,
        aluno_chaves: [],
      },
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

Deno.test("contrato legado v1 continua aceito quando o banco expandido tambem possui v2", async () => {
  const chamadas: Array<{ nome: string; parametros: Record<string, unknown> }> =
    [];
  const cliente = {
    rpc: async (nome: string, parametros: Record<string, unknown>) => {
      chamadas.push({ nome, parametros });
      if (nome === "reconciliar_grade_snapshot_emusys_v1") {
        return { data: { status: "ok", contrato_db: "v1" }, error: null };
      }
      if (nome === "reconciliar_grade_snapshot_emusys_v2") {
        return { data: { status: "ok", contrato_db: "v2" }, error: null };
      }
      throw new Error(`RPC inesperada: ${nome}`);
    },
  };

  const resultado = await reconciliarGradeSnapshotEmusysV1(cliente, {
    unidadeId: PARAMS_RECONCILIACAO.unidadeId,
    dataInicio: PARAMS_RECONCILIACAO.dataInicio,
    dataFim: PARAMS_RECONCILIACAO.dataFim,
    snapshot: PARAMS_RECONCILIACAO.snapshot,
  });

  assertEquals(resultado, { status: "ok", contrato_db: "v1" });
  assertEquals(chamadas, [{
    nome: "reconciliar_grade_snapshot_emusys_v1",
    parametros: {
      p_unidade_id: PARAMS_RECONCILIACAO.unidadeId,
      p_data_inicio: PARAMS_RECONCILIACAO.dataInicio,
      p_data_fim: PARAMS_RECONCILIACAO.dataFim,
      p_snapshot: PARAMS_RECONCILIACAO.snapshot,
      p_dry_run: false,
    },
  }]);
});

Deno.test("contrato dual usa v2 e encaminha o sync run quando a RPC existe", async () => {
  const chamadas: Array<{ nome: string; parametros: Record<string, unknown> }> =
    [];
  const cliente = {
    rpc: async (nome: string, parametros: Record<string, unknown>) => {
      chamadas.push({ nome, parametros });
      return { data: { status: "ok", estados_gravados: 1 }, error: null };
    },
  };

  const resultado = await reconciliarGradeSnapshotEmusys(
    cliente,
    PARAMS_RECONCILIACAO,
  );

  assertEquals(resultado, {
    contrato: "v2",
    resultado: { status: "ok", estados_gravados: 1 },
  });
  assertEquals(chamadas, [{
    nome: "reconciliar_grade_snapshot_emusys_v2",
    parametros: {
      p_sync_run_id: PARAMS_RECONCILIACAO.syncRunId,
      p_unidade_id: PARAMS_RECONCILIACAO.unidadeId,
      p_data_inicio: PARAMS_RECONCILIACAO.dataInicio,
      p_data_fim: PARAMS_RECONCILIACAO.dataFim,
      p_snapshot: PARAMS_RECONCILIACAO.snapshot,
      p_dry_run: false,
    },
  }]);
});

Deno.test("contrato dual faz um unico fallback v1 somente para PGRST202", async () => {
  const chamadas: Array<{ nome: string; parametros: Record<string, unknown> }> =
    [];
  const cliente = {
    rpc: async (nome: string, parametros: Record<string, unknown>) => {
      chamadas.push({ nome, parametros });
      if (nome === "reconciliar_grade_snapshot_emusys_v2") {
        return {
          data: null,
          error: {
            code: "PGRST202",
            message: "funcao v2 ausente do schema cache",
          },
        };
      }
      return { data: { status: "ok", estados_gravados: 1 }, error: null };
    },
  };

  const resultado = await reconciliarGradeSnapshotEmusys(
    cliente,
    PARAMS_RECONCILIACAO,
  );

  assertEquals(resultado, {
    contrato: "v1_fallback",
    resultado: { status: "ok", estados_gravados: 1 },
  });
  assertEquals(
    chamadas.map(({ nome }) => nome),
    [
      "reconciliar_grade_snapshot_emusys_v2",
      "reconciliar_grade_snapshot_emusys_v1",
    ],
  );
});

Deno.test("validacao autorizacao timeout assinatura e rede nunca acionam fallback", async () => {
  const erros = [
    { code: "22023", message: "snapshot invalido" },
    { code: "42501", message: "sem autorizacao" },
    { code: "PGRST203", message: "assinatura ambigua" },
    { message: "Could not find function sem codigo confiavel" },
  ];

  for (const error of erros) {
    const chamadas: string[] = [];
    const cliente = {
      rpc: async (nome: string) => {
        chamadas.push(nome);
        return { data: null, error };
      },
    };

    await assertRejects(
      () => reconciliarGradeSnapshotEmusys(cliente, PARAMS_RECONCILIACAO),
      Error,
      "PRESENCA_SYNC_RECONCILIACAO_ROSTER_FALHOU",
    );
    assertEquals(chamadas, ["reconciliar_grade_snapshot_emusys_v2"]);
  }

  for (const error of [
    { code: "57014", message: "statement timeout" },
    { code: "40001", message: "serializacao concorrente" },
  ]) {
    const chamadas: string[] = [];
    const cliente = {
      rpc: async (nome: string) => {
        chamadas.push(nome);
        return { data: null, error };
      },
    };

    await assertRejects(
      () =>
        reconciliarGradeSnapshotEmusys(
          cliente,
          PARAMS_RECONCILIACAO,
          {
            maxTentativas: 2,
            atrasoBaseMs: 1,
            atrasoMaximoMs: 1,
            dormir: async () => {},
          },
        ),
      Error,
      "PRESENCA_SYNC_CONCORRENCIA_ESGOTADA",
    );
    assertEquals(chamadas, [
      "reconciliar_grade_snapshot_emusys_v2",
      "reconciliar_grade_snapshot_emusys_v2",
    ]);
  }

  const chamadasRede: string[] = [];
  const clienteRede = {
    rpc: async (nome: string): Promise<never> => {
      chamadasRede.push(nome);
      throw new TypeError("rede indisponivel");
    },
  };
  await assertRejects(
    () => reconciliarGradeSnapshotEmusys(clienteRede, PARAMS_RECONCILIACAO),
    TypeError,
    "rede indisponivel",
  );
  assertEquals(chamadasRede, ["reconciliar_grade_snapshot_emusys_v2"]);
});
