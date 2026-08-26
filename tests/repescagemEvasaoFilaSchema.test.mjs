import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260827090000_pesquisa_evasao_envios_fila.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('fila de repescagem tem estados e colunas de lease', () => {
  assert.ok(existsSync(migrationUrl), 'migration da fila deve existir');
  const source = sql();
  assert.match(source, /create table public\.pesquisa_evasao_envios_fila/i);
  assert.match(source, /pendente[\s\S]*enviando[\s\S]*enviada[\s\S]*falhou[\s\S]*cancelada/i);
  assert.match(source, /lease_expires_at/i);
  assert.match(source, /worker_id/i);
  assert.match(source, /toque\s+integer/i);
});

test('unicidade impede toque repetido e dois envios vivos', () => {
  const source = sql();
  assert.match(source, /unique\s*\(\s*pesquisa_id\s*,\s*toque\s*\)/i);
  assert.match(
    source,
    /create unique index[\s\S]+pesquisa_evasao_envios_fila_vivo_uidx[\s\S]+where[\s\S]+'pendente'[\s\S]+'enviando'/i,
  );
});

test('tabela nasce fechada e so abre select escopado para authenticated', () => {
  const source = sql();
  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on table public\.pesquisa_evasao_envios_fila\s+from public, anon, authenticated/i);
  assert.match(source, /grant select on table public\.pesquisa_evasao_envios_fila to authenticated/i);
  // chamada de funcao dentro de (select ...) vira InitPlan
  assert.match(source, /\(\s*select public\.is_admin\(\)\s*\)/i);
  assert.match(source, /\(\s*select public\.get_user_unidade_ids\(\)\s*\)/i);
});
