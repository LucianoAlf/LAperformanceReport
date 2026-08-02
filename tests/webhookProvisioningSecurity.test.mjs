import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  readFileSync(resolve(repoRoot, relativePath), "utf8");

const configurador = read(
  "supabase/functions/configurar-webhook-caixa/index.ts",
);
const contrato = read(
  "supabase/functions/configurar-webhook-caixa/contract.ts",
);
const monitor = read("supabase/functions/monitor-saude-webhook/index.ts");
const config = read("supabase/config.toml");
const runbook = read("docs/runbooks/webhook-inbound-secret-rollout.md");

test("monitor autentica health, falha fechado e descobre caixas ativas no banco", () => {
  assert.match(monitor, /Deno\.env\.get\(['"]WEBHOOK_HEALTH_TOKEN['"]\)/);
  assert.match(monitor, /['"]x-health-secret['"]\s*:\s*healthToken/i);
  assert.match(
    monitor,
    /\.from\(['"]whatsapp_caixas['"]\)[\s\S]*?\.eq\(['"]ativo['"],\s*true\)/i,
  );
  assert.match(monitor, /\.not\(['"]webhook_url['"],\s*['"]is['"],\s*null\)/i);
  assert.doesNotMatch(monitor, /CAIXAS_MONITORADAS|\[\s*3\s*,/);
  assert.doesNotMatch(monitor, /--no-verify-jwt/i);
  assert.doesNotMatch(
    monitor,
    /uazapi_token[^\n]*(?:console|problemas)|console[^\n]*uazapi_token/i,
  );

  const tokenCheckAt = monitor.indexOf("if (!healthToken)");
  const healthFetchAt = monitor.indexOf("await fetch(healthUrl");
  assert.ok(tokenCheckAt >= 0, "monitor nao falha fechado sem health token");
  assert.ok(
    healthFetchAt > tokenCheckAt,
    "health e chamado antes da validacao do token",
  );
});

test("configurador valida JWT e admin ativo antes de body e service role", () => {
  assert.match(configurador, /req\.headers\.get\(['"]Authorization['"]\)/);
  assert.match(configurador, /auth\.getUser\(\)/);
  assert.match(
    configurador,
    /\.from\(['"]usuarios['"]\)[\s\S]*?perfil[\s\S]*?ativo/i,
  );
  assert.match(
    configurador,
    /usuario\.perfil\s*!==\s*['"]admin['"]|usuarioData\.perfil\s*!==\s*['"]admin['"]/,
  );

  const authAt = configurador.indexOf("await userClient.auth.getUser()");
  const bodyAt = configurador.indexOf("await req.json()");
  const serviceKeyAt = configurador.indexOf("SUPABASE_SERVICE_ROLE_KEY");
  const caixaAt = configurador.search(/\.from\(['"]whatsapp_caixas['"]\)/);
  assert.ok(authAt >= 0);
  assert.ok(bodyAt > authAt, "body e lido antes da autenticacao");
  assert.ok(
    serviceKeyAt > bodyAt,
    "service role e lida antes de autenticar e validar body",
  );
  assert.ok(
    caixaAt > serviceKeyAt,
    "credenciais da caixa sao lidas antes da autorizacao",
  );
});

test("configurador usa contrato seguro e nao devolve nem registra segredo", () => {
  assert.match(configurador, /from\s+['"]\.\/contract\.ts['"]/);
  assert.match(configurador, /provisionarWebhookUazapi\(/);
  assert.match(configurador, /whatsapp_caixa_webhook_secrets/);
  assert.doesNotMatch(configurador, /console\.(?:log|warn|error)\s*\(/i);
  assert.doesNotMatch(configurador, /webhook_url\s*:\s*webhookUrl\b/);
  assert.doesNotMatch(configurador, /rawSecret/);

  assert.match(contrato, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(contrato, /crypto\.subtle\.digest\(\s*['"]SHA-256['"]/i);
  assert.match(
    contrato,
    /searchParams\.set\(['"]webhook_secret['"],\s*['"]\[REDACTED\]['"]\)/,
  );
  assert.match(
    contrato,
    /events:\s*\[['"]messages['"],\s*['"]messages_update['"]\]/,
  );
  assert.match(contrato, /excludeMessages:\s*\[\]/);
  assert.doesNotMatch(contrato, /console\.(?:log|warn|error)\s*\(/i);
});

test("gateway exige JWT explicitamente e runbook bloqueia provisionamento inseguro", () => {
  assert.match(
    config,
    /\[functions\.configurar-webhook-caixa\][\s\S]*?verify_jwt\s*=\s*true/i,
  );
  const topo = runbook.split(/\r?\n/).slice(0, 30).join("\n");
  assert.match(topo, /N[AÃ]O IMPLANTAR/i);
  assert.match(topo, /todas as caixas ativas/i);
  assert.match(runbook, /caixa 1[\s\S]*401/i);
  assert.match(
    runbook,
    /caixa 2[\s\S]*sess[aÃ]o[\s\S]*(?:ausente|inexistente|n[aÃ]o (?:foi )?encontrada)/i,
  );
  assert.match(runbook, /caixa 3[\s\S]*exatamente um webhook/i);
  assert.match(runbook, /p01c-staging|nzwqjepncrtufpykjita/i);
  assert.doesNotMatch(runbook, /webhook_secret=(?!\[REDACTED\])/i);
});
