import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const producerMigrationPath = new URL(
  '../supabase/migrations/20260813270000_health_score_v3_papel_diagnostico_canonico.sql',
  import.meta.url,
);
const readerMigrationPath = new URL(
  '../supabase/migrations/20260813270100_health_score_v3_leitor_papel_canonico.sql',
  import.meta.url,
);

test('numero_alunos permanece diagnostico no produtor e no leitor, sem entrar na cobertura', async () => {
  const producerSql = await readFile(producerMigrationPath, 'utf8');
  const readerSql = await readFile(readerMigrationPath, 'utf8');
  const sql = `${producerSql}\n${readerSql}`;

  assert.match(
    sql,
    /case\s+when\s+cm\.metrica\s*=\s*'numero_alunos'\s+then\s*'diagnostico'/i,
  );
  assert.match(
    sql,
    /case\s+when\s+m\.metrica\s*=\s*'numero_alunos'\s+then\s*'diagnostico'/i,
  );
  assert.match(producerSql, /count\(\*\)\s+filter\s*\(where\s+papel\s*=\s*'nota'\)/i);
  assert.match(readerSql, /a\.cobertura_pilares/);
  assert.doesNotMatch(readerSql, /m\.score,[\s\S]{0,80}m\.cobertura,/i);
  assert.match(readerSql, /s\.estado\s+in\s*\(\s*'fechado',\s*'provisorio',\s*'em_maturacao'\s*\)/i);
  assert.match(readerSql, /s\.estado_publicacao\s+in\s*\(\s*'oficial',\s*'parcial',\s*'sem_base'\s*\)/i);
  assert.doesNotMatch(readerSql, /from\s+public\.get_health_score_professor_v3_performance\s*\(/i);
  assert.doesNotMatch(
    producerSql,
    /coalesce\(nullif\(cm\.parametros\s*->>\s*'papel',\s*''\),\s*'nota'\)\s*::text\s+as\s+papel/i,
  );
});
