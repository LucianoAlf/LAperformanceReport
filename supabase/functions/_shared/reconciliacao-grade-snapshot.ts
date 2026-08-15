import { type AlunoNaAulaEmusys, criarAlunoChave } from "./emusys-aulas.ts";

export interface AulaSnapshotGradeFonte {
  id: number;
  alunos?: AlunoNaAulaEmusys[];
}

export interface AulaSnapshotGrade {
  emusys_id: number;
  aluno_chaves: string[];
}

export interface ResultadoReconciliacaoGradeSnapshot {
  status: string;
  dry_run?: boolean;
  alteracoes_aplicadas?: number;
  aulas_canceladas?: number;
  vinculos_removidos?: number;
  detalhe?: unknown;
}

interface ClienteRpc {
  rpc: (
    nome: string,
    parametros: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * O Emusys pode devolver uma linha da mesma turma por participante. A
 * reconciliação precisa de uma fotografia por aula, não de uma linha crua.
 */
export function montarSnapshotGradeEmusys(
  aulas: AulaSnapshotGradeFonte[],
  normalizarNome: (nome: string) => string,
): AulaSnapshotGrade[] {
  const chavesPorAula = new Map<number, Set<string>>();

  for (const aula of aulas) {
    if (!Number.isInteger(aula.id) || aula.id <= 0) {
      throw new Error("EMUSYS_SNAPSHOT_AULA_INVALIDA");
    }
    if (!Array.isArray(aula.alunos)) {
      throw new Error("EMUSYS_SNAPSHOT_ROSTER_AUSENTE");
    }

    const chaves = chavesPorAula.get(aula.id) ?? new Set<string>();
    chavesPorAula.set(aula.id, chaves);

    for (const aluno of aula.alunos) {
      const nome = aluno.nome_aluno?.trim();
      const temIdEmusys = Number.isInteger(aluno.id_aluno) && aluno.id_aluno > 0;
      if (!temIdEmusys && !nome) {
        throw new Error("EMUSYS_SNAPSHOT_ALUNO_SEM_IDENTIDADE");
      }
      chaves.add(
        criarAlunoChave(
          { ...aluno, nome_aluno: nome },
          undefined,
          normalizarNome,
        ),
      );
    }
  }

  return [...chavesPorAula.entries()]
    .sort(([a], [b]) => a - b)
    .map(([emusys_id, alunoChaves]) => ({
      emusys_id,
      aluno_chaves: [...alunoChaves].sort(),
    }));
}

/** Chama a única decisão de escrita da grade após a fotografia estar íntegra. */
export async function reconciliarGradeSnapshotEmusys(
  supabase: ClienteRpc,
  params: {
    unidadeId: string;
    dataInicio: string;
    dataFim: string;
    snapshot: AulaSnapshotGrade[];
    dryRun?: boolean;
  },
): Promise<ResultadoReconciliacaoGradeSnapshot> {
  const { data, error } = await supabase.rpc(
    "reconciliar_grade_snapshot_emusys_v1",
    {
      p_unidade_id: params.unidadeId,
      p_data_inicio: params.dataInicio,
      p_data_fim: params.dataFim,
      p_snapshot: params.snapshot,
      p_dry_run: params.dryRun ?? false,
    },
  );

  if (error) {
    throw new Error(
      `RPC reconciliar_grade_snapshot_emusys_v1: ${error.message}`,
    );
  }

  return (data ??
    { status: "sem_resposta" }) as ResultadoReconciliacaoGradeSnapshot;
}
