import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webhookPath = resolve(
  repoRoot,
  'supabase/functions/webhook-whatsapp-inbox/index.ts',
);
const diagnosticsPath = resolve(
  repoRoot,
  'supabase/functions/webhook-whatsapp-inbox/diagnostics.ts',
);

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('webhook centraliza logs no diagnostico tipado', () => {
  const webhook = readOptional(webhookPath);
  const diagnostics = readOptional(diagnosticsPath);

  assert.ok(diagnostics, 'helper de diagnostico sanitizado ainda nao existe');
  assert.match(webhook, /from\s+["']\.\/diagnostics\.ts["']/i);
  assert.match(webhook, /registrarDiagnosticoWebhook\s*\(/i);
  assert.doesNotMatch(
    webhook,
    /console\.(?:log|warn|error)\s*\(/i,
    'index.ts nao pode contornar o contrato tipado de diagnostico',
  );
});

test('webhook nao envia conteudo privado para logs de execucao', () => {
  const webhook = readOptional(webhookPath);

  for (const forbidden of [
    /JSON\.stringify\(payload\)\.substring/i,
    /Payload COMPLETO/i,
    /JSON\.stringify\(estado\)/i,
    /Dados transcri[cç][aã]o/i,
    /[ÁA]udio transcrito/i,
    /Erro UAZAPI:[^\n]*\$\{errText\}/i,
    /Telefone extra[ií]do/i,
    /Lead nao encontrado para telefone/i,
    /M[ií]dia[^\n]*\$\{persistentUrl/i,
  ]) {
    assert.doesNotMatch(webhook, forbidden);
  }
});

test('limpeza de logs preserva os marcos dos roteamentos existentes', () => {
  const webhook = readOptional(webhookPath);

  for (const required of [
    /handleStatusUpdate\(payload,\s*supabase/i,
    /handleEdicaoMensagem\(/i,
    /reactionMessage/i,
    /handleRespostaEvasao\(/i,
    /handleAdminInboxMessage\(/i,
    /processar-resposta-pesquisa/i,
    /mila-processar-mensagem/i,
  ]) {
    assert.match(webhook, required);
  }
});
