import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260731162000_snapshot_experimentais_admissao_refresh.sql';
const fencingMigrationPath =
  'supabase/migrations/20260731223000_snapshot_experimentais_fencing_lease.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function fencingMigration() {
  assert.equal(
    existsSync(fencingMigrationPath),
    true,
    `${fencingMigrationPath} deve existir`,
  );
  return readFileSync(fencingMigrationPath, 'utf8');
}

test('admissao e privada, particionada e possui lease recuperavel', () => {
  const sql = migration();

  assert.match(
    sql,
    /create\s+table\s+public\.emusys_experimentais_refresh_admissoes/i,
  );
  assert.match(
    sql,
    /unique\s*\(\s*unidade_id\s*,\s*data_inicio\s*,\s*data_fim\s*,\s*origem\s*,\s*bucket_inicio\s*\)/i,
  );
  assert.match(sql, /status[\s\S]*em_andamento[\s\S]*completo[\s\S]*falhou/i);
  assert.match(sql, /lease_ate\s+timestamptz\s+not\s+null/i);
  assert.match(sql, /date_bin\s*\(\s*interval\s*'5 minutes'/i);
  assert.match(sql, /for\s+update/i);
  assert.match(sql, /lease_ate\s*<=\s*v_agora/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.emusys_experimentais_refresh_admissoes\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.emusys_experimentais_refresh_admissoes\s+to\s+service_role/i,
  );
});

test('RPCs de admissao e finalizacao sao exclusivas do service_role', () => {
  const sql = migration();

  for (const nome of [
    'admitir_refresh_snapshot_experimentais_v1',
    'finalizar_refresh_snapshot_experimentais_v1',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+public\\.${nome}`,
        'i',
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${nome}\\([^;]+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
        'i',
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${nome}\\([^;]+to\\s+service_role`,
        'i',
      ),
    );
  }
});

test('finalizacao completa exige snapshot canonico correspondente', () => {
  const sql = migration();

  assert.match(
    sql,
    /from\s+public\.emusys_experimentais_snapshot_execucoes[\s\S]*id\s*=\s*p_execucao_id[\s\S]*unidade_id\s*=\s*v_admissao\.unidade_id[\s\S]*status\s*=\s*'completo'/i,
  );
  assert.match(
    sql,
    /where\s+id\s*=\s*p_admissao_id[\s\S]*snapshot_execucao_id\s*=\s*p_execucao_id[\s\S]*status\s*=\s*'em_andamento'/i,
  );
});

test('aplicacao usa execucao admitida como fencing token antes de publicar', () => {
  const sql = fencingMigration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.aplicar_snapshot_experimentais_emusys_admitido_v1\s*\(\s*p_admissao_id\s+uuid/i,
  );
  assert.match(
    sql,
    /from\s+public\.emusys_experimentais_refresh_admissoes[\s\S]*id\s*=\s*p_admissao_id[\s\S]*snapshot_execucao_id\s*=\s*p_execucao_id[\s\S]*unidade_id\s*=\s*p_unidade_id[\s\S]*data_inicio\s*=\s*p_data_inicio[\s\S]*data_fim\s*=\s*p_data_fim[\s\S]*status\s*=\s*'em_andamento'[\s\S]*for\s+update/i,
  );
  assert.match(sql, /lease_ate\s*<=\s*v_agora/i);
  assert.match(
    sql,
    /return\s+public\.aplicar_snapshot_experimentais_emusys_v1\s*\(/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.aplicar_snapshot_experimentais_emusys_admitido_v1[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.aplicar_snapshot_experimentais_emusys_admitido_v1[\s\S]*to\s+service_role/i,
  );
  assert.doesNotMatch(sql, /alter\s+function[\s\S]*rename\s+to/i);
});
