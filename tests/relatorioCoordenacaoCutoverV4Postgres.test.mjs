import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909043050_relatorio_coordenacao_cutover_v4.sql',
  import.meta.url,
);
const releaseGateMigrationPath = new URL(
  '../supabase/migrations/20260909081131_relatorio_coordenacao_release_gate_v4.sql',
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
  create schema cron;
  create role anon;
  create role authenticated;
  create role service_role;

  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

  create table public.unidades (
    id uuid primary key,
    nome text not null,
    ativo boolean not null default true
  );
  insert into public.unidades values
    ('10000000-0000-0000-0000-000000000001', 'Unidade Fixture', true);

  create table public.fechamento_mensal_snapshots (
    id uuid primary key default gen_random_uuid(),
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    dominio text not null,
    versao integer not null,
    status text not null,
    fonte text not null,
    payload jsonb not null,
    payload_hash text not null,
    observacao text,
    capturado_em timestamptz not null default now(),
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create function public.hash_jsonb_canonico(payload jsonb)
  returns text language sql stable as $$
    select encode(digest(coalesce(payload, '{}'::jsonb)::text, 'sha256'), 'hex')
  $$;

  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable security definer as $$ select 1 $$;

  create function public.get_relatorio_coordenacao_documento_v4(
    p_unidade_id uuid, p_ano integer, p_mes integer, p_periodicidade text default 'mensal'
  ) returns jsonb language sql stable security definer as $$
    select s.payload
    from public.fechamento_mensal_snapshots s
    where s.ano = p_ano and s.mes = p_mes
      and s.unidade_id is not distinct from p_unidade_id
      and s.dominio = case when p_periodicidade = 'ciclo'
        then 'relatorio_coordenacao_ciclo' else 'relatorio_coordenacao' end
    order by s.versao desc limit 1
  $$;

  create table public.fixture_materializacoes (
    id bigserial primary key,
    unidade_id uuid,
    ano integer,
    mes integer,
    periodicidade text,
    status text
  );

  create function public.materializar_relatorio_coordenacao_documento_v4(
    p_unidade_id uuid, p_ano integer, p_mes integer, p_periodicidade text,
    p_status text default 'preview', p_observacao text default null
  ) returns jsonb language plpgsql security definer as $$
  begin
    insert into public.fixture_materializacoes(unidade_id,ano,mes,periodicidade,status)
    values (p_unidade_id,p_ano,p_mes,p_periodicidade,p_status);
    return jsonb_build_object('ok',true,'criado',true);
  end
  $$;

  create function public.get_relatorio_coordenacao_canonico_v3(
    uuid, integer, integer, text default 'mensal'
  ) returns jsonb language sql stable security definer as $$
    select '{"schema_version":3,"legado":true}'::jsonb
  $$;

  create table cron.job (
    jobid bigserial primary key,
    jobname text not null,
    schedule text not null,
    command text not null,
    username text not null default current_user
  );
  create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
  declare v_id bigint;
  begin
    insert into cron.job(jobname,schedule,command) values ($1,$2,$3) returning jobid into v_id;
    return v_id;
  end
  $$;
  create function cron.unschedule(bigint) returns boolean language plpgsql as $$
  begin delete from cron.job where jobid=$1; return found; end
  $$;

  do $seed$
  declare
    v_escopo record;
    v_periodo record;
    v_id uuid;
    v_conteudo jsonb;
    v_hash text;
  begin
    for v_escopo in
      select id as unidade_id, 'unidade'::text as escopo from public.unidades
      union all select null::uuid, 'consolidado'::text
    loop
      for v_periodo in
        select * from (values
          (2026,6,'mensal'::text,'relatorio_coordenacao'::text,'retificado'::text),
          (2026,7,'mensal'::text,'relatorio_coordenacao'::text,'retificado'::text),
          (2026,8,'mensal'::text,'relatorio_coordenacao'::text,'retificado'::text),
          (2026,6,'ciclo'::text,'relatorio_coordenacao_ciclo'::text,'retificado'::text),
          (2026,9,'mensal'::text,'relatorio_coordenacao'::text,'preview'::text),
          (2026,9,'ciclo'::text,'relatorio_coordenacao_ciclo'::text,'preview'::text)
        ) p(ano,mes,periodicidade,dominio,status)
      loop
        v_id := gen_random_uuid();
        v_conteudo := jsonb_build_object(
          'schema_version',4,
          'periodo',jsonb_build_object(
            'ano',v_periodo.ano,'mes',v_periodo.mes,
            'periodicidade',v_periodo.periodicidade,
            'unidade_id',v_escopo.unidade_id
          ),
          'professores','[]'::jsonb
        );
        v_hash := public.hash_jsonb_canonico(v_conteudo);
        insert into public.fechamento_mensal_snapshots(
          id,ano,mes,escopo,unidade_id,dominio,versao,status,fonte,payload,payload_hash
        ) values (
          v_id,v_periodo.ano,v_periodo.mes,v_escopo.escopo,v_escopo.unidade_id,
          v_periodo.dominio,1,v_periodo.status,'fixture',
          v_conteudo || jsonb_build_object('documento',jsonb_build_object(
            'id',v_id,'versao',1,'hash',v_hash,'status',v_periodo.status,'gerado_em',now()
          )),v_hash
        );
      end loop;
    end loop;
  end
  $seed$;
`;

const fixtureSemDocumentos = fixture.replace(
  /do \$seed\$[\s\S]*?\$seed\$;/,
  '',
);

const fixtureReleaseGate = String.raw`
  create extension pgcrypto;
  create schema auth;
  create schema cron;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable security definer as $$ select 1 $$;

  create table cron.job (
    jobid bigserial primary key,
    jobname text not null,
    schedule text not null,
    command text not null,
    username text not null default current_user
  );
  create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
  declare v_id bigint;
  begin
    insert into cron.job(jobname,schedule,command) values ($1,$2,$3) returning jobid into v_id;
    return v_id;
  end
  $$;
  create function cron.unschedule(bigint) returns boolean language plpgsql as $$
  begin delete from cron.job where jobid=$1; return found; end
  $$;

  create table public.unidades (
    id uuid primary key,
    nome text not null,
    ativo boolean not null default true
  );
  insert into public.unidades values
    ('10000000-0000-0000-0000-000000000001','Unidade Fixture',true);

  create table public.fechamento_mensal_snapshots (
    id uuid primary key default gen_random_uuid(),
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    dominio text not null,
    versao integer not null,
    status text not null,
    fonte text not null,
    payload jsonb not null,
    payload_hash text not null,
    observacao text,
    capturado_em timestamptz not null default now(),
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create function public.hash_jsonb_canonico(payload jsonb)
  returns text language sql stable as $$
    select encode(digest(coalesce(payload,'{}'::jsonb)::text,'sha256'),'hex')
  $$;

  create function public.montar_relatorio_coordenacao_conteudo_v4(
    p_unidade_id uuid,p_ano integer,p_mes integer,p_periodicidade text
  ) returns jsonb language sql stable security definer as $$
    select jsonb_build_object(
      'schema_version',4,
      'periodo',jsonb_build_object(
        'unidade_id',p_unidade_id,'ano',p_ano,'mes',p_mes,'periodicidade',p_periodicidade
      ),
      'professores','[]'::jsonb
    )
  $$;

  create function public.materializar_relatorio_coordenacao_documento_v4(
    p_unidade_id uuid,p_ano integer,p_mes integer,p_periodicidade text,
    p_status text default 'preview',p_observacao text default null
  ) returns jsonb language plpgsql security definer as $$
  declare
    v_id uuid := gen_random_uuid();
    v_escopo text := case when p_unidade_id is null then 'consolidado' else 'unidade' end;
    v_dominio text := case when p_periodicidade='ciclo'
      then 'relatorio_coordenacao_ciclo' else 'relatorio_coordenacao' end;
    v_conteudo jsonb;
    v_hash text;
    v_versao integer;
    v_payload jsonb;
  begin
    v_conteudo := public.montar_relatorio_coordenacao_conteudo_v4(
      p_unidade_id,p_ano,p_mes,p_periodicidade
    );
    v_hash := public.hash_jsonb_canonico(v_conteudo);
    select coalesce(max(versao),0)+1 into v_versao
    from public.fechamento_mensal_snapshots
    where ano=p_ano and mes=p_mes and escopo=v_escopo
      and unidade_id is not distinct from p_unidade_id and dominio=v_dominio;
    v_payload := v_conteudo || jsonb_build_object('documento',jsonb_build_object(
      'id',v_id,'versao',v_versao,'hash',v_hash,'status',p_status
    ));
    insert into public.fechamento_mensal_snapshots(
      id,ano,mes,escopo,unidade_id,dominio,versao,status,fonte,payload,payload_hash,observacao
    ) values (
      v_id,p_ano,p_mes,v_escopo,p_unidade_id,v_dominio,v_versao,p_status,
      'fixture',v_payload,v_hash,p_observacao
    );
    return jsonb_build_object('ok',true,'criado',true,'id',v_id,'versao',v_versao);
  end
  $$;

  create function public.get_relatorio_coordenacao_documento_v4(
    p_unidade_id uuid,p_ano integer,p_mes integer,p_periodicidade text default 'mensal'
  ) returns jsonb language sql stable security definer as $$
    select payload from public.fechamento_mensal_snapshots
    where ano=p_ano and mes=p_mes
      and escopo=case when p_unidade_id is null then 'consolidado' else 'unidade' end
      and unidade_id is not distinct from p_unidade_id
      and dominio=case when p_periodicidade='ciclo'
        then 'relatorio_coordenacao_ciclo' else 'relatorio_coordenacao' end
    order by versao desc limit 1
  $$;

  create function public.get_relatorio_coordenacao_canonico_v3(
    uuid,integer,integer,text default 'mensal'
  ) returns jsonb language sql stable security definer as $$
    select '{"schema_version":3,"legado":true}'::jsonb
  $$;
`;

test('preparacao do cutover aceita base vazia sem publicar V4 nem ativar jobs', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-cutover-empty-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const applied = psql(container, `${fixtureSemDocumentos}\n${migration}`);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const jobs = psql(container, 'select count(*) from cron.job;');
    assert.equal(jobs.status, 0, jobs.stderr || jobs.stdout);
    assert.equal(Number(jobs.stdout.trim()), 0);

    const v3 = psql(
      container,
      "select public.get_relatorio_coordenacao_canonico_v3(null,2026,9,'ciclo')::text;",
    );
    assert.equal(v3.status, 0, v3.stderr || v3.stdout);
    assert.deepEqual(JSON.parse(v3.stdout.trim()), {
      schema_version: 3,
      legado: true,
    });
  } finally {
    docker(['stop', container]);
  }
});

test('preparacao cria leitor exato e executor sem trocar alias nem agendar', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-cutover-v4-${process.pid}-${Date.now()}`;
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

    const wrapper = psql(container, String.raw`
      set role authenticated;
      select public.get_relatorio_coordenacao_canonico_v3(
        '10000000-0000-0000-0000-000000000001',2026,9,'ciclo'
      )::text;
    `);
    assert.equal(wrapper.status, 0, wrapper.stderr || wrapper.stdout);
    const wrapperResult = JSON.parse(wrapper.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(wrapperResult.schema_version, 3);
    assert.equal(wrapperResult.legado, true);

    const documentId = psql(container, String.raw`
      select id from public.fechamento_mensal_snapshots
      where unidade_id='10000000-0000-0000-0000-000000000001'
        and ano=2026 and mes=9 and dominio='relatorio_coordenacao_ciclo'
      order by versao desc limit 1;
    `);
    assert.equal(documentId.status, 0, documentId.stderr || documentId.stdout);

    const exact = psql(container, String.raw`
      set role authenticated;
      select (public.get_relatorio_coordenacao_documento_v4_por_id(
        '${documentId.stdout.trim()}'::uuid
      )->>'schema_version');
    `);
    assert.equal(exact.status, 0, exact.stderr || exact.stdout);
    assert.equal(exact.stdout.trim().split(/\r?\n/).at(-1), '4');

    const jobs = psql(container, String.raw`
      select jsonb_build_object(
        'total',count(*),
        'mensal',count(*) filter(where jobname like '%-mensal'),
        'ciclo',count(*) filter(where jobname like '%-ciclo'),
        'todos_isolados',bool_and(command like '%executar_relatorio_coordenacao_documento_v4_diario%')
      )::text from cron.job;
    `);
    assert.equal(jobs.status, 0, jobs.stderr || jobs.stdout);
    assert.deepEqual(JSON.parse(jobs.stdout.trim()), {
      total: 0,
      mensal: 0,
      ciclo: 0,
      todos_isolados: null,
    });

    const run = psql(container, String.raw`
      set role service_role;
      select public.executar_relatorio_coordenacao_documento_v4_diario(
        'unidade','10000000-0000-0000-0000-000000000001','ciclo'
      );
      reset role;
      select jsonb_build_object(
        'total',count(*),
        'mes',max(mes),
        'periodicidade',max(periodicidade),
        'status',max(status)
      )::text from public.fixture_materializacoes;
    `);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const runResult = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(runResult.total, 1);
    assert.equal(runResult.periodicidade, 'ciclo');
    assert.equal(runResult.status, 'preview');

    const anonymous = psql(container, String.raw`
      set role anon;
      select public.get_relatorio_coordenacao_documento_v4_por_id(
        '${documentId.stdout.trim()}'::uuid
      );
    `);
    assert.notEqual(anonymous.status, 0);
    assert.match(anonymous.stderr, /permission denied/i);
  } finally {
    docker(['stop', container]);
  }
});

test('release gate materializa todos os recortes com o produtor final antes de publicar', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  assert.equal(existsSync(releaseGateMigrationPath), true, 'migration do release gate ausente');
  const container = `la-coord-release-gate-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const cutoverMigration = readFileSync(migrationPath, 'utf8');
    const releaseMigration = readFileSync(releaseGateMigrationPath, 'utf8');
    const applied = psql(
      container,
      `${fixtureReleaseGate}\n${cutoverMigration}\n${releaseMigration}`,
    );
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, String.raw`
      select jsonb_build_object(
        'documentos',count(*),
        'escopos',count(distinct (escopo,coalesce(unidade_id::text,'consolidado'))),
        'recortes',count(distinct (ano,mes,dominio)),
        'marcados',bool_and(payload#>>'{motor_documento,versao}'='coordenacao-v4-20260909065200'),
        'jobs',(select count(*) from cron.job),
        'schema_v3',public.get_relatorio_coordenacao_canonico_v3(
          null,2026,9,'ciclo'
        )->>'schema_version'
      )::text
      from public.fechamento_mensal_snapshots;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      documentos: 12,
      escopos: 2,
      recortes: 6,
      marcados: true,
      jobs: 4,
      schema_v3: '4',
    });
  } finally {
    docker(['stop', container]);
  }
});

