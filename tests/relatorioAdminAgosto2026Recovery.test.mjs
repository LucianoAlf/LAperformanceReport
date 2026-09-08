import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260908170000_relatorio_admin_agosto_2026_integridade_e_base_financeira.sql',
  import.meta.url,
);

test('recuperacao de agosto existe como nova migration versionada', () => {
  assert.equal(existsSync(migrationUrl), true);
});

test('base financeira legada vem de snapshot financeiro explicito, nunca de pagantes administrativos', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /dominio\s*=\s*'alunos_executivo'/iu);
  assert.match(sql, /financeiro_ticket_contratual,ticket_denominador_pagantes/iu);
  assert.match(sql, /ticket_denominador_pagantes/iu);
  const assignment = sql.match(
    /v_ticket_denominador_pagantes\s*:=\s*coalesce\([\s\S]*?\n\s*\);/iu,
  );
  assert.ok(assignment, 'atribuicao do denominador nao encontrada');
  assert.doesNotMatch(assignment[0], /v_pagantes_relatorio/iu);
});

test('retificacao corrige a cronologia do Recreio sem reescrever snapshots fechados', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /v_evasoes_interrompidas\s+constant\s+integer\s*:=\s*23/iu);
  assert.match(sql, /v_evasoes_churn\s+constant\s+integer\s*:=\s*29/iu);
  assert.match(sql, /v_movimentos_preliminares_no_snapshot\s+constant\s+integer\s*:=\s*7/iu);
  assert.match(sql, /Caetano Leao Barradas/iu);
  assert.match(sql, /created_at\s*>\s*v_gerencial\.capturado_em/iu);
  assert.match(sql, /insert\s+into\s+public\.fechamento_mensal_snapshots/iu);
  assert.match(sql, /fechamento_mensal_auditoria/iu);
  assert.doesNotMatch(sql, /update\s+public\.fechamento_mensal_snapshots/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.fechamento_mensal_snapshots/iu);
});

test('migration prova o relatorio rico nas tres unidades com os tickets congelados', () => {
  const sql = readFileSync(migrationUrl, 'utf8');

  for (const expected of [
    /Barra[\s\S]*256[\s\S]*446\.30/iu,
    /Campo Grande[\s\S]*382[\s\S]*398\.87/iu,
    /Recreio[\s\S]*325[\s\S]*445\.38/iu,
    /Recreio[\s\S]*334[\s\S]*422[\s\S]*8\.68/iu,
  ]) assert.match(sql, expected);

  assert.match(sql, /get_relatorio_admin_mensal_rico_v1/iu);
});
