import { tokensIguaisEmTempoConstante } from './sync-presenca-authorization.ts';

export type ResultadoAutorizacaoGrade =
  | { permitido: true; origem: 'service_role' | 'x_sync_token' }
  | { permitido: false; status: 401; codigo: 'NAO_AUTENTICADO' };

type DependenciasAutorizacaoGrade = {
  chaveServiceRole: string;
  validarTokenInterno: (token: string) => PromiseLike<boolean>;
};

function extrairBearer(authorization: string | null): string | null {
  const correspondencia = authorization?.match(/^Bearer[\t ]+([^\s]+)$/i);
  return correspondencia?.[1] ?? null;
}

export async function prepararExecucaoSyncGrade(
  input: { authorization: string | null; xSyncToken: string | null },
  deps: DependenciasAutorizacaoGrade,
): Promise<ResultadoAutorizacaoGrade> {
  const bearer = extrairBearer(input.authorization);
  if (
    bearer
    && await tokensIguaisEmTempoConstante(bearer, deps.chaveServiceRole)
  ) {
    return { permitido: true, origem: 'service_role' };
  }

  const tokenInterno = input.xSyncToken?.trim() || null;
  if (tokenInterno) {
    try {
      if (await deps.validarTokenInterno(tokenInterno)) {
        return { permitido: true, origem: 'x_sync_token' };
      }
    } catch {
      // A indisponibilidade do validador nao pode liberar um worker privilegiado.
    }
  }

  return {
    permitido: false,
    status: 401,
    codigo: 'NAO_AUTENTICADO',
  };
}
