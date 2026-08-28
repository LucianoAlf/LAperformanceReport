import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260827031300_presenca_consumidores_numericos_v2.sql';
const performanceMigrationPath =
  'supabase/migrations/20260828093000_presenca_consumidores_periodo_materializados.sql';

function migration() {
  assert.ok(existsSync(migrationPath), `migration ausente: ${migrationPath}`);
  return readFileSync(migrationPath, 'utf8');
}

function migrationCorpus() {
  return readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => !name.startsWith('20260827031300_'))
    .map((name) => readFileSync(`supabase/migrations/${name}`, 'utf8'))
    .join('\n');
}

function performanceMigration() {
  assert.ok(
    existsSync(performanceMigrationPath),
    `migration ausente: ${performanceMigrationPath}`,
  );
  return readFileSync(performanceMigrationPath, 'utf8');
}

test('camada numerica nasce exclusivamente da ocorrencia canonica v2', () => {
  const sql = migration();

  assert.match(sql, /create\s+or\s+replace\s+view\s+public\.vw_presenca_ocorrencia_metrica_v2/iu);
  assert.match(sql, /from\s+public\.vw_presenca_ocorrencia_canonica_v2\b/iu);
  assert.match(sql, /considera_frequencia_denominador/iu);
  assert.match(sql, /resultado_canonico\s+in\s*\(\s*'presente'\s*,\s*'falta'\s*,\s*'falta_justificada'\s*\)/iu);
  assert.match(sql, /considera_presenca/iu);
  assert.match(sql, /considera_falta\b/iu);
  assert.match(sql, /considera_falta_justificada/iu);

  assert.doesNotMatch(sql, /\balunos\.percentual_presenca\b/iu);
  assert.doesNotMatch(sql, /from\s+public\.aluno_presenca\b/iu);
  assert.doesNotMatch(sql, /join\s+public\.aluno_presenca\b/iu);
  assert.doesNotMatch(sql, /\baulas_emusys\.professor_presenca\b/iu);
  assert.doesNotMatch(sql, /'aula:'\s*\|\|\s*(?:p\.)?aula_emusys_id/iu);
});

test('formula publica denominador, presentes e faltas justificadas separadamente', () => {
  const sql = migration();

  assert.match(sql, /count\s*\(\s*\*\s*\)\s+filter\s*\(\s*where\s+o\.considera_frequencia_denominador\s*\)/iu);
  assert.match(sql, /count\s*\(\s*\*\s*\)\s+filter\s*\(\s*where\s+o\.considera_presenca\s*\)/iu);
  assert.match(sql, /count\s*\(\s*\*\s*\)\s+filter\s*\(\s*where\s+o\.considera_falta\s*\)/iu);
  assert.match(sql, /count\s*\(\s*\*\s*\)\s+filter\s*\(\s*where\s+o\.considera_falta_justificada\s*\)/iu);
  assert.match(sql, /presentes_observados::numeric\s*\/\s*nullif\s*\(\s*(?:\w+\.)?denominador_observado\s*,\s*0\s*\)\s*\*\s*100/iu);
  assert.match(sql, /faltas_total/iu);
});

