import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationName = readdirSync(migrationsDir, { encoding: 'utf8' }).find((name) =>
  name.endsWith('_corrige_ticket_agosto_2026_recreio_334_pagantes.sql')
);
const migrationUrl = migrationName ? new URL(migrationName, migrationsDir) : null;

test('correcao do ticket de agosto do Recreio existe como migration aditiva', () => {
  assert.ok(migrationUrl, 'migration de correcao 334 pagantes / R$ 433,38 ausente');
  assert.equal(existsSync(migrationUrl), true);
  assert.ok(
    migrationName > '20260908170000_relatorio_admin_agosto_2026_integridade_e_base_financeira.sql',
    'a correcao precisa rodar depois da migration que republicou 325/R$ 445,38',
  );
});

test('correcao congela a equacao confirmada sem alterar a regra global', () => {
  assert.ok(migrationUrl, 'migration de correcao ausente');
  const sql = readFileSync(migrationUrl, 'utf8');

  for (const expected of [
    /v_ativos\s+constant\s+integer\s*:=\s*344/iu,
    /v_pagantes_administrativos\s+constant\s+integer\s*:=\s*334/iu,
    /v_ticket_denominador_pagantes\s+constant\s+integer\s*:=\s*334/iu,
    /v_mrr\s+constant\s+numeric\s*:=\s*144749\.17/iu,
    /v_ticket\s+constant\s+numeric\s*:=\s*433\.38/iu,
  ]) assert.match(sql, expected);

  assert.match(sql, /round\(v_mrr\s*\/\s*v_ticket_denominador_pagantes,\s*2\)\s*<>\s*v_ticket/iu);
  assert.match(sql, /ticket_denominador_pagantes[^\n]*325/iu);
  assert.match(sql, /ticket_medio[^\n]*445\.38/iu);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.aplicar_financeiro_ticket_contratual/iu);
});

test('snapshots fechados sao retificados por novas versoes e deixam auditoria', () => {
  assert.ok(migrationUrl, 'migration de correcao ausente');
  const sql = readFileSync(migrationUrl, 'utf8');
  const inserts = sql.match(/insert\s+into\s+public\.fechamento_mensal_snapshots/giu) ?? [];

  assert.equal(inserts.length, 3, 'esperadas novas versoes dos tres snapshots consumidores');
  assert.match(sql, /'alunos_executivo'/iu);
  assert.match(sql, /'relatorio_gerencial'/iu);
  assert.match(sql, /'relatorio_admin_mensal'/iu);
  assert.match(sql, /fechamento_mensal_auditoria/iu);
  assert.match(sql, /versao\s*\+\s*1/iu);
  assert.doesNotMatch(sql, /update\s+public\.fechamento_mensal_snapshots/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.fechamento_mensal_snapshots/iu);
});

test('compatibilidade e leitores finais recebem 334 e R$ 433,38', () => {
  assert.ok(migrationUrl, 'migration de correcao ausente');
  const sql = readFileSync(migrationUrl, 'utf8');

  assert.match(sql, /update\s+public\.dados_mensais/iu);
  assert.match(sql, /ticket_denominador_pagantes\s*=\s*v_ticket_denominador_pagantes/iu);
  assert.match(sql, /ticket_medio_contratual\s*=\s*v_ticket/iu);
  assert.match(sql, /get_relatorio_admin_mensal_rico_v1/iu);
  assert.match(sql, /get_relatorio_gerencial_canonico_v1/iu);
  assert.match(sql, /Barra[\s\S]*446\.30/iu);
  assert.match(sql, /Campo Grande[\s\S]*398\.87/iu);
});
