export interface TelefonePesquisaInput {
  telefoneOverride?: string | null;
  telefoneSnapshot?: string | null;
  whatsappAluno?: string | null;
  telefoneAluno?: string | null;
}

export type EnviarPesquisaRequest =
  | {
    acao: "previsualizar";
    evasao_id: number;
    modo_teste: boolean;
    telefone_teste?: string;
  }
  | {
    acao: "confirmar";
    preview_id: string;
  };

export interface RenderInput {
  template: string;
  valores: Record<string, string | null | undefined>;
}

export interface PreviewSnapshot {
  evasaoId: number;
  unidadeId: string;
  usuarioId: number;
  authUserId: string;
  assinaturaId: string;
  templateId: string;
  templateVersao: number;
  caixaId: number;
  modoTeste: boolean;
  destinatarioTipo: "aluno" | "responsavel" | "teste";
  telefoneDestino: string;
  mensagemRenderizada: string;
}

export interface ResolverDestinoPesquisaInput {
  modoTeste: boolean;
  telefoneTeste?: string | null;
  telefoneSnapshot?: string | null;
}

export interface DestinoPesquisa {
  telefone: string;
  origem: "telefone_teste" | "telefone_snapshot";
  modoTeste: boolean;
}

function normalizarTelefone(valor: string | null | undefined): string {
  let digitos = String(valor ?? "").replace(/\D/g, "");

  if (digitos.length === 10 || digitos.length === 11) {
    digitos = `55${digitos}`;
  }

  return digitos;
}

export function resolverTelefonePesquisa(input: TelefonePesquisaInput): string {
  const origem = [
    input.telefoneOverride,
    input.telefoneSnapshot,
    input.whatsappAluno,
    input.telefoneAluno,
  ].find((valor) => typeof valor === "string" && valor.trim().length > 0);

  return normalizarTelefone(origem);
}

export function telefonePesquisaValido(telefone: string): boolean {
  return /^55\d{10,11}$/.test(telefone);
}

function exigirObjeto(input: unknown): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    throw new Error("Request deve ser objeto JSON simples");
  }

  const prototipo = Object.getPrototypeOf(input);
  if (prototipo !== Object.prototype && prototipo !== null) {
    throw new Error("Request deve ser objeto JSON simples");
  }

  if (Object.getOwnPropertySymbols(input).length > 0) {
    throw new Error("Request deve ser objeto JSON simples");
  }

  for (const campo of Object.getOwnPropertyNames(input)) {
    const descritor = Object.getOwnPropertyDescriptor(input, campo);
    if (!descritor?.enumerable || !Object.hasOwn(descritor, "value")) {
      throw new Error("Request deve ser objeto JSON simples");
    }
  }

  return input as Record<string, unknown>;
}

function exigirCampoProprio(
  input: Record<string, unknown>,
  campo: string,
): unknown {
  if (!Object.hasOwn(input, campo)) {
    throw new Error(`Campo obrigatorio ausente: ${campo}`);
  }

  return input[campo];
}

