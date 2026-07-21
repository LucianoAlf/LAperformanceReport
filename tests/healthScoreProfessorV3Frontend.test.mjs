import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath =
  'supabase/migrations/20260718210000_health_score_v3_config_ui_gate7.sql';
const simulationGuardMigrationPath =
  'supabase/migrations/20260718211500_health_score_v3_config_simulation_guard_gate7.sql';
const segmentedConfigMigrationPath =
  'supabase/migrations/20260719204000_health_score_v3_config_segmentada_rpc.sql';
const modalMigrationPath =
  'supabase/migrations/20260718223000_health_score_v3_modal_gate8.sql';
const modalObservationMigrationPath =
  'supabase/migrations/20260718233000_health_score_v3_gate8_observacoes.sql';
const modalObservationPerformanceMigrationPath =
  'supabase/migrations/20260718234000_health_score_v3_gate8_observacoes_performance.sql';
const modalObservationAuditMigrationPath =
  'supabase/migrations/20260718235000_health_score_v3_gate8_presenca_auditoria.sql';
const typesPath = 'src/lib/healthScoreProfessorV3.ts';
const hookPath = 'src/hooks/useHealthScoreProfessorV3Config.ts';
const snapshotHookPath = 'src/hooks/useHealthScoreProfessorV3.ts';
const componentPath =
  'src/components/App/Professores/HealthScoreV3Config.tsx';
const pagePath = 'src/components/App/Professores/ProfessoresPage.tsx';
const modalPath =
  'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx';

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

test('Task 6 evolui o contrato RPC sem expor tabelas segmentadas ao browser', () => {
  assert.equal(
    fs.existsSync(segmentedConfigMigrationPath),
    true,
    `${segmentedConfigMigrationPath} deve existir`,
  );
  const sql = read(segmentedConfigMigrationPath);

  assert.match(sql, /'metas_segmentadas'/i);
  assert.match(sql, /'pendencias'/i);
  assert.match(
    sql,
    /salvar_health_score_professor_v3_config_rascunho\s*\([\s\S]*p_metas_segmentadas\s+jsonb/i,
  );
  assert.match(sql, /segmentada_unidade_curso_modalidade/i);
  assert.match(sql, /security\s+definer/gi);
  assert.match(sql, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/gi);
  assert.match(sql, /fn_health_score_professor_v3_ator_gerenciador\s*\(\s*\)/i);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:all|select|insert|update|delete)[\s\S]*on\s+table\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
  );
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

  assert.match(source, /get_health_score_professor_v3_snapshot_modal/i);
  assert.match(source, /valorBruto:\s*row\.valor_bruto\s*\?\?\s*null/i);
  assert.match(source, /nota:\s*row\.nota\s*\?\?\s*null/i);
  assert.doesNotMatch(source, /get_kpis_professor_periodo|DEFAULT_HEALTH_WEIGHTS/i);
});

test('painel V3 mantem sliders de peso e inputs separados de meta', () => {
  const source = read(componentPath);

  assert.match(source, /<Slider\b/);
  assert.doesNotMatch(source, /type="range"/i);
  assert.match(source, /type="number"/i);
  assert.match(source, /Peso no score/i);
  assert.match(source, /Meta de desempenho/i);
  assert.match(source, /Criar rascunho/i);
  assert.match(source, /Salvar altera[cç][oõ]es/i);
  assert.match(source, /altera[cç][oõ]es n[aã]o salvas/i);
  assert.match(source, /Rascunho salvo/i);
  assert.match(source, /sticky top-20/i);
  assert.match(source, /<section[\s\S]{0,180}className="relative rounded-lg/i);
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

test('Gate 8 cria leitura auditavel e sem ambiguidade entre unidade e consolidado', () => {
  const sql = read(modalMigrationPath);

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_snapshot_modal/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public, pg_temp/i);
  assert.match(sql, /fn_health_score_professor_v3_ator_gerenciador\(\)/i);
  assert.match(sql, /s\.unidade_id\s+is\s+not\s+distinct\s+from\s+p_unidade_id/i);
  for (const field of [
    'numerador',
    'denominador',
    'fonte',
    'regra_versao_metrica',
    'detalhes',
    'motivo_bloqueio',
    'trimestre_inicio',
  ]) {
    assert.match(sql, new RegExp(field, 'i'));
  }
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]*to authenticated, service_role/i);
});

test('hook do modal preserva valor e evidencia V3 sem fallback numerico', () => {
  const source = read(snapshotHookPath);

  assert.match(source, /get_health_score_professor_v3_snapshot_modal/i);
  assert.match(source, /numerador:\s*row\.numerador\s*\?\?\s*null/i);
  assert.match(source, /denominador:\s*row\.denominador\s*\?\?\s*null/i);
  assert.match(source, /detalhes:\s*row\.detalhes\s*\?\?\s*\{\}/i);
  assert.match(source, /valorBruto:\s*row\.valor_bruto\s*\?\?\s*null/i);
  assert.match(source, /nota:\s*row\.nota\s*\?\?\s*null/i);
  assert.doesNotMatch(source, /get_kpis_professor_periodo|DEFAULT_HEALTH_WEIGHTS/i);
});

