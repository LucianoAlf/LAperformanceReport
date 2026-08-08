import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260806123000_versionar_get_contagem_trancados_professores.sql',
  import.meta.url,
);

test('versiona a RPC complementar de trancados com assinatura e ACL seguras', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.get_contagem_trancados_professores\s*\(\s*p_unidade_id\s+uuid\s+default\s+null/i,
  );
  assert.match(sql, /returns\s+table\s*\(\s*professor_id\s+integer\s*,\s*total_trancados\s+integer\s*\)/i);
  assert.match(sql, /language\s+sql/i);
  assert.match(sql, /\bstable\b/i);
  assert.match(sql, /set\s+search_path\s+to\s+'public'\s*,\s*'pg_temp'/i);
  assert.match(sql, /public\.vw_jornada_professor_trancado/i);
  assert.match(sql, /revoke\s+all\s+on\s+function[\s\S]*?from\s+public/i);
  assert.match(sql, /revoke\s+all\s+on\s+function[\s\S]*?from\s+anon/i);
  assert.match(sql, /grant\s+execute\s+on\s+function[\s\S]*?to\s+authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i);
});
