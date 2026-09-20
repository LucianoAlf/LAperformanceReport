import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function migrationSource() {
  const name = fs.readdirSync(migrationsDir)
    .filter((entry) => /_emusys_cpf_hmac_e_faturas_futuras\.sql$/u.test(entry))
    .sort()
    .at(-1);
  assert.ok(name, 'migration de CPF HMAC e faturas futuras ausente');
  return fs.readFileSync(path.join(migrationsDir, name), 'utf8');
}

function resolverNamesMigrationSource() {
  const name = fs.readdirSync(migrationsDir)
    .filter((entry) => /_emusys_cpf_hmac_resolver_nomes\.sql$/u.test(entry))
    .sort()
    .at(-1);
  assert.ok(name, 'migration de nomes do resolver CPF HMAC ausente');
  return fs.readFileSync(path.join(migrationsDir, name), 'utf8');
}

function resolverBatchMigrationSource() {
  const name = fs.readdirSync(migrationsDir)
    .filter((entry) => /_emusys_cpf_hmac_resolver_lote\.sql$/u.test(entry))
    .sort()
    .at(-1);
  assert.ok(name, 'migration do resolvedor CPF HMAC em lote ausente');
  return fs.readFileSync(path.join(migrationsDir, name), 'utf8');
}

test('migration usa Vault e guarda somente HMAC-SHA256 em schema privado', () => {
  const sql = migrationSource();

  assert.match(sql, /vault\.decrypted_secrets/iu);
  assert.match(sql, /emusys_cpf_hmac_key_v1/iu);
  assert.match(sql, /create table(?: if not exists)? private\.emusys_cpf_hmac_vinculos/iu);
  assert.match(sql, /extensions\.hmac[\s\S]{0,180}sha256/iu);
  assert.match(sql, /check\s*\(cpf_hmac\s*~\s*'\^\[0-9a-f\]\{64\}\$'/iu);
  assert.doesNotMatch(sql, /\bcpf(?:_digitos|_claro)?\s+text\b/iu);
});

test('backfill deriva hashes antes de limpar todos os ingressos JSON', () => {
  const sql = migrationSource();
  const backfill = sql.indexOf('backfill_emusys_cpf_hmac');
  const scrub = sql.indexOf('scrub_cpf_claro_existente');

  assert.ok(backfill >= 0, 'marcador de backfill ausente');
  assert.ok(scrub > backfill, 'limpeza deve ocorrer depois da derivacao dos hashes');
  for (const alvo of [
    'emusys_matriculas_estado_atual',
    'emusys_api_payload',
    'matriculas_emusys_decisoes_canonicas',
    'automacao_log',
    'webhook_debug_log',
    'leads_automacao_log',
  ]) assert.match(sql, new RegExp(alvo, 'iu'));
  assert.match(sql, /create trigger[\s\S]+remover_cpf_claro_jsonb/iu);
});

test('RPCs substituem vinculos e resolvem hash apenas para service_role', () => {
  const sql = migrationSource();

  assert.match(sql, /replace_emusys_cpf_hmac_vinculos/iu);
  assert.match(sql, /resolver_emusys_cpf_hmac/iu);
  assert.match(sql, /auth\.role\(\)\s+is\s+distinct\s+from\s+'service_role'/iu);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/iu);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/iu);
});

test('Edges sanitizam snapshots e logs antes da persistencia', () => {
  const sync = read('supabase/functions/sync-matriculas-emusys/index.ts');
  const webhook = read('supabase/functions/processar-matricula-emusys/index.ts');
  const logs = read('supabase/functions/_shared/invariantes.ts');

  assert.match(sync, /extrairMatriculasCpfParaHmac/iu);
  assert.match(sync, /replace_emusys_cpf_hmac_vinculos/iu);
  assert.match(sync, /payload_snapshot:\s*removerCpfClaro\(mat\)/iu);
  assert.match(webhook, /payload_bruto:\s*removerCpfClaro\(body\)/iu);
  assert.match(logs, /payload_bruto:\s*removerCpfClaro\(params\.payload_bruto/iu);
  assert.match(logs, /detalhes:\s*removerCpfClaro\(params\.detalhes/iu);
});

test('indice preserva aluno e responsavel como papeis independentes', () => {
  const sql = migrationSource();
  const edge = read('supabase/functions/resolver-emusys-cpf-hash/index.ts');

  assert.match(sql, /aluno_cpf/iu);
  assert.match(sql, /responsavel_cpf/iu);
  assert.match(sql, /'aluno'::text/iu);
  assert.match(sql, /'responsavel'::text/iu);
  assert.match(sql, /union all[\s\S]{0,900}'responsavel'::text/iu);
  assert.match(edge, /papel_cpf/iu);
  assert.match(edge, /emusys_responsavel_id/iu);
});

test('endpoint do Super Folha valida segredo, aceita somente hash e nao o ecoa', () => {
  const edge = read('supabase/functions/resolver-emusys-cpf-hash/index.ts');
  const config = read('supabase/config.toml');

  assert.match(edge, /x-super-folha-sync-secret/iu);
  assert.match(edge, /\^\[0-9a-f\]\{64\}\$/iu);
  assert.match(edge, /resolver_emusys_cpf_hmac/iu);
  assert.doesNotMatch(edge, /cpf[_-]?(?:claro|digitos)|aluno\.cpf|responsavel\.cpf/iu);
  assert.doesNotMatch(edge, /console\.(?:log|error)[^\n]*cpf_hash/iu);
  assert.match(config, /\[functions\.resolver-emusys-cpf-hash\][\s\S]*?verify_jwt\s*=\s*false/iu);
});

test('backlog recorrente inclui os tres meses futuros', () => {
  const sql = migrationSource();

  assert.match(sql, /interval\s+'1 month'/iu);
  assert.match(sql, /interval\s+'2 months'/iu);
  assert.match(sql, /interval\s+'3 months'/iu);
});

test('resolver devolve nomes do snapshot sanitizado quando nao existe aluno local', () => {
  const sql = resolverNamesMigrationSource();

  assert.match(sql, /join public\.emusys_matriculas_estado_atual/iu);
  assert.match(sql, /payload_snapshot#>>'\{aluno,nome\}'/iu);
  assert.match(sql, /payload_snapshot#>>'\{responsavel,nome\}'/iu);
  assert.match(sql, /coalesce\(\s*aluno\.nome/iu);
  assert.match(sql, /coalesce\(\s*aluno\.responsavel_nome/iu);
});

test('resolvedor em lote consulta o indice privado em uma RPC restrita', () => {
  const sql = resolverBatchMigrationSource();

  assert.match(sql, /resolver_emusys_cpf_hmac_lote/iu);
  assert.match(sql, /p_cpfs_hmac\s+text\[\]/iu);
  assert.match(sql, /private\.emusys_cpf_hmac_vinculos/iu);
  assert.match(sql, /auth\.role\(\)\s+is\s+distinct\s+from\s+'service_role'/iu);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/iu);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/iu);
});

test('endpoint preserva cpf_hash unitario e aceita cpf_hashes sem consultar o Emusys', () => {
  const edge = read('supabase/functions/resolver-emusys-cpf-hash/index.ts');

  assert.match(edge, /body\.cpf_hash/iu);
  assert.match(edge, /body\.cpf_hashes/iu);
  assert.match(edge, /resolver_emusys_cpf_hmac_lote/iu);
  assert.match(edge, /resultados/iu);
  assert.doesNotMatch(edge, /fetch\s*\(/iu);
});
