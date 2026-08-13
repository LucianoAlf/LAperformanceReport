#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function usage() {
  return `Uso:
  node scripts/benchmark-health-score-professor-v3.mjs --database-url <url> [--output <arquivo>] [--allow-remote]
  node scripts/benchmark-health-score-professor-v3.mjs --container <nome> [--database <db>] [--user <usuario>] [--output <arquivo>]

Executa, sequencialmente, tres rodadas de EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
para tres unidades ativas e o consolidado. EXPLAIN ANALYZE executa a consulta.
Ambientes remotos exigem --allow-remote de forma explicita.`;
}

function parseArgs(argv) {
  const args = {
    database: 'postgres',
    user: 'postgres',
    allowRemote: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--allow-remote') args.allowRemote = true;
    else if (token === '--database-url') args.databaseUrl = argv[++index];
    else if (token === '--container') args.container = argv[++index];
    else if (token === '--database') args.database = argv[++index];
    else if (token === '--user') args.user = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else throw new Error(`Argumento desconhecido: ${token}`);
  }
  return args;
}

function assertTarget(args) {
  if (args.help) return;
  if (Boolean(args.databaseUrl) === Boolean(args.container)) {
    throw new Error('Informe exatamente um alvo: --database-url ou --container');
  }
  if (args.databaseUrl) {
    const url = new URL(args.databaseUrl);
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (!localHosts.has(url.hostname) && !args.allowRemote) {
      throw new Error('EXPLAIN ANALYZE remoto exige --allow-remote');
    }
  }
}

function runPsql(args, sql) {
  const command = args.container ? 'docker' : 'psql';
  const commandArgs = args.container
    ? [
      'exec', '-i', args.container,
      'psql', '--no-psqlrc', '-X', '-v', 'ON_ERROR_STOP=1',
      '-U', args.user, '-d', args.database, '-At',
    ]
    : [args.databaseUrl, '--no-psqlrc', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
  const result = spawnSync(command, commandArgs, {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql falhou (${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function explainSql(scope) {
  const unit = scope.unidade_id ? `${sqlLiteral(scope.unidade_id)}::uuid` : 'null::uuid';
  return `
explain (analyze, buffers, format json)
select *
from public.get_health_score_professor_v3_performance(
  date_trunc('month', current_date)::date,
  ${unit},
  'mensal'
) p
where p.escopo = ${sqlLiteral(scope.escopo)}
  and p.unidade_id is not distinct from ${unit};`;
}

function walkPlans(node, visit) {
  visit(node);
  for (const child of node.Plans ?? []) walkPlans(child, visit);
}

function summarizePlan(planDocument) {
  const root = planDocument.Plan;
  let dominant = null;
  let dominantFunction = null;
  walkPlans(root, (node) => {
    const candidate = Number(node['Actual Total Time'] ?? 0);
    if (!dominant || candidate > dominant.actual_total_time_ms) {
      dominant = {
        node_type: node['Node Type'] ?? null,
        function_name: node['Function Name'] ?? null,
        relation_name: node['Relation Name'] ?? null,
        actual_total_time_ms: candidate,
      };
    }
    if (
      node['Function Name']
      && (!dominantFunction || candidate > dominantFunction.actual_total_time_ms)
    ) {
      dominantFunction = {
        function_name: node['Function Name'],
        node_type: node['Node Type'] ?? null,
        actual_total_time_ms: candidate,
      };
    }
  });
  return {
    planning_time_ms: Number(planDocument['Planning Time'] ?? 0),
    execution_time_ms: Number(planDocument['Execution Time'] ?? 0),
    shared_hit_blocks: Number(root['Shared Hit Blocks'] ?? 0),
    shared_read_blocks: Number(root['Shared Read Blocks'] ?? 0),
    shared_dirtied_blocks: Number(root['Shared Dirtied Blocks'] ?? 0),
    shared_written_blocks: Number(root['Shared Written Blocks'] ?? 0),
    temp_read_blocks: Number(root['Temp Read Blocks'] ?? 0),
    temp_written_blocks: Number(root['Temp Written Blocks'] ?? 0),
    dominant_node: dominant,
    dominant_function: dominantFunction,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertTarget(args);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const unitRows = runPsql(args, `
    select jsonb_build_object('unidade_id', id, 'nome', nome)::text
    from public.unidades
    where ativo = true
    order by id;
  `).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  if (unitRows.length !== 3) {
    throw new Error(`Benchmark exige exatamente 3 unidades ativas; encontrado: ${unitRows.length}`);
  }

  const scopes = [
    ...unitRows.map((unit) => ({
      escopo: 'unidade',
      unidade_id: unit.unidade_id,
      unidade_nome: unit.nome,
    })),
    { escopo: 'consolidado', unidade_id: null, unidade_nome: null },
  ];
  const measurements = [];
  for (let round = 1; round <= 3; round += 1) {
    for (const scope of scopes) {
      const raw = runPsql(args, explainSql(scope));
      const parsed = JSON.parse(raw);
      assertExplainDocument(parsed);
      measurements.push({
        round,
        cache_observation: round === 1
          ? 'initial_state_uncontrolled'
          : 'warmed_by_previous_round',
        scope,
        ...summarizePlan(parsed[0]),
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    benchmark: 'health_score_professor_v3_performance',
    rounds: 3,
    sequential: true,
    analyze: true,
    scopes,
    measurements,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) writeFileSync(args.output, serialized, { flag: 'wx' });
  process.stdout.write(serialized);
}

function assertExplainDocument(parsed) {
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.Plan) {
    throw new Error('EXPLAIN nao retornou um documento JSON de plano valido');
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}\n`);
  process.exitCode = 1;
}
