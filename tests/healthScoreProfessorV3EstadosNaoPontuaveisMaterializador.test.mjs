import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727127000_health_score_v3_estados_nao_pontuaveis.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('materializador rejeita estados nao pontuaveis antes de calcular a nota', () => {
  const sql = migration();

  assert.match(
    sql,
    /r\.publicavel\s+is\s+not\s+true[\s\S]*r\.estado_base\s+in\s*\([\s\S]*'em_maturacao'[\s\S]*'revisar'[\s\S]*'sem_base_amostra'[\s\S]*'sem_base_cobertura'[\s\S]*'regra_ausente'[\s\S]*'segmentacao_incompleta'[\s\S]*\)[\s\S]*then\s+null::numeric/i,
  );
  assert.match(
    sql,
    /when\s+cm\.metrica\s+in\s*\(\s*'retencao'\s*,\s*'conversao'\s*,\s*'presenca'\s*\)[\s\S]*then\s+greatest/i,
  );
});

test('correcao preserva revisoes append-only e o isolamento do materializador', () => {
  const sql = migration();

  assert.match(sql, /\bv_snapshot_anterior_id\s+uuid\b/i);
  assert.match(
    sql,
    /insert\s+into\s+public\.health_score_professor_v3_snapshots\s*\([\s\S]*snapshot_anterior_id[\s\S]*\)\s*values\s*\([\s\S]*v_snapshot_anterior_id/i,
  );
  assert.doesNotMatch(
    sql,
    /delete\s+from\s+(?:public\.)?health_score_professor_v3_snapshots/i,
  );
  assert.match(sql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.materializar_health_score_professor_v3_periodo_impl\s*\(\s*date\s*,\s*text\s*,\s*uuid\s*,\s*integer\s*\)\s+from\s+public,\s*anon,\s*authenticated/i,
  );
});
