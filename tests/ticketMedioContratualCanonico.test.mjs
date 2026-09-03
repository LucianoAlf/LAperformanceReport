import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

function migrationSource() {
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => /_ticket_medio_contratual_canonico\.sql$/u.test(name))
    .sort()
    .at(-1);

  assert.ok(
    migrationName,
    'a migration versionada para o ticket medio contratual deve existir',
  );

  return readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

test('ticket medio usa a parcela contratual, inclusive para inadimplente', () => {
  const sql = migrationSource();

  assert.match(sql, /create or replace function public\.aplicar_financeiro_ticket_contratual_v1/i);
  assert.match(
    sql,
    /when i\.status in \('paga', 'aberta'\)[\s\S]{0,260}coalesce\(i\.valor_original, 0\)[\s\S]{0,120}- coalesce\(i\.desconto_aplicado, 0\)/i,
  );
  assert.doesNotMatch(
    sql,
    /valor_contratual[\s\S]{0,360}juros_e_multa/i,
    'juros e multa nao podem inflar o ticket da competencia',
  );
});

test('denominador do ticket historico vem do fechamento de alunos, nao das faturas encontradas', () => {
  const sql = migrationSource();

  assert.match(sql, /dominio = 'alunos_admin'/i);
  assert.match(sql, /s\.status = 'fechado'/i);
  assert.match(sql, /alunos_pagantes_canonicos/i);
  assert.doesNotMatch(
    sql,
    /ticket_medio[\s\S]{0,260}count\(distinct emusys_student_id\)/i,
    'o denominador do ticket nao pode voltar a ser a cobertura de faturas',
  );
});

test('a correcao de agosto e propagada por novas versoes de snapshot e pela compatibilidade historica', () => {
  const sql = migrationSource();

  for (const dominio of ['alunos_executivo', 'relatorio_gerencial', 'relatorio_admin_mensal']) {
    assert.match(sql, new RegExp(`'${dominio}'`, 'i'));
  }

  assert.match(sql, /insert into public\.fechamento_mensal_snapshots/i);
  assert.match(sql, /insert into public\.fechamento_mensal_auditoria/i);
  assert.match(sql, /atualizar_dados_mensais_por_snapshot\(2026, 8,/i);
});

test('o leitor rico recebe mrr contratual coerente com o ticket retificado', () => {
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => /_ticket_medio_contratual_relatorio_rico\.sql$/u.test(name))
    .sort()
    .at(-1);

  assert.ok(
    migrationName,
    'uma migration deve alinhar o mrr canônico ao ticket contratual no leitor rico',
  );

  const sql = readFileSync(path.join(migrationsDir, migrationName), 'utf8');
  assert.match(sql, /'mrr', v_faturamento/i);
  assert.match(sql, /'alunos_executivo'/i);
  assert.match(sql, /'relatorio_gerencial'/i);
  assert.match(sql, /'relatorio_admin_mensal'/i);
  assert.match(sql, /get_relatorio_admin_mensal_rico_v1/i);
});
