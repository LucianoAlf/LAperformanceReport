import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  getHealthScoreV3QueryCompetence,
} from '../src/lib/healthScoreProfessorV3Periodos.ts';

const migrationPath =
  'supabase/migrations/20260909051920_professores_ciclo_vivo_paridade_mensal.sql';
const performanceMigrationPath =
  'supabase/migrations/20260909052519_professores_ciclo_vivo_performance_paridade.sql';
const tabPath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';

test('ciclo corrente avanca a competencia consultada sem sair do ciclo selecionado', () => {
  assert.equal(
    getHealthScoreV3QueryCompetence(2026, 9, 'ciclo', new Date('2026-09-09T12:00:00-03:00')),
    '2026-09',
  );
  assert.equal(
    getHealthScoreV3QueryCompetence(2026, 9, 'ciclo', new Date('2026-10-15T12:00:00-03:00')),
    '2026-10',
  );
  assert.equal(
    getHealthScoreV3QueryCompetence(2026, 9, 'ciclo', new Date('2026-11-30T12:00:00-03:00')),
    '2026-11',
  );
});

test('periodos mensais e ciclos historicos preservam a competencia selecionada', () => {
  assert.equal(
    getHealthScoreV3QueryCompetence(2026, 9, 'mensal', new Date('2026-10-15T12:00:00-03:00')),
    '2026-09',
  );
  assert.equal(
    getHealthScoreV3QueryCompetence(2026, 6, 'ciclo', new Date('2026-09-09T12:00:00-03:00')),
    '2026-06',
  );
});

test('primeiro mes do ciclo usa exatamente a projecao mensal e meses seguintes acumulam', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de paridade do ciclo deve existir');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /fn_health_score_professor_v3_competencia_ciclo_vivo/i);
  assert.match(sql, /get_hs_prof_v3_projecao_viva_before_ciclo_parity_20260909/i);
  assert.match(
    sql,
    /v_competencia_efetiva\s*=\s*v_periodo_inicio[\s\S]*before_ciclo_parity_20260909\([\s\S]*'mensal'/i,
  );
  assert.match(
    sql,
    /before_ciclo_parity_20260909\([\s\S]*p_competencia[\s\S]*p_unidade_id[\s\S]*'ciclo'/i,
  );
  assert.match(sql, /v_ano_fonte/i);
  assert.match(sql, /v_mes_fonte/i);
  assert.match(sql, /montar_rel_coord_conteudo_before_ciclo_vivo_20260909/i);
  assert.match(
    sql,
    /montar_rel_coord_conteudo_before_ciclo_vivo_20260909\([\s\S]*v_ano_fonte[\s\S]*v_mes_fonte/i,
  );
  assert.match(sql, /\{periodo,ano\}[\s\S]*to_jsonb\(p_ano\)/i);
  assert.match(sql, /\{periodo,mes\}[\s\S]*to_jsonb\(p_mes\)/i);
});

test('pagina consulta a competencia efetiva do ciclo vivo', () => {
  const source = fs.readFileSync(tabPath, 'utf8');

  assert.match(source, /getHealthScoreV3QueryCompetence/);
  assert.match(source, /competenciaConsultaV3/);
  assert.match(
    source,
    /useHealthScoreProfessorV3Performance\([\s\S]*competencia:\s*competenciaConsultaV3/i,
  );
});

test('materializador consome a mesma performance mensal no primeiro mes do ciclo', () => {
  assert.equal(
    fs.existsSync(performanceMigrationPath),
    true,
    'migration da fronteira de performance deve existir',
  );
  const sql = fs.readFileSync(performanceMigrationPath, 'utf8');

  assert.match(sql, /get_hs_prof_v3_performance_before_ciclo_parity_20260909/i);
  assert.match(
    sql,
    /v_competencia_efetiva\s*=\s*v_periodo_inicio[\s\S]*before_ciclo_parity_20260909\([\s\S]*'mensal'/i,
  );
  assert.match(
    sql,
    /before_ciclo_parity_20260909\([\s\S]*v_competencia_efetiva[\s\S]*p_unidade_id[\s\S]*'ciclo'/i,
  );
  assert.match(sql, /grant execute[\s\S]*to authenticated, service_role/i);
});
