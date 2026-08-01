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

export interface ConsultaCredenciaisProvider {
  data: unknown[] | null;
  error: { message: string } | null;
}

export interface EnvioProviderInput {
  caixaId: number;
  telefone: string;
  mensagem: string;
}

export interface EnvioProviderAdapters extends FetchProviderOptions {
  buscarCaixaExata: (
    caixaId: number,
  ) => Promise<ConsultaCredenciaisProvider>;
}

interface CredenciaisUazapi {
  provedor: "uazapi";
  baseUrl: string;
  token: string;
}

interface CredenciaisWaha {
  provedor: "waha";
  wahaUrl: string;
  wahaSession: string;
  wahaApiKey: string | null;
}

type CredenciaisProvider = CredenciaisUazapi | CredenciaisWaha;

export class ErroConfiguracaoProvider extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroConfiguracaoProvider";
  }
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

function exigirTextoConfiguracao(
  valor: unknown,
  campo: string,
): string {
  const texto = textoNaoVazio(valor);
  if (!texto) {
    throw new ErroConfiguracaoProvider(
      `Configuracao obrigatoria ausente: ${campo}`,
    );
  }
  return texto;
}

function exigirUrlHttp(valor: unknown, campo: string): string {
  const texto = exigirTextoConfiguracao(valor, campo);
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErroConfiguracaoProvider(`URL invalida: ${campo}`);
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new ErroConfiguracaoProvider(`URL invalida: ${campo}`);
  }
  return texto.replace(/\/+$/, "");
}

function validarCredenciaisExatas(
  row: unknown,
  caixaIdEsperada: number,
): CredenciaisProvider {
  const objeto = objetoJson(row);
  if (!objeto || objeto.id !== caixaIdEsperada) {
    throw new ErroConfiguracaoProvider(
      "Caixa retornada diverge do claim",
    );
  }

  if (objeto.provedor === "uazapi") {
    return {
      provedor: "uazapi",
      baseUrl: exigirUrlHttp(objeto.uazapi_url, "uazapi_url"),
      token: exigirTextoConfiguracao(objeto.uazapi_token, "uazapi_token"),
    };
  }

  if (objeto.provedor === "waha") {
    return {
      provedor: "waha",
      wahaUrl: exigirUrlHttp(objeto.waha_url, "waha_url"),
      wahaSession: exigirTextoConfiguracao(
        objeto.waha_session,
        "waha_session",
      ),
      wahaApiKey: textoNaoVazio(objeto.waha_api_key),
    };
  }

  throw new ErroConfiguracaoProvider("Provedor da caixa invalido");
}

function toWahaJid(numero: string): string {
  return numero.includes("@") ? numero : `${numero}@c.us`;
}

export async function enviarMensagemComCredenciaisExatas(
  input: EnvioProviderInput,
  adapters: EnvioProviderAdapters,
): Promise<{
  provedor: ProvedorWhatsApp;
  statusHttp: number;
  payload: unknown;
}> {
  const consulta = await adapters.buscarCaixaExata(input.caixaId);
  if (consulta.error) {
    throw new ErroConfiguracaoProvider(
      "Falha ao consultar a caixa exata do claim",
    );
  }
  if (!Array.isArray(consulta.data) || consulta.data.length !== 1) {
    throw new ErroConfiguracaoProvider(
      "Caixa exata e ativa nao encontrada de forma unica",
    );
  }
  const credenciais = validarCredenciaisExatas(
    consulta.data[0],
    input.caixaId,
  );

  let response: Response;
  if (credenciais.provedor === "waha") {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (credenciais.wahaApiKey) {
      headers["X-Api-Key"] = credenciais.wahaApiKey;
    }
    response = await fetchProviderComTimeout(
      `${credenciais.wahaUrl}/api/sendText`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          session: credenciais.wahaSession,
          chatId: toWahaJid(input.telefone),
          text: input.mensagem,
        }),
      },
      adapters,
    );
  } else {
    response = await fetchProviderComTimeout(
      `${credenciais.baseUrl}/send/text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: credenciais.token,
        },
        body: JSON.stringify({
          number: input.telefone,
          text: input.mensagem,
          delay: 2000,
          readchat: true,
        }),
      },
      adapters,
    );
  }

  const corpo = await response.text();
  let payload: unknown = {};
  if (corpo.trim().length > 0) {
    try {
      payload = JSON.parse(corpo);
    } catch {
      payload = null;
    }
  }

  return {
    provedor: credenciais.provedor,
    statusHttp: response.status,
    payload,
  };
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
