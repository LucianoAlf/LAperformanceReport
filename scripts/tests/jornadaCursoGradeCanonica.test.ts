import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath =
  'supabase/migrations/20260721150000_jornada_curso_grade_canonica.sql';

test('protege a jornada contra curso obsoleto do endpoint de matriculas', () => {
  assert.equal(existsSync(migrationPath), true, 'migration canonica deve existir');

  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /emusys_disciplina_id_origem/i);
  assert.match(migration, /curso_nome_emusys_origem/i);
  assert.match(migration, /curso_resolucao_fonte/i);
  assert.match(migration, /fn_resolver_jornada_curso_grade_atual_v1/i);
  assert.match(migration, /matricula_disciplina_id\s*=\s*p_matricula_disciplina_id/i);
  assert.match(migration, /data_aula\s+between\s+current_date\s*-\s*14\s+and\s+current_date\s*\+\s*60/i);
  assert.match(migration, /not\s+coalesce\(a\.cancelada,\s*false\)/i);
  assert.match(migration, /count\(\*\)\s+filter\s*\(\s*where\s+not\s+coalesce\(a\.reagendada,\s*false\)\s*\)\s*>=\s*2/i);
  assert.match(migration, /curso_emusys_depara/i);
  assert.match(migration, /emusys_disciplinas_catalogo/i);
  assert.match(migration, /payload_snapshot\s*->\s*'disciplina'/i);
  assert.match(migration, /before\s+insert\s+or\s+update/i);
  assert.match(migration, /trg_resolver_jornada_curso_grade_atual_v1/i);
  assert.match(migration, /backfill_jornada_curso_grade_atual_v1/i);
  assert.match(migration, /fonte_ultima_atualizacao\s*=\s*'backfill:grade_recorrente_v1'/i);
  assert.match(migration, /revoke\s+all[\s\S]*from\s+public,\s*anon,\s*authenticated/i);
  assert.doesNotMatch(migration, /update\s+public\.professor_unidade_curso_modalidade/i);
});
