import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const verificationPath = 'scripts/verify-health-score-v3-segmentos.sql';
const reportPath =
  'docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-seguranca.md';
const canonicalTotalMigrationPath =
  'supabase/migrations/20260719206000_health_score_v3_segmentos_preservar_total_canonico.sql';

test('Gate 11 registra auditoria reproduzivel de seguranca e desempenho', () => {
  assert.equal(existsSync(verificationPath), true);
  assert.equal(existsSync(reportPath), true);

  const sql = readFileSync(verificationPath, 'utf8');
  const report = readFileSync(reportPath, 'utf8');

  assert.match(sql, /information_schema\.role_table_grants/i);
  assert.match(sql, /has_function_privilege/i);
  assert.match(sql, /proconfig/i);
  assert.match(sql, /professores\.editar/i);
  assert.match(sql, /begin;[\s\S]*rollback;/i);
  assert.match(sql, /config_meta_segmentada_imutavel/i);
  assert.match(sql, /snapshot_segmento_imutavel/i);
  assert.match(sql, /explain\s*\(\s*analyze\s*,\s*buffers/i);
  assert.match(sql, /get_health_score_professor_v3_metricas_segmentadas_agregadas_v1/i);
  assert.match(sql, /simular_health_score_professor_v3_config/i);

  assert.match(report, /anon[^\n]*(?:sem acesso|zero privilegio)/i);
  assert.match(report, /authenticated[^\n]*(?:sem dml|zero dml)/i);
  assert.match(report, /imutabilidade[^\n]*(?:aprovada|preservada)/i);
  assert.match(report, /search_path[^\n]*(?:fixo|public, pg_temp)/i);
  assert.match(report, /service_role/i);
  assert.match(report, /nao ativad[ao]/i);
});

test('camada corretiva mantem RPCs internas privadas e search_path fixo', () => {
  const sql = readFileSync(canonicalTotalMigrationPath, 'utf8');

  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/gi);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/gi);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/gi);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to\s+(?:public|anon)\b/i);
});
