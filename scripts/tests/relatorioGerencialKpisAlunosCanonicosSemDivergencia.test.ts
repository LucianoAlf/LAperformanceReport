import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260707000500_p17_relatorio_gerencial_sem_bloco_legado_divergente.sql';

assert(
  existsSync(migrationPath),
  'migration P17 deve alinhar kpis_alunos_canonicos ao gerencial canonico',
);

const migration = readFileSync(migrationPath, 'utf8');

for (const expected of [
  'get_dados_relatorio_gerencial_legacy_p17_20260707',
  'totais_patch',
  'kpis_alunos_canonicos',
  'por_unidade',
  'total_evasoes_label',
  'p17_kpis_alunos_canonicos_sem_divergencia',
]) {
  assert(migration.includes(expected), `migration deve conter ${expected}`);
}

assert(
  !migration.includes('get_kpis_alunos_canonicos('),
  'P17 nao deve recalcular por outra RPC; deve reutilizar o resultado gerencial ja corrigido',
);

console.log('relatorioGerencialKpisAlunosCanonicosSemDivergencia OK');
