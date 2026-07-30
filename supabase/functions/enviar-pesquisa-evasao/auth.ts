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

export interface AdaptersAutenticacaoOperador {
  authGetUser(token: string): Promise<{ id: string } | null>;
  buscarUsuariosAtivosPorAuthUserId(
    authUserId: string,
  ): Promise<UsuarioInterno[]>;
}

export interface AdapterAutorizacaoOperador {
  usuarioTemPermissaoEstrita(
    usuarioId: number,
    codigo: string,
    unidadeId: string,
  ): Promise<boolean>;
}

export interface AdapterAssinaturaOperador {
  buscarAssinaturasAtivas(usuarioId: number): Promise<AssinaturaAtiva[]>;
}

export interface AuthAdapters
  extends
    AdaptersAutenticacaoOperador,
    AdapterAutorizacaoOperador,
    AdapterAssinaturaOperador {}

export interface ResolverContextoInput {
  authorization: string | null;
  unidadeId: string;
  modoTeste: boolean;
}

declare const IDENTIDADE_AUTENTICADA: unique symbol;

export interface IdentidadeOperadorAutenticada {
  usuarioId: number;
  authUserId: string;
  nomeUsuario: string;
  readonly [IDENTIDADE_AUTENTICADA]: true;
}

/**
 * Na confirmacao, estes valores devem vir do snapshot persistido em
 * pesquisa_evasao_previews, nunca do request do cliente.
 */
export interface EscopoAutorizacaoDaPreviewPersistida {
  unidadeIdDaPreviewPersistida: string;
  modoTesteDaPreviewPersistida: boolean;
}

export interface AssinaturaOperadorParaNovaPreview {
  assinaturaId: string;
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

async function exigirPermissao(
  adapters: AdapterAutorizacaoOperador,
  usuarioId: number,
  codigo: string,
  unidadeId: string,
): Promise<void> {
  const permitido = await adapters.usuarioTemPermissaoEstrita(
    usuarioId,
    codigo,
    unidadeId,
  );

  if (permitido !== true) {
    throw new ErroAutorizacao(403, `Permissao ${codigo} ausente`);
  }
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
  return {
    usuarioId: usuario.id,
    authUserId: usuarioAuth.id,
    nomeUsuario: usuario.nome,
  } as IdentidadeOperadorAutenticada;
}

async function autorizarIdentidadeNaUnidadeConcreta(
  identidade: IdentidadeOperadorAutenticada,
  unidadeId: string,
  modoTeste: boolean,
  adapters: AdapterAutorizacaoOperador,
): Promise<void> {
  if (typeof unidadeId !== "string" || unidadeId.trim().length === 0) {
    throw new ErroAutorizacao(403, "Unidade concreta obrigatoria");
  }

  await exigirPermissao(
    adapters,
    identidade.usuarioId,
    "sucesso_aluno.evasao.enviar",
    unidadeId,
  );
  if (modoTeste) {
    await exigirPermissao(
      adapters,
      identidade.usuarioId,
      "sucesso_aluno.evasao.modo_teste",
      unidadeId,
    );
  }
}

export async function autorizarIdentidadeComPreviewPersistida(
  identidade: IdentidadeOperadorAutenticada,
  previewPersistida: EscopoAutorizacaoDaPreviewPersistida,
  adapters: AdapterAutorizacaoOperador,
): Promise<void> {
  if (
    typeof previewPersistida.modoTesteDaPreviewPersistida !== "boolean"
  ) {
    throw new ErroAutorizacao(
      403,
      "modo_teste da preview persistida invalido",
    );
  }

  await autorizarIdentidadeNaUnidadeConcreta(
    identidade,
    previewPersistida.unidadeIdDaPreviewPersistida,
    previewPersistida.modoTesteDaPreviewPersistida,
    adapters,
  );
}

export async function resolverAssinaturaAtivaParaNovaPreview(
  identidade: IdentidadeOperadorAutenticada,
  adapters: AdapterAssinaturaOperador,
): Promise<AssinaturaOperadorParaNovaPreview> {
  const assinaturas = await adapters.buscarAssinaturasAtivas(
    identidade.usuarioId,
  );
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
    assinaturaId: assinatura.id,
    assinaturaNome: assinatura.nome,
  };
}

export async function resolverContextoOperador(
  input: ResolverContextoInput,
  adapters: AuthAdapters,
): Promise<ContextoOperador> {
  const identidade = await autenticarUsuarioAtivoUnico(
    { authorization: input.authorization },
    adapters,
  );
  if (typeof input.modoTeste !== "boolean") {
    throw new ErroAutorizacao(403, "modo_teste invalido");
  }

  await autorizarIdentidadeNaUnidadeConcreta(
    identidade,
    input.unidadeId,
    input.modoTeste,
    adapters,
  );
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