function rejeitarCamposDesconhecidos(
  input: Record<string, unknown>,
  permitidos: ReadonlySet<string>,
): void {
  for (const campo of Object.getOwnPropertyNames(input)) {
    if (!permitidos.has(campo)) {
      throw new Error(`Campo nao permitido: ${campo}`);
    }
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidCanonico(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return null;
  }

  const canonico = valor.trim().toLowerCase();
  return UUID_REGEX.test(canonico) ? canonico : null;
}

export function validarRequest(input: unknown): EnviarPesquisaRequest {
  const request = exigirObjeto(input);
  const acao = exigirCampoProprio(request, "acao");

  if (acao === "previsualizar") {
    rejeitarCamposDesconhecidos(
      request,
      new Set(["acao", "evasao_id", "modo_teste", "telefone_teste"]),
    );
    const evasaoId = exigirCampoProprio(request, "evasao_id");
    const modoTeste = exigirCampoProprio(request, "modo_teste");

    if (
      typeof evasaoId !== "number" ||
      !Number.isSafeInteger(evasaoId) ||
      evasaoId <= 0
    ) {
      throw new Error("evasao_id invalido");
    }
    if (typeof modoTeste !== "boolean") {
      throw new Error("modo_teste deve ser boolean");
    }

    const possuiTelefoneTeste = Object.hasOwn(request, "telefone_teste");
    if (possuiTelefoneTeste && modoTeste !== true) {
      throw new Error("telefone_teste exige modo_teste=true");
    }

    if (possuiTelefoneTeste) {
      if (typeof request.telefone_teste !== "string") {
        throw new Error("telefone_teste invalido");
      }

      const telefoneTeste = normalizarTelefone(request.telefone_teste);
      if (!telefonePesquisaValido(telefoneTeste)) {
        throw new Error("telefone_teste invalido");
      }

      return {
        acao: "previsualizar",
        evasao_id: evasaoId,
        modo_teste: true,
        telefone_teste: telefoneTeste,
      };
    }

    return {
      acao: "previsualizar",
      evasao_id: evasaoId,
      modo_teste: modoTeste,
    };
  }

  if (acao === "confirmar") {
    rejeitarCamposDesconhecidos(request, new Set(["acao", "preview_id"]));
    const previewId = uuidCanonico(
      exigirCampoProprio(request, "preview_id"),
    );

    if (!previewId) {
      throw new Error("preview_id invalido");
    }

    return {
      acao: "confirmar",
      preview_id: previewId,
    };
  }

  throw new Error("acao invalida");
}

export function resolverDestinoPesquisa(
  input: ResolverDestinoPesquisaInput,
): DestinoPesquisa {
  if (input.modoTeste) {
    const telefone = normalizarTelefone(input.telefoneTeste);
    if (!telefonePesquisaValido(telefone)) {
      throw new Error("telefone_teste invalido");
    }

    return {
      telefone,
      origem: "telefone_teste",
      modoTeste: true,
    };
  }

  const telefone = normalizarTelefone(input.telefoneSnapshot);

  if (!telefonePesquisaValido(telefone)) {
    throw new Error("Telefone snapshot invalido ou ausente");
  }

  return {
    telefone,
    origem: "telefone_snapshot",
    modoTeste: false,
  };
}

const PLACEHOLDERS_PERMITIDOS = new Set([
  "aluno_primeiro_nome",
  "responsavel_primeiro_nome",
  "assinatura_nome",
]);

export function renderizarMensagem(input: RenderInput): string {
  if (typeof input.template !== "string" || input.template.length === 0) {
    throw new Error("Template invalido");
  }

  const renderizada = input.template.replace(
    /{{\s*([a-z][a-z0-9_]*)\s*}}/gi,
    (_placeholder, nome: string) => {
      if (!PLACEHOLDERS_PERMITIDOS.has(nome)) {
        throw new Error(`Placeholder invalido: ${nome}`);
      }

      const valor = input.valores[nome];
      if (typeof valor !== "string" || valor.trim().length === 0) {
        throw new Error(`Placeholder ausente: ${nome}`);
      }

      return valor;
    },
  );

  if (renderizada.includes("{{") || renderizada.includes("}}")) {
    throw new Error("Placeholder invalido no template");
  }

  return renderizada;
}

function snapshotInvalido(campo: keyof PreviewSnapshot | "objeto"): never {
  throw new Error(`Snapshot invalido: ${campo}`);
}

function inteiroPositivoSeguro(
  valor: unknown,
  campo: keyof PreviewSnapshot,
): number {
  if (
    typeof valor !== "number" ||
    !Number.isSafeInteger(valor) ||
    valor <= 0
  ) {
    return snapshotInvalido(campo);
  }

  return valor;
}

function uuidSnapshot(
  valor: unknown,
  campo: keyof PreviewSnapshot,
): string {
  return uuidCanonico(valor) ?? snapshotInvalido(campo);
}

function validarPreviewSnapshot(input: unknown): PreviewSnapshot {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  ) {
    return snapshotInvalido("objeto");
  }

  const snapshot = input as Record<string, unknown>;
  const campos = new Set<keyof PreviewSnapshot>([
    "evasaoId",
    "unidadeId",
    "usuarioId",
    "authUserId",
    "assinaturaId",
    "templateId",
    "templateVersao",
    "caixaId",
    "modoTeste",
    "destinatarioTipo",
    "telefoneDestino",
    "mensagemRenderizada",
  ]);
  for (const campo of Object.getOwnPropertyNames(snapshot)) {
    if (!campos.has(campo as keyof PreviewSnapshot)) {
      return snapshotInvalido("objeto");
    }
  }

  const modoTeste = snapshot.modoTeste;
  if (typeof modoTeste !== "boolean") {
    return snapshotInvalido("modoTeste");
  }

  const destinatarioTipo = snapshot.destinatarioTipo;
  if (
    destinatarioTipo !== "aluno" &&
    destinatarioTipo !== "responsavel" &&
    destinatarioTipo !== "teste"
  ) {
    return snapshotInvalido("destinatarioTipo");
  }

  const telefoneDestino = snapshot.telefoneDestino;
  if (
    typeof telefoneDestino !== "string" ||
    !telefonePesquisaValido(telefoneDestino)
  ) {
    return snapshotInvalido("telefoneDestino");
  }

  const mensagemRenderizada = snapshot.mensagemRenderizada;
  if (
    typeof mensagemRenderizada !== "string" ||
    mensagemRenderizada.trim().length === 0
  ) {
    return snapshotInvalido("mensagemRenderizada");
  }

  return {
    evasaoId: inteiroPositivoSeguro(snapshot.evasaoId, "evasaoId"),
    unidadeId: uuidSnapshot(snapshot.unidadeId, "unidadeId"),
    usuarioId: inteiroPositivoSeguro(snapshot.usuarioId, "usuarioId"),
    authUserId: uuidSnapshot(snapshot.authUserId, "authUserId"),
    assinaturaId: uuidSnapshot(snapshot.assinaturaId, "assinaturaId"),
    templateId: uuidSnapshot(snapshot.templateId, "templateId"),
    templateVersao: inteiroPositivoSeguro(
      snapshot.templateVersao,
      "templateVersao",
    ),
    caixaId: inteiroPositivoSeguro(snapshot.caixaId, "caixaId"),
    modoTeste,
    destinatarioTipo,
    telefoneDestino,
    mensagemRenderizada,
  };
}

