import {
  type AulaEmusys,
  montarLinhasSnapshot,
  type SnapshotRow,
} from "./experimental-snapshot.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SyncMode = "presenca" | "agenda" | "metadados" | "experimentais";

export type UnidadeExperimental = {
  id: string;
  nome: string;
};

export type CursoDePara = {
  cursoId: number;
  cursoNome: string | null;
};

export type ExperimentalParaReconciliar = {
  emusysAulaId: number;
  dataAula: string;
  dataHoraInicio: string;
  horario: string;
  horarioBanco: string;
  professorId: number | null;
  professorNome: string | null;
  unidadeId: string;
  cancelada: boolean;
  cursoId: number | null;
  cursoNome: string | null;
  alunos: Array<{
    nome_aluno?: string | null;
    presenca?: string | null;
    horario_presenca?: string | null;
    telefone_aluno?: string | null;
    telefone_responsavel?: string | null;
    id_lead?: number | string | null;
    id_aluno?: number | string | null;
  }>;
};

export type SnapshotResultado = {
  execucao_id: string;
  status: "completo";
  aulas_recebidas: number;
  linhas_recebidas: number;
  linhas_ativas: number;
  linhas_inseridas: number;
  linhas_atualizadas: number;
  linhas_versionadas: number;
  linhas_inativadas: number;
  experimentais_reconciliadas: number;
};

type RpcResultado = Record<string, unknown> & {
  execucao_id?: unknown;
  status?: unknown;
};

export type SnapshotDeps = {
  criarExecucaoId: () => string;
  agora: () => Date;
  aplicarSnapshotRpc: (input: {
    execucaoId: string;
    unidadeId: string;
    dataInicio: string;
    dataFim: string;
    linhas: SnapshotRow[];
  }) => Promise<RpcResultado>;
  carregarCursoDePara: (
    unidadeId: string,
  ) => Promise<Map<number, CursoDePara>>;
  carregarResolverProfessor: (
    unidadeId: string,
  ) => Promise<(aula: AulaEmusys) => number | null>;
  reconciliar: (
    experimentais: ExperimentalParaReconciliar[],
  ) => Promise<Array<{ status: string }>>;
};

export type ModoExperimentaisDeps = SnapshotDeps & {
  buscarTodasAulas: (input: {
    unidade: UnidadeExperimental;
    dataInicio: string;
    dataFim: string;
  }) => Promise<AulaEmusys[]>;
  onFluxoPresenca?: () => unknown;
  onAtualizarPercentual?: () => unknown;
};

export class SnapshotRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotRequestError";
  }
}

export class SnapshotUpstreamError extends Error {
  constructor() {
    super("FALHA_UPSTREAM_EMUSYS");
    this.name = "SnapshotUpstreamError";
  }
}

function parseDataIsoEstrita(value: unknown, campo: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new SnapshotRequestError(`${campo.toUpperCase()}_INVALIDA`);
  }

  const data = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== value
  ) {
    throw new SnapshotRequestError(`${campo.toUpperCase()}_INVALIDA`);
  }
  return value;
}

function diasEntreDatas(dataInicio: string, dataFim: string): number {
  const inicio = Date.parse(`${dataInicio}T00:00:00.000Z`);
  const fim = Date.parse(`${dataFim}T00:00:00.000Z`);
  return Math.trunc((fim - inicio) / (24 * 60 * 60 * 1000));
}

export function validarParametrosExperimentais(
  body: Record<string, unknown>,
  unidades: UnidadeExperimental[],
): {
  unidade: UnidadeExperimental;
  dataInicio: string;
  dataFim: string;
} {
  const unidadeId = typeof body.unidade_id === "string"
    ? body.unidade_id.trim()
    : "";
  if (!UUID_PATTERN.test(unidadeId)) {
    throw new SnapshotRequestError("UNIDADE_ID_INVALIDA");
  }

  const dataInicio = parseDataIsoEstrita(body.data_inicio, "data_inicio");
  const dataFim = parseDataIsoEstrita(body.data_fim, "data_fim");
  const intervalo = diasEntreDatas(dataInicio, dataFim);
  if (intervalo < 0 || intervalo > 45) {
    throw new SnapshotRequestError("INTERVALO_INVALIDO_MAX_45_DIAS");
  }

  const unidade = unidades.find((item) => item.id === unidadeId);
  if (!unidade) throw new SnapshotRequestError("UNIDADE_DESCONHECIDA");

  return { unidade, dataInicio, dataFim };
}

