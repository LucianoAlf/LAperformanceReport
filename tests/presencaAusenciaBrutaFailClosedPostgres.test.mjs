import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const canonical = join(migrationsDir, '20260827030100_presenca_ocorrencia_canonica_v2.sql');
const correctionName = readdirSync(migrationsDir)
  .filter((name) => /_presenca_ausencia_bruta_fail_closed\.sql$/u.test(name))
  .at(-1);
const UNIT = '91000000-0000-0000-0000-000000000001';

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function psql(container, sql) {
  const result = docker([
    'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL 17 descartável não ficou pronto');
}

test('correção não hardcode política e mantém a projeção temporal versionada', () => {
  assert.ok(correctionName, 'migration presenca_ausencia_bruta_fail_closed ausente');
  const correction = readFileSync(join(migrationsDir, correctionName), 'utf8');
  const canonicalSql = readFileSync(canonical, 'utf8');
  assert.equal((correction.match(/when\s+'ausente'\s+then\s+'indeterminado'/giu) ?? []).length, 2);
  assert.doesNotMatch(correction, /Barra|Recreio|Campo Grande|2026-06-01|2026-07-31/iu);
  assert.match(canonicalSql, /presenca_politicas_confiabilidade/iu);
  assert.match(canonicalSql, /ausencia_emusys_resultado\s*=\s*'falta_confirmada'/iu);
});

test('aluno e professor ausentes brutos ficam indeterminados no envelope legado', { timeout: 120_000 }, async (t) => {
  if (!correctionName || !existsSync(canonical) || docker(['info']).status !== 0) {
    t.skip('Docker ou migration indisponível');
    return;
  }
  const container = `la-presenca-ausencia-${process.pid}`;
  const started = docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr);
  try {
    await waitForPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create type public.agenda_fixture as (
        chave text, professor_id integer, professor_presenca text,
        alunos jsonb, aula_ids integer[]
      );
      create function public.get_agenda_dia(date, uuid default null)
      returns setof public.agenda_fixture language sql stable as $$
        select ('slot-1', 7, 'ausente',
          jsonb_build_array(jsonb_build_object(
            'aluno_id', 101,
            'aula_emusys_id', 10,
            'status_presenca', 'ausente',
            'respondido_por', 'emusys'
          )), array[10])::public.agenda_fixture
      $$;
      create function public.fn_presenca_pendencias_do_dia(uuid, date)
      returns table(motivo text, aluno_id integer) language sql stable as $$
        select 'sem_resposta'::text, 101
      $$;
    `);
    psql(container, readFileSync(join(migrationsDir, correctionName), 'utf8'));
    const result = JSON.parse(psql(container, `
      select public.fn_agenda_dia_legado_envelope_v1('2026-08-27', '${UNIT}');
    `));
    assert.equal(result.ocorrencias[0].resultado_canonico, 'indeterminado');
    assert.equal(result.professores_ocorrencias[0].estado, 'indeterminado');
    const acl = psql(container, `
      select has_function_privilege('public','public.fn_agenda_dia_legado_envelope_v1(date,uuid)','execute');
    `);
    assert.equal(acl, 'f');
  } finally {
    docker(['rm', '-f', container]);
  }
});
