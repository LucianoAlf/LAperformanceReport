import { type AlunoNaAulaEmusys, criarAlunoChave } from "./emusys-aulas.ts";
import {
  executarComRetrySqlPresenca,
  type OpcoesRetry,
} from "./presenca-db-retry.ts";

export interface AulaSnapshotGradeFonte {
  id: number;
  alunos?: AlunoNaAulaEmusys[] | null;
  qtd_alunos?: number | null;
  cancelada?: boolean | null;
}

export type EstadoRosterSnapshot =
  | "completo"
  | "vazio_confirmado"
  | "incompleto"
  | "ambiguo";

export interface AulaSnapshotGrade {
  emusys_id: number;
  estado: EstadoRosterSnapshot;
  qtd_esperada: number;
  qtd_recebida: number;
  aluno_chaves: string[];
}

export interface ResultadoReconciliacaoGradeSnapshot
  extends Record<string, unknown> {
  status: string;
  dry_run?: boolean;
  alteracoes_aplicadas?: number;
  estados_gravados?: number;
  aulas_canceladas?: number;
  vinculos_removidos?: number;
  vinculos_inativados?: number;
  vinculos_reativados?: number;
  detalhe?: unknown;
}

export type ReconciliacaoContrato = "v2" | "v1_fallback";

export interface ResultadoReconciliacaoDual {
  contrato: ReconciliacaoContrato;
  resultado: Record<string, unknown>;
}

export interface ResultadoIntegridadeMapaAulas {
  completo: boolean;
  aulas_esperadas: number;
  aulas_mapeadas: number;
  emusys_ids_ausentes: number[];
}

