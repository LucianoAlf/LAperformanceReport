const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AcaoAdmissao =
  | "atualizar"
  | "reutilizar"
  | "aguardar"
  | "bloqueado";

type Admissao = {
  admissaoId: string;
  acao: AcaoAdmissao;
  execucaoId: string;
};

export type SnapshotAdmissionDeps<TResposta> = {
  admitir: () => Promise<unknown>;
  protegerLeitura: (input: {
    admissaoId: string;
    execucaoId: string;
  }) => Promise<unknown>;
  atualizar: (input: {
    admissaoId: string;
    execucaoId: string;
  }) => Promise<TResposta>;
  finalizar: (input: {
    admissaoId: string;
    execucaoId: string;
    sucesso: boolean;
    erroCodigo: string | null;
  }) => Promise<void>;
  esperar: (ms: number) => Promise<void>;
  agoraMs: () => number;
};

export class SnapshotAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotAdmissionError";
  }
}

function objeto(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseAdmissao(value: unknown): Admissao {
  const payload = objeto(value);
  const admissaoId = payload?.admissao_id;
  const acao = payload?.acao;
  const execucaoId = payload?.snapshot_execucao_id;
  if (
    typeof admissaoId !== "string" ||
    !UUID_PATTERN.test(admissaoId) ||
    !["atualizar", "reutilizar", "aguardar", "bloqueado"].includes(
      String(acao),
    ) ||
    typeof execucaoId !== "string" ||
    !UUID_PATTERN.test(execucaoId)
  ) {
    throw new SnapshotAdmissionError("SNAPSHOT_ADMISSAO_RESPOSTA_INVALIDA");
  }
  return {
    admissaoId,
    acao: acao as AcaoAdmissao,
    execucaoId,
  };
}

export async function obterSnapshotComAdmissao<TResposta>(input: {
  deps: SnapshotAdmissionDeps<TResposta>;
  esperaMs?: number;
  timeoutMs?: number;
}): Promise<
  | {
    origem: "atualizado";
    admissaoId: string;
    execucaoId: string;
    resposta: TResposta;
  }
  | { origem: "reutilizado"; admissaoId: string; execucaoId: string }
> {
  const esperaMs = input.esperaMs ?? 250;
  const timeoutMs = input.timeoutMs ?? 120_000;
  if (
    !Number.isSafeInteger(esperaMs) ||
    esperaMs <= 0 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new SnapshotAdmissionError("SNAPSHOT_ADMISSAO_TIMEOUT_INVALIDO");
  }
  const limite = input.deps.agoraMs() + timeoutMs;

  let admissaoPendente: Admissao | null = null;

  while (true) {
    const admissao = admissaoPendente ??
      parseAdmissao(await input.deps.admitir());
    admissaoPendente = null;

    if (admissao.acao === "reutilizar") {
      const protegida = parseAdmissao(
        await input.deps.protegerLeitura({
          admissaoId: admissao.admissaoId,
          execucaoId: admissao.execucaoId,
        }),
      );
      if (protegida.admissaoId !== admissao.admissaoId) {
        throw new SnapshotAdmissionError(
          "SNAPSHOT_ADMISSAO_PROTECAO_IDENTIDADE_INVALIDA",
        );
      }
      if (protegida.acao === "atualizar") {
        admissaoPendente = protegida;
        continue;
      }
      if (
        protegida.acao !== "reutilizar" ||
        protegida.execucaoId !== admissao.execucaoId
      ) {
        throw new SnapshotAdmissionError(
          "SNAPSHOT_ADMISSAO_PROTECAO_RESPOSTA_INVALIDA",
        );
      }
      return {
        origem: "reutilizado",
        admissaoId: admissao.admissaoId,
        execucaoId: admissao.execucaoId,
      };
    }

    if (admissao.acao === "bloqueado") {
      throw new SnapshotAdmissionError(
        "SNAPSHOT_EXPERIMENTAIS_RETRY_BLOQUEADO",
      );
    }

    if (admissao.acao === "atualizar") {
      let resposta: TResposta;
      try {
        resposta = await input.deps.atualizar({
          admissaoId: admissao.admissaoId,
          execucaoId: admissao.execucaoId,
        });
      } catch (error) {
        try {
          await input.deps.finalizar({
            admissaoId: admissao.admissaoId,
            execucaoId: admissao.execucaoId,
            sucesso: false,
            erroCodigo: "FALHA_ATUALIZAR_SNAPSHOT",
          });
        } catch {
          // A falha original continua sendo a causa publica da tentativa.
        }
        throw error;
      }

      await input.deps.finalizar({
        admissaoId: admissao.admissaoId,
        execucaoId: admissao.execucaoId,
        sucesso: true,
        erroCodigo: null,
      });
      const protegida = parseAdmissao(
        await input.deps.protegerLeitura({
          admissaoId: admissao.admissaoId,
          execucaoId: admissao.execucaoId,
        }),
      );
      if (protegida.admissaoId !== admissao.admissaoId) {
        throw new SnapshotAdmissionError(
          "SNAPSHOT_ADMISSAO_PROTECAO_IDENTIDADE_INVALIDA",
        );
      }
      if (protegida.acao === "atualizar") {
        admissaoPendente = protegida;
        continue;
      }
      if (
        protegida.acao !== "reutilizar" ||
        protegida.execucaoId !== admissao.execucaoId
      ) {
        throw new SnapshotAdmissionError(
          "SNAPSHOT_ADMISSAO_PROTECAO_RESPOSTA_INVALIDA",
        );
      }
      return {
        origem: "atualizado",
        admissaoId: admissao.admissaoId,
        execucaoId: admissao.execucaoId,
        resposta,
      };
    }

    if (input.deps.agoraMs() + esperaMs > limite) {
      throw new SnapshotAdmissionError(
        "SNAPSHOT_EXPERIMENTAIS_EM_ANDAMENTO",
      );
    }
    await input.deps.esperar(esperaMs);
  }
}
