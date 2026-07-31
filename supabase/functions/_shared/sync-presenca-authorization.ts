export type ModoSyncPresenca =
  | 'presenca'
  | 'agenda'
  | 'metadados'
  | 'experimentais';

export type CorpoSyncPresenca = Record<string, unknown> & {
  modo?: ModoSyncPresenca;
  unidade_index?: number;
  unidade_id?: string;
};

export type UnidadeSyncConfigurada = {
  id: string;
  nome: string;
};

export type SolicitacaoSyncPresenca = {
  body: CorpoSyncPresenca;
  modo: ModoSyncPresenca;
  unidadesIds: string[];
  alvoExato: boolean;
};

type RespostaAuthUsuario = {
  data: { user: { id: string } | null } | null;
  error: unknown;
};

type RespostaRpc = {
  data: unknown;
  error: unknown;
};

export type ClienteUsuarioSync = {
  auth: {
    getUser: (token: string) => PromiseLike<RespostaAuthUsuario>;
  };
  rpc: (
    nome: string,
    parametros: Record<string, unknown>,
  ) => PromiseLike<RespostaRpc>;
};

export class SolicitacaoSyncPresencaInvalida extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'SolicitacaoSyncPresencaInvalida';
  }
}

export async function lerCorpoSyncPresenca(
  requisicao: { json: () => Promise<unknown> },
): Promise<CorpoSyncPresenca> {
  let body: unknown;
  try {
    body = await requisicao.json();
  } catch {
    throw new SolicitacaoSyncPresencaInvalida('BODY_INVALIDO');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new SolicitacaoSyncPresencaInvalida('BODY_INVALIDO');
  }
  return body as CorpoSyncPresenca;
}

const MODOS_SUPORTADOS = new Set<ModoSyncPresenca>([
  'presenca',
  'agenda',
  'metadados',
  'experimentais',
]);

export function resolverSolicitacaoSyncPresenca(
  body: CorpoSyncPresenca,
  unidades: readonly UnidadeSyncConfigurada[],
): SolicitacaoSyncPresenca {
  const modoRecebido = body.modo ?? 'presenca';
  if (
    typeof modoRecebido !== 'string'
    || !MODOS_SUPORTADOS.has(modoRecebido as ModoSyncPresenca)
  ) {
    throw new SolicitacaoSyncPresencaInvalida('MODO_INVALIDO');
  }
  const modo = modoRecebido as ModoSyncPresenca;
  const informouId = body.unidade_id !== undefined;
  const informouIndex = body.unidade_index !== undefined;

  if (informouId && informouIndex) {
    throw new SolicitacaoSyncPresencaInvalida('ALVO_AMBIGUO');
  }

  if (informouId) {
    if (typeof body.unidade_id !== 'string') {
      throw new SolicitacaoSyncPresencaInvalida('UNIDADE_ID_INVALIDA');
    }
    const unidade = unidades.find((item) => item.id === body.unidade_id);
    if (!unidade) {
      throw new SolicitacaoSyncPresencaInvalida('UNIDADE_DESCONHECIDA');
    }
    return {
      body,
      modo,
      unidadesIds: [unidade.id],
      alvoExato: true,
    };
  }

  if (informouIndex) {
    if (
      typeof body.unidade_index !== 'number'
      || !Number.isInteger(body.unidade_index)
      || !unidades[body.unidade_index]
    ) {
      throw new SolicitacaoSyncPresencaInvalida('UNIDADE_INDEX_INVALIDO');
    }
    if (modo === 'experimentais') {
      throw new SolicitacaoSyncPresencaInvalida(
        'UNIDADE_ID_OBRIGATORIA_EXPERIMENTAIS',
      );
    }
    return {
      body,
      modo,
      unidadesIds: [unidades[body.unidade_index].id],
      alvoExato: true,
    };
  }

  if (modo === 'experimentais') {
    throw new SolicitacaoSyncPresencaInvalida(
      'UNIDADE_ID_OBRIGATORIA_EXPERIMENTAIS',
    );
  }

  return {
    body,
    modo,
    unidadesIds: unidades.map((item) => item.id),
    alvoExato: false,
  };
}

function extrairBearer(authorization: string | null): string | null {
  const correspondencia = authorization?.match(/^Bearer[\t ]+([^\s]+)$/i);
  return correspondencia?.[1] ?? null;
}

