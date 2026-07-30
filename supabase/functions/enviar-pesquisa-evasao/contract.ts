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

  if (
    (digitos.length === 10 || digitos.length === 11) &&
    !digitos.startsWith("55")
  ) {
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
    throw new Error("Request invalido");
  }

  return input as Record<string, unknown>;
}

function rejeitarCamposDesconhecidos(
  input: Record<string, unknown>,
  permitidos: ReadonlySet<string>,
): void {
  for (const campo of Object.keys(input)) {
    if (!permitidos.has(campo)) {
      throw new Error(`Campo nao permitido: ${campo}`);
    }
  }
}

export function validarRequest(input: unknown): EnviarPesquisaRequest {
  const request = exigirObjeto(input);

  if (request.acao === "previsualizar") {
    rejeitarCamposDesconhecidos(
      request,
      new Set(["acao", "evasao_id", "modo_teste", "telefone_teste"]),
    );

    if (
      typeof request.evasao_id !== "number" ||
      !Number.isInteger(request.evasao_id) ||
      request.evasao_id <= 0
    ) {
      throw new Error("evasao_id invalido");
    }
    if (typeof request.modo_teste !== "boolean") {
      throw new Error("modo_teste deve ser boolean");
    }

    const possuiTelefoneTeste = Object.hasOwn(request, "telefone_teste");
    if (possuiTelefoneTeste && request.modo_teste !== true) {
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
        evasao_id: request.evasao_id,
        modo_teste: true,
        telefone_teste: telefoneTeste,
      };
    }

    return {
      acao: "previsualizar",
      evasao_id: request.evasao_id,
      modo_teste: request.modo_teste,
    };
  }

  if (request.acao === "confirmar") {
    rejeitarCamposDesconhecidos(request, new Set(["acao", "preview_id"]));

    if (
      typeof request.preview_id !== "string" ||
      request.preview_id.trim().length === 0
    ) {
      throw new Error("preview_id invalido");
    }

    return {
      acao: "confirmar",
      preview_id: request.preview_id,
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

export async function hashPreview(input: PreviewSnapshot): Promise<string> {
  const payloadCanonico = JSON.stringify({
    evasaoId: input.evasaoId,
    unidadeId: input.unidadeId,
    usuarioId: input.usuarioId,
    authUserId: input.authUserId,
    assinaturaId: input.assinaturaId,
    templateId: input.templateId,
    templateVersao: input.templateVersao,
    caixaId: input.caixaId,
    modoTeste: input.modoTeste,
    destinatarioTipo: input.destinatarioTipo,
    telefoneDestino: input.telefoneDestino,
    mensagemRenderizada: input.mensagemRenderizada,
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
