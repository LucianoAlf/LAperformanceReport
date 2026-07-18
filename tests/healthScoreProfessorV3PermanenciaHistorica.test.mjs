import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260717190000_health_score_v3_permanencia_historica.sql';
const partialValueGuardMigrationPath =
  'supabase/migrations/20260717210000_health_score_v3_permanencia_bloqueio_valor_parcial.sql';
const incompleteHistoryConfigMigrationPath =
  'supabase/migrations/20260717213000_health_score_v3_permanencia_config_historico_incompleto.sql';
const conditionalDiagnosticMigrationPath =
  'supabase/migrations/20260717230000_health_score_v3_permanencia_aviso_condicional.sql';

test('permanencia V3 usa historico acumulado e bloqueia fonte incompleta', () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /create or replace function public\.get_professor_permanencia_v3_sombra/i);
  assert.match(sql, /fim_competencia_exclusivo/i);
  assert.match(sql, /data_fim[\s\S]*<\s*p\.fim_competencia_exclusivo/i);
  assert.match(sql, /bool_or\s*\(\s*pe\.inicio_incompleto\s*\)/i);
  assert.match(sql, /historico_incompleto/i);
  assert.match(sql, /historico_acumulado_ate_competencia/i);
  assert.match(sql, /health-score-professor-v3-permanencia-2/i);
  assert.doesNotMatch(sql, /date_trunc\s*\(\s*'quarter'/i);
  assert.doesNotMatch(sql, /between\s+p\.inicio_trimestre\s+and\s+p\.fim_trimestre/i);
});

test('permanencia V3 nao publica valor bruto quando o historico esta incompleto', () => {
  assert.equal(
    existsSync(partialValueGuardMigrationPath),
    true,
    `${partialValueGuardMigrationPath} deve existir`,
  );
  const sql = readFileSync(partialValueGuardMigrationPath, 'utf8');

  assert.match(
    sql,
    /case\s+when\s+coalesce\s*\(\s*c\.historico_incompleto\s*,\s*false\s*\)\s+then\s+null[\s\S]*as\s+valor_bruto/i,
  );
  assert.match(sql, /media_parcial_diagnostica/i);
  assert.match(sql, /publicavel[\s\S]*historico_incompleto/i);
});

test('configuracao V3 explicita que permanencia esta bloqueada por historico incompleto', () => {
  assert.equal(
    existsSync(incompleteHistoryConfigMigrationPath),
    true,
    `${incompleteHistoryConfigMigrationPath} deve existir`,
  );
  const sql = readFileSync(incompleteHistoryConfigMigrationPath, 'utf8');

  assert.match(sql, /'\{meta_status\}'[\s\S]*bloqueada_historico_incompleto/i);
  assert.match(sql, /origem nao cobre o inicio integral/i);
  assert.match(sql, /where\s+metrica\s*=\s*'permanencia'/i);
  assert.match(sql, /and\s+meta\s+is\s+null/i);
});

test('permanencia V3 exibe aviso de parcialidade somente quando ainda ha bloqueio', () => {
  assert.equal(
    existsSync(conditionalDiagnosticMigrationPath),
    true,
    `${conditionalDiagnosticMigrationPath} deve existir`,
  );
  const sql = readFileSync(conditionalDiagnosticMigrationPath, 'utf8');

  assert.match(sql, /'aviso_diagnostico'\s*,\s*case/i);
  assert.match(sql, /historico_incompleto[\s\S]*valor parcial nao pode ser exibido como KPI oficial/i);
  assert.match(sql, /elegiveis_nao_publicaveis[\s\S]*valor parcial nao pode ser exibido como KPI oficial/i);
  assert.match(sql, /else\s+null\s+end/i);
  assert.doesNotMatch(
    sql,
    /'aviso_diagnostico'\s*,\s*'valor parcial nao pode ser exibido como KPI oficial'/i,
  );
});
