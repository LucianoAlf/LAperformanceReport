export interface ContextoOperador {
  usuarioId: number;
  authUserId: string;
  nomeUsuario: string;
  assinaturaId: string;
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

export interface AuthAdapters {
  authGetUser(token: string): Promise<{ id: string } | null>;
  buscarUsuariosAtivosPorAuthUserId(
    authUserId: string,
  ): Promise<UsuarioInterno[]>;
  usuarioTemPermissaoEstrita(
    usuarioId: number,
    codigo: string,
    unidadeId: string,
  ): Promise<boolean>;
  buscarAssinaturasAtivas(usuarioId: number): Promise<AssinaturaAtiva[]>;
}

export interface ResolverContextoInput {
  authorization: string | null;
  unidadeId: string;
  modoTeste: boolean;
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

async function exigirPermissao(
  adapters: AuthAdapters,
  usuarioId: number,
  codigo: string,
  unidadeId: string,
): Promise<void> {
  const permitido = await adapters.usuarioTemPermissaoEstrita(
    usuarioId,
    codigo,
    unidadeId,
  );

  if (!permitido) {
    throw new ErroAutorizacao(403, `Permissao ${codigo} ausente`);
  }
}

export async function resolverContextoOperador(
  input: ResolverContextoInput,
  adapters: AuthAdapters,
): Promise<ContextoOperador> {
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
  if (
    typeof input.unidadeId !== "string" || input.unidadeId.trim().length === 0
  ) {
    throw new ErroAutorizacao(403, "Unidade concreta obrigatoria");
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
  await exigirPermissao(
    adapters,
    usuario.id,
    "sucesso_aluno.evasao.enviar",
    input.unidadeId,
  );
  if (input.modoTeste) {
    await exigirPermissao(
      adapters,
      usuario.id,
      "sucesso_aluno.evasao.modo_teste",
      input.unidadeId,
    );
  }

  const assinaturas = await adapters.buscarAssinaturasAtivas(usuario.id);
  if (assinaturas.length === 0) {
    throw new ErroAutorizacao(403, "Assinatura ativa nao encontrada");
  }
  if (assinaturas.length !== 1) {
    throw new ErroAutorizacao(
      403,
      "Assinatura ativa nao encontrada de forma unica",
    );
  }

  const assinatura = assinaturas[0];
  return {
    usuarioId: usuario.id,
    authUserId: usuarioAuth.id,
    nomeUsuario: usuario.nome,
    assinaturaId: assinatura.id,
    assinaturaNome: assinatura.nome,
  };
}
