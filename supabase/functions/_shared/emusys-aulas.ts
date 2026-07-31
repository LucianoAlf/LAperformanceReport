export const EMUSYS_API_BASE = "https://api.emusys.com.br/v1";

export interface EmusysPaginacao {
  tem_mais: boolean;
  proximo_cursor?: string | null;
}

export interface EmusysPaginaAulas<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  items: T[];
  paginacao: EmusysPaginacao;
}

export interface BuscarPaginaAulasParams {
  token: string;
  dataInicio: string;
  dataFim: string;
  cursor?: string | null;
  limite?: number;
  signal?: AbortSignal;
  apiBase?: string;
}

export class EmusysApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
    message = `Emusys API respondeu HTTP ${status}`,
  ) {
    super(message);
    this.name = "EmusysApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePaginaAulas<T extends Record<string, unknown>>(
  payload: unknown,
): EmusysPaginaAulas<T> {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("EMUSYS_AULAS_PAYLOAD_INVALIDO");
  }
  if (!payload.items.every(isRecord) || !isRecord(payload.paginacao)) {
    throw new Error("EMUSYS_AULAS_PAYLOAD_INVALIDO");
  }
  if (typeof payload.paginacao.tem_mais !== "boolean") {
    throw new Error("EMUSYS_AULAS_PAYLOAD_INVALIDO");
  }

  const cursor = payload.paginacao.proximo_cursor;
  let proximoCursor: string | null | undefined;
  if (typeof cursor === "string") proximoCursor = cursor;
  else if (cursor === null) proximoCursor = null;

  return {
    items: payload.items as T[],
    paginacao: {
      tem_mais: payload.paginacao.tem_mais,
      proximo_cursor: proximoCursor,
    },
  };
}

export function parseDataHoraEmusys(dataHora: string): string {
  return dataHora.replace(" ", "T") + ":00-03:00";
}

function validarDataIso(data: string, campo: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`${campo} deve estar em YYYY-MM-DD`);
  }
}

export function montarUrlAulasEmusys({
  dataInicio,
  dataFim,
  cursor = null,
  limite: limiteRecebido = 100,
  apiBase = EMUSYS_API_BASE,
}: Omit<BuscarPaginaAulasParams, "token" | "signal">): string {
  validarDataIso(dataInicio, "dataInicio");
  validarDataIso(dataFim, "dataFim");

  const limite = Math.max(1, Math.min(Math.trunc(limiteRecebido), 100));
  let url = `${
    apiBase.replace(/\/$/, "")
  }/aulas/?data_hora_inicial=${dataInicio}T00:00:00&data_hora_final=${dataFim}T23:59:59&limite=${limite}`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
  return url;
}

export async function buscarPaginaAulasEmusys<
  T extends Record<string, unknown> = Record<string, unknown>,
>({
  token,
  signal,
  ...params
}: BuscarPaginaAulasParams): Promise<EmusysPaginaAulas<T>> {
  const url = montarUrlAulasEmusys(params);
  const response = await fetch(url, { headers: { token }, signal });

  if (!response.ok) {
    throw new EmusysApiError(
      response.status,
      response.headers.get("Retry-After"),
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("EMUSYS_AULAS_JSON_INVALIDO");
  }

  return parsePaginaAulas<T>(json);
}
