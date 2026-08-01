export type WebhookDiagnosticEventType =
  | "messages"
  | "messages_update"
  | "unknown";
export type WebhookDiagnosticRoute =
  | "admin"
  | "crm"
  | "evasao"
  | "pesquisa_primeira_aula"
  | "ignored";
export type WebhookDiagnosticResult =
  | "accepted"
  | "duplicate"
  | "rejected"
  | "error";
export type WebhookDiagnosticErrorCode =
  | "invalid_payload"
  | "provider_error"
  | "database_error"
  | "internal_error";

export interface WebhookDiagnosticInput {
  correlationId: string;
  caixaId: number;
  eventType: WebhookDiagnosticEventType;
  route: WebhookDiagnosticRoute;
  result: WebhookDiagnosticResult;
  httpStatus?: number;
  errorCode?: WebhookDiagnosticErrorCode;
  durationMs?: number;
  providerMessageIdHash?: string;
  occurredAt?: string;
}

export interface WebhookDiagnostic {
  correlation_id: string;
  caixa_id: number;
  event_type: WebhookDiagnosticEventType;
  route: WebhookDiagnosticRoute;
  result: WebhookDiagnosticResult;
  http_status?: number;
  error_code?: WebhookDiagnosticErrorCode;
  duration_ms?: number;
  provider_message_id_hash?: string;
  occurred_at: string;
}

export type WebhookDiagnosticSink = (...args: unknown[]) => void;

const EVENT_TYPES = new Set<WebhookDiagnosticEventType>([
  "messages",
  "messages_update",
  "unknown",
]);
const ROUTES = new Set<WebhookDiagnosticRoute>([
  "admin",
  "crm",
  "evasao",
  "pesquisa_primeira_aula",
  "ignored",
]);
const RESULTS = new Set<WebhookDiagnosticResult>([
  "accepted",
  "duplicate",
  "rejected",
  "error",
]);
const ERROR_CODES = new Set<WebhookDiagnosticErrorCode>([
  "invalid_payload",
  "provider_error",
  "database_error",
  "internal_error",
]);

function numeroInteiroPositivo(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function horarioIso(value: unknown): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

export function criarDiagnosticoWebhook(
  input: WebhookDiagnosticInput,
): WebhookDiagnostic {
  const diagnostico: WebhookDiagnostic = {
    correlation_id: typeof input.correlationId === "string" &&
        input.correlationId.trim()
      ? input.correlationId
      : crypto.randomUUID(),
    caixa_id: numeroInteiroPositivo(input.caixaId) ?? 0,
    event_type: EVENT_TYPES.has(input.eventType) ? input.eventType : "unknown",
    route: ROUTES.has(input.route) ? input.route : "ignored",
    result: RESULTS.has(input.result) ? input.result : "error",
    occurred_at: horarioIso(input.occurredAt),
  };

  const httpStatus = numeroInteiroPositivo(input.httpStatus);
  if (httpStatus !== undefined && httpStatus >= 100 && httpStatus <= 599) {
    diagnostico.http_status = httpStatus;
  }

  if (ERROR_CODES.has(input.errorCode as WebhookDiagnosticErrorCode)) {
    diagnostico.error_code = input.errorCode as WebhookDiagnosticErrorCode;
  }

  const durationMs = numeroInteiroPositivo(input.durationMs);
  if (durationMs !== undefined) {
    diagnostico.duration_ms = durationMs;
  }

  if (
    typeof input.providerMessageIdHash === "string" &&
    /^[0-9a-f]{64}$/i.test(input.providerMessageIdHash)
  ) {
    diagnostico.provider_message_id_hash = input.providerMessageIdHash
      .toLowerCase();
  }

  return diagnostico;
}

export function registrarDiagnosticoWebhook(
  input: WebhookDiagnosticInput,
  sink: WebhookDiagnosticSink = console.log,
): void {
  sink("[webhook]", criarDiagnosticoWebhook(input));
}
