import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260715202505_presenca_politica_unidades_conciliacao.sql';
const privilegesMigrationPath = 'supabase/migrations/20260715202845_presenca_politica_conciliacao_privilegios.sql';
const queueScopeMigrationPath = 'supabase/migrations/20260715203155_presenca_conciliacao_apenas_emusys.sql';
const indexesMigrationPath = 'supabase/migrations/20260715203500_presenca_revisoes_indices.sql';
const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('politica de confiabilidade e temporal, versionada e escopada por unidade', () => {
  const migration = readOptional(migrationPath);

  assert.ok(migration, 'migration da politica de presenca ainda nao existe');
  assert.match(migration, /create table if not exists public\.presenca_politicas_confiabilidade/i);
  assert.match(migration, /data_inicio\s+date/i);
  assert.match(migration, /data_fim\s+date/i);
  assert.match(migration, /regra_versao\s+text/i);
  assert.match(migration, /2026-06-01/);
  assert.match(migration, /2026-07-31/);
  assert.match(migration, /exige_revisao_operacional/i);
  assert.match(migration, /campo grande/i);
  assert.match(migration, /fn_presenca_politica_impedir_sobreposicao/i);
  assert.match(migration, /daterange[\s\S]*&&[\s\S]*daterange/i);
});

test('semantica v1.2 preserva precedencia e promove ausencia somente pela politica', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /create or replace view public\.vw_aluno_presenca_semantica_v1/i);
  assert.match(migration, /presenca-semantica-v1\.2/i);
  assert.match(migration, /aula_cancelada[\s\S]*aula_justificada[\s\S]*falta_confirmada/i);
  assert.match(migration, /politica_confiabilidade_id/i);
  assert.match(migration, /revisao_operacional_exigida/i);
  assert.match(migration, /revisao_operacional_status/i);
  assert.doesNotMatch(migration, /update\s+public\.aluno_presenca[\s\S]*politica/i);
});

test('conciliacao registra somente decisoes humanas e possui RPCs escopadas', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /create table if not exists public\.aluno_presenca_revisoes_operacionais/i);
  assert.match(migration, /unique\s*\(aluno_presenca_id\)/i);
  assert.match(migration, /create or replace view public\.vw_aluno_presenca_conciliacao_operacional/i);
  assert.match(migration, /get_conciliacao_presencas/i);
  assert.match(migration, /admin_confirmar_presencas_aula/i);
  assert.match(migration, /admin_revisar_presenca_conciliacao/i);
  assert.match(migration, /usuario_tem_permissao[\s\S]*professores\.editar/i);
  assert.match(migration, /admin_corrigir_presenca/i);
  assert.match(migration, /security definer/ig);
});

test('fila pagina grupos sem reduzir o contador global', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /p_busca\s+text\s+default\s+null/i);
  assert.match(migration, /p_limite\s+integer\s+default\s+50/i);
  assert.match(migration, /p_offset\s+integer\s+default\s+0/i);
  assert.match(migration, /limit\s+p_limite[\s\S]*offset\s+p_offset/i);
  assert.match(migration, /total_grupos/i);
});

test('fila posterior inclui apenas ausencias automaticas do Emusys', () => {
  const migration = readOptional(queueScopeMigrationPath);
  const escoposEmusys = migration.match(
    /AND c\.respondido_por\s+IN\s*\('emusys',\s*'sistema'\)/gi,
  ) ?? [];

  assert.ok(migration, 'migration de escopo da fila ainda nao existe');
  assert.equal(escoposEmusys.length, 2);
  assert.match(migration, /AS revisao_operacional_exigida/i);
  assert.match(migration, /END AS revisao_operacional_status/i);
});

test('objetos sensiveis usam RLS e nao sao expostos ao navegador', () => {
  const migration = readOptional(migrationPath);
  const privilegesMigration = readOptional(privilegesMigrationPath);

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant select[\s\S]*to service_role/i);
  assert.doesNotMatch(
    migration,
    /grant\s+(select|insert|update|delete)[^;]*on\s+table[^;]*to\s+(anon|authenticated)/i,
  );
  assert.match(privilegesMigration, /fabio_agent/i);
  assert.match(privilegesMigration, /lia_acesso_restrito/i);
  assert.match(privilegesMigration, /mila_acesso_restrito/i);
  assert.match(privilegesMigration, /sol_acesso_restrito/i);
  assert.match(privilegesMigration, /revoke all on table public\.vw_aluno_presenca_semantica_v1/i);
});

test('trilha de revisao indexa as chaves estrangeiras operacionais', () => {
  const migration = readOptional(indexesMigrationPath);

  assert.match(migration, /politica_confiabilidade_id/i);
  assert.match(migration, /revisado_por_usuario_id/i);
});
