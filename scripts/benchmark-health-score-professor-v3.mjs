#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function usage() {
  return `Uso seguro (ambiente nao produtivo autorizado):
  $env:DATABASE_URL='<url-nao-producao>'
  node scripts/benchmark-health-score-professor-v3.mjs \\
    --competencia YYYY-MM-01 \\
    --unit-id <uuid-1> --unit-id <uuid-2> --unit-id <uuid-3> \\
    --output <arquivo-novo.json> \\
    --confirm-non-production

Executa tres rodadas sequenciais dos quatro executores completos com
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), cada chamada dentro de BEGIN/ROLLBACK.
Isso mede materializacao, fingerprint e persistencia sem conservar writes.
O wrapper de alerta e validado separadamente e nao e disparado pelo benchmark.
A primeira rodada e apenas uma primeira observacao nao controlada; nao e cache frio.`;
}

function parseArgs(argv) {
  const args = { unitIds: [], confirmNonProduction: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--confirm-non-production') args.confirmNonProduction = true;
    else if (token === '--competencia') args.competencia = argv[++index];
    else if (token === '--unit-id') args.unitIds.push(argv[++index]);
    else if (token === '--output') args.output = argv[++index];
    else throw new Error(`Argumento desconhecido: ${token}`);
  }
  return args;
}