export function normalizarHorarioExperimental(dataHoraInicio: string): string {
  const match = dataHoraInicio.trim().match(
    /^\d{4}-\d{2}-\d{2} (\d{2}):(\d{2})(?::\d{2})?$/,
  );
  if (!match) throw new Error("DATA_HORA_EXPERIMENTAL_INVALIDA");
  return `${match[1]}:${match[2]}`;
}

export function horarioExperimentalParaBanco(horario: string): string {
  const match = horario.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) throw new Error("HORARIO_EXPERIMENTAL_INVALIDO");
  return `${match[1]}:${match[2]}:00`;
}

function numero(resultado: RpcResultado, campo: string): number {
  const valor = Number(resultado[campo] ?? 0);
  return Number.isFinite(valor) ? valor : 0;
}

function cursoEmusysId(aula: AulaEmusys): number | null {
  const value = Number(aula.curso_id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function projetarExperimentaisParaReconciliacao(input: {
  aulas: AulaEmusys[];
  unidadeId: string;
  cursoDePara: Map<number, CursoDePara>;
  resolverProfessor: (aula: AulaEmusys) => number | null;
}): ExperimentalParaReconciliar[] {
  return input.aulas
    .filter((aula) =>
      typeof aula.categoria === "string" &&
      aula.categoria.trim().toLocaleLowerCase("pt-BR") === "experimental"
    )
    .map((aula) => {
      const horario = normalizarHorarioExperimental(aula.data_hora_inicio);
      const emusysCursoId = cursoEmusysId(aula);
      const curso = emusysCursoId === null
        ? null
        : input.cursoDePara.get(emusysCursoId) ?? null;

      return {
        emusysAulaId: aula.id,
        dataAula: aula.data_hora_inicio.slice(0, 10),
        dataHoraInicio: aula.data_hora_inicio,
        horario,
        horarioBanco: horarioExperimentalParaBanco(horario),
        professorId: input.resolverProfessor(aula),
        professorNome: null,
        unidadeId: input.unidadeId,
        cancelada: aula.cancelada === true,
        cursoId: curso?.cursoId ?? null,
        cursoNome: curso?.cursoNome ?? null,
        alunos: (aula.alunos ?? []).map((aluno) => ({
          nome_aluno: aluno.nome_aluno,
          presenca: aluno.presenca,
          horario_presenca: typeof aluno.horario_presenca === "string"
            ? aluno.horario_presenca
            : null,
          id_lead: aluno.id_lead,
          id_aluno: aluno.id_aluno,
        })),
      };
    });
}

export async function executarSnapshotExperimentais(input: {
  unidade: UnidadeExperimental;
  dataInicio: string;
  dataFim: string;
  aulas: AulaEmusys[];
  deps: SnapshotDeps;
}): Promise<SnapshotResultado> {
  const execucaoId = input.deps.criarExecucaoId();
  const linhas = montarLinhasSnapshot({
    unidadeId: input.unidade.id,
    execucaoId,
    aulas: input.aulas,
    agora: input.deps.agora(),
  });

  const rpc = await input.deps.aplicarSnapshotRpc({
    execucaoId,
    unidadeId: input.unidade.id,
    dataInicio: input.dataInicio,
    dataFim: input.dataFim,
    linhas,
  });
  if (
    rpc.status !== "completo" ||
    rpc.execucao_id !== execucaoId
  ) {
    throw new Error("RESPOSTA_SNAPSHOT_EXPERIMENTAIS_INVALIDA");
  }

  const [cursoDePara, resolverProfessor] = await Promise.all([
    input.deps.carregarCursoDePara(input.unidade.id),
    input.deps.carregarResolverProfessor(input.unidade.id),
  ]);
  const experimentais = projetarExperimentaisParaReconciliacao({
    aulas: input.aulas,
    unidadeId: input.unidade.id,
    cursoDePara,
    resolverProfessor,
  });
  const reconciliacao = await input.deps.reconciliar(experimentais);

  return {
    execucao_id: execucaoId,
    status: "completo",
    aulas_recebidas: input.aulas.length,
    linhas_recebidas: numero(rpc, "linhas_recebidas"),
    linhas_ativas: numero(rpc, "linhas_ativas"),
    linhas_inseridas: numero(rpc, "linhas_inseridas"),
    linhas_atualizadas: numero(rpc, "linhas_atualizadas"),
    linhas_versionadas: numero(rpc, "linhas_versionadas"),
    linhas_inativadas: numero(rpc, "linhas_inativadas"),
    experimentais_reconciliadas:
      reconciliacao.filter((item) => item.status.startsWith("reconciliada_"))
        .length,
  };
}

function respostaSnapshotSemPii(resultado: SnapshotResultado) {
  return {
    execucao_id: resultado.execucao_id,
    status: resultado.status,
    aulas_recebidas: resultado.aulas_recebidas,
    linhas_recebidas: resultado.linhas_recebidas,
    linhas_ativas: resultado.linhas_ativas,
    linhas_inseridas: resultado.linhas_inseridas,
    linhas_atualizadas: resultado.linhas_atualizadas,
    linhas_versionadas: resultado.linhas_versionadas,
    linhas_inativadas: resultado.linhas_inativadas,
    experimentais_reconciliadas: resultado.experimentais_reconciliadas,
  };
}

export async function executarModoExperimentais(input: {
  body: Record<string, unknown>;
  unidades: UnidadeExperimental[];
  deps: ModoExperimentaisDeps;
}) {
  const { unidade, dataInicio, dataFim } = validarParametrosExperimentais(
    input.body,
    input.unidades,
  );

  let aulas: AulaEmusys[];
  try {
    aulas = await input.deps.buscarTodasAulas({
      unidade,
      dataInicio,
      dataFim,
    });
  } catch (error) {
    if (error instanceof SnapshotUpstreamError) throw error;
    throw new SnapshotUpstreamError();
  }

  const snapshot = await executarSnapshotExperimentais({
    unidade,
    dataInicio,
    dataFim,
    aulas,
    deps: input.deps,
  });

  return {
    success: true,
    modo: "experimentais" as const,
    unidade: { id: unidade.id, nome: unidade.nome },
    intervalo: { data_inicio: dataInicio, data_fim: dataFim },
    snapshot: respostaSnapshotSemPii(snapshot),
  };
}

export async function aplicarSnapshotsMetadados<
  TUnidade extends UnidadeExperimental,
  TAula,
  TSnapshot,
>(input: {
  lotes: Array<{
    unidade: TUnidade;
    dataInicio: string;
    dataFim: string;
    aulas: TAula[];
  }>;
  aplicarSnapshot: (lote: {
    unidade: TUnidade;
    dataInicio: string;
    dataFim: string;
    aulas: TAula[];
  }) => Promise<TSnapshot>;
}) {
  const snapshots: Array<{
    unidade: { id: string; nome: string };
    intervalo: { data_inicio: string; data_fim: string };
    snapshot: TSnapshot;
  }> = [];

  for (const lote of input.lotes) {
    const snapshot = await input.aplicarSnapshot(lote);
    snapshots.push({
      unidade: { id: lote.unidade.id, nome: lote.unidade.nome },
      intervalo: {
        data_inicio: lote.dataInicio,
        data_fim: lote.dataFim,
      },
      snapshot,
    });
  }

  return snapshots;
}

export function classificarErroSnapshot(error: unknown): {
  status: 400 | 500 | 502;
  mensagem: string;
} {
  if (error instanceof SnapshotRequestError) {
    return { status: 400, mensagem: error.message };
  }
  if (error instanceof SnapshotUpstreamError) {
    return { status: 502, mensagem: "FALHA_UPSTREAM_EMUSYS" };
  }
  return { status: 500, mensagem: "ERRO_INTERNO" };
}