export async function hashPreview(input: PreviewSnapshot): Promise<string> {
  const snapshot = validarPreviewSnapshot(input);
  const payloadCanonico = JSON.stringify({
    evasaoId: snapshot.evasaoId,
    unidadeId: snapshot.unidadeId,
    usuarioId: snapshot.usuarioId,
    authUserId: snapshot.authUserId,
    assinaturaId: snapshot.assinaturaId,
    templateId: snapshot.templateId,
    templateVersao: snapshot.templateVersao,
    caixaId: snapshot.caixaId,
    modoTeste: snapshot.modoTeste,
    destinatarioTipo: snapshot.destinatarioTipo,
    telefoneDestino: snapshot.telefoneDestino,
    mensagemRenderizada: snapshot.mensagemRenderizada,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payloadCanonico),
  );

  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function mascararTelefone(telefone: string): string {
  const normalizado = normalizarTelefone(telefone);
  if (!telefonePesquisaValido(normalizado)) {
    throw new Error("Telefone invalido");
  }

  const numeroLocal = normalizado.slice(4);
  const ocultos = "*".repeat(numeroLocal.length - 4);

  return `+${normalizado.slice(0, 2)} (${normalizado.slice(2, 4)}) ${ocultos}-${
    numeroLocal.slice(-4)
  }`;
}