function assertInputs(args, databaseUrl) {
  if (args.help) return;
  if (!databaseUrl) throw new Error('DATABASE_URL e obrigatoria');
  if (!args.confirmNonProduction) {
    throw new Error('Confirme ambiente autorizado nao produtivo com --confirm-non-production');
  }
  if (!/^\d{4}-\d{2}-01$/u.test(args.competencia ?? '')) {
    throw new Error('--competencia deve usar YYYY-MM-01');
  }
  const parsedCompetencia = new Date(`${args.competencia}T00:00:00Z`);
  if (
    Number.isNaN(parsedCompetencia.valueOf())
    || parsedCompetencia.toISOString().slice(0, 10) !== args.competencia
  ) {
    throw new Error('--competencia deve ser uma data valida YYYY-MM-01');
  }
  if (args.unitIds.length !== 3) {
    throw new Error('Informe exatamente tres --unit-id');
  }
  if (new Set(args.unitIds.map((id) => id.toLowerCase())).size !== 3) {
    throw new Error('Os tres --unit-id devem ser distintos');
  }
  for (const id of args.unitIds) {
    if (!uuidPattern.test(id)) throw new Error(`--unit-id invalido: ${id}`);
  }
  if (!args.output) throw new Error('--output explicito e obrigatorio');
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync(
    'psql',
    ['--no-psqlrc', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, PGDATABASE: databaseUrl },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql falhou (${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function executorExplainSql(competencia, scope) {
  const unit = scope.unidade_id ? `${sqlLiteral(scope.unidade_id)}::uuid` : 'null::uuid';
  return `
begin;
explain (analyze, buffers, format json)
select public.executar_health_score_professor_v3_escopo_diario(
  ${sqlLiteral(competencia)}::date,
  'mensal',
  ${sqlLiteral(scope.escopo)},
  ${unit}
);
rollback;`;
}

function requiredNumber(object, field, context) {
  if (!Object.hasOwn(object, field) || typeof object[field] !== 'number') {
    throw new Error(`EXPLAIN sem campo numerico obrigatorio ${context}.${field}`);
  }
  return object[field];
}

function summarizePlan(planDocument) {
  const root = planDocument.Plan;
  return {
    planning_time_ms: requiredNumber(planDocument, 'Planning Time', 'documento'),
    execution_time_ms: requiredNumber(planDocument, 'Execution Time', 'documento'),
    shared_hit_blocks: requiredNumber(root, 'Shared Hit Blocks', 'Plan'),
    shared_read_blocks: requiredNumber(root, 'Shared Read Blocks', 'Plan'),
    shared_dirtied_blocks: requiredNumber(root, 'Shared Dirtied Blocks', 'Plan'),
    shared_written_blocks: requiredNumber(root, 'Shared Written Blocks', 'Plan'),
    temp_read_blocks: requiredNumber(root, 'Temp Read Blocks', 'Plan'),
    temp_written_blocks: requiredNumber(root, 'Temp Written Blocks', 'Plan'),
  };
}

function assertExplainDocument(parsed) {
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.Plan) {
    throw new Error('EXPLAIN nao retornou um documento JSON de plano valido');
  }
}

function readFunctionStats(databaseUrl) {
  const raw = runPsql(databaseUrl, `
    select jsonb_build_object(
      'track_functions', current_setting('track_functions'),
      'functions', coalesce(jsonb_agg(jsonb_build_object(
        'schema', schemaname,
        'function', funcname,
        'calls', calls,
        'total_time_ms', total_time,
        'self_time_ms', self_time
      ) order by schemaname, funcname), '[]'::jsonb)
    )::text
    from pg_stat_user_functions;`);
  const parsed = JSON.parse(raw);
  if (parsed.track_functions === 'none') {
    return {
      available: false,
      reason: 'track_functions=none',
      functions: [],
    };
  }
  if (!Array.isArray(parsed.functions)) {
    throw new Error('pg_stat_user_functions nao retornou array de funcoes');
  }
  for (const row of parsed.functions) {
    if (typeof row.schema !== 'string' || typeof row.function !== 'string') {
      throw new Error('pg_stat_user_functions sem identidade completa da funcao');
    }
    requiredNumber(row, 'calls', 'pg_stat_user_functions');
    requiredNumber(row, 'total_time_ms', 'pg_stat_user_functions');
    requiredNumber(row, 'self_time_ms', 'pg_stat_user_functions');
  }
  return {
    available: true,
    track_functions: parsed.track_functions,
    functions: parsed.functions,
  };
}

function dominantFunctionDelta(before, after) {
  if (!before.available) return { available: false, reason: before.reason };
  if (!after.available) return { available: false, reason: after.reason };

  const previous = new Map(before.functions.map((row) => (
    [`${row.schema}.${row.function}`, row]
  )));
  const deltas = after.functions.map((row) => {
    const old = previous.get(`${row.schema}.${row.function}`) ?? {
      calls: 0,
      total_time_ms: 0,
      self_time_ms: 0,
    };
    return {
      schema: row.schema,
      function: row.function,
      calls_delta: Number(row.calls) - Number(old.calls),
      total_time_delta_ms: Number(row.total_time_ms) - Number(old.total_time_ms),
      self_time_delta_ms: Number(row.self_time_ms) - Number(old.self_time_ms),
    };
  }).filter((row) => row.calls_delta > 0);

  if (deltas.length === 0) {
    return {
      available: false,
      reason: 'nenhum delta positivo observado em pg_stat_user_functions',
    };
  }
  deltas.sort((a, b) => (
    b.total_time_delta_ms - a.total_time_delta_ms
    || b.self_time_delta_ms - a.self_time_delta_ms
    || a.function.localeCompare(b.function)
  ));
  return { available: true, ...deltas[0] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  assertInputs(args, databaseUrl);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const scopes = [
    ...args.unitIds.map((unidadeId) => ({ escopo: 'unidade', unidade_id: unidadeId })),
    { escopo: 'consolidado', unidade_id: null },
  ];
  const measurements = [];
  for (let round = 1; round <= 3; round += 1) {
    for (const scope of scopes) {
      const statsBefore = readFunctionStats(databaseUrl);
      const raw = runPsql(databaseUrl, executorExplainSql(args.competencia, scope));
      const rawExplain = JSON.parse(raw);
      assertExplainDocument(rawExplain);
      const statsAfter = readFunctionStats(databaseUrl);
      measurements.push({
        round,
        cache_observation: round === 1
          ? 'primeira_observacao_nao_controlada'
          : 'aquecida',
        scope,
        summary: summarizePlan(rawExplain[0]),
        dominant_function_pg_stat: dominantFunctionDelta(statsBefore, statsAfter),
        raw_explain: rawExplain,
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    competencia: args.competencia,
    benchmark: 'executar_health_score_professor_v3_escopo_diario',
    environment_confirmation: 'nao_producao_autorizado',
    rounds: 3,
    sequential: true,
    transaction_policy: 'begin_explain_analyze_rollback_por_escopo',
    writes_preserved: false,
    alert_wrapper: 'validado_separadamente_nao_disparado_no_benchmark',
    scopes,
    measurements,
  };
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Benchmark gravado em ${args.output}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}\n`);
  process.exitCode = 1;
}
