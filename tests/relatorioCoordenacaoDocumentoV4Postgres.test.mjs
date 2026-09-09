import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909040926_relatorio_coordenacao_documento_v4.sql',
  import.meta.url,
);

const dockerWindows = join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'DockerDesktop',
  'resources',
  'bin',
  'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows
  : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
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
    if (psql(container, 'select 1;').status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 3) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const fixture = String.raw`
  create extension pgcrypto;
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;

  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

  create table public.unidades (
    id uuid primary key,
    nome text not null,
    ativo boolean not null default true
  );

  create table public.fechamento_mensal_snapshots (
    id uuid primary key default gen_random_uuid(),
    ano integer not null check (ano between 2020 and 2100),
    mes integer not null check (mes between 1 and 12),
    escopo text not null check (escopo in ('unidade', 'consolidado')),
    unidade_id uuid,
    dominio text not null,
    versao integer not null check (versao > 0),
    status text not null check (status in ('preview', 'aprovado', 'fechado', 'retificado')),
    fonte text not null,
    payload jsonb not null,
    payload_hash text not null,
    financeiro_realizado_disponivel boolean not null default false,
    observacao text,
    capturado_em timestamptz not null default now(),
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint fechamento_mensal_snapshots_dominio_check check (
      dominio in (
        'alunos_admin', 'alunos_executivo', 'comercial', 'retencao',
        'renovacoes', 'professores', 'relatorio_admin',
        'relatorio_admin_mensal', 'relatorio_comercial_mensal',
        'relatorio_gerencial', 'relatorio_coordenacao', 'metas',
        'programa_matriculador', 'programa_fideliza',
        'compatibilidade_dados_mensais'
      )
    ),
    constraint fechamento_mensal_snapshots_escopo_unidade_chk check (
      (escopo = 'unidade' and unidade_id is not null)
      or (escopo = 'consolidado' and unidade_id is null)
    )
  );

  create unique index ux_fechamento_mensal_snapshots_competencia_dominio
    on public.fechamento_mensal_snapshots (
      ano, mes, escopo,
      coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
      dominio, versao
    );

  create function public.hash_jsonb_canonico(payload jsonb)
  returns text language sql stable as $$
    select encode(digest(coalesce(payload, '{}'::jsonb)::text, 'sha256'), 'hex')
  $$;

  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable security definer as $$ select 1 $$;
  grant execute on function public.fn_health_score_professor_v3_ator_leitura(uuid)
    to authenticated, service_role;

  create table public.fixture_relatorio_v3 (
    id integer primary key,
    valor integer not null,
    falhar boolean not null default false
  );
  insert into public.fixture_relatorio_v3 values (1, 1, false);

  create function public.get_relatorio_coordenacao_canonico_v3(
    p_unidade_id uuid,
    p_ano integer,
    p_mes integer,
    p_periodicidade text default 'mensal'
  ) returns jsonb language plpgsql stable security definer as $$
  declare v_fixture public.fixture_relatorio_v3%rowtype;
  begin
    select * into v_fixture from public.fixture_relatorio_v3 where id = 1;
    if v_fixture.falhar then raise exception 'PRODUTOR_V3_NAO_DEVERIA_SER_CHAMADO'; end if;
    return jsonb_build_object(
      'schema_version', 3,
      'periodo', jsonb_build_object(
        'ano', p_ano,
        'mes', p_mes,
        'periodicidade', p_periodicidade,
        'unidade_id', p_unidade_id,
        'inicio', make_date(p_ano, p_mes, 1),
        'fim', (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ),
      'professores', jsonb_build_array(jsonb_build_object(
        'professor_id', 7,
        'nome', 'Professor Fixture',
        'valor_fixture', v_fixture.valor
      ))
    );
  end;
  $$;

  insert into public.unidades values
    ('10000000-0000-0000-0000-000000000001', 'Unidade Fixture', true);
`;

