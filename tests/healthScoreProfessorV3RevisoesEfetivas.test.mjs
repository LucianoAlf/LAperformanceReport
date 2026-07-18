import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260717224500_health_score_v3_revisoes_periodos_efetivos.sql';
const isolationMigrationPath =
  'supabase/migrations/20260717225000_health_score_v3_revisoes_roles_isolamento.sql';

function readMigration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

test('camada efetiva aplica somente a ultima revisao humana ao baseline', () => {
  const sql = readMigration();

  assert.match(sql, /vw_professor_periodos_baseline_v3_sombra/i);
  assert.match(sql, /vw_professor_periodos_efetivos_v3_sombra/i);
  assert.match(sql, /security_invoker\s*=\s*true/i);
  assert.match(sql, /professor_periodos_revisoes_v1/i);
  assert.match(sql, /distinct\s+on\s*\(\s*(?:\w+\.)?periodo_id\s*\)/i);
  assert.match(sql, /order\s+by\s+(?:\w+\.)?periodo_id[\s\S]*created_at\s+desc[\s\S]*id\s+desc/i);
  assert.match(
    sql,
    /periodo_chave\s*=\s*'baseline:'\s*\|\|\s*(?:\w+\.)?periodo_id::text/i,
  );
});

test('decisoes aprovadas corrigem a leitura e decisoes abertas nao publicam', () => {
  const sql = readMigration();

  assert.match(sql, /decisao\s+in\s*\(\s*'aprovado'\s*,\s*'corrigido'\s*\)/i);
  assert.match(sql, /professor_corrigido_id/i);
  assert.match(sql, /emusys_professor_corrigido_id/i);
  assert.match(sql, /data_inicio_corrigida/i);
  assert.match(sql, /data_fim_corrigida/i);
  assert.match(sql, /'revisado_aprovado'/i);
  assert.match(sql, /decisao\s*=\s*'rejeitado'[\s\S]*'invalidado'/i);
  assert.match(sql, /decisao\s+in\s*\(\s*'rejeitado'\s*,\s*'manter_revisao'\s*\)[\s\S]*false/i);
  assert.match(sql, /30\.44::numeric/i);
  assert.match(sql, />=\s*4/i);
});

test('overlay preserva historico bruto e continua isolado do frontend', () => {
  const sql = readMigration();

  assert.doesNotMatch(
    sql,
    /(insert\s+into|update|delete\s+from)\s+public\.(professor_matricula_disciplina_periodos_v1|professor_periodos_revisoes_v1|aulas_emusys|aluno_presenca)/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.vw_professor_periodos_(?:baseline|efetivos)_v3_sombra[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s+on\s+table\s+public\.vw_professor_periodos_(?:baseline|efetivos)_v3_sombra[\s\S]*to\s+service_role/i,
  );
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(?:public|anon|authenticated)/i);
});

test('migration corretiva remove grants padrao dos agentes e deixa service role somente leitura', () => {
  assert.equal(
    existsSync(isolationMigrationPath),
    true,
    `${isolationMigrationPath} deve existir`,
  );
  const sql = readFileSync(isolationMigrationPath, 'utf8');

  for (const role of [
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
  ]) {
    assert.match(sql, new RegExp(`revoke all[\\s\\S]*${role}`, 'i'));
  }

  assert.match(sql, /revoke all[\s\S]*service_role/i);
  assert.match(sql, /grant select[\s\S]*service_role/i);
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(?:public|anon|authenticated|fabio_agent|lia_acesso_restrito|mila_acesso_restrito|sol_acesso_restrito)/i);
});