test('hook do modal descarta resposta obsoleta ao trocar professor ou unidade', () => {
  const source = read(snapshotHookPath);

  assert.match(source, /useRef/i);
  assert.match(source, /requestIdRef\.current/i);
  assert.match(source, /requestId\s*!==\s*requestIdRef\.current/i);
  assert.match(source, /return\s*\(\)\s*=>\s*\{[\s\S]*requestIdRef\.current\s*\+=\s*1/i);
});

test('hook do modal nao expoe metricas do recorte anterior durante nova carga', () => {
  const source = read(snapshotHookPath);

  assert.match(source, /requestKey/i);
  assert.match(source, /loadedRequestKey/i);
  assert.match(source, /loadedRequestKey\s*===\s*requestKey\s*\?\s*metrics\s*:\s*\[\]/i);
  assert.match(source, /loading:\s*loading\s*\|\|\s*\([^\n]*loadedRequestKey\s*!==\s*requestKey\)/i);
});

test('Gate 8 preserva valor observado de presenca sem antecipar pontuacao de agosto', () => {
  const sql = read(modalObservationMigrationPath);

  assert.match(sql, /create or replace function public\.get_professor_presenca_v3_sombra/i);
  assert.match(sql, /valor_observado/i);
  assert.match(sql, /cobertura_observada/i);
  assert.match(sql, /observado_fora_score/i);
  assert.match(sql, /s\.data_aula\s*>=\s*date\s*'2026-08-03'/i);
  assert.match(sql, /vigencia_pontuavel[^\n]*2026-08-03/i);
});

test('observacao de presenca resolve identidade uma vez antes de materializar a rede', () => {
  const sql = read(modalObservationPerformanceMigrationPath);

  assert.match(sql, /identidade_mapa\s+as\s+materialized/i);
  assert.match(sql, /unnest\(i\.aluno_ids_locais\)/i);
  assert.doesNotMatch(sql, /=\s*any\(i\.aluno_ids_locais\)/i);
});

test('presenca observada respeita politica versionada de auditoria por unidade', () => {
  const sql = read(modalObservationAuditMigrationPath);

  assert.match(sql, /presenca_politicas_confiabilidade/i);
  assert.match(sql, /exige_revisao_operacional/i);
  assert.match(
    sql,
    /observacao_esperados_stats\s+as\s*\([\s\S]*?bool_or\(e\.observacao_exige_auditoria\)\s+as\s+exige_revisao_operacional/i,
  );
  assert.match(sql, /observacao_publicacao/i);
  assert.match(sql, /em_auditoria/i);
});

test('modal nao publica percentual observado quando a politica exige auditoria', () => {
  const source = read(modalPath);

  assert.match(source, /observacao_publicacao/i);
  assert.match(source, /Em auditoria/i);
  assert.match(source, /preservado para auditoria/i);
});

test('modal individual alterna V3 por flag e exibe base cobertura e recorte', () => {
  const source = read(modalPath);

  assert.match(source, /VITE_HEALTH_SCORE_V3_MODAL_ENABLED/i);
  assert.match(source, /VITE_HEALTH_SCORE_V3_MODAL_ENABLED[\s\S]*!==\s*['"]false['"]/i);
  assert.match(source, /useHealthScoreProfessorV3/i);
  assert.match(source, /Health Score parcial/i);
  assert.match(source, /Sem base/i);
  assert.match(source, /Amostra/i);
  assert.match(source, /Cobertura/i);
  assert.match(source, /Recorte/i);
  assert.match(source, /motivoSemBase/i);
  assert.match(source, /HEALTH_SCORE_V3_MODAL_ENABLED\s*\?/i);
  assert.match(source, /calcularHealthScore/i);
});

test('modal distingue valor observado de valor pontuavel nos pilares incompletos', () => {
  const source = read(modalPath);

  assert.match(source, /alunos_fechamento/i);
  assert.match(source, /valor_observado/i);
  assert.match(source, /Valor observado/i);
  assert.match(source, /Fechamentos:\s*\$\{formatV3BaseNumber\(meses\)\}\/3/i);
  assert.match(source, /Eventos classificados:\s*\$\{formatV3BaseNumber\(classificados\)\}\/\$\{formatV3BaseNumber\(esperados\)\}/i);
  assert.match(source, /observed\?\.evidenceLabel\s*\?\?/i);
  assert.match(source, /fora do score/i);
  assert.match(source, /pontua[cç][aã]o.*03\/08/i);
});
