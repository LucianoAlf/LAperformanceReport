import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260811032732_relatorio_gerencial_ranking_mensal_fechado.sql',
);
const conversionMigrationPath = path.join(
  root,
  'supabase/migrations/20260811034046_relatorio_gerencial_ranking_mensal_conversao_canonica.sql',
);
const universeMigrationPath = path.join(
  root,
  'supabase/migrations/20260811034320_relatorio_gerencial_ranking_mensal_universo_professores.sql',
);
const edgePath = path.join(root, 'supabase/functions/gemini-relatorio-gerencial/index.ts');

test('fechamento mensal publica rankings por metrica sem exigir snapshot de ciclo', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de ranking mensal ainda nao existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /get_health_score_professor_v3_performance/);
  assert.match(sql, /periodicidade\s*=\s*'mensal'/i);
  assert.match(sql, /periodo_fim\s*=\s*(?:v_fim|prm\.fim)/i);
  assert.match(sql, /metrica_publicavel\s*=\s*true/i);
  assert.match(sql, /jsonb_set[\s\S]*\{mensais\}/i);
  assert.match(sql, /status['"]?\s*,\s*['"]oficial/i);
  assert.doesNotMatch(sql, /mensais[\s\S]{0,900}estado_publicacao\s*=\s*'oficial'/i);
});

test('ranking mensal usa a fonte canonica mensal para matriculadores', () => {
  assert.equal(
    fs.existsSync(conversionMigrationPath),
    true,
    'migration da conversao mensal canonica ainda nao existe',
  );
  const sql = fs.readFileSync(conversionMigrationPath, 'utf8');

  assert.match(sql, /get_kpis_professor_periodo_canonico_v3\s*\(/i);
  assert.match(sql, /experimentais[\s\S]{0,80}>=\s*3/i);
  assert.match(sql, /matriculas_pos_exp/i);
  assert.match(sql, /metrica_publicavel/i);
});

test('matriculadores respeitam o mesmo universo de professores da unidade', () => {
  assert.equal(fs.existsSync(universeMigrationPath), true, 'migration do universo mensal ainda nao existe');
  const sql = fs.readFileSync(universeMigrationPath, 'utf8');
  assert.match(sql, /professores_base/i);
  assert.match(sql, /join\s+professores_base/i);
});

test('renderer usa ranking do fechamento mensal e nao o rotula como destaque parcial', () => {
  const edge = fs.readFileSync(edgePath, 'utf8');
  assert.match(edge, /rankings\.mensais/);
  assert.match(edge, /RANKINGS DO FECHAMENTO MENSAL/);
  assert.doesNotMatch(edge, /DESTAQUES MENSAIS PARCIAIS[\s\S]{0,240}rankings\.mensais/);
});
