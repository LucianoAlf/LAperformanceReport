import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maskSqlStringLiterals,
  readSqlContract,
} from './helpers/sqlContractHelpers.mjs';

const migration = readSqlContract(
  import.meta.url,
  'supabase/migrations/20260801103000_relatorio_admin_mensal_rico_canonico.sql',
);

test('leitura mensal administrativa compoe somente snapshots fechados referenciados', () => {
  assert.equal(
    migration.exists,
    true,
    'migration de leitura rica ainda nao existe',
  );

  const sql = maskSqlStringLiterals(migration.executable);
  assert.match(sql, /get_relatorio_admin_mensal_rico_v1/i);
  assert.match(migration.source, /fontes[\s\S]*alunos_admin[\s\S]*snapshot_id/i);
  assert.match(migration.source, /fontes[\s\S]*relatorio_gerencial[\s\S]*snapshot_id/i);
  assert.match(migration.source, /status\s*=\s*'fechado'/i);
  assert.match(migration.source, /hash_jsonb_canonico/i);
  assert.match(migration.source, /pode_gerar_relatorio_admin_v1/i);
  assert.doesNotMatch(
    sql,
    /\b(insert\s+into|update|delete\s+from)\s+public\.fechamento_mensal_snapshots/i,
  );
});

test('payload rico normaliza financeiro retencao metas e trancamentos do periodo', () => {
  assert.match(migration.source, /indicadores_financeiros/i);
  assert.match(migration.source, /indicadores_retencao/i);
  assert.match(migration.source, /metas_fideliza/i);
  assert.match(migration.source, /trancamentos_periodo/i);
  assert.match(migration.source, /movimentacoes_admin/i);
  assert.match(migration.source, /audit_log/i);
  assert.match(migration.source, /capturado_em/i);
  assert.match(migration.source, /TRANCAMENTOS_MENSAL_DIVERGENTE/i);
  assert.match(migration.source, /inadimplentes[\s\S]*alunos_pagantes/i);
  assert.match(migration.source, /evasoes_base_alunos[\s\S]*nao_renovacoes/i);
  assert.match(migration.source, /faturamento_previsto/i);
  assert.match(migration.source, /ltv_medio/i);
  assert.match(migration.source, /mrr_perdido/i);
});

test('reconstrucao historica usa corte e auditoria e futuras capturas persistem o campo', () => {
  assert.match(migration.source, /m\.created_at\s*<=\s*v_mensal\.capturado_em/i);
  assert.match(migration.source, /a\.created_at\s*>\s*v_mensal\.capturado_em/i);
  assert.match(migration.source, /dados_antigos/i);
  assert.match(migration.source, /dados_novos/i);
  assert.match(migration.source, /'INSERT'\s*,\s*'UPDATE'\s*,\s*'DELETE'/i);
  assert.match(
    migration.source,
    /montar_relatorio_admin_mensal_payload_v1[\s\S]*resumo[\s\S]*trancamentos_periodo/i,
  );
});

test('ACL da leitura rica permanece escopada ao administrativo', () => {
  const sql = maskSqlStringLiterals(migration.executable);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.get_relatorio_admin_mensal_rico_v1[\s\S]*from\s+public\s*,\s*anon/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_relatorio_admin_mensal_rico_v1[\s\S]*to\s+authenticated\s*,\s*service_role/i,
  );
});
