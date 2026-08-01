import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maskSqlStringLiterals,
  readSqlContract,
} from './helpers/sqlContractHelpers.mjs';

const migration = readSqlContract(
  import.meta.url,
  'supabase/migrations/20260801115829_relatorios_mensais_fechamento_canonico.sql',
);

test('migration governa snapshots mensais e fechamento imutavel', () => {
  assert.equal(
    migration.exists,
    true,
    'migration de relatorios mensais ainda nao existe',
  );

  const sql = maskSqlStringLiterals(migration.executable);
  assert.match(migration.source, /relatorio_admin_mensal/i);
  assert.match(migration.source, /relatorio_comercial_mensal/i);
  assert.match(sql, /trg_fechamento_mensal_snapshot_imutavel/i);
  assert.match(migration.source, /SNAPSHOT_MENSAL_IMUTAVEL/i);
  assert.match(sql, /capturar_relatorios_mensais_canonicos_v1/i);
  assert.match(sql, /get_relatorio_mensal_canonico_v1/i);
  assert.match(sql, /fechar_competencia_mensal_canonica_v1/i);
  assert.doesNotMatch(
    sql,
    /on\s+conflict[\s\S]*do\s+update[\s\S]*payload\s*=/i,
  );
});

test('ACL separa captura, fechamento e leitura escopada', () => {
  const sql = maskSqlStringLiterals(migration.executable);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.capturar_relatorios_mensais_canonicos_v1[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.capturar_relatorios_mensais_canonicos_v1[\s\S]*to\s+service_role/i,
  );
  assert.match(
    migration.source,
    /get_relatorio_mensal_canonico_v1[\s\S]*pode_gerar_relatorio_(admin|comercial)_v1/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_relatorio_mensal_canonico_v1[\s\S]*to\s+authenticated\s*,\s*service_role/i,
  );
});

test('payload administrativo preserva multicurso e detalha a politica de trancamento', () => {
  assert.match(migration.source, /montar_relatorio_admin_mensal_payload_v1[\s\S]*matriculas_trancadas/i);
  assert.match(migration.source, /montar_relatorio_admin_mensal_payload_v1[\s\S]*get_trancamentos_admin_operacionais_v1/i);
  assert.match(migration.source, /trancamentos_detalhados/i);
  assert.match(migration.source, /faixa_politica/i);
  assert.match(migration.source, /alunos_com_exatamente_3_cursos/i);
});

test('payload comercial fecha contagens, valores e os dois tickets medios', () => {
  assert.match(migration.source, /SNAPSHOT_COMERCIAL_DIVERGENTE:[^\n]*matriculas/i);
  assert.match(migration.source, /total_passaportes/i);
  assert.match(migration.source, /total_parcelas/i);
  assert.match(migration.source, /ticket_medio_passaporte/i);
  assert.match(migration.source, /ticket_medio_parcela/i);
  assert.doesNotMatch(migration.source, /taxa_exp_mat[^\n]*BLOQUEADA/i);
});
