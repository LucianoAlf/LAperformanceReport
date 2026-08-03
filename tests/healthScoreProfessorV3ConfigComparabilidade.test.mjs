import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260803215000_health_score_v3_config_comparabilidade.sql';
const performanceMigrationPath =
  'supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql';
const libPath = 'src/lib/healthScoreProfessorV3.ts';
const hookPath = 'src/hooks/useHealthScoreProfessorV3Config.ts';
const componentPath = 'src/components/App/Professores/HealthScoreV3Config.tsx';

const read = (path) => fs.readFileSync(path, 'utf8');

test('criterios de comparabilidade ficam versionados na configuracao', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de configuracao ainda nao existe');
  const sql = read(migrationPath);

  assert.match(sql, /add column if not exists pilares_minimos integer/i);
  assert.match(sql, /pilares_minimos\s+between\s+1\s+and\s+5/i);
  assert.match(sql, /'pilares_minimos'\s*,\s*c\.pilares_minimos/i);
  assert.match(sql, /'cobertura_minima'\s*,\s*c\.cobertura_minima/i);
  assert.match(sql, /'exige_pilar_fidelizacao'\s*,\s*c\.exige_pilar_fidelizacao/i);
  assert.match(sql, /fn_health_score_professor_v3_config_fingerprint/i);
});

test('criacao e salvamento clonam criterios sem editar regra ativa', () => {
  const sql = read(migrationPath);

  assert.match(sql, /criar_health_score_professor_v3_config_rascunho_v2/i);
  assert.match(sql, /criar_health_score_professor_v3_config_revisao_ciclo_aberto_v2/i);
  assert.match(sql, /salvar_health_score_professor_v3_config_rascunho_v2/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /status\s*<>\s*'rascunho'/i);
  assert.match(sql, /set[\s\S]*pilares_minimos\s*=\s*p_pilares_minimos/i);
  assert.doesNotMatch(
    sql,
    /update\s+public\.health_score_professor_v3_config_versoes[\s\S]{0,350}status\s*=\s*'ativa'/i,
  );
});

test('motor usa o corte de pilares da versao e nao um literal escondido', () => {
  const sql = read(performanceMigrationPath);
  const configSql = read(migrationPath);

  assert.match(
    sql,
    /avaliar_health_score_professor_v3_comparabilidade\([\s\S]{0,500}c\.pilares_minimos/i,
  );
  assert.match(configSql, /p_pilares_minimos/i);
  assert.match(configSql, /p_pilares_validos\s*<\s*coalesce\(p_pilares_minimos,\s*3\)/i);
});

test('frontend nomeia os tres criterios sem chama-los de nota de corte', () => {
  const lib = read(libPath);
  const hook = read(hookPath);
  const component = read(componentPath);

  assert.match(lib, /pilaresMinimos:\s*number/i);
  assert.match(lib, /pilares_minimos/i);
  assert.match(hook, /salvar_health_score_professor_v3_config_rascunho_v2/i);
  assert.match(hook, /p_pilares_minimos:\s*draft\.pilaresMinimos/i);
  assert.match(component, /Critérios para comparação/i);
  assert.match(component, /Cobertura mínima/i);
  assert.match(component, /Pilares mínimos/i);
  assert.match(component, /Retenção ou permanência obrigatória/i);
  assert.doesNotMatch(component, /Nota de corte:\s*60/i);
});