test('release gate reverte o cutover inteiro quando um documento final nao existe', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-release-rollback-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const cutoverMigration = readFileSync(migrationPath, 'utf8');
    const releaseMigration = readFileSync(releaseGateMigrationPath, 'utf8');
    const fixtureSemGravacao = fixtureReleaseGate.replace(
      /create function public\.materializar_relatorio_coordenacao_documento_v4\([\s\S]*?\n  \$\$;/,
      () => String.raw`create function public.materializar_relatorio_coordenacao_documento_v4(
    uuid,integer,integer,text,text default 'preview',text default null
  ) returns jsonb language sql security definer as $$
    select jsonb_build_object('ok',true,'criado',false)
  $$;`,
    );
    const applied = psql(
      container,
      `${fixtureSemGravacao}\n${cutoverMigration}\n${releaseMigration}`,
    );
    assert.notEqual(applied.status, 0);
    assert.match(
      applied.stderr,
      /RELEASE_MATERIALIZACAO_FALHOU|RELEASE_DOCUMENTO_AUSENTE|RELEASE_DOCUMENTOS_INCOMPLETOS/i,
    );

    const rollback = psql(container, String.raw`
      select jsonb_build_object(
        'documentos',count(*),
        'jobs',(select count(*) from cron.job),
        'legado',public.get_relatorio_coordenacao_canonico_v3(
          null,2026,9,'ciclo'
        )->>'legado'
      )::text
      from public.fechamento_mensal_snapshots;
    `);
    assert.equal(rollback.status, 0, rollback.stderr || rollback.stdout);
    assert.deepEqual(JSON.parse(rollback.stdout.trim()), {
      documentos: 0,
      jobs: 0,
      legado: 'true',
    });
  } finally {
    docker(['stop', container]);
  }
});
