export interface CaixaWebhookMonitorada {
  id: number;
  nome: string;
  provedor: string | null;
  ativo: boolean;
  uazapi_url: string | null;
  uazapi_token: string | null;
  waha_url: string | null;
  waha_session: string | null;
  waha_api_key: string | null;
}

interface WebhookProviderObservado {
  enabled: boolean;
  url: string;
}

export interface InspecaoWebhookProvider {
  estado: "ok" | "desconectado" | "indisponivel" | "nao_suportado";
  httpStatus: number;
  webhooks: WebhookProviderObservado[];
}

export interface ProblemaCoberturaWebhook {
  caixaId: number;
  caixaNome: string;
  code:
    | "provider_webhook_sem_hash"
    | "provider_webhook_sem_segredo"
    | "provider_webhook_destino_inesperado"
    | "provider_webhook_ausente"
    | "provider_inspection_unavailable";
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).toString().replace(/\/+$/, "");
}

function parseWebhooks(value: unknown): WebhookProviderObservado[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.url !== "string") return [];
    return [{ enabled: row.enabled !== false, url: row.url }];
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function inspecionarWebhookProvider(
  caixa: CaixaWebhookMonitorada,
  _inboundEndpoint: string,
  fetcher: typeof fetch = fetch,
): Promise<InspecaoWebhookProvider> {
  const provedor = String(caixa.provedor ?? "").toLowerCase();

  if (provedor === "uazapi") {
    if (!caixa.uazapi_url || !caixa.uazapi_token) {
      return {
        estado: "desconectado",
        httpStatus: 0,
        webhooks: [],
      };
    }

    try {
      const response = await fetcher(
        `${normalizeBaseUrl(caixa.uazapi_url)}/webhook`,
        { method: "GET", headers: { token: caixa.uazapi_token } },
      );
      if (!response.ok) {
        return {
          estado: response.status === 401 || response.status === 404
            ? "desconectado"
            : "indisponivel",
          httpStatus: response.status,
          webhooks: [],
        };
      }

      const body = await readJson(response);
      if (!Array.isArray(body)) {
        return {
          estado: "indisponivel",
          httpStatus: response.status,
          webhooks: [],
        };
      }
      return {
        estado: "ok",
        httpStatus: response.status,
        webhooks: parseWebhooks(body),
      };
    } catch {
      return { estado: "indisponivel", httpStatus: 0, webhooks: [] };
    }
  }

  if (provedor === "waha") {
    if (!caixa.waha_url || !caixa.waha_session) {
      return {
        estado: "desconectado",
        httpStatus: 0,
        webhooks: [],
      };
    }

    try {
      const headers: Record<string, string> = {};
      if (caixa.waha_api_key) headers["X-Api-Key"] = caixa.waha_api_key;
      const response = await fetcher(
        `${normalizeBaseUrl(caixa.waha_url)}/api/sessions/${
          encodeURIComponent(caixa.waha_session)
        }`,
        { method: "GET", headers },
      );
      if (!response.ok) {
        return {
          estado: response.status === 401 || response.status === 404
            ? "desconectado"
            : "indisponivel",
          httpStatus: response.status,
          webhooks: [],
        };
      }

      const body = await readJson(response);
      if (!body || typeof body !== "object") {
        return {
          estado: "indisponivel",
          httpStatus: response.status,
          webhooks: [],
        };
      }
      const config = (body as Record<string, unknown>).config;
      const webhooks = config && typeof config === "object"
        ? parseWebhooks((config as Record<string, unknown>).webhooks)
        : [];
      return { estado: "ok", httpStatus: response.status, webhooks };
    } catch {
      return { estado: "indisponivel", httpStatus: 0, webhooks: [] };
    }
  }

  return { estado: "nao_suportado", httpStatus: 0, webhooks: [] };
}

function matchesExpectedTarget(
  webhookUrl: string,
  inboundEndpoint: string,
  caixaId: number,
): boolean {
  try {
    const observed = new URL(webhookUrl);
    const expected = new URL(inboundEndpoint);
    return observed.origin === expected.origin &&
      observed.pathname.replace(/\/+$/, "") ===
        expected.pathname.replace(/\/+$/, "") &&
      observed.searchParams.get("caixa_id") === String(caixaId);
  } catch {
    return false;
  }
}

export function temWebhookEfetivoEsperado(
  caixa: CaixaWebhookMonitorada,
  inspecao: InspecaoWebhookProvider,
  inboundEndpoint: string,
): boolean {
  return inspecao.estado === "ok" &&
    inspecao.webhooks.some((webhook) =>
      webhook.enabled &&
      matchesExpectedTarget(webhook.url, inboundEndpoint, caixa.id)
    );
}

export function avaliarCoberturaWebhook(
  caixa: CaixaWebhookMonitorada,
  inspecao: InspecaoWebhookProvider,
  temHashAtivo: boolean,
  inboundEndpoint: string,
): ProblemaCoberturaWebhook[] {
  const problem = (
    code: ProblemaCoberturaWebhook["code"],
  ): ProblemaCoberturaWebhook[] => [{
    caixaId: caixa.id,
    caixaNome: caixa.nome,
    code,
  }];

  if (inspecao.estado === "indisponivel") {
    return temHashAtivo ? problem("provider_inspection_unavailable") : [];
  }
  if (inspecao.estado !== "ok") return [];

  const enabled = inspecao.webhooks.filter((webhook) => webhook.enabled);
  const expected = enabled.filter((webhook) =>
    matchesExpectedTarget(webhook.url, inboundEndpoint, caixa.id)
  );

  if (
    enabled.length > 1 ||
    (enabled.length > 0 && expected.length !== enabled.length)
  ) {
    return problem("provider_webhook_destino_inesperado");
  }
  if (expected.length === 0) {
    return temHashAtivo ? problem("provider_webhook_ausente") : [];
  }
  if (!temHashAtivo) return problem("provider_webhook_sem_hash");

  const url = new URL(expected[0].url);
  if (!url.searchParams.get("webhook_secret")) {
    return problem("provider_webhook_sem_segredo");
  }

  return [];
}