test('documento V4 e append-only, idempotente, isolado e legivel sem recompor', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-doc-v4-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const applied = psql(container, `${fixture}\n${migration}`);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const privateBuilder = psql(container, String.raw`
      set role authenticated;
      select public.montar_relatorio_coordenacao_conteudo_v4(
        '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal'
      );
    `);
    assert.notEqual(privateBuilder.status, 0);
    assert.match(privateBuilder.stderr, /permission denied/i);

    const first = psql(container, String.raw`
      set role service_role;
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal', 'preview', 'fixture'
      )::text;
    `);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstResult = JSON.parse(first.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(firstResult.criado, true);
    assert.equal(firstResult.versao, 1);

    const same = psql(container, String.raw`
      set role service_role;
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal', 'preview', 'fixture'
      )::text;
    `);
    assert.equal(same.status, 0, same.stderr || same.stdout);
    const sameResult = JSON.parse(same.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(sameResult.criado, false);
    assert.equal(sameResult.versao, 1);

    const changed = psql(container, String.raw`
      update public.fixture_relatorio_v3 set valor = 2 where id = 1;
      set role service_role;
      select public.materializar_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal', 'preview', 'fixture'
      )::text;
    `);
    assert.equal(changed.status, 0, changed.stderr || changed.stdout);
    const changedResult = JSON.parse(changed.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(changedResult.criado, true);
    assert.equal(changedResult.versao, 2);

    const cycle = psql(container, String.raw`
      set role service_role;
      select public.materializar_relatorio_coordenacao_documento_v4(
        null, 2026, 9, 'ciclo', 'preview', 'fixture ciclo'
      )::text;
    `);
    assert.equal(cycle.status, 0, cycle.stderr || cycle.stdout);

    const stored = psql(container, String.raw`
      select jsonb_build_object(
        'monthly_count', count(*) filter (where dominio = 'relatorio_coordenacao'),
        'cycle_count', count(*) filter (where dominio = 'relatorio_coordenacao_ciclo'),
        'latest_supersedes', max(payload #>> '{documento,supersede_id}') filter (
          where dominio = 'relatorio_coordenacao' and versao = 2
        ),
        'all_hashes_ok', bool_and(
          payload_hash = public.hash_jsonb_canonico(payload - 'documento')
        )
      )::text
      from public.fechamento_mensal_snapshots;
    `);
    assert.equal(stored.status, 0, stored.stderr || stored.stdout);
    const storedResult = JSON.parse(stored.stdout.trim());
    assert.equal(storedResult.monthly_count, 2);
    assert.equal(storedResult.cycle_count, 1);
    assert.equal(storedResult.all_hashes_ok, true);
    assert.ok(storedResult.latest_supersedes);

    const readWithoutProducer = psql(container, String.raw`
      update public.fixture_relatorio_v3 set falhar = true where id = 1;
      set role authenticated;
      select public.get_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal'
      )::text;
    `);
    assert.equal(readWithoutProducer.status, 0, readWithoutProducer.stderr || readWithoutProducer.stdout);
    const document = JSON.parse(readWithoutProducer.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(document.schema_version, 4);
    assert.equal(document.documento.versao, 2);
    assert.equal(document.professores[0].valor_fixture, 2);

    const anon = psql(container, String.raw`
      set role anon;
      select public.get_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal'
      );
    `);
    assert.notEqual(anon.status, 0);
    assert.match(anon.stderr, /permission denied/i);

    const corrupt = psql(container, String.raw`
      reset role;
      update public.fechamento_mensal_snapshots
      set payload = jsonb_set(payload, '{professores,0,valor_fixture}', '999'::jsonb)
      where dominio = 'relatorio_coordenacao' and versao = 2;
      set role authenticated;
      select public.get_relatorio_coordenacao_documento_v4(
        '10000000-0000-0000-0000-000000000001', 2026, 9, 'mensal'
      );
    `);
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /RELATORIO_COORDENACAO_V4_HASH_INVALIDO/);
  } finally {
    docker(['stop', container]);
  }
});
