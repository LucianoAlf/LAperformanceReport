import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath =
  'supabase/migrations/20260718210000_health_score_v3_config_ui_gate7.sql';
const simulationGuardMigrationPath =
  'supabase/migrations/20260718211500_health_score_v3_config_simulation_guard_gate7.sql';
const typesPath = 'src/lib/healthScoreProfessorV3.ts';
const hookPath = 'src/hooks/useHealthScoreProfessorV3Config.ts';
const snapshotHookPath = 'src/hooks/useHealthScoreProfessorV3.ts';
const componentPath =
  'src/components/App/Professores/HealthScoreV3Config.tsx';
const pagePath = 'src/components/App/Professores/ProfessoresPage.tsx';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Gate 7 expoe configuracao V3 somente por RPCs guardadas', () => {
  const sql = read(migrationPath);

  for (const fn of [
    'get_health_score_professor_v3_config_ui',
    'criar_health_score_professor_v3_config_rascunho',
    'salvar_health_score_professor_v3_config_rascunho',
    'simular_health_score_professor_v3_config',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, 'i'));
  }

  assert.match(sql, /security definer/gi);
  assert.match(sql, /set search_path = public, pg_temp/gi);
  assert.match(sql, /fn_health_score_professor_v3_ator_gerenciador\(\)/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon/i);
  assert.match(sql, /grant execute[\s\S]*to authenticated, service_role/i);
});

test('rascunho clona a versao ativa sem permitir edicao retroativa', () => {
  const sql = read(migrationPath);

  assert.match(sql, /status = 'ativa'/i);
  assert.match(sql, /max\(c\.versao\)[\s\S]*\+ 1/i);
  assert.match(sql, /insert into public\.health_score_professor_v3_config_versoes/i);
  assert.match(sql, /insert into public\.health_score_professor_v3_config_metricas/i);
  assert.match(sql, /where m\.config_id = v_origem\.id/i);
  assert.match(sql, /status[^\n]*'rascunho'/i);
});

test('salvamento valida seis pilares e soma de pesos cem', () => {
  const sql = read(migrationPath);

  assert.match(sql, /jsonb_array_length\(p_metricas\) <> 6/i);
  assert.match(sql, /count\(distinct[\s\S]*metrica\)[\s\S]*<> 6/i);
  assert.match(sql, /sum\([^)]+peso[^)]*\)[\s\S]*<> 100/i);
  assert.match(sql, /peso[\s\S]*between 1 and 100/i);
  assert.match(sql, /meta[\s\S]*null[\s\S]*> 0/i);
});

test('simulacao recalcula nota e classificacao sem publicar snapshot', () => {
  const sql = read(migrationPath);

  assert.match(sql, /valor_bruto\s*\/\s*[^\n]*meta\s*\*\s*100/i);
  assert.match(sql, /faixa_saudavel_min/i);
  assert.match(sql, /faixa_atencao_min/i);
  assert.match(sql, /jsonb_build_object\([\s\S]*saudaveis/i);
  assert.doesNotMatch(sql, /insert into public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /update public\.health_score_professor_v3_snapshots/i);
});

test('ativacao exige simulacao persistida da mesma revisao do rascunho', () => {
  const sql = read(simulationGuardMigrationPath);

  assert.match(sql, /create table if not exists public\.health_score_professor_v3_config_simulacoes/i);
  assert.match(sql, /config_fingerprint/i);
  assert.match(sql, /insert into public\.health_score_professor_v3_config_simulacoes/i);
  assert.match(sql, /fn_health_score_professor_v3_config_fingerprint\(p_config_id\)/i);
  assert.match(sql, /simulacao atual obrigatoria antes da ativacao/i);
  assert.match(sql, /revoke all on table public\.health_score_professor_v3_config_simulacoes/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[\s\S]*health_score_professor_v3_config_simulacoes/i);
});

test('tipos V3 separam peso meta valor real e nota nos seis pilares', () => {
  const source = read(typesPath);

  for (const metric of [
    'retencao',
    'permanencia',
    'conversao',
    'media_turma',
    'numero_alunos',
    'presenca',
  ]) {
    assert.match(source, new RegExp(`'${metric}'`));
  }

  assert.match(source, /peso:\s*number/i);
  assert.match(source, /meta:\s*number\s*\|\s*null/i);
  assert.match(source, /valorBruto:\s*number\s*\|\s*null/i);
  assert.match(source, /nota:\s*number\s*\|\s*null/i);
  assert.doesNotMatch(source, /taxaCrescimento|evasoes/i);
});

test('hook V3 usa RPC e nunca acessa as tabelas internas diretamente', () => {
  const source = read(hookPath);

  for (const fn of [
    'get_health_score_professor_v3_config_ui',
    'criar_health_score_professor_v3_config_rascunho',
    'salvar_health_score_professor_v3_config_rascunho',
    'simular_health_score_professor_v3_config',
  ]) {
    assert.match(source, new RegExp(`rpc\\('${fn}'`));
  }

  assert.doesNotMatch(source, /\.from\(['"]health_score_professor_v3_/i);
});

test('hook de snapshot V3 preserva null sem fallback para V2 ou zero', () => {
  const source = read(snapshotHookPath);

  assert.match(source, /get_health_score_professor_v3_snapshot_ui/i);
  assert.match(source, /valorBruto:\s*row\.valor_bruto\s*\?\?\s*null/i);
  assert.match(source, /nota:\s*row\.nota\s*\?\?\s*null/i);
  assert.doesNotMatch(source, /get_kpis_professor_periodo|DEFAULT_HEALTH_WEIGHTS/i);
});

test('painel V3 mantem sliders de peso e inputs separados de meta', () => {
  const source = read(componentPath);

  assert.match(source, /type="range"/i);
  assert.match(source, /type="number"/i);
  assert.match(source, /Peso no score/i);
  assert.match(source, /Meta de desempenho/i);
  assert.match(source, /Criar rascunho/i);
  assert.match(source, /Simular impacto/i);
  assert.match(source, /Ativar vers[aã]o/i);
  assert.match(source, /totalWeight[^\n]*100/i);
});

test('pagina protege V3 por feature flag e permissao sem remover V2', () => {
  const source = read(pagePath);

  assert.match(source, /VITE_HEALTH_SCORE_V3_CONFIG_ENABLED/i);
  assert.match(source, /hasPermission\('professores\.editar'\)/i);
  assert.match(source, /<HealthScoreV3Config/i);
  assert.match(source, /<HealthScoreConfig/i);
});
