import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

function tipoMigration() {
  const filename = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('_financeiro_faturas_tipo_canonico.sql'))
    .sort()
    .at(-1);
  assert.ok(filename, 'migration de tipo de fatura ainda não foi criada');
  return read(`supabase/migrations/${filename}`);
}

test('contrato financeiro publica tipo e metadados da fatura com precedência de parcela', () => {
  const migration = tipoMigration();
  for (const field of ['tipo_fatura', 'numero_parcela', 'total_parcelas_contrato']) {
    assert.match(migration, new RegExp(field));
  }

  const parcelaIndex = migration.indexOf('p_numero_parcela is not null');
  const passaporteIndex = migration.indexOf("like '%passaporte%'");
  assert.ok(parcelaIndex >= 0, 'a parcela deve usar numero_parcela');
  assert.ok(passaporteIndex > parcelaIndex, 'numero_parcela deve ter precedência sobre a descrição');

  for (const tipo of ['parcela', 'passaporte_taxa_matricula', 'lojinha_produto', 'venda_ingressos', 'avulsa_outro']) {
    assert.match(migration, new RegExp(tipo));
  }
  assert.match(migration, /reconciliation/);
});

test('adaptador e página tratam tipo de fatura separado da forma de pagamento', () => {
  const adapter = read('src/lib/faturasAlunosFinanceiras.ts');
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(adapter, /tipo_fatura/);
  assert.match(adapter, /tipoFatura/);
  assert.match(page, /Tipo da fatura/);
  assert.match(page, /Passaporte\/Taxa de matrícula/);
  assert.match(page, /Lojinha\/Produto/);
  assert.match(page, /Venda de ingressos/);
  assert.match(page, /Avulsa\/Outro/);
  assert.match(page, /forma_pagamento/);
});

test('enriquecimento de tipo é set-based e não consulta uma fatura por chamada', () => {
  const filename = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('_financeiro_faturas_tipo_canonico_set_based.sql'))
    .sort()
    .at(-1);
  assert.ok(filename, 'migration set-based ainda não foi criada');
  const migration = read(`supabase/migrations/${filename}`);
  assert.match(migration, /financeiro_enriquecer_tipos_fatura_v1/);
  assert.match(migration, /jsonb_array_elements\((?:coalesce\()?p_items/);
  assert.doesNotMatch(migration, /financeiro_enriquecer_tipo_fatura_v1\(value\)/);
});
