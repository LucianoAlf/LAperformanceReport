import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260803124500_lia_alertas_utf8_correcao.sql',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const sql = read(migrationPath);

test('correcao UTF-8 recria o renderizador com fonte ASCII-safe', () => {
  assert.ok(sql, `migration ausente: ${migrationPath}`);
  assert.match(
    sql,
    /create or replace function public\.fn_lia_renderizar_alerta_pesquisa\s*\(/i,
  );
  assert.doesNotMatch(sql, /[^\x00-\x7F]/, 'migration deve conter somente ASCII');
  assert.match(sql, /U&'\\\+01F514/);
  assert.match(sql, /U&'\\\+01F515/);
  assert.match(sql, /U&'\\\+01F449/);
  assert.match(sql, /\\2014/);
  assert.match(sql, /\\00E3/);
  assert.match(sql, /\\00ED/);
  assert.match(sql, /\\00EA/);
  assert.match(sql, /\\00FA/);
});

test('correcao nao reescreve alertas historicos nem libera producao', () => {
  assert.ok(sql, `migration ausente: ${migrationPath}`);
  assert.doesNotMatch(sql, /update\s+public\.lia_alertas_privados/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.lia_alertas_privados/i);
  assert.doesNotMatch(sql, /alertas_producao_liberados\s*=\s*true/i);
  assert.doesNotMatch(sql, /cron\.schedule/i);
});
