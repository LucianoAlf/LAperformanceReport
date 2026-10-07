import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const defaultPath =
  'supabase/migrations/20260919223000_revoke_anon_default_privileges_funcoes.sql';
const revokePath =
  'supabase/migrations/20260919224000_revoke_anon_recalcular_projecao_e_hermes_patch.sql';

test('default privileges de funcao nova deixam de nascer com EXECUTE para anon', () => {
  assert.equal(existsSync(defaultPath), true);
  const sql = readFileSync(defaultPath, 'utf8');
  assert.match(
    sql,
    /alter default privileges for role postgres in schema public\s+revoke execute on functions from anon/i,
  );
  assert.match(sql, /DEFAULT_PRIVILEGES_POSTGRES_AINDA_ANON/);
  assert.match(sql, /supabase_admin/);
  assert.doesNotMatch(sql, /revoke execute on functions from authenticated/i);
});

test('recalcular_projecao e hermes_patch perdem anon e public, sem tocar na anamnese', () => {
  assert.equal(existsSync(revokePath), true);
  const sql = readFileSync(revokePath, 'utf8');
  assert.match(sql, /revoke all on function public\.recalcular_projecao\([^)]+\)\s+from public, anon/i);
  assert.match(
    sql,
    /grant execute on function public\.recalcular_projecao\([^)]+\)\s+to authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.hermes_patch_status_reportar\([^)]+\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.hermes_patch_status_reportar\([^)]+\)\s+to service_role/i,
  );
  assert.doesNotMatch(sql, /revoke[\s\S]*get_anamnese_publica/i);
  assert.doesNotMatch(sql, /revoke[\s\S]*salvar_anamnese_online/i);
  assert.match(sql, /ANON_AINDA_EXECUTA/);
});

test('recalcular_projecao recupera authenticated sem devolver anon', () => {
  const sql = readFileSync(
    'supabase/migrations/20260919224500_recalcular_projecao_restaura_authenticated.sql',
    'utf8',
  );
  assert.match(
    sql,
    /grant execute on function public\.recalcular_projecao\([^)]+\)\s+to authenticated/i,
  );
  assert.match(sql, /AUTHENTICATED_SEM_EXECUTE/);
  assert.match(sql, /ANON_VOLTOU_EM/);
});
