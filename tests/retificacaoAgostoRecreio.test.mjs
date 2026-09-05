import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260905180835_retificacao_agosto_2026_recreio.sql', import.meta.url),
  'utf8',
);

test('retificacao e versionada, auditada e falha fechada sobre as fontes medidas', () => {
  assert.match(migration, /c1bf3681cdcdf6c81366875d2fcdb6efe0998b18ec1b5ddc07f103146a6d30b6/i);
  assert.match(migration, /2a4cc45323c26fe4ce3a15eb63190b48aa2b0cf5ab0afa7c052949b1dcf0a95c/i);
  assert.match(migration, /7e2e5ce45f923dea30dcc16d24434f0a245a24206a78d1816c870f799f69f949/i);
  assert.match(migration, /f6f066d8d75d64729148e7503aa015df7ca9242429d6a6e3521bc7c22c10074a/i);
  assert.match(migration, /18b6d7e0da0f67edcfa273b41ab75c37ac543d39fecdf9714120dadd579b3eac/i);
  assert.match(migration, /276b2c1a29365d73a9ad03d989d644f36f42c277e0f0f71ce61a5f94116f0c60/i);
  assert.match(migration, /versao\s*\+\s*1/i);
  assert.match(migration, /fechamento_mensal_auditoria/i);
  assert.doesNotMatch(migration, /update\s+public\.fechamento_mensal_snapshots/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.fechamento_mensal_snapshots/i);
});

test('retificacao historica publicou os KPIs administrativos confirmados pela Fernanda', () => {
  for (const expected of [
    /v_ativos\s+constant\s+integer\s*:=\s*344/i,
    /v_pagantes\s+constant\s+numeric\s*:=\s*334/i,
    /v_matriculas\s+constant\s+integer\s*:=\s*422/i,
    /v_evasoes_churn\s+constant\s+integer\s*:=\s*28/i,
    /v_churn\s*:=\s*round\s*\(\s*v_evasoes_churn::numeric\s*\/\s*v_pagantes\s*\*\s*100/i,
    /v_churn\s*<>\s*8\.38/i,
  ]) assert.match(migration, expected);
});

test('regressao historica: a retificacao acoplou o ticket ao pagante administrativo', () => {
  assert.match(migration, /v_mrr\s+constant\s+numeric\s*:=\s*144749\.17/i);
  assert.match(migration, /round\s*\(\s*v_mrr\s*\/\s*v_pagantes/i);
  assert.match(migration, /433\.38/i);
  assert.doesNotMatch(migration, /'ticket_medio'\s*,\s*445\.38/i);
});

test('regressao historica ficou registrada antes da reconciliacao financeira final', () => {
  const insertExecutivo = migration.indexOf("'alunos_executivo', v_exec.versao + 1");
  const reconciliacaoFinal = migration.indexOf('RETIFICACAO_AGOSTO_RECREIO_FINANCEIRO_RECONCILIACAO_FALHOU');

  assert.notEqual(insertExecutivo, -1);
  assert.notEqual(reconciliacaoFinal, -1);
  assert.ok(insertExecutivo < reconciliacaoFinal);
});

test('saidas de agosto ficam anuladas, nunca apagadas, e setembro e preservado', () => {
  assert.match(migration, /Sara Ferreira Machado/i);
  assert.match(migration, /Caetano Leao Barradas/i);
  assert.match(migration, /anulado_motivo/i);
  assert.match(migration, /data\s*<\s*date\s+'2026-09-01'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.movimentacoes_admin/i);
});

test('dados mensais e relatorio rico sao validados no fim da mesma transacao', () => {
  assert.match(migration, /update\s+public\.dados_mensais/i);
  const updateDadosMensais = migration.match(/update\s+public\.dados_mensais[\s\S]*?get diagnostics v_qtd = row_count;/i)?.[0] ?? '';
  assert.doesNotMatch(updateDadosMensais, /faturamento_estimado\s*=/i);
  assert.doesNotMatch(updateDadosMensais, /saldo_liquido\s*=/i);
  assert.match(migration, /faturamento_estimado\s*=\s*round\s*\(\s*v_pagantes\s*\*\s*v_ticket/i);
  assert.match(migration, /saldo_liquido\s*=\s*v_novas_matriculas\s*-\s*v_evasoes_churn/i);
  assert.match(migration, /get_relatorio_admin_mensal_rico_v1/i);
  assert.match(migration, /RELATORIO_AGOSTO_RECREIO_VALIDACAO/i);
});
