import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260728123000_health_score_v3_carteira_disponibilidade_append_only.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('reparo cria revisao encadeada e nao atualiza metricas existentes', () => {
  const sql = migration();

  assert.match(
    sql,
    /insert\s+into\s+public\.health_score_professor_v3_snapshots[\s\S]*snapshot_anterior_id[\s\S]*v_snapshot_base\.id/i,
  );
  assert.match(
    sql,
    /insert\s+into\s+public\.health_score_professor_v3_snapshot_metricas/i,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.health_score_professor_v3_snapshot_metricas/i,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.health_score_professor_v3_snapshot_metrica_segmentos/i,
  );
});

test('reparo preserva filhos auditaveis e marca diagnostico nao pontuavel', () => {
  const sql = migration();

  assert.match(
    sql,
    /insert\s+into\s+public\.health_score_professor_v3_snapshot_metrica_segmentos/i,
  );
  assert.match(
    sql,
    /insert\s+into\s+public\.health_score_professor_v3_snapshot_metrica_diagnosticos/i,
  );
  assert.match(sql, /diagnostico_nao_pontuavel/i);
  assert.match(sql, /snapshots_base_intermediarios/i);
});

test('reparo continua privado e nao altera consumidores', () => {
  const sql = migration();

  assert.match(sql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+view/i);
  assert.doesNotMatch(sql, /get_health_score_professor_v3_consumidor/i);
});
