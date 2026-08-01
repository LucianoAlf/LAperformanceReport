export interface ContextoOperador {
  usuarioId: number;
  authUserId: string;
  nomeUsuario: string;
  assinaturaId: string | null;
  assinaturaNome: string;
}

export interface UsuarioInterno {
  id: number;
  authUserId: string;
  nome: string;
}

export interface AssinaturaAtiva {
  id: string;
  nome: string;
}

export interface AdaptersAutenticacaoOperador {
  authGetUser(token: string): Promise<{ id: string } | null>;
  buscarUsuariosAtivosPorAuthUserId(
    authUserId: string,
  ): Promise<UsuarioInterno[]>;
}

export interface AdapterAssinaturaOperador {
  buscarAssinaturasAtivas(usuarioId: number): Promise<AssinaturaAtiva[]>;
}

export interface AuthAdapters
  extends AdaptersAutenticacaoOperador, AdapterAssinaturaOperador {}

declare const IDENTIDADE_AUTENTICADA: unique symbol;

export interface IdentidadeOperadorAutenticada {
  usuarioId: number;
  authUserId: string;
  nomeUsuario: string;
  readonly [IDENTIDADE_AUTENTICADA]: true;
}

export interface AssinaturaOperadorParaNovaPreview {
  assinaturaId: string | null;
  assinaturaNome: string;
}

export class ErroAutorizacao extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "ErroAutorizacao";
  }
}

function extrairToken(authorization: string | null): string {
  if (!authorization || authorization.trim().length === 0) {
    throw new ErroAutorizacao(401, "Token ausente");
  }

  const resultado = authorization.match(/^\s*Bearer\s+(\S+)\s*$/i);
  if (!resultado) {
    throw new ErroAutorizacao(401, "Token invalido");
  }

  return resultado[1];
}

export function primeiroNomeDoUsuario(nomeUsuario: string): string {
  const primeiroNome = nomeUsuario.trim().split(/\s+/)[0];
  if (!primeiroNome) {
    throw new ErroAutorizacao(403, "Usuario ativo sem nome valido");
  }
  return primeiroNome;
}

export async function autenticarUsuarioAtivoUnico(
  input: { authorization: string | null },
  adapters: AdaptersAutenticacaoOperador,
): Promise<IdentidadeOperadorAutenticada> {
  const token = extrairToken(input.authorization);

  let usuarioAuth: { id: string } | null;
  try {
    usuarioAuth = await adapters.authGetUser(token);
  } catch {
    throw new ErroAutorizacao(401, "Token invalido");
  }

  if (!usuarioAuth?.id) {
    throw new ErroAutorizacao(401, "Token invalido");
  }

  const usuarios = await adapters.buscarUsuariosAtivosPorAuthUserId(
    usuarioAuth.id,
  );
  if (usuarios.length === 0) {
    throw new ErroAutorizacao(403, "Usuario ativo nao encontrado");
  }
  if (usuarios.length !== 1 || usuarios[0].authUserId !== usuarioAuth.id) {
    throw new ErroAutorizacao(
      403,
      "Usuario ativo nao encontrado de forma unica",
    );
  }

  const usuario = usuarios[0];
  primeiroNomeDoUsuario(usuario.nome);
  return {
    usuarioId: usuario.id,
    authUserId: usuarioAuth.id,
    nomeUsuario: usuario.nome,
  } as IdentidadeOperadorAutenticada;
}

export async function resolverAssinaturaAtivaParaNovaPreview(
  identidade: IdentidadeOperadorAutenticada,
  adapters: AdapterAssinaturaOperador,
): Promise<AssinaturaOperadorParaNovaPreview> {
  const assinaturas = await adapters.buscarAssinaturasAtivas(
    identidade.usuarioId,
  );
  if (assinaturas.length > 1) {
    throw new ErroAutorizacao(
      403,
      "Assinatura ativa nao encontrada de forma unica",
    );
  }

  if (assinaturas.length === 0) {
    return {
      assinaturaId: null,
      assinaturaNome: primeiroNomeDoUsuario(identidade.nomeUsuario),
    };
  }

  const assinatura = assinaturas[0];
  const nomeOverride = assinatura.nome.trim();
  if (!nomeOverride) {
    throw new ErroAutorizacao(403, "Assinatura ativa sem nome valido");
  }
  return {
    assinaturaId: assinatura.id,
    assinaturaNome: nomeOverride,
  };
}

export async function resolverContextoOperador(
  input: { authorization: string | null },
  adapters: AuthAdapters,
): Promise<ContextoOperador> {
  const identidade = await autenticarUsuarioAtivoUnico(input, adapters);
  const assinatura = await resolverAssinaturaAtivaParaNovaPreview(
    identidade,
    adapters,
  );

  return {
    usuarioId: identidade.usuarioId,
    authUserId: identidade.authUserId,
    nomeUsuario: identidade.nomeUsuario,
    assinaturaId: assinatura.assinaturaId,
    assinaturaNome: assinatura.assinaturaNome,
  };
}