export async function tokensIguaisEmTempoConstante(
  recebido: string,
  esperado: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [digestRecebido, digestEsperado] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(recebido)),
    crypto.subtle.digest('SHA-256', encoder.encode(esperado)),
  ]);
  const bytesRecebido = new Uint8Array(digestRecebido);
  const bytesEsperado = new Uint8Array(digestEsperado);
  let diferenca = bytesRecebido.length ^ bytesEsperado.length;

  for (let indice = 0; indice < bytesRecebido.length; indice += 1) {
    diferenca |= bytesRecebido[indice] ^ bytesEsperado[indice];
  }
  return diferenca === 0;
}

type DependenciasPreparacao<TClienteAdmin, TUnidadeProvedor> = {
  chaveServiceRole: string;
  validarTokenInterno: (token: string) => PromiseLike<boolean>;
  criarClienteUsuario: (token: string) => ClienteUsuarioSync;
  criarClienteAdministrativo: () => TClienteAdmin;
  carregarUnidadesProvedor: (unidadesIds: string[]) => TUnidadeProvedor[];
};

type PreparacaoNegada = {
  permitido: false;
  status: 401 | 403;
  codigo:
    | 'NAO_AUTENTICADO'
    | 'ACAO_NAO_AUTORIZADA'
    | 'UNIDADE_EXATA_OBRIGATORIA'
    | 'UNIDADE_NAO_AUTORIZADA';
};

type PreparacaoPermitida<TClienteAdmin, TUnidadeProvedor> = {
  permitido: true;
  status: 200;
  interno: boolean;
  clienteAdministrativo: TClienteAdmin;
  unidadesProvedor: TUnidadeProvedor[];
};

export async function prepararExecucaoSyncPresenca<
  TClienteAdmin,
  TUnidadeProvedor,
>(
  input: {
    authorization: string | null;
    xSyncToken?: string | null;
    solicitacao: SolicitacaoSyncPresenca;
  },
  deps: DependenciasPreparacao<TClienteAdmin, TUnidadeProvedor>,
): Promise<
  PreparacaoNegada | PreparacaoPermitida<TClienteAdmin, TUnidadeProvedor>
> {
  const token = extrairBearer(input.authorization);
  const tokenInternoDedicado = input.xSyncToken?.trim() || null;
  let interno = token
    ? await tokensIguaisEmTempoConstante(token, deps.chaveServiceRole)
    : false;

  if (!interno && tokenInternoDedicado) {
    try {
      interno = await deps.validarTokenInterno(tokenInternoDedicado);
    } catch {
      interno = false;
    }
  }

  if (!interno && !token) {
    return {
      permitido: false,
      status: 401,
      codigo: 'NAO_AUTENTICADO',
    };
  }

  if (!interno) {
    if (!token) {
      return {
        permitido: false,
        status: 401,
        codigo: 'NAO_AUTENTICADO',
      };
    }
    const clienteUsuario = deps.criarClienteUsuario(token);
    let identidadeValida = false;
    try {
      const { data, error } = await clienteUsuario.auth.getUser(token);
      identidadeValida = !error && Boolean(data?.user?.id);
    } catch {
      identidadeValida = false;
    }
    if (!identidadeValida) {
      return {
        permitido: false,
        status: 401,
        codigo: 'NAO_AUTENTICADO',
      };
    }

    if (input.solicitacao.modo !== 'presenca') {
      return {
        permitido: false,
        status: 403,
        codigo: 'ACAO_NAO_AUTORIZADA',
      };
    }
    if (
      !input.solicitacao.alvoExato
      || input.solicitacao.unidadesIds.length !== 1
    ) {
      return {
        permitido: false,
        status: 403,
        codigo: 'UNIDADE_EXATA_OBRIGATORIA',
      };
    }

    try {
      const { data, error } = await clienteUsuario.rpc(
        'pode_sincronizar_presenca_emusys_v1',
        {
          p_unidade_id: input.solicitacao.unidadesIds[0],
          p_acao: 'presenca',
        },
      );
      if (error || data !== true) {
        return {
          permitido: false,
          status: 403,
          codigo: 'UNIDADE_NAO_AUTORIZADA',
        };
      }
    } catch {
      return {
        permitido: false,
        status: 403,
        codigo: 'UNIDADE_NAO_AUTORIZADA',
      };
    }
  }

  const unidadesProvedor = deps.carregarUnidadesProvedor(
    input.solicitacao.unidadesIds,
  );
  const clienteAdministrativo = deps.criarClienteAdministrativo();
  return {
    permitido: true,
    status: 200,
    interno,
    clienteAdministrativo,
    unidadesProvedor,
  };
}
