import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260801192000_pesquisa_evasao_opt_out.sql',
);
const sendPath = resolve(root, 'supabase/functions/enviar-pesquisa-evasao/index.ts');
const consolidationPath = resolve(
  root,
  'supabase/functions/processar-conversa-evasao/contract.ts',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('opt-out tem proveniência e resposta inválida no cabeçalho', () => {
  const sql = read(migrationPath);
  assert.match(sql, /add column if not exists resposta_valida boolean/i);
  assert.match(sql, /add column if not exists opt_out_em timestamptz/i);
  assert.match(sql, /add column if not exists opt_out_provider_message_id text/i);
  assert.match(sql, /resposta_status\s*=\s*'recusada_opt_out'/i);
  assert.match(sql, /resposta_valida\s*=\s*false/i);
  assert.match(sql, /new\.provider_message_id/i);
});

test('trigger remove a fila e impede reabrir pesquisa recusada', () => {
  const sql = read(migrationPath);
  assert.match(sql, /delete from public\.pesquisa_evasao_processamento/i);
  assert.match(sql, /old\.resposta_status\s*=\s*'recusada_opt_out'/i);
  assert.match(sql, /pesquisa_evasao_opt_out/i);
});

test('preview e confirmação recusam reenvio com HTTP 409', () => {
  const source = read(sendPath);
  assert.match(source, /exigirPesquisaSemOptOut/);
  assert.match(source, /recusada_opt_out/);
  assert.match(source, /new ErroHttp\(\s*409/i);
  assert.ok((source.match(/exigirPesquisaSemOptOut/g) ?? []).length >= 3);
});

test('worker não cria análise para opt-out e consentimentos externos não são tocados', () => {
  const contract = read(consolidationPath);
  const sql = read(migrationPath);
  assert.match(contract, /substantividade\s*===\s*["']opt_out["']/);
  assert.doesNotMatch(
    sql,
    /(?:update|insert\s+into|alter\s+table|delete\s+from)[^;]*(?:consent|lgpd|marketing|opt_out_whatsapp)/i,
  );
});
