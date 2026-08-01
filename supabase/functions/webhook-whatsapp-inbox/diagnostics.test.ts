// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@1";
import {
  criarDiagnosticoWebhook,
  registrarDiagnosticoWebhook,
} from "./diagnostics.ts";

Deno.test("diagnostico conserva somente campos permitidos", () => {
  const diagnostico = criarDiagnosticoWebhook({
    correlationId: "corr-123",
    caixaId: 3,
    eventType: "messages",
    route: "evasao",
    result: "accepted",
    httpStatus: 200,
    errorCode: "provider_error",
    durationMs: 12.8,
    providerMessageIdHash: "a".repeat(64),
    occurredAt: "2026-08-01T18:00:00.000Z",
    phone: "5521999999999",
    remoteJid: "5521999999999@s.whatsapp.net",
    message: "resposta privada",
    body: { transcription: "conteudo privado" },
    url: "https://midia.exemplo/arquivo.ogg",
    token: "segredo",
  } as never);

  assertEquals(diagnostico, {
    correlation_id: "corr-123",
    caixa_id: 3,
    event_type: "messages",
    route: "evasao",
    result: "accepted",
    http_status: 200,
    error_code: "provider_error",
    duration_ms: 13,
    provider_message_id_hash: "a".repeat(64),
    occurred_at: "2026-08-01T18:00:00.000Z",
  });
});

Deno.test("valores opcionais invalidos nao entram no diagnostico", () => {
  const diagnostico = criarDiagnosticoWebhook({
    correlationId: "corr-456",
    caixaId: Number.NaN,
    eventType: "evento-forjado",
    route: "rota-forjada",
    result: "resultado-forjado",
    httpStatus: 999,
    errorCode: "mensagem livre do provedor",
    durationMs: -1,
    providerMessageIdHash: "nao-e-sha256",
    occurredAt: "data-invalida",
  } as never);

  const { occurred_at: occurredAt, ...semHorario } = diagnostico;
  assertEquals(semHorario, {
    correlation_id: "corr-456",
    caixa_id: 0,
    event_type: "unknown",
    route: "ignored",
    result: "error",
  });
  assertEquals(Number.isNaN(Date.parse(occurredAt)), false);
});

Deno.test("registro emite prefixo e objeto ja sanitizado", () => {
  const chamadas: Array<[unknown, Record<string, unknown>]> = [];

  registrarDiagnosticoWebhook(
    {
      correlationId: "corr-789",
      caixaId: 3,
      eventType: "messages_update",
      route: "ignored",
      result: "duplicate",
      phone: "5521988887777",
    } as never,
    (...args) => chamadas.push(args as [unknown, Record<string, unknown>]),
  );

  assertEquals(chamadas, [[
    "[webhook]",
    {
      correlation_id: "corr-789",
      caixa_id: 3,
      event_type: "messages_update",
      route: "ignored",
      result: "duplicate",
      occurred_at: chamadas[0][1].occurred_at,
    },
  ]]);
});
