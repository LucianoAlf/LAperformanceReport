export type ProvedorWhatsApp = "uazapi" | "waha";
export type TipoResultadoProvider =
  | "sucesso"
  | "falha_conhecida"
  | "incerto";
export type EstadoEnvioPersistido = "enviado" | "falhou" | "incerto";

export type ResultadoProvider =
  | { tipo: "sucesso"; providerMessageId: string }
  | { tipo: "falha_conhecida"; statusHttp: number }
  | { tipo: "incerto" };

export interface FetchProviderOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const PROVIDER_TIMEOUT_MS = 15_000;

function objetoJson(payload: unknown): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null &&
      !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
}

function textoNaoVazio(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim().length > 0
    ? valor.trim()
    : null;
}

function possuiErroExplicito(payload: Record<string, unknown> | null): boolean {
  const erro = payload?.error ?? payload?.erro;
  return textoNaoVazio(erro) !== null ||
    erro === true ||
    (typeof erro === "object" && erro !== null);
}

export function extrairProviderMessageId(payload: unknown): string | null {
  const objeto = objetoJson(payload);
  if (!objeto) return null;

  const chave = objetoJson(objeto.key);
  return textoNaoVazio(objeto.id) ??
    textoNaoVazio(objeto.messageid) ??
    textoNaoVazio(objeto.messageId) ??
    textoNaoVazio(chave?.id);
}

export function classificarRespostaProvider(
  statusHttp: number,
  payload: unknown,
): ResultadoProvider {
  const objeto = objetoJson(payload);

  if (statusHttp >= 500 && statusHttp < 600) {
    return { tipo: "incerto" };
  }

  if (statusHttp >= 400 && statusHttp < 500) {
    return { tipo: "falha_conhecida", statusHttp };
  }

  if (statusHttp >= 200 && statusHttp < 300) {
    if (possuiErroExplicito(objeto)) {
      return { tipo: "falha_conhecida", statusHttp };
    }

    const providerMessageId = extrairProviderMessageId(payload);
    if (providerMessageId) {
      return { tipo: "sucesso", providerMessageId };
    }
  }

  return { tipo: "incerto" };
}

export function fetchProviderComTimeout(
  input: string | URL | Request,
  init: RequestInit,
  options: FetchProviderOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  return fetchImpl(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export function estadoPersistidoParaResultado(
  resultado: TipoResultadoProvider,
): EstadoEnvioPersistido {
  if (resultado === "sucesso") return "enviado";
  if (resultado === "falha_conhecida") return "falhou";
  return "incerto";
}

export function sanitizarErroProvider(statusHttp: number): string {
  return `Falha conhecida no provedor (HTTP ${statusHttp})`;
}

/**
 * O OpenAPI versionado da UAZAPI declara que track_id aceita duplicados.
 * O contrato WAHA usado pelo projeto tambem nao expoe chave idempotente.
 */
export function providerSuportaChaveIdempotente(
  _provedor: ProvedorWhatsApp,
): boolean {
  return false;
}

export function deveAbrirConversaReal(
  modoTeste: boolean,
  estado: EstadoEnvioPersistido,
): boolean {
  return modoTeste === false && estado === "enviado";
}
