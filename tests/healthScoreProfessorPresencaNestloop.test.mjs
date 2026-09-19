import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260919210000_get_professor_presenca_v3_sombra_sem_nestloop.sql';
const corpoPath =
  'supabase/migrations/20260718235000_health_score_v3_gate8_presenca_auditoria.sql';

test('presenca v3 sombra desliga nestloop por ALTER, sem recriar o corpo', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /alter\s+function\s+public\.get_professor_presenca_v3_sombra\s*\(\s*date\s*,\s*uuid\s*\)\s+set\s+enable_nestloop\s*=\s*off/i,
  );
  assert.doesNotMatch(
    sql,
    /create\s+or\s+replace\s+function\s+public\.get_professor_presenca_v3_sombra/i,
    'recriar sem repetir o SET no cabecalho apaga o enable_nestloop (e o search_path)',
  );
  assert.match(
    sql,
    /SET enable_nestloop TO 'off'/,
    'o aviso ao proximo CREATE OR REPLACE precisa citar a linha do cabecalho',
  );
  assert.match(
    sql,
    /reset enable_nestloop/i,
    'a volta tem de estar no arquivo da migration, nao so no PR',
  );
});

test('a migration que ainda tem o CREATE OR REPLACE avisa que o SET vive fora dela', () => {
  assert.equal(existsSync(corpoPath), true, `${corpoPath} deve existir`);
  const sql = readFileSync(corpoPath, 'utf8');
  assert.match(sql, /create or replace function public\.get_professor_presenca_v3_sombra/i);
  assert.match(sql, /20260919210000/);
  assert.match(sql, /enable_nestloop/i);
});
