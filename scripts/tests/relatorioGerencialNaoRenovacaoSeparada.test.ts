import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260706235500_p16_relatorio_gerencial_evasoes_sem_nao_renovacao.sql';

assert(
  existsSync(migrationPath),
  'migration P16 deve separar evasoes de nao renovacoes no texto gerencial',
);

const migration = readFileSync(migrationPath, 'utf8');

for (const expected of [
  'get_dados_relatorio_gerencial_legacy_p16_20260706',
  'retencao_canonica_base',
  'retencao_canonica_resumo',
  '(r.evasoes_base_alunos + r.evasoes_bolsista)::integer AS total_evasoes_display',
  'r.evasoes_base_alunos + r.nao_renovacoes - r.transferencias',
  'nao_renovacoes',
  'total_evasoes_label',
  'p16_retencao_canonica_evasoes_sem_nao_renovacao',
]) {
  assert(migration.includes(expected), `migration deve conter ${expected}`);
}

assert(
  !migration.includes('(r.evasoes_base_alunos + r.evasoes_bolsista + r.nao_renovacoes)::integer AS total_evasoes_display'),
  'campo Evasoes do gerencial nao deve somar nao renovacoes',
);

console.log('relatorioGerencialNaoRenovacaoSeparada OK');
