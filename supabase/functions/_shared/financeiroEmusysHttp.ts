export type CodigoHttpFinanceiroEmusys =
  | 'EMUSYS_HTTP_429'
  | 'EMUSYS_HTTP_5XX'
  | `EMUSYS_HTTP_${number}`;

export class EmusysFinanceiroHttpError extends Error {
  readonly codigo: CodigoHttpFinanceiroEmusys;
  readonly status: number;
  readonly caminho: string;
  readonly unidade: string;
  readonly retryAfterSeconds: number | null;

  constructor(args: {
    codigo: CodigoHttpFinanceiroEmusys;
    status: number;
    caminho: string;
    unidade: string;
    retryAfterSeconds: number | null;
    detalhe: string;
  }) {
    const sufixo = args.detalhe ? ` - ${args.detalhe}` : '';
    super(`${args.codigo} em ${args.caminho} (${args.unidade}): HTTP ${args.status}${sufixo}`);
    this.name = 'EmusysFinanceiroHttpError';
    this.codigo = args.codigo;
    this.status = args.status;
    this.caminho = args.caminho;
    this.unidade = args.unidade;
    this.retryAfterSeconds = args.retryAfterSeconds;
  }
}

export function retryAfterSegundos(valor: string | null, agoraMs = Date.now()): number | null {
  const texto = valor?.trim();
  if (!texto) return null;
  if (/^\d+(?:\.\d+)?$/.test(texto)) return Math.max(0, Math.ceil(Number(texto)));
  const instante = Date.parse(texto);
  if (Number.isNaN(instante)) return null;
  return Math.max(0, Math.ceil((instante - agoraMs) / 1000));
}

export function criarErroHttpFinanceiroEmusys(args: {
  status: number;
  caminho: string;
  unidade: string;
  retryAfter: string | null;
  detalhe: string;
}): EmusysFinanceiroHttpError {
  const codigo: CodigoHttpFinanceiroEmusys = args.status === 429
    ? 'EMUSYS_HTTP_429'
    : args.status >= 500
    ? 'EMUSYS_HTTP_5XX'
    : `EMUSYS_HTTP_${args.status}`;
  return new EmusysFinanceiroHttpError({
    codigo,
    status: args.status,
    caminho: args.caminho,
    unidade: args.unidade,
    retryAfterSeconds: retryAfterSegundos(args.retryAfter),
    detalhe: args.detalhe,
  });
}
