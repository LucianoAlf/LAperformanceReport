export interface WebhookProviderConfig {
  id?: string;
  enabled?: boolean;
  url?: string;
  events?: string[];
  excludeMessages?: string[];
  addUrlEvents?: boolean;
  addUrlTypesMessages?: boolean;
}

export interface WebhookSecretMaterial {
  rawSecret: string;
  secretBytes: number;
  secretHashSha256: string;
  webhookUrl: string;
  webhookUrlRedigida: string;
}

export interface ProvisionarWebhookInput {
  caixaId: number;
  providerBaseUrl: string;
  providerToken: string;
  inboundEndpoint: string;
}

export interface ProvisionarWebhookDependencies {
  fetch?: typeof fetch;
  randomBytes?: () => Uint8Array;
  persistHash: (secretHashSha256: string) => Promise<void>;
}

export interface ProvisionarWebhookResult {
  enabled: true;
  providerWebhookId: string | null;
  webhookUrlRedigida: string;
}

function defaultRandomBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function criarMaterialSegredoWebhook(
  inboundEndpoint: string,
  caixaId: number,
  randomBytes: () => Uint8Array = defaultRandomBytes,
): Promise<WebhookSecretMaterial> {
  if (!Number.isSafeInteger(caixaId) || caixaId <= 0) {
    throw new Error("invalid_caixa_id");
  }

  const bytes = randomBytes();
  if (bytes.length !== 32) throw new Error("invalid_secret_entropy");

  const rawSecret = base64Url(bytes);
  const secretHashSha256 = await sha256(rawSecret);
  const url = new URL(inboundEndpoint);
  url.searchParams.set("caixa_id", String(caixaId));
  url.searchParams.set("webhook_secret", rawSecret);

  const redigida = new URL(url);
  redigida.searchParams.set("webhook_secret", "[REDACTED]");

  return {
    rawSecret,
    secretBytes: bytes.length,
    secretHashSha256,
    webhookUrl: url.toString(),
    webhookUrlRedigida: decodeURIComponent(redigida.toString()),
  };
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("invalid_provider_url");
  }
  return url.toString().replace(/\/+$/, "");
}

function normalizeProviderConfig(
  config: WebhookProviderConfig,
): WebhookProviderConfig {
  if (!config.id || !config.url) throw new Error("provider_webhook_invalid");
  return {
    id: config.id,
    enabled: config.enabled ?? true,
    url: config.url,
    events: Array.isArray(config.events) ? config.events : [],
    excludeMessages: Array.isArray(config.excludeMessages)
      ? config.excludeMessages
      : [],
    addUrlEvents: config.addUrlEvents ?? false,
    addUrlTypesMessages: config.addUrlTypesMessages ?? false,
  };
}

function matchesExpectedTarget(
  config: WebhookProviderConfig,
  inboundEndpoint: string,
  caixaId: number,
): boolean {
  try {
    const current = new URL(config.url ?? "");
    const expected = new URL(inboundEndpoint);
    return current.origin === expected.origin &&
      current.pathname.replace(/\/+$/, "") ===
        expected.pathname.replace(/\/+$/, "") &&
      current.searchParams.get("caixa_id") === String(caixaId);
  } catch {
    return false;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postProvider(
  fetcher: typeof fetch,
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(body),
  });
  const responseBody = await readJson(response);
  if (!response.ok) throw new Error("provider_write_failed");
  return responseBody;
}

function findCreatedId(body: unknown, webhookUrl: string): string | null {
  const configs = Array.isArray(body) ? body : [body];
  const exact = configs.find((item) =>
    item && typeof item === "object" &&
    (item as WebhookProviderConfig).url === webhookUrl &&
    typeof (item as WebhookProviderConfig).id === "string"
  ) as WebhookProviderConfig | undefined;
  if (exact?.id) return exact.id;

  if (configs.length === 1) {
    const id = (configs[0] as WebhookProviderConfig | null)?.id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function desiredPayload(
  webhookUrl: string,
  existing: WebhookProviderConfig | null,
): Record<string, unknown> {
  return {
    action: existing ? "update" : "add",
    ...(existing?.id ? { id: existing.id } : {}),
    enabled: true,
    url: webhookUrl,
    events: ["messages", "messages_update"],
    excludeMessages: [],
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };
}

function restorePayload(
  existing: WebhookProviderConfig,
): Record<string, unknown> {
  return {
    action: "update",
    id: existing.id,
    enabled: existing.enabled,
    url: existing.url,
    events: existing.events,
    excludeMessages: existing.excludeMessages,
    addUrlEvents: existing.addUrlEvents,
    addUrlTypesMessages: existing.addUrlTypesMessages,
  };
}

export async function provisionarWebhookUazapi(
  input: ProvisionarWebhookInput,
  dependencies: ProvisionarWebhookDependencies,
): Promise<ProvisionarWebhookResult> {
  const fetcher = dependencies.fetch ?? fetch;
  const providerEndpoint = `${normalizeBaseUrl(input.providerBaseUrl)}/webhook`;
  const material = await criarMaterialSegredoWebhook(
    input.inboundEndpoint,
    input.caixaId,
    dependencies.randomBytes,
  );

  const currentResponse = await fetcher(providerEndpoint, {
    method: "GET",
    headers: { token: input.providerToken },
  });
  const currentBody = await readJson(currentResponse);
  if (!currentResponse.ok || !Array.isArray(currentBody)) {
    throw new Error("provider_read_failed");
  }
  if (currentBody.length > 1) throw new Error("provider_webhooks_ambiguous");

  const existing = currentBody.length === 1
    ? normalizeProviderConfig(currentBody[0] as WebhookProviderConfig)
    : null;
  if (
    existing &&
    !matchesExpectedTarget(existing, input.inboundEndpoint, input.caixaId)
  ) {
    throw new Error("provider_webhook_unexpected_target");
  }
  const providerBody = await postProvider(
    fetcher,
    providerEndpoint,
    input.providerToken,
    desiredPayload(material.webhookUrl, existing),
  );
  const createdId = existing?.id ??
    findCreatedId(providerBody, material.webhookUrl);

  try {
    await dependencies.persistHash(material.secretHashSha256);
  } catch {
    let compensated = false;
    try {
      if (existing) {
        await postProvider(
          fetcher,
          providerEndpoint,
          input.providerToken,
          restorePayload(existing),
        );
        compensated = true;
      } else if (createdId) {
        await postProvider(
          fetcher,
          providerEndpoint,
          input.providerToken,
          { action: "delete", id: createdId },
        );
        compensated = true;
      }
    } catch {
      compensated = false;
    }

    throw new Error(
      compensated
        ? "hash_persistence_failed_compensated"
        : "hash_persistence_failed_manual_intervention",
    );
  }

  return {
    enabled: true,
    providerWebhookId: createdId,
    webhookUrlRedigida: material.webhookUrlRedigida,
  };
}
