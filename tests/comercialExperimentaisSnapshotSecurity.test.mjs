import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260731161000_snapshot_experimentais_minimiza_payload.sql';
const consumersMigrationPath =
  'supabase/migrations/20260731160500_snapshot_experimentais_consumidores_ids_materializados.sql';
const durableMigrationPath =
  'supabase/migrations/20260731163000_snapshot_experimentais_acl_payload_duravel.sql';
const syncSourcePath =
  'supabase/functions/sync-presenca-emusys/index.ts';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

test('snapshot remove leitura autenticada ampla e concede apenas colunas operacionais', () => {
  const sql = migration();

  assert.match(
    sql,
    /revoke\s+select\s+on\s+table\s+public\.emusys_experimentais_raw\s+from\s+authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+select\s+on\s+(?:table\s+)?public\.emusys_experimentais_raw\s+to\s+authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s*\(\s*id\s*,\s*aluno_nome\s*,\s*data_aula\s*,\s*horario_aula\s*,\s*situacao_operacional\s*,\s*professor_id\s*,\s*unidade_id\s*\)\s+on\s+table\s+public\.emusys_experimentais_raw\s+to\s+authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s+on\s+table\s+public\.emusys_experimentais_raw\s+to\s+service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+select\s*\([^)]*\b(?:payload|aluno_telefone|responsavel_nome|responsavel_telefone|professor_nome)\b[^)]*\)\s+on\s+table\s+public\.emusys_experimentais_raw\s+to\s+authenticated/i,
  );
});

test('consumidores migram IDs tecnicos para colunas materializadas antes do saneamento', () => {
  assert.equal(
    existsSync(consumersMigrationPath),
    true,
    `${consumersMigrationPath} deve existir`,
  );
  const sql = readFileSync(consumersMigrationPath, 'utf8');

  assert.match(sql, /pg_get_functiondef/i);
  assert.match(
    sql,
    /add column if not exists emusys_lead_id_zero\s+boolean\s+not null\s+default false/i,
  );
  assert.match(
    sql,
    /replace\([\s\S]*r\.payload #>> ''\{aluno,id_lead\}''[\s\S]*case when r\.emusys_lead_id_zero then ''0'' else r\.emusys_lead_id::text end/i,
  );
  assert.match(
    sql,
    /replace\([\s\S]*r\.payload #>> ''\{aluno,id_aluno\}''[\s\S]*r\.emusys_aluno_id::text/i,
  );
  assert.match(
    sql,
    /raise exception[\s\S]*consumidor[\s\S]*payload legado/i,
  );
  assert.match(
    sql,
    /comment on column public\.emusys_experimentais_raw\.emusys_lead_id/i,
  );
  assert.match(
    sql,
    /create trigger[\s\S]*before insert or update[\s\S]*payload[\s\S]*execute function public\.normalizar_payload_emusys_experimental_minimo/i,
  );
  assert.match(
    sql,
    /jsonb_build_object\([\s\S]*'schema_version',\s*1[\s\S]*'participante'[\s\S]*emusys_lead_id_zero/i,
  );
});

test('snapshot saneia o historico para o schema minimo versionado', () => {
  const sql = migration();

  assert.match(
    sql,
    /update\s+public\.emusys_experimentais_raw[\s\S]*set\s+payload\s*=\s*jsonb_build_object/i,
  );
  for (const key of [
    'schema_version',
    'data_aula',
    'horario_aula',
    'cancelada',
    'aula',
    'participante',
    'id_lead',
    'id_aluno',
  ]) {
    assert.match(sql, new RegExp(`'${key}'`, 'i'));
  }
  assert.match(
    sql,
    /'id_lead',\s*case\s+when emusys_lead_id_zero then 0\s+else emusys_lead_id\s+end/i,
  );
  assert.doesNotMatch(
    sql,
    /\|\||jsonb_strip_nulls|payload\s*-\s*'|jsonb_set\s*\(\s*payload/i,
  );
});

test('writer regular nao reintroduz PII no payload raw', () => {
  const source = readFileSync(syncSourcePath, 'utf8');
  const inicio = source.indexOf('async function upsertExperimentalRaw');
  const fim = source.indexOf('async function reconciliarExperimentaisOrfas');
  assert.ok(inicio >= 0 && fim > inicio, 'upsert experimental raw nao localizado');
  const writer = source.slice(inicio, fim);

  assert.doesNotMatch(writer, /aluno:\s*params\.aluno/);
  assert.match(writer, /schema_version:\s*1/);
  assert.match(writer, /participante:\s*\{/);
  assert.match(writer, /id_lead:/);
  assert.match(writer, /id_aluno:/);
  assert.doesNotMatch(writer, /telefone_aluno:\s*params\.aluno/);
});

test('migration posterior reconcilia ACL mesmo se o saneamento anterior ja foi aplicado', () => {
  assert.equal(
    existsSync(durableMigrationPath),
    true,
    `${durableMigrationPath} deve existir`,
  );
  const sql = readFileSync(durableMigrationPath, 'utf8');

  assert.match(
    sql,
    /add column if not exists emusys_lead_id_zero\s+boolean\s+not null\s+default false/i,
  );
  assert.match(
    sql,
    /create or replace function public\.normalizar_payload_emusys_experimental_minimo/i,
  );
  assert.match(sql, /pg_get_functiondef/i);
  assert.match(
    sql,
    /r\.emusys_lead_id_zero[\s\S]*r\.emusys_lead_id::text/i,
  );
  assert.match(
    sql,
    /revoke select on table public\.emusys_experimentais_raw\s+from authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s*\(\s*id\s*,\s*aluno_nome\s*,\s*data_aula\s*,\s*horario_aula\s*,\s*situacao_operacional\s*,\s*professor_id\s*,\s*unidade_id\s*\)\s+on\s+table\s+public\.emusys_experimentais_raw\s+to\s+authenticated/i,
  );
});
