import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const legacyMigrationName =
  '20260808193000_health_score_v3_cron_diario_idempotente.sql';
const resilientMaterializationMigrationName =
  '20260813151923_health_score_v3_materializacao_resiliente.sql';
const isolatedCronMigrationName =
  '20260813173236_health_score_v3_cron_escopos_isolados.sql';
const migrationPath = new URL(
  `../supabase/migrations/${legacyMigrationName}`,
  import.meta.url,
);
const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url);

function extractFinalFunctionDefinition(sql, functionName) {
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const definitions = [
    ...sql.matchAll(new RegExp(
      String.raw`create\s+or\s+replace\s+function\s+${escapedFunctionName}\s*\([\s\S]*?\)\s*returns\s+[\s\S]*?as\s+\$function\$[\s\S]*?\$function\$\s*;`,
      'giu',
    )),
  ];

  assert.ok(definitions.length > 0, `definicao ausente para ${functionName}`);
  return definitions.at(-1)[0];
}

function assertActivePathHasNoStatementTimeout(sql) {
  for (const [pattern, mechanism] of [
    [/\bstatement_timeout\b/iu, 'statement_timeout'],
    [/\bset_config\s*\(\s*['"]statement_timeout['"]/iu, 'set_config de timeout'],
    [/\bset\s+local\s+statement_timeout\b/iu, 'SET LOCAL'],
    [/\balter\s+(?:role|database)\b[^;]*\bstatement_timeout\b/iu, 'ALTER ROLE/DATABASE'],
  ]) {
    assert.doesNotMatch(sql, pattern, `caminho ativo nao pode usar ${mechanism}`);
  }
}

async function migration() {
  try {
    await access(migrationPath);
    return await readFile(migrationPath, 'utf8');
  } catch {
    return '';
  }
}

async function migrationCorretivaCronIsolado() {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{14}_.+\.sql$/u.test(name))
    .filter((name) => name > legacyMigrationName)
    .sort();

  for (const name of names) {
    const rawSql = await readFile(new URL(name, migrationsDirectory), 'utf8');
    const sql = rawSql
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/--[^\r\n]*/gu, ' ');
    if (
      /materializar-health-score-professor-v3-diario/iu.test(sql)
      && /cron\.unschedule\s*\(/iu.test(sql)
      && /cron\.schedule\s*\(/iu.test(sql)
      && /executar_health_score_professor_v3_escopo_diario\s*\(/iu.test(sql)
    ) {
      return { name, sql };
    }
  }

  return null;
}

function assertSemStatementTimeout(sql) {
  assert.doesNotMatch(
    sql,
    /\bstatement_timeout\b/iu,
    'migration de isolamento nao pode alterar statement_timeout por nenhum mecanismo',
  );
}

test('wrapper isolado chama executor final da 2A sem timeout transitivo', async () => {
  const materializationSql = await readFile(
    new URL(resilientMaterializationMigrationName, migrationsDirectory),
    'utf8',
  );
  const isolatedCronSql = await readFile(
    new URL(isolatedCronMigrationName, migrationsDirectory),
    'utf8',
  );
  const executorDefinition = extractFinalFunctionDefinition(
    materializationSql,
    'public.executar_health_score_professor_v3_escopo_diario',
  );
  const wrapperDefinition = extractFinalFunctionDefinition(
    isolatedCronSql,
    'public.executar_health_score_professor_v3_job_escopo',
  );

  assert.match(
    wrapperDefinition,
    /public\.executar_health_score_professor_v3_escopo_diario\s*\(\s*date_trunc\('month',\s*current_date\)::date,\s*'mensal',\s*v_escopo,\s*v_unidade_id\s*\)/iu,
    'wrapper 2B deve chamar a assinatura de quatro argumentos redefinida pela 2A',
  );
  assertActivePathHasNoStatementTimeout(`${wrapperDefinition}\n${executorDefinition}`);
});

test('cron diario registra fingerprint e evita nova revisao quando o retrato nao muda', async () => {
  const sql = await migration();

  assert.match(sql, /health_score_professor_v3_materializacao_execucoes/i);
  assert.match(sql, /fingerprint_fonte\s+text\s+not null/i);
  assert.match(sql, /'sem_alteracao'/i);
  assert.match(sql, /jsonb_agg\([\s\S]*order by[\s\S]*professor_id[\s\S]*metrica/i);
  assert.match(sql, /if v_fingerprint_atual is not distinct from v_fingerprint_anterior then[\s\S]*'sem_alteracao'/i);
});

test('cron usa somente as tres unidades reais, mais o consolidado explicito', async () => {
  const sql = await migration();

  assert.match(sql, /from public\.unidades[\s\S]*where ativo/i);
  assert.match(sql, /order by id/i);
  assert.match(sql, /'unidade'[\s\S]*v_unidade\.id/i);
  assert.match(sql, /'consolidado'[\s\S]*null::uuid/i);
  assert.doesNotMatch(sql, /materializar_health_score_professor_v3_periodo\([^)]*null::uuid/i);
  assert.match(sql, /where f\.escopo is distinct from v_escopo[\s\S]*or f\.unidade_id is distinct from v_unidade_id[\s\S]*HEALTH_SCORE_V3_ESCOPO_DIVERGENTE/i);
});

test('migration legada ancora mes aberto e evidencia a dependencia antiga de timeout', async () => {
  const sql = await migration();

  assert.match(sql, /date_trunc\('month',\s*current_date\)::date/i);
  assert.match(sql, /set_config\('statement_timeout',\s*'600s',\s*true\)/i);
  assert.doesNotMatch(sql, /statement_timeout',\s*'0'/i);
  assert.doesNotMatch(sql, /estado\s*=\s*'fechado'/i);
  assert.doesNotMatch(sql, /estado_publicacao\s*=\s*'oficial'/i);
});

test('migration posterior substitui o cron monolitico sem depender de timeout maior', async () => {
  const corretiva = await migrationCorretivaCronIsolado();

  assert.ok(
    corretiva,
    'migration corretiva real do cron isolado deve existir depois da ancora legada',
  );
  assert.match(corretiva.name, /^\d{14}_.+\.sql$/u);
  assert.match(
    corretiva.sql,
    /cron\.unschedule\s*\([\s\S]*materializar-health-score-professor-v3-diario/iu,
  );
  assert.match(corretiva.sql, /cron\.schedule\s*\(/iu);
  assert.doesNotMatch(
    corretiva.sql,
    /(?:insert\s+into|update|delete\s+from)\s+cron\.job\b/iu,
  );
  assertSemStatementTimeout(corretiva.sql);
  assert.match(
    corretiva.sql,
    /pg_advisory_xact_lock\s*\(/iu,
    'reconciliador deve serializar alteracoes do catalogo cron',
  );
  assert.match(
    corretiva.sql,
    /revoke\s+all\s+on\s+function\s+public\.executar_health_score_professor_v3_cron_diario\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/iu,
    'executor monolitico legado nao pode continuar como entrypoint operacional',
  );
  assert.match(
    corretiva.sql,
    /if\s+v_escopo\s*=\s*'consolidado'[\s\S]*configurar_health_score_professor_v3_cron_escopos\s*\(\s*\)[\s\S]*exception\s+when\s+others/iu,
    'wrapper consolidado deve reconciliar com falha protegida antes de materializar',
  );
});

test('cron ativa alerta somente para Alf e Hugo identificados de forma exata', async () => {
  const sql = await migration();

  assert.doesNotMatch(sql, /hugo@gmail\.com/i);
  assert.doesNotMatch(sql, /health_score_professor_v3_alerta_url/i);
  assert.match(sql, /lower\(coalesce\(u\.email,\s*''\)\)\s*=\s*'lucianoalf\.la@gmail\.com'/i);
  assert.match(sql, /lower\(coalesce\(u\.nome,\s*''\)\)\s*=\s*'hugo'/i);
  assert.doesNotMatch(sql, /like\s+'%hugo%'/i);
  assert.match(sql, /https:\/\/ouqwbbermlzqqvtqwlul\.supabase\.co\/functions\/v1\/projeto-alertas-whatsapp/i);
  assert.match(sql, /values\s*\('health_score_professor_v3_falha',\s*false,\s*0,\s*0\)/i);
});
