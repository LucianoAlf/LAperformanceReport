import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260806143100_health_score_v3_performance_snapshot_reader_legacy_metric_roles.sql',
  import.meta.url,
);
const historicalReaderMigrationPath = new URL(
  '../supabase/migrations/20260813204212_health_score_v3_historico_leitura_nao_bloqueante.sql',
  import.meta.url,
);

test('leitor histórico entrega retratos provisórios sem promovê-los a oficiais', async () => {
  const sql = await readFile(historicalReaderMigrationPath, 'utf8');

  assert.match(sql, /get_health_score_professor_v3_performance_snapshot_v1/i);
  assert.match(sql, /estado\s+in\s*\(\s*'fechado'\s*,\s*'provisorio'\s*,\s*'em_maturacao'\s*\)/i);
  assert.match(sql, /estado_publicacao\s+in\s*\(\s*'oficial'\s*,\s*'parcial'\s*,\s*'sem_base'\s*\)/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
});

test('leitor direto usa somente snapshots e preserva o contrato operacional', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const baseSql = await readFile(
    new URL('../supabase/migrations/20260806143000_health_score_v3_performance_snapshot_reader.sql', import.meta.url),
    'utf8',
  );
  const readerSql = `${baseSql}\n${sql}`;

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_performance_snapshot_v2\s*\(/i);
  assert.match(readerSql, /health_score_professor_v3_snapshots/i);
  assert.match(readerSql, /health_score_professor_v3_snapshot_metricas/i);
  assert.doesNotMatch(readerSql, /from\s+public\.get_health_score_professor_v3_performance\s*\(/i);
  assert.doesNotMatch(readerSql, /materializar_health_score_professor_v3_periodo/i);

  for (const field of [
    'retrato_calculado_em',
    'retrato_execucao_id',
    'retrato_estado',
    'retrato_defasagem_minutos',
  ]) {
    assert.match(readerSql, new RegExp(field, 'i'));
  }

  assert.match(readerSql, /p_competencia\s*=\s*date_trunc\('month',\s*current_date\)::date/i);
  assert.match(readerSql, /estado\s+in\s*\('provisorio',\s*'em_maturacao'\)/i);
  assert.match(readerSql, /estado_publicacao\s*=\s*'oficial'/i);
  assert.match(readerSql, /estado\s*=\s*'fechado'/i);
  assert.match(readerSql, /row_number\(\)\s+over\s*\([\s\S]*revisao desc/i);
  assert.match(sql, /grant execute on function public\.get_health_score_professor_v3_performance_snapshot_v2[\s\S]*authenticated, service_role/i);
  assert.match(sql, /coalesce\(\s*r\.papel,\s*case r\.metrica\s*when 'numero_alunos' then 'diagnostico' else 'nota' end\s*\)/i);
  assert.match(baseSql, /m\.ranking_habilitado, m\.config_versao, m\.revisao, m\.score,\s*m\.cobertura,/i);
  assert.match(sql, /o\.cobertura_snapshot,\s*r\.pilares_validos/i);
  assert.match(sql, /o\.cobertura_snapshot,/i);
});

test('frontend consulta o leitor rapido de snapshot e nunca o produtor vivo', async () => {
  const hook = await readFile(
    new URL('../src/hooks/useHealthScoreProfessorV3Performance.ts', import.meta.url),
    'utf8',
  );
  const contract = await readFile(
    new URL('../src/lib/healthScoreProfessorV3Performance.ts', import.meta.url),
    'utf8',
  );
  const tab = await readFile(
    new URL('../src/components/App/Professores/TabPerformanceProfessores.tsx', import.meta.url),
    'utf8',
  );

  assert.match(hook, /supabase\.rpc\(\s*['"]get_health_score_professor_v3_performance_snapshot_v3['"]/i);
  assert.doesNotMatch(hook, /supabase\.rpc\(\s*['"]get_health_score_professor_v3_performance['"]/i);
  assert.doesNotMatch(hook, /for\s*\(const unidade of unidades/i);

  assert.match(contract, /retratoCalculadoEm:\s*string\s*\|\s*null/i);
  assert.match(contract, /retratoExecucaoId:\s*string\s*\|\s*null/i);
  assert.match(contract, /retratoEstado:\s*string\s*\|\s*null/i);
  assert.match(contract, /retratoDefasagemMinutos:\s*number\s*\|\s*null/i);

  assert.match(tab, /retratoCalculadoEm/i);
  assert.match(tab, /Tentar novamente/i);
  assert.match(tab, /healthV3Error\s*\?\s*\[\]\s*:\s*mergeHealthScoreV3ActiveRoster/i);
  assert.match(tab, /healthV3SnapshotCoverageIncomplete/i);
  assert.match(tab, /Retrato incompleto/i);
});

test('cobertura parcial mantém a tabela visível e sinaliza a lacuna sem bloquear o roster', async () => {
  const tab = await readFile(
    new URL('../src/components/App/Professores/TabPerformanceProfessores.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    tab,
    /healthV3Error\s*\|\|\s*healthV3SnapshotUnavailable\s*\|\|\s*healthV3SnapshotCoverageIncomplete/,
  );
  assert.match(
    tab,
    /healthV3SnapshotUnavailable\s*\|\|\s*healthV3SnapshotCoverageIncomplete\s*\)\s*&&\s*\(/,
  );
  assert.match(tab, /mergeHealthScoreV3ActiveRoster\(\{/i);
});

test('leitor v3 evita a normalizacao legada quando o retrato ja possui papel', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260806190200_health_score_v3_performance_snapshot_reader_fastpath.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_performance_snapshot_v3\s*\(/i);
  assert.match(sql, /get_health_score_professor_v3_performance_snapshot_v1\(/i);
  assert.match(sql, /get_health_score_professor_v3_performance_snapshot_v2\(/i);
  assert.match(sql, /bool_or\(papel is null\)/i);
  assert.match(sql, /where not e\.tem_papel_ausente/i);
  assert.match(sql, /where e\.tem_papel_ausente/i);
});

test('leitor de snapshot devolve linhas em ordem deterministica por professor e pilar', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260808194000_health_score_v3_snapshot_reader_ordem_estavel.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_performance_snapshot_v3\s*\(/i);
  assert.match(sql, /select \* from leitura[\s\S]*order by professor_id, metrica/i);
  assert.doesNotMatch(sql, /get_health_score_professor_v3_performance\s*\(/i);
});

test('materializador por escopo delega unidade para o produtor canônico e impede consolidado de repetir unidades', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260806190000_health_score_v3_materializador_escopo_explicito.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /create or replace function public\.materializar_health_score_professor_v3_escopo/i);
  assert.match(sql, /p_escopo\s+text/i);
  assert.match(sql, /v_escopo\s+not\s+in\s*\('unidade',\s*'consolidado'\)/i);
  assert.match(sql, /v_escopo\s*=\s*'unidade'\s+and\s+p_unidade_id\s+is\s+null/i);
  assert.match(sql, /v_escopo\s*=\s*'consolidado'\s+and\s+p_unidade_id\s+is\s+not\s+null/i);
  assert.match(
    sql,
    /if v_escopo = 'unidade' then[\s\S]*materializar_health_score_professor_v3_periodo\(\s*v_competencia,\s*p_periodicidade,\s*p_unidade_id,\s*p_professor_id\s*\)/i,
  );
  assert.match(sql, /get_health_score_professor_v3_performance\(/i);
  assert.match(sql, /v_unidade_id\s*:=\s*case\s+when\s+v_escopo\s*=\s*'unidade'\s+then\s+p_unidade_id\s+else\s+null::uuid\s+end/i);
  assert.match(sql, /f\.escopo\s+is\s+distinct\s+from\s+v_escopo/i);
  assert.match(sql, /v_estado_snapshot\s*:=\s*case when exists/i);
  assert.match(sql, /when v_linha\.score is null then 'sem_base'/i);
  assert.match(sql, /when v_linha\.score >= v_config\.faixa_saudavel_min then 'saudavel'/i);
  assert.match(sql, /v_linha\.score is not null/i);
});

test('modal detalhado de quatro argumentos le o mesmo retrato sem recalculo vivo', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260806190100_health_score_v3_snapshot_modal_reader.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_snapshot_modal\(/i);
  assert.match(sql, /p_periodicidade text/i);
  assert.match(sql, /get_health_score_professor_v3_performance_snapshot_v2\(/i);
  assert.doesNotMatch(sql, /get_health_score_professor_v3_performance\s*\(/i);
  assert.match(sql, /where p\.professor_id\s*=\s*p_professor_id/i);
});
