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

const migration = read(
  'supabase/migrations/20260801220000_webhook_inbound_secrets_debug_retention.sql',
);
const verifier = read('scripts/verify-webhook-inbound-security.sql');
const webhook = read('supabase/functions/webhook-whatsapp-inbox/index.ts');
const pg17Fixture = read(
  'tests/fixtures/webhook_inbound_security_pg17.sql',
);

function createTableBlock(tableName) {
  const match = migration.match(
    new RegExp(
      `create\\s+table\\s+public\\.${tableName}\\s*\\(([\\s\\S]*?)\\n\\);`,
      'i',
    ),
  );
  assert.ok(match, `CREATE TABLE de ${tableName} ausente`);
  return match[1];
}

function functionBlock(functionName) {
  const match = migration.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?\\$function\\$\\s*;`,
      'i',
    ),
  );
  assert.ok(match, `funcao ${functionName} ausente`);
  return match[0];
}

test('segredo inbound fica backend-only e somente o hash e persistido', () => {
  assert.ok(migration, 'migration de seguranca inbound ausente');
  const table = createTableBlock('whatsapp_caixa_webhook_secrets');

  assert.match(table, /caixa_id\s+integer\s+primary\s+key/i);
  assert.match(
    table,
    /references\s+public\.whatsapp_caixas\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
  );
  assert.match(table, /secret_hash_sha256\s+text\s+not\s+null/i);
  assert.match(table, /\^\[0-9a-f\]\{64\}\$/i);
  assert.doesNotMatch(
    table.replace(/secret_hash_sha256/gi, ''),
    /\bsecret(?:_raw|_value|_plain|_texto)?\b|\btoken\b/i,
  );
  assert.match(
    migration,
    /alter\s+table\s+public\.whatsapp_caixa_webhook_secrets\s+enable\s+row\s+level\s+security/i,
  );
  assert.match(
    migration,
    /revoke\s+all\s+on\s+table\s+public\.whatsapp_caixa_webhook_secrets[\s\S]*from[\s\S]*public[\s\S]*anon[\s\S]*authenticated[\s\S]*mila_acesso_restrito[\s\S]*sol_acesso_restrito/i,
  );
  assert.match(
    migration,
    /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*on\s+table\s+public\.whatsapp_caixa_webhook_secrets[\s\S]*to\s+service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /create\s+policy[\s\S]{0,180}on\s+public\.whatsapp_caixa_webhook_secrets/i,
  );
});

test('validador recebe hash e devolve apenas boolean com ACL minima', () => {
  const validator = functionBlock('validar_webhook_caixa_hash');

  assert.match(
    validator,
    /\(\s*p_caixa_id\s+integer\s*,\s*p_secret_hash_sha256\s+text\s*\)/i,
  );
  assert.match(validator, /returns\s+boolean/i);
  assert.match(validator, /language\s+sql/i);
  assert.match(validator, /stable/i);
  assert.match(validator, /security\s+definer/i);
  assert.match(validator, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(validator, /wc\.ativo\s+is\s+true/i);
  assert.match(validator, /ws\.ativo\s+is\s+true/i);
  assert.match(validator, /ws\.secret_hash_sha256\s*=\s*p_secret_hash_sha256/i);
  assert.doesNotMatch(validator, /uazapi_token|waha_api_key|unidade_id/i);

  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.validar_webhook_caixa_hash\s*\(\s*integer\s*,\s*text\s*\)[\s\S]*from\s+public\s*,\s*authenticated\s*,\s*mila_acesso_restrito\s*,\s*sol_acesso_restrito/i,
  );
  assert.match(
    migration,
    /grant\s+execute\s+on\s+function\s+public\.validar_webhook_caixa_hash\s*\(\s*integer\s*,\s*text\s*\)[\s\S]*to\s+anon\s*,\s*service_role/i,
  );
});

test('expurgo usa contagem dinamica, notice e falha fechada por estrutura ou escritor', () => {
  assert.match(migration, /to_regclass\s*\(\s*'public\.webhook_debug_log'/i);
  assert.match(migration, /raise\s+exception[\s\S]*webhook_debug_log[\s\S]*n[aã]o\s+existe/i);
  assert.match(
    migration,
    /lock\s+table\s+public\.webhook_debug_log\s+in\s+access\s+exclusive\s+mode/i,
  );
  assert.match(
    migration,
    /select\s+count\s*\(\s*\*\s*\)[\s\S]*min\s*\(\s*created_at\s*\)[\s\S]*max\s*\(\s*created_at\s*\)/i,
  );
  assert.match(migration, /raise\s+notice[\s\S]*linhas/i);
  assert.match(migration, /if\s+v_debug_count\s*>\s*0\s+then[\s\S]*truncate\s+table\s+public\.webhook_debug_log/i);
  assert.match(migration, /webhook_debug_log\s+vazia[\s\S]*expurgo\s+ignorado/i);
  assert.doesNotMatch(migration, /v_debug_count\s*(?:<>|=|!=)\s*2290/i);
  assert.match(migration, /pg_get_functiondef/i);
  assert.match(migration, /escritor[\s\S]*webhook_debug_log/i);
  assert.match(
    migration,
    /pg_policies[\s\S]*webhook_debug_log[\s\S]*raise\s+exception[\s\S]*policy/i,
  );
  assert.match(
    migration,
    /revoke\s+all\s+on\s+table\s+public\.webhook_debug_log[\s\S]*service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /create\s+policy[\s\S]{0,180}on\s+public\.webhook_debug_log/i,
  );
});

test('diagnostico persistido e tipado, privado e retido por no maximo sete dias', () => {
  const table = createTableBlock('webhook_diagnosticos_sanitizados');

  for (const column of [
    'correlation_id',
    'caixa_id',
    'event_type',
    'route',
    'result',
    'http_status',
    'error_code',
    'duration_ms',
    'provider_message_id_hash',
    'occurred_at',
  ]) {
    assert.match(table, new RegExp(`\\b${column}\\b`, 'i'), `coluna ${column} ausente`);
  }
  assert.doesNotMatch(table, /\bjsonb?\b|\bpayload\b|\bbody\b|\bmessage\b|\btext\b/i);
  assert.match(
    migration,
    /alter\s+table\s+public\.webhook_diagnosticos_sanitizados\s+enable\s+row\s+level\s+security/i,
  );
  assert.match(
    migration,
    /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*on\s+table\s+public\.webhook_diagnosticos_sanitizados[\s\S]*to\s+service_role/i,
  );
  const retention = functionBlock('expurgar_webhook_diagnosticos_sanitizados');
  assert.match(retention, /occurred_at\s*<\s*now\s*\(\s*\)\s*-\s*interval\s*'7 days'/i);
  assert.match(retention, /security\s+definer/i);
  assert.match(retention, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(migration, /cron\.schedule[\s\S]*expurgar-webhook-diagnosticos-sanitizados/i);
});

test('webhook e verificacao nao reintroduzem payload bruto nem acesso de cliente', () => {
  assert.doesNotMatch(webhook, /from\s*\(\s*['"]webhook_debug_log['"]\s*\)/i);
  assert.ok(verifier, 'script de verificacao inbound ausente');

  for (const evidence of [
    /whatsapp_caixa_webhook_secrets/i,
    /validar_webhook_caixa_hash/i,
    /webhook_debug_log/i,
    /webhook_diagnosticos_sanitizados/i,
    /has_table_privilege/i,
    /has_function_privilege/i,
    /pg_policies/i,
    /cron\.job/i,
  ]) {
    assert.match(verifier, evidence);
  }
  assert.doesNotMatch(verifier, /select\s+payload|returning\s+payload/i);
});

test('fixture PostgreSQL cobre expurgo, validador, ACL, retencao e writer guard', () => {
  assert.ok(pg17Fixture, 'fixture PostgreSQL 17 ausente');
  for (const evidence of [
    /WEBHOOK_INBOUND_SECURITY_PG17_OK/,
    /WEBHOOK_INBOUND_EMPTY_PG17_OK/,
    /linhas legadas n[aã]o foram expurgadas/i,
    /hash correto da caixa ativa foi rejeitado/i,
    /authenticated leu tabela backend-only/i,
    /retenc[aã]o de sete dias divergiu/i,
    /writer guard n[aã]o bloqueou/i,
  ]) {
    assert.match(pg17Fixture, evidence);
  }
});
