import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => {
  const path = resolve(repoRoot, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const webhook = read('supabase/functions/webhook-whatsapp-inbox/index.ts');
const auth = read('supabase/functions/webhook-whatsapp-inbox/auth.ts');
const config = read('supabase/config.toml');
const plan = read(
  'docs/superpowers/plans/2026-07-30-pesquisa-evasao-subprojeto-b-conversa-multipartes.md',
);
const runbook = read('docs/runbooks/webhook-inbound-secret-rollout.md');

test('autenticacao acontece antes do body e da criacao da service role', () => {
  assert.ok(auth, 'helper auth.ts ainda nao existe');
  assert.match(webhook, /from\s+["']\.\/auth\.ts["']/i);

  const authAt = webhook.indexOf('await autenticarWebhookInbound(');
  const bodyAt = webhook.indexOf('await req.json()');
  const serviceRoleReadAt = webhook.indexOf(
    "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')",
  );
  const serviceRoleAt = webhook.indexOf(
    'createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)',
  );

  assert.ok(authAt >= 0, 'autenticacao inbound nao esta ligada ao webhook');
  assert.ok(bodyAt > authAt, 'payload e lido antes da autenticacao');
  assert.ok(serviceRoleReadAt > authAt, 'service role e lida antes da autenticacao');
  assert.ok(serviceRoleAt > authAt, 'service role e criada antes da autenticacao');
  assert.match(webhook, /createClient\(SUPABASE_URL,\s*SUPABASE_ANON_KEY\)/);
  assert.match(
    webhook,
    /rpc\(['"]validar_webhook_caixa_hash['"],\s*\{[\s\S]*?p_caixa_id:[\s\S]*?p_secret_hash_sha256:/i,
  );
});

test('enforcement inbound fica desligado por padrao ate a caixa 3 ser provisionada', () => {
  assert.match(
    webhook,
    /WEBHOOK_INBOUND_SECRET_ENFORCEMENT\s*=\s*Deno\.env[\s\S]*?\.get\(['"]WEBHOOK_INBOUND_SECRET_ENFORCEMENT['"]\)[\s\S]*?\.toLowerCase\(\)\s*===\s*['"]true['"]/,
  );
  assert.match(
    webhook,
    /enforceProviderSecret:\s*WEBHOOK_INBOUND_SECRET_ENFORCEMENT/,
  );
});

test('health e provedor usam credenciais separadas e falham fechado', () => {
  assert.match(auth, /x-health-secret/i);
  assert.match(auth, /x-webhook-secret/i);
  assert.match(auth, /webhook_secret/i);
  assert.match(auth, /WEBHOOK_HEALTH_TOKEN|healthSecret/);
  assert.match(auth, /crypto\.subtle\.digest\(['"]SHA-256['"]/i);
  assert.doesNotMatch(auth, /console\.(?:log|warn|error)\s*\(/i);
  assert.doesNotMatch(auth, /SUPABASE_SERVICE_ROLE_KEY/i);
});

test('config deixa JWT do gateway aberto somente para autenticacao customizada', () => {
  assert.match(
    config,
    /\[functions\.webhook-whatsapp-inbox\][\s\S]*?autentica[cç][aã]o[^\n]*segredo[^\n]*caixa[\s\S]*?verify_jwt\s*=\s*false/i,
  );
});

test('bloqueio de rollout fica explicito no plano e no topo do runbook', () => {
  assert.match(
    plan,
    /BLOQUEIO DE ROLLOUT:[\s\S]*n[aã]o implantar[\s\S]*efetivamente chama o webhook[\s\S]*hash[\s\S]*URL[^\n]*provedor/i,
  );
  assert.ok(runbook, 'runbook de rollout do segredo inbound ainda nao existe');
  const topo = runbook.split(/\r?\n/).slice(0, 24).join('\n');
  assert.match(topo, /BLOQUEIO DE ROLLOUT/i);
  assert.match(topo, /toda caixa que efetivamente chama o[\s*>]+webhook/i);
  assert.match(topo, /hash/i);
  assert.match(topo, /URL[\s\S]*?provedor/i);
  assert.match(topo, /inbox[\s>]+administrativa/i);
  assert.match(topo, /CRM/i);
  assert.match(topo, /pesquisa de evas[aã]o/i);
});

test('roteamentos existentes permanecem no webhook autenticado', () => {
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
