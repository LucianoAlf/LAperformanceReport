import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260706234500_p15_relatorio_gerencial_retencao_canonica.sql';

assert(
  existsSync(migrationPath),
  'migration P15 deve corrigir retencao canonica do relatorio gerencial',
);

const migration = readFileSync(migrationPath, 'utf8');

for (const expected of [
  'CREATE OR REPLACE FUNCTION public.get_dados_relatorio_gerencial',
  'retencao_canonica_base',
  'retencao_canonica_resumo',
  'tipo_evasao_calc',
  'interrompido_2_curso',
  'interrompido_banda',
  'interrompido_bolsista',
  'total_evasoes_label',
  'evasoes_base_alunos',
  'evasoes_bolsista',
  "jsonb_set(v_result, '{motivos_evasao}'",
  "jsonb_set(v_result, '{kpis_retencao}'",
  "jsonb_set(v_result, '{kpis_gestao}'",
  'p15_retencao_canonica_alunos_motivos',
]) {
  assert(migration.includes(expected), `migration deve conter ${expected}`);
}

for (const excluded of [
  "'%canto coral%'",
  "'%power kids%'",
  "'%minha banda%'",
  "'%garageband%'",
  "'%percussion kids%'",
]) {
  assert(migration.includes(excluded), `migration deve excluir atividade extra ${excluded}`);
}

assert(
  migration.includes("tipo_evasao_calc IN ('interrompido', 'transferencia')"),
  'motivos e MRR perdido devem usar somente evasoes base de alunos',
);

assert(
  migration.includes('round((greatest(r.evasoes_base_alunos + r.nao_renovacoes - r.transferencias, 0)::numeric / nullif(dm.alunos_pagantes, 0)) * 100, 2)'),
  'churn do gerencial deve ser recalculado pela base canonica de pagantes',
);

console.log('relatorioGerencialRetencaoCanonica OK');
