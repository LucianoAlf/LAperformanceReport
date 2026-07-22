import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260722131713_health_score_v3_diagnosticos_estado_base.sql';

test('diagnosticos aceitam todos os estados sem base emitidos pelo motor segmentado', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);

  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /drop\s+constraint\s+if\s+exists\s+health_score_professor_v3_snapshot_metrica_di_estado_base_check/i,
  );
  assert.match(sql, /estado_base\s+in\s*\([\s\S]*?'segmentacao_incompleta'/i);
  assert.match(sql, /estado_base\s+in\s*\([\s\S]*?'regra_ausente'/i);
  assert.match(sql, /estado_base\s+in\s*\([\s\S]*?'sem_base_sem_turmas'/i);
  assert.match(sql, /estado_base\s+in\s*\([\s\S]*?'sem_base_zero_carteira'/i);
  assert.match(sql, /estado_base\s+in\s*\([\s\S]*?'divergencia_nao_ofertada'/i);
  assert.match(sql, /estado_base\s+in\s*\([\s\S]*?'projeto_sem_segmento_pontuavel'/i);
  assert.match(sql, /validate\s+constraint\s+health_score_professor_v3_snapshot_metrica_di_estado_base_check/i);
  assert.doesNotMatch(sql, /materializar_health_score_professor_v3_periodo\s*\(/i);
  assert.doesNotMatch(sql, /fechar_health_score_professor_v3_ciclo\s*\(/i);
});
