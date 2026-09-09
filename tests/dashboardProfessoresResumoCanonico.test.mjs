import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20260909011724_dashboard_professores_resumo_canonico.sql',
);
const helperPath = path.join(root, 'src/lib/dashboardProfessoresResumoCanonico.ts');
const dashboardPath = path.join(root, 'src/components/App/Dashboard/DashboardPage.tsx');

const read = (file) => readFileSync(file, 'utf8');

test('resumo do Dashboard le somente os numeradores canonicos necessarios', () => {
  assert.equal(existsSync(migrationPath), true, 'migration do resumo leve do Dashboard ainda nao existe');
  const sql = read(migrationPath);
  const corpoExecutavel = sql.replace(/^--.*$/gm, '');

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.get_dashboard_professores_resumo_canonico_v1/i);
  assert.match(sql, /get_carteira_professor_periodo_canonica/i);
  assert.match(sql, /movimentacoes_admin/i);
  assert.match(sql, /is_movimentacao_admin_retencao_valida/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /auth\.role\(\)\s*=\s*'service_role'/i);
  assert.match(sql, /grant\s+execute[\s\S]*?to\s+authenticated\s*,\s*service_role/i);
  assert.doesNotMatch(corpoExecutavel, /get_kpis_professor_periodo_canonico_v[23]/i);
  assert.doesNotMatch(corpoExecutavel, /get_frequencia_professor/i);
  assert.doesNotMatch(corpoExecutavel, /get_experimentais_professor/i);
  assert.doesNotMatch(corpoExecutavel, /get_fator_demanda/i);
});

test('Dashboard usa o resumo leve sem misturar media de medias', () => {
  assert.equal(existsSync(helperPath), true, 'helper do resumo leve do Dashboard ainda nao existe');
  const helper = read(helperPath);
  const dashboard = read(dashboardPath);

  assert.match(helper, /get_dashboard_professores_resumo_canonico_v1/i);
  assert.match(helper, /alunos_via_turmas/i);
  assert.match(helper, /turmas_elegiveis_media/i);
  assert.match(dashboard, /buscarResumoDashboardProfessoresCanonico/i);
  assert.match(dashboard, /alunos_via_turmas\s*\/\s*resumoProfessores\.turmas_elegiveis_media/i);
  assert.doesNotMatch(dashboard, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(dashboard, /buscarKpisTurmasCanonicos/);
  assert.doesNotMatch(dashboard, /filtrarKpisPorVinculosAtivos/);
});
