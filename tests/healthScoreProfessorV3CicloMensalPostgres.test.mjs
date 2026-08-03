import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql',
);
const configMigrationPath = path.join(
  root,
  'supabase/migrations/20260803215000_health_score_v3_config_comparabilidade.sql',
);
const periodMigrationPath = path.join(
  root,
  'supabase/migrations/20260719120000_health_score_v3_ciclos_publicacao_parcial.sql',
);

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = psql(container, 'select 1;');
    if (ready.status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 2) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

function extractFunction(sql, functionName) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\(`,
    'i',
  );
  const start = sql.search(pattern);
  assert.notEqual(start, -1, `funcao ${functionName} deve existir`);
  const taggedBodyStart = sql.indexOf('$function$', start);
  const plainBodyStart = sql.indexOf('$$', start);
  const delimiter =
    taggedBodyStart !== -1 && (plainBodyStart === -1 || taggedBodyStart < plainBodyStart)
      ? '$function$'
      : '$$';
  const bodyStart = sql.indexOf(delimiter, start);
  const end = sql.indexOf(`${delimiter};`, bodyStart + delimiter.length);
  assert.notEqual(bodyStart, -1, `corpo de ${functionName} deve existir`);
  assert.notEqual(end, -1, `fim de ${functionName} deve existir`);
  return sql.slice(start, end + `${delimiter};`.length);
}

test('PostgreSQL normaliza 55 de 90 para 61.1 e aplica o corte versionado', async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration mensal/ciclo ainda nao existe');
  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-cobertura-${process.pid}`;
  const start = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(start.status, 0, start.stderr || start.stdout);

  try {
    await waitForPostgres(container);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const coverage = extractFunction(
      migration,
      'calcular_health_score_professor_v3_cobertura_normalizada',
    );
    const configMigration = fs.readFileSync(configMigrationPath, 'utf8');
    const comparability = extractFunction(
      configMigration,
      'avaliar_health_score_professor_v3_comparabilidade',
    );
    const setup = psql(container, `create schema if not exists public;\n${coverage}\n${comparability}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const result = psql(container, `
      with casos(nome, disponivel, total, pilares, fidelizacao, pilares_minimos) as (
        values
          ('matheus_reis', 55::numeric, 90::numeric, 3, true, 3),
          ('pedro_sergio', 55::numeric, 90::numeric, 3, true, 3),
          ('willer', 55::numeric, 90::numeric, 3, true, 3),
          ('matheus_corte4', 55::numeric, 90::numeric, 3, true, 4),
          ('jeyson', 40::numeric, 90::numeric, 2, true, 3),
          ('adriana', 15::numeric, 90::numeric, 1, true, 3)
      )
      select jsonb_object_agg(
        nome,
        jsonb_build_object(
          'cobertura', public.calcular_health_score_professor_v3_cobertura_normalizada(
            disponivel, total
          ),
          'avaliacao', public.avaliar_health_score_professor_v3_comparabilidade(
            100,
            public.calcular_health_score_professor_v3_cobertura_normalizada(disponivel, total),
            pilares,
            fidelizacao,
            60,
            pilares_minimos,
            true
          )
        )
      )::text
      from casos;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.matheus_reis.cobertura, 61.1);
    assert.equal(payload.matheus_reis.avaliacao.estado, 'comparavel');
    assert.equal(payload.pedro_sergio.avaliacao.estado, 'comparavel');
    assert.equal(payload.willer.avaliacao.estado, 'comparavel');
    assert.equal(payload.matheus_corte4.avaliacao.estado, 'em_maturacao');
    assert.equal(payload.jeyson.cobertura, 44.4);
    assert.equal(payload.jeyson.avaliacao.estado, 'em_maturacao');
    assert.equal(payload.adriana.avaliacao.estado, 'em_maturacao');
  } finally {
    docker(['stop', container]);
  }
});

test('PostgreSQL resolve os quatro ciclos fixos inclusive Dez-Jan-Fev', async (t) => {
  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-periodos-${process.pid}`;
  const start = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(start.status, 0, start.stderr || start.stdout);

  try {
    await waitForPostgres(container);
    const periodMigration = fs.readFileSync(periodMigrationPath, 'utf8');
    const periodFunction = extractFunction(periodMigration, 'fn_health_score_v3_periodo');
    const setup = psql(container, `create schema if not exists public;\n${periodFunction}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const result = psql(container, `
      select jsonb_agg(to_jsonb(p) order by competencia)::text
      from (values
        (date '2026-03-01'),
        (date '2026-06-01'),
        (date '2026-09-01'),
        (date '2026-12-01'),
        (date '2027-02-01')
      ) v(competencia)
      cross join lateral public.fn_health_score_v3_periodo(v.competencia, 'ciclo') p;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const rows = JSON.parse(result.stdout.trim());

    assert.deepEqual(
      rows.map((row) => [row.periodo_inicio, row.periodo_fim]),
      [
        ['2026-03-01', '2026-05-31'],
        ['2026-06-01', '2026-08-31'],
        ['2026-09-01', '2026-11-30'],
        ['2026-12-01', '2027-02-28'],
        ['2026-12-01', '2027-02-28'],
      ],
    );
  } finally {
    docker(['stop', container]);
  }
});