interface ClienteRpc {
  rpc: (
    nome: string,
    parametros: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

interface ParametrosReconciliacaoGrade {
  unidadeId: string;
  dataInicio: string;
  dataFim: string;
  snapshot: AulaSnapshotGrade[];
  dryRun?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizarResultadoRpc(
  data: unknown,
): ResultadoReconciliacaoGradeSnapshot {
  return isRecord(data)
    ? data as ResultadoReconciliacaoGradeSnapshot
    : { status: "sem_resposta" };
}

function erroIndicaFuncaoAusente(error: unknown): boolean {
  return isRecord(error) && error.code === "PGRST202";
}

/**
 * O Emusys pode repetir uma aula por participante. O retorno do upsert, por
 * outro lado, precisa conter uma linha para cada id de aula distinto antes de
 * gravarmos roster ou deixarmos a RPC reconciliar ausencias. Falhar fechado
 * aqui evita que uma resposta parcial apague vinculos que ainda nao puderam
 * ser regravados.
 */
export function verificarIntegridadeMapaAulas(
  linhas: ReadonlyArray<{ emusys_id?: unknown }>,
  idPorEmusysId: ReadonlyMap<number, number>,
): ResultadoIntegridadeMapaAulas {
  const idsEsperados = new Set<number>();
  let origemInvalida = false;

  for (const linha of linhas) {
    const emusysId = Number(linha.emusys_id);
    if (!Number.isSafeInteger(emusysId) || emusysId <= 0) {
      origemInvalida = true;
      continue;
    }
    idsEsperados.add(emusysId);
  }

  const emusysIdsAusentes = [...idsEsperados]
    .filter((emusysId) => {
      const aulaLocalId = idPorEmusysId.get(emusysId);
      return !Number.isSafeInteger(aulaLocalId) || aulaLocalId <= 0;
    })
    .sort((a, b) => a - b);

  return {
    completo: !origemInvalida && emusysIdsAusentes.length === 0,
    aulas_esperadas: idsEsperados.size,
    aulas_mapeadas: idsEsperados.size - emusysIdsAusentes.length,
    emusys_ids_ausentes: emusysIdsAusentes,
  };
}

/**
 * O Emusys pode devolver uma linha da mesma turma por participante. A
 * reconciliação precisa de uma fotografia por aula, não de uma linha crua.
 */
export function montarSnapshotGradeEmusys(
  aulas: AulaSnapshotGradeFonte[],
  normalizarNome: (nome: string) => string,
): AulaSnapshotGrade[] {
  type Acumulador = {
    chaves: Set<string>;
    quantidadesDeclaradas: Set<number>;
    incompleto: boolean;
    ambiguo: boolean;
  };
  const porAula = new Map<number, Acumulador>();

  for (const aula of aulas) {
    if (!Number.isInteger(aula.id) || aula.id <= 0) {
      throw new Error("EMUSYS_SNAPSHOT_AULA_INVALIDA");
    }

    const acumulador = porAula.get(aula.id) ?? {
      chaves: new Set<string>(),
      quantidadesDeclaradas: new Set<number>(),
      incompleto: false,
      ambiguo: false,
    };
    porAula.set(aula.id, acumulador);

    if (aula.qtd_alunos !== undefined && aula.qtd_alunos !== null) {
      if (!Number.isSafeInteger(aula.qtd_alunos) || aula.qtd_alunos < 0) {
        acumulador.incompleto = true;
      } else {
        acumulador.quantidadesDeclaradas.add(aula.qtd_alunos);
      }
    }

    if (!Array.isArray(aula.alunos)) {
      acumulador.incompleto = true;
      continue;
    }

    for (const aluno of aula.alunos) {
      const nome = aluno.nome_aluno?.trim();
      const temIdEmusys = Number.isInteger(aluno.id_aluno) &&
        aluno.id_aluno > 0;
      if (!temIdEmusys && !nome) {
        acumulador.incompleto = true;
        continue;
      }
      if (!temIdEmusys) acumulador.ambiguo = true;
      acumulador.chaves.add(
        criarAlunoChave(
          { ...aluno, nome_aluno: nome },
          undefined,
          normalizarNome,
        ),
      );
    }
  }

  return [...porAula.entries()]
    .sort(([a], [b]) => a - b)
    .map(([emusys_id, acumulador]) => {
      const alunoChaves = [...acumulador.chaves].sort();
      const qtdRecebida = alunoChaves.length;
      const [qtdDeclarada] = acumulador.quantidadesDeclaradas;
      const qtdEsperada = acumulador.quantidadesDeclaradas.size === 1
        ? qtdDeclarada
        : qtdRecebida;
      const contagemIncoerente = acumulador.quantidadesDeclaradas.size > 1 ||
        qtdEsperada !== qtdRecebida;
      const estado: EstadoRosterSnapshot =
        acumulador.incompleto || contagemIncoerente
          ? "incompleto"
          : acumulador.ambiguo
          ? "ambiguo"
          : qtdRecebida === 0
          ? "vazio_confirmado"
          : "completo";

      return {
        emusys_id,
        estado,
        qtd_esperada: qtdEsperada,
        qtd_recebida: qtdRecebida,
        aluno_chaves: alunoChaves,
      };
    });
}

/** Preserva o contrato v1 para Edges ainda não atualizadas durante a expansão. */
export async function reconciliarGradeSnapshotEmusysV1(
  supabase: ClienteRpc,
  params: ParametrosReconciliacaoGrade,
  opcoesRetry: OpcoesRetry = {},
): Promise<ResultadoReconciliacaoGradeSnapshot> {
  const tentativa = await executarComRetrySqlPresenca(
    () =>
      supabase.rpc(
        "reconciliar_grade_snapshot_emusys_v1",
        {
          p_unidade_id: params.unidadeId,
          p_data_inicio: params.dataInicio,
          p_data_fim: params.dataFim,
          p_snapshot: params.snapshot,
          p_dry_run: params.dryRun ?? false,
        },
      ),
    opcoesRetry,
  );
  const { data, error } = tentativa.resultado;

  if (error) {
    if (tentativa.transitorioEsgotado) {
      throw new Error("PRESENCA_SYNC_CONCORRENCIA_ESGOTADA");
    }
    throw new Error("PRESENCA_SYNC_RECONCILIACAO_ROSTER_FALHOU");
  }

  return normalizarResultadoRpc(data);
}

/**
 * Tenta a RPC v2 associada ao run de cobertura. Durante o rollout, recua uma
 * única vez para v1 apenas quando o PostgREST comprova que a assinatura v2 não
 * existe no schema cache (PGRST202). Qualquer outra falha permanece terminal.
 */
export async function reconciliarGradeSnapshotEmusys(
  supabase: ClienteRpc,
  params: ParametrosReconciliacaoGrade & { syncRunId: string },
  opcoesRetry: OpcoesRetry = {},
): Promise<ResultadoReconciliacaoDual> {
  const tentativa = await executarComRetrySqlPresenca(
    () =>
      supabase.rpc(
        "reconciliar_grade_snapshot_emusys_v2",
        {
          p_sync_run_id: params.syncRunId,
          p_unidade_id: params.unidadeId,
          p_data_inicio: params.dataInicio,
          p_data_fim: params.dataFim,
          p_snapshot: params.snapshot,
          p_dry_run: params.dryRun ?? false,
        },
      ),
    opcoesRetry,
  );
  const { data, error } = tentativa.resultado;

  if (!error) {
    return {
      contrato: "v2",
      resultado: normalizarResultadoRpc(data),
    };
  }

  if (!erroIndicaFuncaoAusente(error)) {
    if (tentativa.transitorioEsgotado) {
      throw new Error("PRESENCA_SYNC_CONCORRENCIA_ESGOTADA");
    }
    throw new Error("PRESENCA_SYNC_RECONCILIACAO_ROSTER_FALHOU");
  }

  return {
    contrato: "v1_fallback",
    resultado: await reconciliarGradeSnapshotEmusysV1(
      supabase,
      params,
      opcoesRetry,
    ),
  };
}
