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
  const possuiErroExplicito = Boolean(
    textoNaoVazio(objeto?.error) ?? textoNaoVazio(objeto?.erro),
  );

  if ((statusHttp >= 400 && statusHttp < 500) || possuiErroExplicito) {
    return { tipo: "falha_conhecida", statusHttp };
  }

  const providerMessageId = extrairProviderMessageId(payload);
  if (statusHttp >= 200 && statusHttp < 300 && providerMessageId) {
    return { tipo: "sucesso", providerMessageId };
  }

  return { tipo: "incerto" };
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
