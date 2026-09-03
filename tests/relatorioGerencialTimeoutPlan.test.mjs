import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260903270000_relatorio_gerencial_timeout_plan_custom.sql',
);

test('hotfix preserva o KPI e impede ranking mensal ao vivo no relatório fechado', () => {
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    'migration do timeout do relatório gerencial ainda não existe',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /alter\s+function\s+public\.get_kpis_professor_periodo_canonico\s*\(\s*integer\s*,\s*integer\s*,\s*uuid\s*,\s*date\s*,\s*date\s*\)\s*set\s+plan_cache_mode\s*=\s*'force_custom_plan'/iu,
  );
  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.get_relatorio_gerencial_canonico_comparativos_base_v1/iu,
  );
  assert.match(sql, /ranking_mensal_sem_snapshot_fechado/iu);
  for (const chave of ['retencao', 'matriculadores', 'presenca', 'media_turma']) {
    assert.match(sql, new RegExp(`'${chave}'`, 'iu'));
  }

  const corpoComparativos = sql.match(
    /create\s+or\s+replace\s+function\s+public\.get_relatorio_gerencial_canonico_comparativos_base_v1[\s\S]*?\$function\$/iu,
  )?.[0] ?? '';
  assert.doesNotMatch(
    corpoComparativos,
    /get_relatorio_gerencial_ranking_mensal_v1/iu,
    'o documento fechado nao pode recalcular ranking mensal ao vivo',
  );
  assert.doesNotMatch(sql, /statement_timeout/iu);
  assert.doesNotMatch(
    sql,
    /\b(?:insert\s+into|update|delete\s+from|truncate)\b/iu,
  );
});
