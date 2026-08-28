import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const suffix = '_presenca_professores_periodo_set_based.sql';
const scopedSuffix = '_presenca_ocorrencia_canonica_escopada.sql';
const publishSuffix = '_presenca_ocorrencia_canonica_escopada_publicacao.sql';
const parametersSuffix = '_presenca_ocorrencia_canonica_escopada_parametros.sql';
const literalPlanSuffix = '_presenca_ocorrencia_canonica_escopada_plano_literal.sql';
const materializedAggregatesSuffix = '_presenca_ocorrencia_agregados_materializados.sql';
const setBasedPublicationStateSuffix = '_presenca_estado_periodo_set_based.sql';
const singleSliceMetricsSuffix = '_presenca_metricas_recorte_unico.sql';

function migration() {
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith(suffix));
  assert.equal(files.length, 1, `esperava uma migration *${suffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

function definition(sql, name) {
  const normalized = sql.toLowerCase();
  const start = normalized.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} nao foi redefinida`);
  const end = normalized.indexOf('$function$;', start);
  assert.notEqual(end, -1, `${name} sem terminador`);
  return sql.slice(start, end + '$function$;'.length);
}

function scopedMigration() {
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith(scopedSuffix));
  assert.equal(files.length, 1, `esperava uma migration *${scopedSuffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

function publishMigration() {
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith(publishSuffix));
  assert.equal(files.length, 1, `esperava uma migration *${publishSuffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

function parametersMigration() {
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith(parametersSuffix));
  assert.equal(files.length, 1, `esperava uma migration *${parametersSuffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

function literalPlanMigration() {
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith(literalPlanSuffix));
  assert.equal(files.length, 1, `esperava uma migration *${literalPlanSuffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

function materializedAggregatesMigration() {
  const files = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith(materializedAggregatesSuffix));
  assert.equal(files.length, 1, `esperava uma migration *${materializedAggregatesSuffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

function setBasedPublicationStateMigration() {
  const files = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith(setBasedPublicationStateSuffix));
  assert.equal(files.length, 1, `esperava uma migration *${setBasedPublicationStateSuffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

function singleSliceMetricsMigration() {
  const files = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith(singleSliceMetricsSuffix));
  assert.equal(files.length, 1, `esperava uma migration *${singleSliceMetricsSuffix}`);
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8');
}

test('recorte canonico de ocorrencias consulta o periodo uma unica vez', () => {
  const sql = migration();
  const fn = definition(sql, 'fn_presenca_ocorrencias_escopo_interno_v2');

  assert.match(fn, /o\.data_aula\s+between\s+p_data_inicio\s+and\s+p_data_fim/iu);
  assert.doesNotMatch(fn, /generate_series|for\s+v_data/iu);
  assert.match(fn, /p_data_fim\s*-\s*p_data_inicio\s*>\s*370/iu);
  assert.match(fn, /stable\s+security\s+definer/iu);
});

test('frequencia descobre unidades sem varrer a view de presenca', () => {
  const sql = migration();
  const fn = definition(sql, 'get_frequencia_professor_periodo_canonica_v1');
  const unidades = fn.match(/unidades_alvo\s+as\s*\([\s\S]*?\)\s*,\s*metricas\s+as/iu)?.[0] ?? '';

  assert.match(unidades, /from\s+public\.unidades\s+u/iu);
  assert.doesNotMatch(unidades, /vw_presenca_ocorrencia_metrica_v2/iu);
  assert.match(unidades, /p_unidade_id\s+is\s+null\s+or\s+u\.id\s*=\s*p_unidade_id/iu);
  assert.match(unidades, /public\.is_admin\s*\(\s*\)/iu);
  assert.match(unidades, /public\.get_user_unidade_ids\s*\(\s*\)/iu);
  assert.match(fn, /get_presenca_metricas_canonicas_v2/iu);
});

test('hotfix preserva fronteiras e nao altera dados nem a view canonica', () => {
  const sql = migration();

  assert.doesNotMatch(sql, /create\s+or\s+replace\s+view/iu);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from|truncate)\s+public\./iu);
  assert.match(sql, /revoke\s+all[\s\S]*fn_presenca_ocorrencias_escopo_interno_v2[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/iu);
  assert.match(sql, /grant\s+execute[\s\S]*fn_presenca_ocorrencias_escopo_interno_v2[\s\S]*to\s+service_role/iu);
  assert.match(sql, /grant\s+execute[\s\S]*get_frequencia_professor_periodo_canonica_v1[\s\S]*to\s+authenticated\s*,\s*service_role/iu);
});

test('kernel canonico aplica unidade e periodo antes de resolver os slots', () => {
  scopedMigration();
  parametersMigration();
  const sql = literalPlanMigration();
  const fn = definition(sql, 'fn_presenca_ocorrencia_canonica_escopada_v2');

  assert.match(fn, /ae\.unidade_id\s*=\s*%L::uuid/iu);
  assert.match(fn, /ae\.data_aula\s+between\s+%L::date\s+and\s+%L::date/iu);
  assert.match(fn, /ap\.unidade_id\s*=\s*%L::uuid/iu);
  assert.match(fn, /ap\.data_aula\s+between\s+%L::date\s+and\s+%L::date/iu);
  assert.doesNotMatch(fn, /p_unidade_id\s+is\s+null\s+or\s+ae\.unidade_id/iu);
  assert.doesNotMatch(fn, /p_data_inicio\s+is\s+null\s+or\s+ae\.data_aula/iu);
  assert.match(fn, /language\s+plpgsql/iu);
  assert.match(fn, /return\s+query\s+execute\s+format/iu);
  assert.match(fn, /PRESENCA_ESCOPO_INTERNO_INVALIDO/iu);
});

test('recorte publica o kernel escopado sem reescrever a view compartilhada', () => {
  const sql = publishMigration();
  const wrapper = definition(sql, 'fn_presenca_ocorrencias_escopo_interno_v2');

  assert.doesNotMatch(sql, /create\s+or\s+replace\s+view\s+public\.vw_presenca_ocorrencia_canonica_v2/iu);
  assert.match(wrapper, /data_aula\s+is\s+distinct\s+from[\s\S]*at\s+time\s+zone\s+'America\/Sao_Paulo'/iu);
  assert.match(wrapper, /vw_presenca_ocorrencia_metrica_v2/iu);
  assert.match(wrapper, /fn_presenca_ocorrencia_canonica_escopada_v2/iu);
  assert.match(sql, /set\s+plan_cache_mode\s*=\s*'force_custom_plan'/iu);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from|truncate)\s+public\./iu);
});

test('agregados canonicos sao calculados uma vez por recorte', () => {
  const sql = materializedAggregatesMigration();
  const fn = definition(sql, 'fn_presenca_ocorrencia_canonica_escopada_v2');

  assert.match(fn, /agregada_regular\s+as\s+materialized\s*\(/iu);
  assert.match(fn, /agregada_multidata\s+as\s+materialized\s*\(/iu);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+view/iu);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from|truncate)\s+public\./iu);
});

test('estado de publicacao do periodo deixa de recalcular cada dia', () => {
  const sql = setBasedPublicationStateMigration();
  const fn = definition(sql, 'fn_presenca_estado_publicacao_periodo_v2');

  assert.doesNotMatch(fn, /fn_presenca_pendencias_do_dia_v2/iu);
  assert.match(fn, /fn_presenca_ocorrencias_escopo_interno_v2\s*\([\s\S]*p_data_inicio[\s\S]*p_data_fim/iu);
  assert.match(fn, /dias_operacionais\s+as\s+materialized/iu);
  assert.match(fn, /respostas_por_dia\s+as\s+materialized/iu);
  assert.match(sql, /grant\s+execute[\s\S]*fn_presenca_estado_publicacao_periodo_v2[\s\S]*to\s+authenticated\s*,\s*service_role/iu);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from|truncate)\s+public\./iu);
});

test('metricas e publicacao compartilham o mesmo recorte canonico', () => {
  const sql = singleSliceMetricsMigration();
  const fn = definition(sql, 'get_presenca_metricas_canonicas_v2');
  const chamadas = fn.match(/fn_presenca_ocorrencias_escopo_interno_v2\s*\(/giu) ?? [];

  assert.equal(chamadas.length, 1);
  assert.doesNotMatch(fn, /fn_presenca_estado_publicacao_periodo_v2/iu);
  assert.match(fn, /ocorrencias\s+as\s+materialized/iu);
  assert.match(fn, /observada\s+as\s+materialized/iu);
  assert.match(fn, /respostas_por_dia\s+as\s+materialized/iu);
  assert.match(sql, /grant\s+execute[\s\S]*get_presenca_metricas_canonicas_v2[\s\S]*to\s+service_role/iu);
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*get_presenca_metricas_canonicas_v2[\s\S]*to\s+(?:anon|authenticated)/iu);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from|truncate)\s+public\./iu);
});
