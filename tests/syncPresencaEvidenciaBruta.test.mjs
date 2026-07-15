import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260715162000_sync_presenca_emusys_evidencia_bruta.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const sync = readFileSync('supabase/functions/sync-presenca-emusys/index.ts', 'utf8');

test('banco preserva estado bruto e instante de sincronizacao do Emusys', () => {
  assert.match(migration, /emusys_presenca_bruta\s+text/i);
  assert.match(migration, /sincronizado_emusys_em\s+timestamptz/i);
  assert.match(migration, /upsert_presenca_emusys_bruta/i);
  assert.match(migration, /respondido_em[\s\S]*NULL/i);
});

test('upsert atualiza apenas linha de origem automatica e nunca pisa no LA Teacher', () => {
  assert.match(
    migration,
    /WHERE[\s\S]*aluno_presenca\.respondido_por\s+IS\s+NULL[\s\S]*'emusys'[\s\S]*'sistema'/i,
  );
  assert.match(migration, /aluno_presenca\.status\s*=\s*'presente'[\s\S]*EXCLUDED\.status\s*=\s*'ausente'/i);
  assert.match(migration, /THEN\s+aluno_presenca\.status/i);
});

test('sync usa RPC condicional no lugar do upsert congelado', () => {
  assert.match(sync, /\.rpc\(\s*'upsert_presenca_emusys_bruta'/i);
  assert.doesNotMatch(
    sync,
    /\.from\('aluno_presenca'\)[\s\S]{0,900}ignoreDuplicates:\s*true/i,
  );
  assert.doesNotMatch(
    sync,
    /respondido_por:\s*'emusys'[\s\S]{0,120}respondido_em:\s*new\s+Date\(\)\.toISOString\(\)/i,
  );
});

test('RPC fica restrita ao service role', () => {
  assert.match(migration, /SECURITY\s+DEFINER/i);
  assert.match(migration, /SET\s+search_path\s*=\s*public/i);
  assert.match(migration, /REVOKE\s+ALL[\s\S]*FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /GRANT\s+EXECUTE[\s\S]*TO\s+service_role/i);
});
