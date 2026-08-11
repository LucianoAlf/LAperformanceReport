import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260811200702_relatorio_gerencial_rankings_todos_canonicos.sql',
);

test('ranking mensal usa produtores canonicos para todas as metricas', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de rankings canonicos ausente');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /get_health_score_professor_v3_permanencia_periodo_v2\s*\(/i,
    'permanencia deve vir do produtor canonico temporal',
  );
  assert.match(
    sql,
    /get_kpis_professor_periodo_canonico_v3\s*\(/i,
    'presenca, conversao e media_turma devem vir do KPI canonico por competencia',
  );

  for (const chave of ['retencao', 'matriculadores', 'presenca', 'media_turma']) {
    assert.match(
      sql,
      new RegExp(`jsonb_build_object\\([\\s\\S]*'${chave}'`, 'i'),
      `bloco ${chave} deve ser reconstruido pela cadeia canonica`,
    );
  }

  assert.doesNotMatch(
    sql,
    /get_relatorio_gerencial_ranking_mensal_v2\s*\(/i,
    'o ranking novo nao deve herdar blocos derivados de snapshot',
  );
});
