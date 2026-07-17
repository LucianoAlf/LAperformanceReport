export const EMUSYS_API_BASE = 'https://api.emusys.com.br/v1';

export interface EmusysPaginacao {
  tem_mais?: boolean;
  proximo_cursor?: string | null;
}

export interface EmusysPaginaAulas<T = Record<string, unknown>> {
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
    this.name = 'EmusysApiError';
  }
}

export function parseDataHoraEmusys(dataHora: string): string {
  return dataHora.replace(' ', 'T') + ':00-03:00';
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
}: Omit<BuscarPaginaAulasParams, 'token' | 'signal'>): string {
  validarDataIso(dataInicio, 'dataInicio');
  validarDataIso(dataFim, 'dataFim');

  const limite = Math.max(1, Math.min(Math.trunc(limiteRecebido), 100));
  let url = `${apiBase.replace(/\/$/, '')}/aulas/?data_hora_inicial=${dataInicio}T00:00:00&data_hora_final=${dataFim}T23:59:59&limite=${limite}`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
  return url;
}

export async function buscarPaginaAulasEmusys<T = Record<string, unknown>>({
  token,
  signal,
  ...params
}: BuscarPaginaAulasParams): Promise<EmusysPaginaAulas<T>> {
  const url = montarUrlAulasEmusys(params);
  const response = await fetch(url, { headers: { token }, signal });

  if (!response.ok) {
    throw new EmusysApiError(
      response.status,
      response.headers.get('Retry-After'),
    );
  }

  const json = await response.json() as Partial<EmusysPaginaAulas<T>>;
  return {
    items: Array.isArray(json.items) ? json.items : [],
    paginacao: json.paginacao ?? {},
  };
}
