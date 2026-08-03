import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = resolve(
  root,
  'supabase/migrations/20260803213000_lia_alertas_privados_fase_a_ativacao.sql',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('ativacao exige segredo governado antes de liberar producao', () => {
  assert.equal(existsSync(migration), true, 'migration de ativacao ausente');
  const sql = read(migration);

  assert.match(sql, /vault\.decrypted_secrets/i);
  assert.match(sql, /name\s*=\s*'lia_alertas_service_role_key'/i);
  assert.match(sql, /lia_alertas_service_role_key_required/i);
  assert.match(sql, /alertas_producao_liberados\s*=\s*true/i);
  assert.match(sql, /alertas_producao_liberados\s*=\s*false/i);
  assert.doesNotMatch(sql, /eyJ[a-zA-Z0-9_-]{20,}/);
});

test('reavaliacao libera somente entrega produtiva com rota congelada ainda valida', () => {
  const sql = read(migration);

  assert.match(sql, /evento\.ambiente\s*=\s*'producao'/i);
  assert.match(sql, /alerta\.status\s*=\s*'aguardando_liberacao'/i);
  assert.match(sql, /destino\.id\s*=\s*alerta\.destino_id/i);
  assert.match(
    sql,
    /destino\.destino_normalizado\s*=\s*alerta\.destino_snapshot/i,
  );
  assert.match(sql, /alerta\.caixa_id\s*=\s*3/i);
  assert.match(sql, /set\s+status\s*=\s*'pendente'/i);
  assert.match(sql, /set\s+status\s*=\s*'fila_administrativa'/i);
  assert.doesNotMatch(sql, /usuarios\.telefone|usuario\.telefone/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.lia_(pesquisa_eventos|alertas_privados)/i);
});

test('cron unico chama somente o dispatcher autenticado e nao envia na migration', () => {
  const sql = read(migration);

  assert.match(sql, /lia-alertas-privados-dispatcher-minuto/i);
  assert.match(sql, /cron\.unschedule/i);
  assert.match(sql, /cron\.schedule/i);
  assert.match(sql, /\* \* \* \* \*/);
  assert.match(sql, /net\.http_post/i);
  assert.match(
    sql,
    /https:\/\/ouqwbbermlzqqvtqwlul\.supabase\.co\/functions\/v1\/processar-alertas-lia/i,
  );
  assert.match(sql, /'Authorization'\s*,\s*'Bearer '\s*\|\|/i);
  assert.match(sql, /body\s*:=\s*'\{\}'::jsonb/i);
  assert.doesNotMatch(sql, /\/send\/text|uazapi|3000|3001|8657/i);
});
