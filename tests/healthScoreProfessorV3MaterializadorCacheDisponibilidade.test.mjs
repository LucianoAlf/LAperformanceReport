import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260728224000_health_score_v3_cache_disponibilidade_materializacao.sql',
);

test('materializacao reutiliza a carteira por disponibilidade dentro da transacao', () => {
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /rename\s+to\s+get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728/i,
  );
  assert.match(
    sql,
    /create\s+temporary\s+table\s+pg_temp\.health_score_v3_numero_alunos_cache[\s\S]*on\s+commit\s+drop/i,
  );
  assert.match(
    sql,
    /get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728\s*\(/i,
  );
  assert.match(
    sql,
    /v_competencia\s+date\s*:=\s*date_trunc\('month',\s*p_competencia\)::date[\s\S]*where\s+c\.cache_competencia\s*=\s*v_competencia[\s\S]*c\.cache_unidade_id\s+is\s+not\s+distinct\s+from\s+p_unidade_id/i,
  );
});

test('funcoes de cache permanecem internas e registram a verificacao de dependencias', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /pg_constraint[\s\S]*pg_trigger[\s\S]*pg_attrdef/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.get_health_score_professor_v3_numero_alunos_disponibilidade_raw_20260728[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.get_health_score_professor_v3_numero_alunos_disponibilidade[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_health_score_professor_v3_numero_alunos_disponibilidade[\s\S]*to\s+service_role/i,
  );
});
