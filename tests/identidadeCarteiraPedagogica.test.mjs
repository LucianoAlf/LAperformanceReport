import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260715130000_identidade_carteira_pedagogica_sombra.sql';
const ajusteOrfaosPath = 'supabase/migrations/20260715131500_carteira_sombra_resolver_identidade_local.sql';
const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('identidade canonica e escopada por unidade e ID Emusys', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(migration, /partition\s+by\s+a\.unidade_id[\s\S]*pessoa_chave/i);
  assert.match(migration, /emusys_student_id[\s\S]*identidade_fonte/i);
  assert.match(migration, /identidade_confianca/i);
  assert.match(migration, /'baixa'/i);
});

test('carteira sombra conta pessoa sem depender de presenca', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /vw_professor_carteira_pessoa_canonica_sombra/i);
  assert.match(migration, /status_matricula\s*=\s*'ativa'/i);
  assert.match(migration, /professores_unidades/i);
  assert.match(migration, /group\s+by[\s\S]*pessoa_chave/i);
  assert.doesNotMatch(migration, /aluno_presenca|vw_jornada_aluno_com_presenca/i);
});

test('read models sombra sao security invoker e restritos ao service role', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /security_invoker\s*=\s*true/gi);
  assert.match(migration, /revoke\s+all[\s\S]*vw_aluno_identidade_unidade_canonica[\s\S]*public[\s\S]*anon[\s\S]*authenticated/i);
  assert.match(migration, /grant\s+select[\s\S]*vw_professor_carteira_pessoa_canonica_sombra[\s\S]*service_role/i);
});

test('jornada sem ID externo herda a identidade Emusys da linha local', () => {
  const migration = readOptional(ajusteOrfaosPath);

  assert.match(migration, /left\s+join\s+public\.alunos\s+a\s+on\s+a\.id\s*=\s*j\.aluno_id/i);
  assert.match(migration, /coalesce\s*\(\s*j\.emusys_aluno_id[\s\S]*a\.emusys_student_id/i);
  assert.match(migration, /pessoa_chave/i);
  assert.doesNotMatch(migration, /aluno_presenca/i);
});
