import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260717170000_health_score_v3_config_snapshots.sql';
const serviceRoleMigrationPath =
  'supabase/migrations/20260717173000_health_score_v3_service_role_readonly.sql';
const indexesMigrationPath =
  'supabase/migrations/20260717174500_health_score_v3_fk_indexes.sql';
const normalizationMigrationPath =
  'supabase/migrations/20260717180000_health_score_v3_normalizacao_meta.sql';
const permanenceTargetMigrationPath =
  'supabase/migrations/20260718160000_health_score_v3_meta_permanencia_12_meses.sql';

function migration() {
  return existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
}

function securityMigration() {
  return existsSync(serviceRoleMigrationPath)
    ? readFileSync(serviceRoleMigrationPath, 'utf8')
    : '';
}

function indexesMigration() {
  return existsSync(indexesMigrationPath)
    ? readFileSync(indexesMigrationPath, 'utf8')
    : '';
}

function normalizationMigration() {
  return existsSync(normalizationMigrationPath)
    ? readFileSync(normalizationMigrationPath, 'utf8')
    : '';
}

function permanenceTargetMigration() {
  return existsSync(permanenceTargetMigrationPath)
    ? readFileSync(permanenceTargetMigrationPath, 'utf8')
    : '';
}

function functionBlock(sql, name) {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i'));
  if (start < 0) return '';
  const next = sql.slice(start + 1).search(/\ncreate or replace function public\./i);
  return next < 0 ? sql.slice(start) : sql.slice(start, start + 1 + next);
}

