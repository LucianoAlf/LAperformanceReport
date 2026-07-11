import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const helperPath = 'supabase/functions/_shared/nao-renovacao-canonica.ts';
const migrationPath = 'supabase/migrations/20260711143000_nao_renovacao_emusys_canonica.sql';
const idempotenciaMigrationPath = 'supabase/migrations/20260711150000_nao_renovacao_emusys_idempotencia.sql';
const syncPath = 'supabase/functions/sync-matriculas-emusys/index.ts';
const pagePath = 'src/components/App/Administrativo/AdministrativoPage.tsx';
const tabelaPath = 'src/components/App/Administrativo/TabelaRenovacoes.tsx';
const modalPath = 'src/components/App/Administrativo/ModalRenovacao.tsx';

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('regra automatica exige finalizada e renovacao pendente da mesma matricula', async () => {
  assert.ok(existsSync(helperPath), 'helper canonico ainda nao existe');
  const { deveConverterFinalizadaEmNaoRenovacao } = await import(
    new URL(`../${helperPath}`, import.meta.url).href
  );

  const pendente = {
    id: 10,
    tipo: 'renovacao',
    renovacao_status: 'pendente_validacao',
    emusys_matricula_id: 976,
  };

  assert.equal(deveConverterFinalizadaEmNaoRenovacao('finalizada', 976, pendente), true);
  assert.equal(deveConverterFinalizadaEmNaoRenovacao('ativa', 976, pendente), false);
  assert.equal(deveConverterFinalizadaEmNaoRenovacao('finalizada', 999, pendente), false);
  assert.equal(deveConverterFinalizadaEmNaoRenovacao('finalizada', 976, null), false);
  assert.equal(deveConverterFinalizadaEmNaoRenovacao('finalizada', 976, {
    ...pendente,
    renovacao_status: 'confirmada',
  }), false);
});

test('migration concentra a conversao em RPC atomica e idempotente', () => {
  const migration = readOptional(migrationPath);
  assert.match(migration, /converter_renovacao_pendente_em_nao_renovacao/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /tipo\s*=\s*'nao_renovacao'/i);
  assert.match(migration, /status\s*=\s*'inativo'/i);
  assert.match(migration, /status_divergente/i);
});

test('nao duplica quando a equipe ja registrou a nao renovacao manualmente', () => {
  const migration = readOptional(idempotenciaMigrationPath);
  assert.match(migration, /v_nao_renovacao_existente/i);
  assert.match(migration, /tipo\s*=\s*'nao_renovacao'/i);
  assert.match(migration, /delete\s+from\s+public\.movimentacoes_admin/i);
  assert.match(migration, /registro_manual_preservado/i);
});

test('sync usa a mesma RPC apenas para candidato elegivel', () => {
  const sync = readOptional(syncPath);
  assert.match(sync, /deveConverterFinalizadaEmNaoRenovacao/);
  assert.match(sync, /converter_renovacao_pendente_em_nao_renovacao/);
  assert.match(sync, /nao_renovacoes_convertidas/);
  assert.match(sync, /naoRenovacoesCanonicas/);
  assert.match(sync, /alunosComStatusCanonico/);
});

test('renovacao pendente oferece acao manual de nao renovacao', () => {
  const page = readOptional(pagePath);
  const tabela = readOptional(tabelaPath);
  const modal = readOptional(modalPath);

  assert.match(tabela, /onMarcarNaoRenovou/);
  assert.match(modal, /onMarcarNaoRenovou/);
  assert.match(modal, /N[aã]o renovou/i);
  assert.match(page, /converter_renovacao_pendente_em_nao_renovacao/);
});