test('dado incompleto nunca vira zero publicavel', () => {
  const sql = migration();

  assert.match(sql, /fn_presenca_pendencias_do_dia_v2/iu);
  assert.match(sql, /dados_desatualizados/iu);
  assert.match(sql, /em_auditoria/iu);
  assert.match(sql, /estado_publicacao/iu);
  assert.match(sql, /when\s+[^\n]+estado_publicacao(?:_calculado)?\s*=\s*'publicavel'\s+then\s+[^\n]+\s+else\s+null/iu);
  assert.doesNotMatch(sql, /coalesce\s*\(\s*(?:percentual_presenca|media_presenca|taxa_faltas)\s*,\s*0/iu);
});

test('frescor do periodo incorpora roster, pendencias e conflitos do contrato operacional', () => {
  const sql = migration();

  assert.match(sql, /fn_presenca_pendencias_do_dia_v2\s*\(/iu);
  assert.match(sql, /roster_em_revisao/iu);
  assert.match(sql, /bloqueado_roster/iu);
  assert.match(sql, /jsonb_array_length\s*\([^)]*pendencias/iu);
  assert.match(sql, /jsonb_array_length\s*\([^)]*conflitos/iu);
});

test('helper autenticado delega a mesma ACL de unidade da pendencia canonica', () => {
  const sql = migration();
  const helper = sql.match(
    /create\s+or\s+replace\s+function\s+public\.fn_presenca_estado_publicacao_periodo_v2[\s\S]*?\$\$;/iu,
  )?.[0] ?? '';

  assert.match(helper, /fn_presenca_pendencias_do_dia_v2\s*\(/iu);
  assert.doesNotMatch(helper, /fn_presenca_dados_frescos_interno_v1\s*\(/iu);
  assert.match(sql, /grant\s+execute[\s\S]*fn_presenca_estado_publicacao_periodo_v2[\s\S]*to\s+authenticated\s*,\s*service_role/iu);
});

test('universo vazio produz linha deterministica sem_base', () => {
  const sql = migration();

  assert.match(sql, /alvo_deterministico/iu);
  assert.match(sql, /not\s+exists\s*\(\s*select\s+1\s+from\s+observada/iu);
  assert.match(sql, /denominador_observado\s*=\s*0\s+then\s*'sem_base'/iu);
});

test('produtores ativos possuem fonte v2 ou wrapper de assinatura comprovada', () => {
  const sql = migration();
  const historico = migrationCorpus();

  for (const producer of [
    'vw_aluno_frequencia_canonica_v1',
    'get_frequencia_professor_periodo_canonica_v1',
    'get_frequencia_professor_periodo_publicavel_v1',
    'get_faltas_periodo_v2',
    'get_faltas_periodo',
    'vw_absenteismo_aluno',
    'vw_radar_aluno_sinais',
    'get_health_score_professor_v3_presenca_periodo_v2',
  ]) {
    assert.match(sql, new RegExp(`\\b${producer}\\b`, 'iu'), `${producer} sem adaptacao v2`);
  }

  assert.match(
    historico,
    /get_kpis_professor_periodo_canonico_v2[\s\S]*?get_frequencia_professor_periodo_publicavel_v1/iu,
  );
  assert.match(
    historico,
    /get_kpis_professor_periodo_canonico_v3[\s\S]*?get_kpis_professor_periodo_canonico_v2/iu,
  );
  assert.match(
    historico,
    /get_relatorio_coordenacao_canonico_v3[\s\S]*?get_kpis_professor_periodo_canonico_v3/iu,
  );
  assert.match(
    historico,
    /get_relatorio_gerencial_canonico_v1[\s\S]*?fechamento_mensal_snapshots/iu,
  );
});

test('inventario distingue redefinicao real de encadeamento indireto', () => {
  const sql = migration();
  const countCreate = (kind, name) => (
    sql.match(new RegExp(`create\\s+or\\s+replace\\s+${kind}\\s+public\\.${name}\\b`, 'giu')) ?? []
  ).length;

  for (const [kind, name] of [
    ['view', 'vw_aluno_frequencia_canonica_v1'],
    ['function', 'get_frequencia_professor_periodo_canonica_v1'],
    ['function', 'get_frequencia_professor_periodo_publicavel_v1'],
    ['function', 'get_faltas_periodo'],
    ['view', 'vw_absenteismo_aluno'],
    ['view', 'vw_radar_aluno_sinais'],
    ['function', 'get_health_score_professor_v3_presenca_periodo_v2'],
  ]) {
    assert.equal(countCreate(kind, name), 1, `${name} precisa de uma redefinicao real`);
  }

  for (const [kind, name] of [
    ['function', 'get_kpis_professor_periodo_canonico_v2'],
    ['function', 'get_kpis_professor_periodo_canonico_v3'],
    ['function', 'get_relatorio_gerencial_canonico_v1'],
    ['function', 'get_relatorio_coordenacao_canonico_v3'],
  ]) {
    assert.equal(countCreate(kind, name), 0, `${name} foi documentado como indireto e nao deve ser redefinido`);
  }

  assert.match(sql, /PRODUTORES REDEFINIDOS NESTA MIGRATION/iu);
  assert.match(sql, /PRODUTORES INDIRETOS OU PRESERVADOS/iu);
});

test('snapshots fechados e presenca do professor ficam fora da mutacao', () => {
  const sql = migration();

  assert.doesNotMatch(
    sql,
    /(?:insert\s+into|update|delete\s+from|truncate)\s+public\.health_score_professor_v3_snapshot/iu,
  );
  assert.doesNotMatch(
    sql,
    /(?:insert\s+into|update|delete\s+from|truncate)\s+public\.fechamento_mensal_snapshots/iu,
  );
  assert.doesNotMatch(sql, /professor_presenca\s*=\s*'ausente'/iu);
  assert.match(sql, /somente\s+ciclos\s+abertos\s+e\s+novas\s+materializacoes/iu);
});

test('ACL da camada v2 e explicita e nao libera anon', () => {
  const sql = migration();

  assert.match(
    sql,
    /vw_presenca_ocorrencia_metrica_v2[\s\S]*with\s*\(\s*security_barrier\s*=\s*true\s*\)/iu,
  );
  assert.match(sql, /revoke\s+all[\s\S]*vw_presenca_ocorrencia_metrica_v2[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql, /grant\s+select[\s\S]*vw_presenca_ocorrencia_metrica_v2\s+to\s+service_role/iu);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+public\.vw_presenca_ocorrencia_metrica_v2\s+to\s+authenticated/iu);
  assert.match(sql, /revoke\s+all[\s\S]*get_presenca_metricas_canonicas_v2[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql, /grant\s+execute[\s\S]*get_presenca_metricas_canonicas_v2[\s\S]*to\s+service_role/iu);
});

test('consumidores de periodo materializam cada recorte canonico uma unica vez', () => {
  const sql = performanceMigration();

  assert.match(sql, /fn_presenca_estado_publicacao_periodo_v2[\s\S]*dias_operacionais\s+as\s+materialized[\s\S]*pendencias_por_dia\s+as\s+materialized/iu);
  assert.match(sql, /fn_presenca_ocorrencias_escopo_interno_v2[\s\S]*for\s+v_data[\s\S]*vw_presenca_ocorrencia_metrica_v2[\s\S]*o\.data_aula\s*=\s*v_data/iu);
  assert.match(sql, /get_presenca_metricas_canonicas_v2[\s\S]*observada\s+as\s+materialized[\s\S]*fn_presenca_ocorrencias_escopo_interno_v2[\s\S]*frescor\s+as\s+materialized/iu);
  assert.match(sql, /get_presenca_ocorrencias_periodo_canonico_v2[\s\S]*unidades_permitidas\s+as\s+materialized[\s\S]*permitida\s+as\s+materialized[\s\S]*fn_presenca_ocorrencias_escopo_interno_v2[\s\S]*frescor\s+as\s+materialized/iu);
  assert.match(sql, /get_health_score_professor_v3_presenca_periodo_v2[\s\S]*unidades_permitidas\s+as\s+materialized[\s\S]*estado_unidade\s+as\s+materialized[\s\S]*observada\s+as\s+materialized[\s\S]*fn_presenca_ocorrencias_escopo_interno_v2/iu);
  assert.match(sql, /revoke\s+all[\s\S]*fn_presenca_ocorrencias_escopo_interno_v2[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/iu);
  assert.doesNotMatch(sql, /pg_get_functiondef|execute\s+format|information_schema/iu);
});
