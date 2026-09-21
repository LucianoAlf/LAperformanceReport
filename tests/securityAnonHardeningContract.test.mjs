import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = new URL('../supabase/migrations/20260921013120_security_anon_hardening_20260920.sql', import.meta.url);
const rollbackPath = new URL('../scripts/rollback/20260921013120_security_anon_hardening_20260920.sql', import.meta.url);
const sequenceMigrationPath = new URL('../supabase/migrations/20260921021929_security_anon_sequences_defaults.sql', import.meta.url);
const sequenceRollbackPath = new URL('../scripts/rollback/20260921021929_security_anon_sequences_defaults.sql', import.meta.url);

function migration() {
  assert.ok(existsSync(migrationPath), 'a migration versionada deve existir');
  return readFileSync(migrationPath, 'utf8');
}

test('fecha leads_campanhas para anon e preserva leitura interna por unidade', () => {
  const sql = migration();
  assert.match(sql, /revoke all on table public\.leads_campanhas from anon, public/i);
  assert.match(sql, /create policy leads_campanhas_select_authenticated[\s\S]+?to authenticated/i);
  assert.match(sql, /from public\.leads/i);
  assert.doesNotMatch(sql, /leads_campanhas[\s\S]{0,500}using\s*\(\s*true\s*\)/i);
});

test('cobre as vinte tabelas sem RLS e preserva somente acessos internos levantados', () => {
  const sql = migration();
  for (const table of [
    '_auditoria_chave_natural_20260809',
    '_auditoria_reconstrucao_20260809',
    'calendario_escolar',
    'emusys_experimentais_snapshot_execucoes',
    'fabio_memoria_janela',
    'fabio_memoria_proposta',
    'fabio_participacao_ocorrencia_eventos',
    'fabio_participacao_ocorrencias',
    'fabio_professor_memoria',
    'fechamento_snapshots_backup_20260808',
    'health_score_professor_v3_materializacao_execucoes',
    'hermes_patch_status',
    'lead_experimentais_arquivadas',
    'lead_experimental_aulas_arquivadas',
    'migrations_audit_data_nascimento',
    'programa_matriculador_estrelas_config',
    'projecao_aulas',
    'projecao_recaculo_log',
    'sol_grants_revogados_fatia0',
    'unidade_contato_comercial',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /projecao_aulas_select_authenticated/i);
  assert.match(sql, /calendario_escolar_select_authenticated/i);
});

test('remove a heranca PUBLIC de funcoes anon, fixa definers e protege os quatro contratos publicos', () => {
  const sql = migration();
  assert.match(sql, /set search_path = pg_catalog, public, pg_temp/i);
  assert.match(sql, /revoke execute on function %s from public, anon/i);
  for (const fn of [
    'fn_porteiro_requisicao',
    'get_anamnese_publica',
    'get_convite_anamnese',
    'salvar_anamnese_online',
  ]) assert.match(sql, new RegExp(fn, 'i'));
  assert.match(sql, /private\.anamnese_publica_rate_limit/i);
  assert.match(sql, /\^\[0-9a-fA-F\]\{32\}\$/i);
  assert.match(sql, /revoke all on tables from anon, public/i);
  assert.match(sql, /revoke execute on functions from anon, public/i);
});

test('inclui roteiro versionado de desfazer para ACLs capturadas antes do lote', () => {
  assert.ok(existsSync(rollbackPath), 'o rollback versionado deve existir');
  const sql = readFileSync(rollbackPath, 'utf8');
  assert.match(sql, /security_anon_hardening_20260920_acl_backup/i);
  assert.match(sql, /grant .* on table/i);
  assert.match(sql, /grant execute on function/i);
});

test('fecha sequencias existentes e futuras para anon e preserva rollback versionado', () => {
  assert.ok(existsSync(sequenceMigrationPath), 'a migration de sequencias deve existir');
  assert.ok(existsSync(sequenceRollbackPath), 'o rollback de sequencias deve existir');
  const sql = readFileSync(sequenceMigrationPath, 'utf8');
  const rollback = readFileSync(sequenceRollbackPath, 'utf8');
  assert.match(sql, /revoke all privileges on all sequences in schema public from anon, public/i);
  assert.match(sql, /alter default privileges for role postgres in schema public\s+revoke all on sequences from anon, public/i);
  assert.match(sql, /object_kind in \('table', 'sequence', 'function'\)/i);
  assert.match(rollback, /grant .* on sequence/i);
});
