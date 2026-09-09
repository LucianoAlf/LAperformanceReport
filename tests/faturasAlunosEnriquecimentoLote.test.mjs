import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260909014500_financeiro_faturas_enriquecimento_em_lote.sql';

test('enriquecimento financeiro de aluno processa o lote inteiro sem N+1', () => {
  assert.ok(existsSync(migrationPath), 'a migration do enriquecimento em lote precisa existir');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /financeiro_enriquecer_faturas_itens_v1\(p_items jsonb\)/);
  assert.match(migration, /jsonb_array_elements\(coalesce\(p_items, '\[\]'::jsonb\)\) with ordinality/i);
  assert.match(migration, /get_faturas_alunos_financeiro_v1_contrato_tipo_20260817/);
  assert.match(migration, /v_main_items := public\.financeiro_enriquecer_faturas_itens_v1/i);

  const contrato = migration.slice(
    migration.lastIndexOf('create or replace function public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817'),
  );
  assert.doesNotMatch(contrato, /financeiro_enriquecer_fatura_item\s*\(/i);
  assert.match(
    contrato,
    /jsonb_array_elements\(\s*public\.financeiro_enriquecer_faturas_itens_v1/i,
  );
});

test('enriquecimento em lote preserva identidade, foto e forma de pagamento', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  for (const trecho of [
    'emusys_matriculas_estado_atual',
    'alunos_arquivados',
    "'foto_url'",
    "'photo_url'",
    "'forma_pagamento_manual'",
    "'Forma prevista'",
    "'Forma informada'",
  ]) {
    assert.ok(migration.includes(trecho), `o lote deve preservar ${trecho}`);
  }
});
