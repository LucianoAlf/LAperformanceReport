import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = resolve(
  root,
  'supabase/migrations/20260803210000_lia_alertas_dispatcher_edge.sql',
);
const index = resolve(
  root,
  'supabase/functions/processar-alertas-lia/index.ts',
);
const dispatcher = resolve(
  root,
  'supabase/functions/processar-alertas-lia/dispatcher.ts',
);
const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('dispatcher usa caixa 3 sem bridge ou fallback', () => {
  const source = `${read(index)}\n${read(dispatcher)}`;
  assert.match(source, /CAIXA_LIA_ID\s*=\s*3/);
  assert.match(source, /\/send\/text/);
  assert.match(source, /claim_lia_alerta_privado/);
  assert.match(source, /concluir_lia_alerta_privado/);
  assert.match(source, /falhar_lia_alerta_privado/);
  assert.doesNotMatch(source, /3000|3001|8657|send-alert|send-report/);
  assert.match(
    config,
    /\[functions\.processar-alertas-lia\][\s\S]*verify_jwt\s*=\s*true/,
  );
});

test('endpoint autentica service role antes do acesso privilegiado', () => {
  const source = read(index);
  assert.match(source, /autorizarServiceRole/);
  assert.match(source, /validarPedidoDispatcher/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /claim_lia_alerta_privado/);
  assert.match(source, /\.eq\(["']id["'],\s*CAIXA_LIA_ID\)/);
  assert.ok(
    source.indexOf('if (!autorizarServiceRole') <
      source.indexOf('const supabase = createClient'),
    'autorização precisa ocorrer antes de criar o cliente service role',
  );
  assert.doesNotMatch(source, /webhook-whatsapp-inbox/);
});

test('migration audita a caixa e usa erros de provider', () => {
  const sql = read(migration);
  assert.match(sql, /add column caixa_id integer/i);
  assert.match(sql, /default 3/i);
  assert.match(
    sql,
    /claim_lia_alerta_privado[\s\S]*returns table[\s\S]*caixa_id integer/i,
  );
  assert.match(sql, /provider_confirmacao_ambigua/i);
  assert.doesNotMatch(sql, /bridge_/i);
});

test('pacote do dispatcher não modifica o webhook de recepção', () => {
  for (const path of [migration, index, dispatcher]) {
    assert.doesNotMatch(path.replaceAll('\\', '/'), /webhook-whatsapp-inbox/);
  }
});
