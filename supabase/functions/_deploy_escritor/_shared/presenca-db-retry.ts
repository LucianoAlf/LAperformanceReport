type ResultadoBanco<T> = {
  data: T;
  error: unknown;
};

export type OpcoesRetry = {
  maxTentativas?: number;
  atrasoBaseMs?: number;
  atrasoMaximoMs?: number;
  dormir?: (ms: number) => Promise<void>;
};

const SQLSTATES_TRANSITORIOS = new Set([
  '40001',
  '40P01',
  '55P03',
  '57014',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function codigoSqlState(error: unknown): string | null {
  if (!isRecord(error) || typeof error.code !== 'string') return null;
  return /^[0-9A-Z]{5}$/u.test(error.code) ? error.code : null;
}

export function sqlStatePresencaTransitorio(error: unknown): boolean {
  const codigo = codigoSqlState(error);
  return codigo !== null && SQLSTATES_TRANSITORIOS.has(codigo);
}

function inteiroPositivo(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

export async function executarComRetrySqlPresenca<T>(
  operacao: () => PromiseLike<ResultadoBanco<T>>,
  opcoes: OpcoesRetry = {},
): Promise<{
  resultado: ResultadoBanco<T>;
  tentativas: number;
  transitorioEsgotado: boolean;
}> {
  const maxTentativas = inteiroPositivo(opcoes.maxTentativas, 7);
  const atrasoBaseMs = inteiroPositivo(opcoes.atrasoBaseMs, 250);
  const atrasoMaximoMs = inteiroPositivo(opcoes.atrasoMaximoMs, 4_000);
  const dormir = opcoes.dormir ?? ((ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    const resultado = await operacao();
    if (!resultado.error || !sqlStatePresencaTransitorio(resultado.error)) {
      return { resultado, tentativas: tentativa, transitorioEsgotado: false };
    }

    if (tentativa === maxTentativas) {
      const code = codigoSqlState(resultado.error) ?? '55P03';
      return {
        resultado: { ...resultado, error: { code } },
        tentativas: tentativa,
        transitorioEsgotado: true,
      };
    }

    const atraso = Math.min(
      atrasoBaseMs * (2 ** (tentativa - 1)),
      atrasoMaximoMs,
    );
    await dormir(atraso);
  }

  throw new Error('PRESENCA_SYNC_RETRY_ESTADO_INVALIDO');
}
