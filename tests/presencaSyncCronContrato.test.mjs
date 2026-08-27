import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

function carregarMigration() {
  const nomes = readdirSync(migrationsDir)
    .filter((nome) => /^\d+_presenca_sync_crons_operacional_e_backlog\.sql$/u.test(nome));
  assert.equal(nomes.length, 1, 'deve existir exatamente uma migration dos crons de presenca');
  return readFileSync(join(migrationsDir, nomes[0]), 'utf8');
}

test('crons separam dia, catchup e backlog e condicionam relatorio a cobertura', () => {
  const sql = carregarMigration();

  for (const job of [
    'sync-presenca-dia-barra',
    'sync-presenca-dia-campo-grande',
    'sync-presenca-dia-recreio',
    'sync-presenca-catchup-manha',
    'sync-presenca-backlog',
    'relatorio-presenca-pendencias-9h',
  ]) {
    assert.match(sql, new RegExp(`['"]${job}['"]`, 'u'), `job ausente: ${job}`);
  }

  assert.match(sql, /'modo'\s*,\s*'presenca'/u);
  assert.match(sql, /'dias'\s*,\s*1/u, 'sync operacional deve processar somente um dia');
  assert.match(sql, /America\/Sao_Paulo/u, 'data operacional deve ser calculada em BRT');
  assert.match(sql, /presenca_sync_cobertura/u, 'catchup precisa consultar cobertura real');
  assert.match(sql, /status\s*=\s*'concluida'/u);
  assert.match(sql, /snapshot_hash\s+is\s+not\s+null/u);
  assert.match(sql, /fn_enfileirar_relatorio_presenca_se_coberto_v1/u);
  assert.match(sql, /fn_enfileirar_relatorio_presenca\s*\(p_data,\s*false\)/u);

  const blocoAposentadoria = sql.match(/where jobname in \(([\s\S]*?)\)\s*loop/u)?.[1] ?? '';
  for (const legado of [
    'sync-presenca-cg', 'sync-presenca-cg-sabado',
    'sync-presenca-barra', 'sync-presenca-barra-sabado',
    'sync-presenca-recreio', 'sync-presenca-recreio-sabado',
  ]) {
    assert.ok(blocoAposentadoria.includes(`'${legado}'`), `legado nao aposentado: ${legado}`);
  }
});
