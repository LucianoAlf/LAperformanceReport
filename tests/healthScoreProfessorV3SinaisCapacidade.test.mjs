import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const baseMigrationPath =
  'supabase/migrations/20260802191000_health_score_v3_sinais_capacidade.sql';
const migrationPath =
  'supabase/migrations/20260803013000_relatorio_coordenacao_amostra_capacidade_honesta.sql';

function source() {
  assert.equal(existsSync(baseMigrationPath), true, `${baseMigrationPath} deve existir`);
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return `${readFileSync(baseMigrationPath, 'utf8')}\n${readFileSync(migrationPath, 'utf8')}`
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('capacidade estimada fica separada da concentracao fisica comprovada', () => {
  const sql = source();

  assert.match(sql, /capacidade_fisica_excedida/i);
  assert.match(sql, /capacidade_estimada_excedida/i);
  assert.match(sql, /'concentracao_operacional'\s*,\s*'alto'/i);
  assert.match(sql, /'capacidade_estimada_conferir'\s*,\s*'medio'/i);
  assert.match(sql, /'estimada_segmento'/i);
});

test('diagnostico usa a turma e a sala reais sem alterar score', () => {
  const sql = source();

  assert.match(sql, /get_health_score_professor_v3_capacidade_diagnostico/i);
  assert.match(sql, /public\.turmas_explicitas/i);
  assert.match(sql, /public\.salas/i);
  assert.match(sql, /sala_id/i);
  assert.match(sql, /capacidade_excedida/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /set\s+score\s*=/i);
});

test('mapa de sinais cruza carteira percentis e evidencia pedagogica', () => {
  const sql = source();

  assert.match(sql, /get_health_score_professor_v3_sinais/i);
  assert.match(sql, /percentile_cont\s*\(0\.5\)/i);
  assert.match(sql, /percentile_cont\s*\(0\.75\)/i);
  for (const signal of [
    'possivel_sobrecarga',
    'expansao_sustentavel',
    'oportunidade_distribuicao',
    'concentracao_operacional',
    'capacidade_estimada_conferir',
    'maturacao',
  ]) {
    assert.match(sql, new RegExp(signal, 'i'));
  }
  assert.match(sql, /evidencias\s+jsonb/i);
  assert.match(
    sql,
    /not\s+b\.retencao_saudavel\s+or\s+not\s+b\.presenca_saudavel\s+or\s+b\.capacidade_fisica_excedida/i,
  );
});

test('RPCs diagnosticas preservam autorizacao e isolamento', () => {
  const sql = source();

  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(sql, /fn_health_score_professor_v3_ator_leitura/i);
  assert.doesNotMatch(sql, /fn_health_score_professor_v3_ator_gerenciador/i);
  assert.match(sql, /revoke\s+all[\s\S]*from\s+public\s*,\s*anon/i);
  assert.match(sql, /grant\s+execute[\s\S]*to\s+authenticated\s*,\s*service_role/i);
});
