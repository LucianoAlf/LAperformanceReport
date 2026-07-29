import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260729120000_emusys_matriculas_estado_atual.sql';
const migrationExists = existsSync(migrationPath);
const sql = migrationExists ? readFileSync(migrationPath, 'utf8') : '';

test('cria a fonte bruta e a projecao semantica de estado atual', () => {
  assert.equal(
    migrationExists,
    true,
    `migration ausente: ${migrationPath}`,
  );
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.emusys_matriculas_estado_atual/i);
  assert.match(sql, /primary\s+key\s*\(\s*unidade_id\s*,\s*emusys_matricula_id\s*\)/i);
  assert.match(sql, /create\s+or\s+replace\s+view\s+public\.vw_aluno_estado_operacional_canonico/i);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.upsert_emusys_matriculas_estado_atual/i);
});

test('preserva os quatro estados e os detalhes do trancamento', { skip: !migrationExists }, () => {
  assert.match(
    sql,
    /constraint\s+emusys_matriculas_estado_atual_status_check[\s\S]{0,100}check\s*\(\s*status_emusys\s+in\s*\(\s*'ativa'\s*,\s*'trancada'\s*,\s*'inativa'\s*,\s*'finalizada'\s*,\s*'desconhecido'/i,
  );
  assert.match(
    sql,
    /constraint\s+emusys_matriculas_estado_atual_motivo_check[\s\S]{0,100}check\s*\(\s*motivo_inativa\s+is\s+null\s+or\s+motivo_inativa\s+in\s*\(\s*'interrompida'\s*,\s*'concluida'/i,
  );
  for (const column of [
    'trancamento_id',
    'trancamento_motivo',
    'trancamento_data_inicial',
    'trancamento_data_final',
    'payload_snapshot',
    'payload_hash',
    'primeiro_sync_em',
    'sincronizado_em',
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'), `coluna ausente: ${column}`);
  }
});

test('somente ativa entra nas bases operacionais vivas', { skip: !migrationExists }, () => {
  for (const flag of [
    'entra_base_ativa',
    'entra_carteira_professor',
    'entra_financeiro_ativo',
    'entra_denominador_presenca',
    'entra_health_score',
    'entra_churn_atual',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `\\(\\s*e\\.status_emusys\\s*=\\s*'ativa'\\s*\\)\\s+as\\s+${flag}`,
        'i',
      ),
      `${flag} deve depender exclusivamente de status ativa`,
    );
  }

  assert.match(
    sql,
    /\(\s*e\.status_emusys\s*=\s*'trancada'\s*\)\s+as\s+eh_trancamento_atual/i,
  );
  assert.match(
    sql,
    /\(\s*e\.status_emusys\s*=\s*'inativa'\s+and\s+e\.motivo_inativa\s*=\s*'interrompida'\s*\)\s+as\s+eh_interrupcao_definitiva/i,
  );
  assert.match(
    sql,
    /\(\s*e\.status_emusys\s*=\s*'inativa'\s+and\s+e\.motivo_inativa\s*=\s*'concluida'\s*\)\s+as\s+eh_contrato_concluido/i,
  );
});

test('fonte bruta e materializador ficam privados', { skip: !migrationExists }, () => {
  assert.match(
    sql,
    /alter\s+table\s+public\.emusys_matriculas_estado_atual\s+enable\s+row\s+level\s+security/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.emusys_matriculas_estado_atual\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.emusys_matriculas_estado_atual\s+to\s+service_role/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.upsert_emusys_matriculas_estado_atual\s*\(\s*uuid\s*,\s*jsonb\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.upsert_emusys_matriculas_estado_atual\s*\(\s*uuid\s*,\s*jsonb\s*\)\s+to\s+service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|all)[\s\S]{0,100}emusys_matriculas_estado_atual[\s\S]{0,80}to\s+(?:anon|authenticated)/i,
  );
});

test('upsert atualiza colunas explicitamente e nao inventa status ativo', { skip: !migrationExists }, () => {
  assert.match(sql, /on\s+conflict\s*\(\s*unidade_id\s*,\s*emusys_matricula_id\s*\)\s+do\s+update\s+set/i);
  assert.doesNotMatch(sql, /excluded\.\*/i);
  assert.doesNotMatch(sql, /coalesce\s*\([^)]*status_emusys[^)]*,\s*'ativa'/i);
  assert.match(sql, /jsonb_array_elements\s*\(\s*p_linhas\s*\)/i);
});
