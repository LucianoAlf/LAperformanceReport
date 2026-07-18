import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260717200000_health_score_v3_retencao_transicao.sql';

function readMigration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

test('retencao V3 usa regra historica geral ate 02/08 e motivo confirmado depois', () => {
  const sql = readMigration();

  assert.match(sql, /create or replace function public\.get_professor_retencao_v3_sombra/i);
  assert.match(sql, /date\s+'2026-08-03'/i);
  assert.match(sql, /encerramentos_pre_corte/i);
  assert.match(sql, /encerramentos_pos_corte_atribuiveis/i);
  assert.match(
    sql,
    /data_fim[\s\S]*<\s*date\s+'2026-08-03'[\s\S]*status_periodo\s*=\s*'encerrado'/i,
  );
  assert.match(
    sql,
    /data_fim[\s\S]*>=\s*date\s+'2026-08-03'[\s\S]*atribuicao_confirmada\s+is\s+true[\s\S]*conta_retencao_professor\s+is\s+true/i,
  );
  assert.match(sql, /ms\.conta_score_professor\s+is\s+true/i);
});

test('motivo ausente so bloqueia publicacao apos o corte', () => {
  const sql = readMigration();

  assert.match(sql, /encerramentos_pos_corte_pendentes/i);
  assert.doesNotMatch(sql, /encerramentos_pre_corte_pendentes/i);
  assert.match(
    sql,
    /atribuicao_confirmada\s+is\s+not\s+true[\s\S]*encerramentos_pos_corte_pendentes/i,
  );
  assert.match(sql, /'modo_pre_corte',\s*'todos_encerramentos'/i);
  assert.match(sql, /'modo_pos_corte',\s*'somente_motivo_atribuivel_confirmado'/i);
});

test('nova regra e auditavel, versionada e nao abre acesso anonimo', () => {
  const sql = readMigration();

  assert.match(sql, /health-score-professor-v3-retencao-2/i);
  assert.match(sql, /'data_corte',\s*date\s+'2026-08-03'/i);
  assert.match(
    sql,
    /revoke all on function public\.get_professor_retencao_v3_sombra\(date, uuid\)[\s\S]*from public, anon/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_professor_retencao_v3_sombra\(date, uuid\)[\s\S]*to authenticated, service_role/i,
  );
});