test('Gate 5 cria configuracao e snapshots pai/filha com grao versionado', () => {
  const sql = migration();

  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  assert.match(sql, /create table if not exists public\.health_score_professor_v3_config_versoes/i);
  assert.match(sql, /create table if not exists public\.health_score_professor_v3_config_metricas/i);
  assert.match(sql, /create table if not exists public\.health_score_professor_v3_snapshots/i);
  assert.match(sql, /create table if not exists public\.health_score_professor_v3_snapshot_metricas/i);
  assert.match(sql, /unique\s*\(\s*config_id\s*,\s*metrica\s*\)/i);
  assert.match(sql, /check\s*\(\s*metrica\s+in\s*\([\s\S]*'retencao'[\s\S]*'presenca'/i);
  assert.match(sql, /snapshot_anterior_id[\s\S]*references public\.health_score_professor_v3_snapshots/i);
  assert.match(sql, /revisao integer not null/i);
});

test('configuracao inicial nasce rascunho com seis pesos e metas nao inventadas', () => {
  const sql = migration();

  assert.match(sql, /'retencao'\s*,\s*25/i);
  assert.match(sql, /'permanencia'\s*,\s*25/i);
  assert.match(sql, /'conversao'\s*,\s*15/i);
  assert.match(sql, /'media_turma'\s*,\s*15/i);
  assert.match(sql, /'numero_alunos'\s*,\s*10/i);
  assert.match(sql, /'presenca'\s*,\s*10/i);
  assert.match(sql, /status[\s\S]*'rascunho'/i);
  assert.match(sql, /'media_turma'\s*,\s*15(?:::numeric)?\s*,\s*null(?:::numeric)?/i);
  assert.match(sql, /'numero_alunos'\s*,\s*10(?:::numeric)?\s*,\s*null(?:::numeric)?/i);
  assert.match(sql, /'permanencia'\s*,\s*25(?:::numeric)?\s*,\s*null(?:::numeric)?/i);
  assert.doesNotMatch(sql, /percentile_(?:cont|disc)[\s\S]*insert into public\.health_score_professor_v3_config_metricas/i);
});

test('ativacao valida seis pilares, soma cem, metas, faixas e vigencia sem sobreposicao', () => {
  const block = functionBlock(migration(), 'ativar_health_score_professor_v3_config');

  assert.match(block, /select\s+count\s*\(\s*distinct\s+metrica\s*\)\s*,\s*sum\s*\(\s*peso\s*\)[\s\S]*into\s+v_metricas\s*,\s*v_peso_total/i);
  assert.match(block, /if\s+v_metricas\s*<>\s*6\s+or\s+v_peso_total\s*<>\s*100/i);
  assert.match(block, /metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*,\s*'permanencia'\s*\)[\s\S]*meta\s+is\s+null/i);
  assert.match(block, /faixa_atencao_min\s*>=\s*v_config\.faixa_saudavel_min/i);
  assert.match(block, /daterange[\s\S]*&&/i);
  assert.match(block, /snapshot[\s\S]*estado\s*=\s*'fechado'/i);
  assert.match(block, /pg_advisory_xact_lock/i);
});

test('motor chama os seis pilares e calcula nota, cobertura e publicabilidade sem zero fabricado', () => {
  const block = functionBlock(migration(), 'fn_materializar_health_score_professor_v3');

  for (const metrica of [
    'conversao',
    'media_turma',
    'numero_alunos',
    'retencao',
    'permanencia',
    'presenca',
  ]) {
    assert.match(block, new RegExp(`get_professor_${metrica}_v3_sombra`, 'i'));
  }

  assert.match(block, /least\s*\(\s*100[\s\S]*valor_bruto[\s\S]*meta/i);
  assert.match(block, /sum\s*\([\s\S]*peso[\s\S]*filter[\s\S]*nota\s+is\s+not\s+null/i);
  assert.match(block, /cobertura[\s\S]*>=\s*v_config\.cobertura_minima/i);
  assert.match(block, /metrica\s+in\s*\(\s*'retencao'\s*,\s*'permanencia'\s*\)/i);
  assert.doesNotMatch(block, /coalesce\s*\(\s*(?:valor_bruto|nota|score)[^,]*,\s*0(?:\.0)?\s*\)/i);
  assert.doesNotMatch(block, /get_kpis_professor_periodo|get_health_score_professores/i);
});

test('materializacao separa provisorio de fechado e nunca fecha configuracao rascunho', () => {
  const block = functionBlock(migration(), 'materializar_health_score_professor_v3');

  assert.match(block, /p_modo\s+not\s+in\s*\(\s*'provisorio'\s*,\s*'fechado'\s*\)/i);
  assert.match(block, /p_modo\s*=\s*'fechado'[\s\S]*v_config\.status\s*<>\s*'ativa'/i);
  assert.match(block, /p_modo\s*=\s*'provisorio'[\s\S]*v_config\.status\s+not\s+in\s*\(\s*'rascunho'\s*,\s*'ativa'\s*\)/i);
  assert.match(functionBlock(migration(), 'fn_materializar_health_score_professor_v3'), /max\s*\(\s*s\.revisao\s*\)[\s\S]*\+\s*1/i);
});

test('snapshot fechado e metricas filhas sao imutaveis fora de RPC controlada', () => {
  const sql = migration();

  assert.match(sql, /create or replace function public\.fn_health_score_professor_v3_bloquear_snapshot_fechado/i);
  assert.match(sql, /old\.estado\s*=\s*'fechado'/i);
  assert.match(sql, /current_setting\s*\(\s*'app\.health_score_v3_mutacao_controlada'/i);
  assert.match(sql, /before update or delete on public\.health_score_professor_v3_snapshots/i);
  assert.match(sql, /before insert or update or delete on public\.health_score_professor_v3_snapshot_metricas/i);
  assert.match(sql, /health_score_professor_v3_config_metricas[\s\S]*snapshots[\s\S]*estado\s+in\s*\(\s*'fechado'\s*,\s*'invalidado'\s*\)/i);
  assert.match(sql, /old\.estado\s*=\s*'fechado'[\s\S]*new\.estado\s*=\s*'invalidado'/i);
  assert.match(sql, /on delete restrict/i);
  assert.doesNotMatch(sql, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*to service_role/i);
  assert.match(securityMigration(), /revoke insert, update, delete, truncate, references, trigger[\s\S]*from service_role/i);
});

test('retificacao exige justificativa, invalida sem apagar e cria revisao fechada', () => {
  const block = functionBlock(migration(), 'retificar_health_score_professor_v3');

  assert.match(block, /nullif\s*\(\s*btrim\s*\(\s*p_justificativa\s*\)/i);
  assert.match(block, /set_config\s*\(\s*'app\.health_score_v3_mutacao_controlada'/i);
  assert.match(block, /update public\.health_score_professor_v3_snapshots[\s\S]*estado\s*=\s*'invalidado'/i);
  assert.match(block, /fn_materializar_health_score_professor_v3\s*\([\s\S]*v_original\.id[\s\S]*p_justificativa/i);
  assert.match(block, /c\.id\s*=\s*v_original\.config_id/i);
  assert.match(block, /pg_advisory_xact_lock/i);
  assert.match(migration(), /snapshot_anterior_id/i);
  assert.match(migration(), /max\s*\(\s*s\.revisao\s*\)[\s\S]*\+\s*1/i);
  assert.doesNotMatch(block, /delete\s+from\s+public\.health_score_professor_v3_snapshots/i);
});

test('publicabilidade permanece separada de publicacao oficial durante a sombra', () => {
  const sql = migration();

  assert.match(sql, /publicavel boolean not null default false/i);
  assert.match(sql, /publicado boolean not null default false/i);
  assert.match(sql, /not publicado or \(estado = 'fechado' and publicavel\)/i);
  assert.doesNotMatch(sql, /set\s+publicado\s*=\s*true/i);
});

test('Gate 5 nasce com RLS e sem acesso public ou anon', () => {
  const sql = migration();

  for (const table of [
    'health_score_professor_v3_config_versoes',
    'health_score_professor_v3_config_metricas',
    'health_score_professor_v3_snapshots',
    'health_score_professor_v3_snapshot_metricas',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated`, 'i'));
  }

  for (const rpc of [
    'ativar_health_score_professor_v3_config',
    'materializar_health_score_professor_v3',
    'retificar_health_score_professor_v3',
  ]) {
    assert.match(sql, new RegExp(`security definer[\\s\\S]*?set search_path = public, pg_temp`, 'i'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon`, 'i'));
  }

  assert.match(sql, /fn_usuario_atual_tem_permissao\s*\(\s*'professores\.editar'/i);
});

test('Gate 5 indexa as chaves estrangeiras usadas por configuracao e snapshots', () => {
  const sql = indexesMigration();

  assert.equal(existsSync(indexesMigrationPath), true, `${indexesMigrationPath} deve existir`);
  assert.match(sql, /health_score_professor_v3_config_versoes\s*\(criado_por\)/i);
  assert.match(sql, /health_score_professor_v3_config_versoes\s*\(ativado_por\)/i);
  assert.match(sql, /health_score_professor_v3_snapshots\s*\(config_id\)/i);
  assert.match(sql, /health_score_professor_v3_snapshots\s*\(unidade_id\)/i);
  assert.match(sql, /health_score_professor_v3_snapshots\s*\(snapshot_anterior_id\)/i);
  assert.match(sql, /health_score_professor_v3_snapshots\s*\(criado_por\)/i);
});

test('Gate 5 separa peso, meta, valor real e nota nos seis pilares', () => {
  const sql = normalizationMigration();

  assert.equal(
    existsSync(normalizationMigrationPath),
    true,
    `${normalizationMigrationPath} deve existir`,
  );
  assert.match(sql, /'normalizacao'\s*,\s*'meta_versionada'/i);
  assert.doesNotMatch(sql, /percentual_direta/i);
  assert.match(sql, /when\s+'media_turma'\s+then\s+1\.44/i);
  assert.match(sql, /when\s+'numero_alunos'\s+then\s+33/i);
  assert.match(sql, /when\s+'conversao'\s+then\s+null/i);
  assert.match(sql, /when\s+'permanencia'\s+then\s+null/i);
  assert.match(sql, /when\s+'retencao'\s+then\s+null/i);
  assert.match(sql, /when\s+'presenca'\s+then\s+null/i);
});

test('config V1 explicita estados aprovados, em calibracao e aguardando dados', () => {
  const sql = normalizationMigration();

  assert.match(sql, /'media_turma'[\s\S]*'aprovada'/i);
  assert.match(sql, /'numero_alunos'[\s\S]*'aprovada'/i);
  assert.match(sql, /'conversao'[\s\S]*'em_calibracao'/i);
  assert.match(sql, /'permanencia'[\s\S]*'em_calibracao'/i);
  assert.match(sql, /'retencao'[\s\S]*'aguardando_dados_reais'/i);
  assert.match(sql, /'presenca'[\s\S]*'bloqueada_ate_inicio'/i);
});

test('ativacao exige quatro metas aprovadas e aceita os dois pilares pendentes explicitos', () => {
  const block = functionBlock(
    normalizationMigration(),
    'ativar_health_score_professor_v3_config',
  );

  assert.match(block, /metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*,\s*'conversao'\s*,\s*'permanencia'\s*\)/i);
  assert.match(block, /parametros\s*->>\s*'meta_status'\s*<>\s*'aprovada'/i);
  assert.match(block, /metrica\s+in\s*\(\s*'retencao'\s*,\s*'presenca'\s*\)/i);
  assert.match(block, /meta\s+is\s+null[\s\S]*meta_status/i);
  assert.match(
    block,
    /parametros\s*->>\s*'normalizacao'[\s\S]*<>\s*'meta_versionada'/i,
  );
});

test('meta de permanencia aprovada usa 12 meses sem ativar a configuracao V3', () => {
  const sql = permanenceTargetMigration();

  assert.equal(
    existsSync(permanenceTargetMigrationPath),
    true,
    `${permanenceTargetMigrationPath} deve existir`,
  );
  assert.match(sql, /where\s+c\.versao\s*=\s*1[\s\S]*c\.status\s*=\s*'rascunho'/i);
  assert.match(sql, /set\s+meta\s*=\s*12(?:\.0+)?/i);
  assert.match(sql, /'meta_status'\s*,\s*'aprovada'/i);
  assert.match(sql, /'meta_autoridade'\s*,\s*'Alf'/i);
  assert.match(sql, /'meta_aprovada_em'\s*,\s*'2026-07-18'/i);
  assert.match(sql, /'meta_comparador_operacional'\s*,\s*'>'/i);
  assert.match(sql, /'meta_regra_exibicao'\s*,\s*'> 12 meses'/i);
  assert.match(sql, /metrica\s*=\s*'permanencia'/i);
  assert.doesNotMatch(sql, /ativar_health_score_professor_v3_config\s*\(/i);
  assert.doesNotMatch(sql, /set\s+status\s*=\s*'ativa'/i);
});
