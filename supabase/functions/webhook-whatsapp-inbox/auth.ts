export type WebhookInboundAuthResult =
  | { ok: true; kind: "provider"; caixaId: number }
  | { ok: true; kind: "health" }
  | {
    ok: false;
    status: 400 | 401 | 403 | 503;
    code:
      | "invalid_caixa_id"
      | "missing_secret"
      | "invalid_secret"
      | "auth_unavailable"
      | "missing_health_secret"
      | "invalid_health_secret"
      | "health_auth_unavailable";
  };

export interface WebhookInboundAuthDependencies {
  validarHash: (caixaId: number, secretHashSha256: string) => Promise<boolean>;
  healthSecret: string;
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseCaixaId(url: URL): number | null {
  const raw = url.searchParams.get("caixa_id");
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;

  const caixaId = Number(raw);
  return Number.isSafeInteger(caixaId) ? caixaId : null;
}

async function autenticarHealth(
  req: Request,
  healthSecret: string,
): Promise<WebhookInboundAuthResult> {
  if (!healthSecret) {
    return { ok: false, status: 503, code: "health_auth_unavailable" };
  }

  const provided = req.headers.get("x-health-secret");
  if (!provided) {
    return { ok: false, status: 401, code: "missing_health_secret" };
  }

  const [providedHash, expectedHash] = await Promise.all([
    sha256(provided),
    sha256(healthSecret),
  ]);
  if (!constantTimeEqual(providedHash, expectedHash)) {
    return { ok: false, status: 403, code: "invalid_health_secret" };
  }

  return { ok: true, kind: "health" };
}

export async function autenticarWebhookInbound(
  req: Request,
  url: URL,
  dependencies: WebhookInboundAuthDependencies,
): Promise<WebhookInboundAuthResult> {
  if (url.searchParams.get("_health") === "1") {
    return autenticarHealth(req, dependencies.healthSecret);
  }

  const caixaId = parseCaixaId(url);
  if (caixaId === null) {
    return { ok: false, status: 400, code: "invalid_caixa_id" };
  }

  const headerSecret = req.headers.get("x-webhook-secret");
  const rawSecret = headerSecret !== null
    ? headerSecret
    : url.searchParams.get("webhook_secret");
  if (!rawSecret) {
    return { ok: false, status: 401, code: "missing_secret" };
  }

  const secretHashSha256 = await sha256(rawSecret);
  try {
    const valid = await dependencies.validarHash(caixaId, secretHashSha256);
    if (!valid) {
      return { ok: false, status: 403, code: "invalid_secret" };
    }
  } catch {
    return { ok: false, status: 503, code: "auth_unavailable" };
  }

  return { ok: true, kind: "provider", caixaId };
}
