import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260905195222_separa_pagantes_admin_denominador_ticket_rpc.sql',
    import.meta.url,
  ),
  'utf8',
);

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function psql(container, sql) {
  const result = docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function waitForPostgres(container) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = docker([
      'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres',
    ]);
    if (ready.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

test('RPC conserva pagantes administrativos e publica denominador financeiro', { timeout: 120_000 }, (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker indisponivel para o teste PostgreSQL');
    return;
  }

  const container = `la-ticket-rpc-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create extension if not exists pgcrypto;
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role; exception when duplicate_object then null; end $$;

      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

      create function public.hash_jsonb_canonico(p_payload jsonb)
      returns text language sql stable as $$
        select encode(digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
      $$;

      create table public.fechamento_mensal_snapshots (
        id uuid primary key default gen_random_uuid(),
        ano integer not null,
        mes integer not null,
        escopo text not null,
        unidade_id uuid not null,
        dominio text not null,
        versao integer not null,
        status text not null,
        fonte text not null default 'fixture',
        payload jsonb not null,
        payload_hash text not null,
        financeiro_realizado_disponivel boolean not null default true,
        observacao text,
        capturado_em timestamptz not null default now(),
        capturado_por uuid,
        aprovado_em timestamptz,
        aprovado_por uuid,
        fechado_em timestamptz default now(),
        fechado_por uuid,
        created_at timestamptz not null default now()
      );

      create table public.fechamento_mensal_auditoria (
        id bigint generated always as identity primary key,
        snapshot_id uuid,
        ano integer,
        mes integer,
        escopo text,
        unidade_id uuid,
        acao text,
        detalhes jsonb,
        actor_id uuid
      );

      create table public.dados_mensais (
        unidade_id uuid not null,
        ano integer not null,
        mes integer not null,
        alunos_ativos integer not null,
        alunos_pagantes integer not null,
        faturamento_estimado numeric not null,
        ticket_medio numeric not null,
        ticket_denominador_pagantes integer,
        ticket_medio_contratual numeric,
        mrr_contratual numeric,
        updated_at timestamptz default now(),
        primary key (unidade_id, ano, mes)
      );

      create function public.get_kpis_alunos_canonicos(
        p_unidade_id uuid default null,
        p_ano integer default 2026,
        p_mes integer default 9
      ) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
        with linhas as (
          select * from (values
            ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 8, 'dados_mensais', 256, 114251.65::numeric, 447.94::numeric),
            ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 2026, 8, 'dados_mensais', 382, 152368.64::numeric, 398.28::numeric),
            ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 8, 'dados_mensais', 334, 144748.92::numeric, 433.38::numeric),
            ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 9, 'vivo', 328, 148214.03::numeric, 453.25::numeric)
          ) x(unidade_id, unidade_nome, ano, mes, fonte, alunos_pagantes, mrr, ticket_medio)
          where ano = p_ano and mes = p_mes
            and (p_unidade_id is null or unidade_id = p_unidade_id)
        )
        select jsonb_build_object(
          'por_unidade', coalesce(jsonb_agg(jsonb_build_object(
            'unidade_id', unidade_id,
            'unidade_nome', unidade_nome,
            'fonte', fonte,
            'alunos_pagantes', alunos_pagantes,
            'mrr', mrr,
            'ticket_medio', ticket_medio,
            'faturamento_previsto', mrr,
            'faturamento_realizado', mrr
          )), '[]'::jsonb),
          'totais', '{}'::jsonb
        ) from linhas
      $$;

      create function public.get_kpis_alunos_financeiro_vivo_canonico(
        p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns table (
        unidade_id uuid, mrr numeric, alunos_pagantes integer,
        inadimplentes integer, inadimplencia_valor numeric,
        inadimplencia_pct numeric, faturamento_realizado numeric,
        reajustes_validos integer, reajuste_pct numeric
      ) language sql stable security definer set search_path=public,pg_temp as $$
        select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 148214.03::numeric,
          327, 1, 405::numeric, 0.31::numeric, 147809.03::numeric, 0, 0::numeric
        where p_ano = 2026 and p_mes = 9
          and (p_unidade_id is null or p_unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'::uuid)
      $$;

      create function public.get_financeiro_faturas_emusys(
        p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
        select jsonb_build_object(
          'tem_dados', true,
          'por_unidade', jsonb_build_array(
            jsonb_build_object('unidade_id', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'faturamento_previsto', 114251.65, 'mrr_atual', 105922.70, 'ticket_denominador_pagantes', 256, 'ticket_medio', 446.30),
            jsonb_build_object('unidade_id', '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'faturamento_previsto', 152368.64, 'mrr_atual', 139343.36, 'ticket_denominador_pagantes', 382, 'ticket_medio', 398.87),
            jsonb_build_object('unidade_id', '95553e96-971b-4590-a6eb-0201d013c14d', 'faturamento_previsto', 144749.17, 'mrr_atual', 143346.97, 'ticket_denominador_pagantes', 325, 'ticket_medio', 445.38)
          )
        )
      $$;

      with fontes(unidade_id, nome, ativos, admin, mrr, ticket, denom, versao) as (
        values
          ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 260, 256, 114251.65::numeric, 447.94::numeric, null::integer, 1),
          ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 410, 382, 152368.64::numeric, 398.28::numeric, null::integer, 1),
          ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 344, 334, 144749.17::numeric, 445.38::numeric, 325, 5)
      ), payloads as (
        select *, jsonb_strip_nulls(jsonb_build_object(
          'unidade_nome', nome,
          'alunos_ativos', ativos,
          'alunos_pagantes', admin,
          'mrr', mrr,
          'ticket_medio', ticket,
          'faturamento_previsto', mrr,
          'faturamento_realizado', mrr,
          'ticket_denominador_pagantes', denom
        )) as payload
        from fontes
      )
      insert into public.fechamento_mensal_snapshots (
        ano, mes, escopo, unidade_id, dominio, versao, status, payload, payload_hash
      )
      select 2026, 8, 'unidade', unidade_id, 'alunos_executivo', versao, 'fechado',
        payload, public.hash_jsonb_canonico(payload)
      from payloads;

      insert into public.dados_mensais (
        unidade_id, ano, mes, alunos_ativos, alunos_pagantes,
        faturamento_estimado, ticket_medio,
        ticket_denominador_pagantes, ticket_medio_contratual, mrr_contratual
      ) values
        ('368d47f5-2d88-4475-bc14-ba084a9a348e', 2026, 8, 260, 256, 114251.65, 447.94, null, null, null),
        ('2ec861f6-023f-4d7b-9927-3960ad8c2a92', 2026, 8, 410, 382, 152368.64, 398.28, null, null, null),
        ('95553e96-971b-4590-a6eb-0201d013c14d', 2026, 8, 344, 334, 144748.92, 433.38, 325, 445.38, 144749.17);
    `);

    psql(container, migration);

    const agosto = JSON.parse(psql(container, String.raw`
      select jsonb_agg(jsonb_build_object(
        'unidade_id', unidade_id,
        'admin', payload->'alunos_pagantes',
        'denominador', payload->'ticket_denominador_pagantes',
        'ticket', payload->'ticket_medio'
      ) order by unidade_id)::text
      from (
        select distinct on (unidade_id) unidade_id, payload
        from public.fechamento_mensal_snapshots
        where ano=2026 and mes=8 and dominio='alunos_executivo'
        order by unidade_id, versao desc
      ) latest;
    `));
    const porUnidade = new Map(agosto.map(row => [row.unidade_id, row]));
    assert.deepEqual(
      [porUnidade.get('368d47f5-2d88-4475-bc14-ba084a9a348e').admin, porUnidade.get('368d47f5-2d88-4475-bc14-ba084a9a348e').denominador, porUnidade.get('368d47f5-2d88-4475-bc14-ba084a9a348e').ticket],
      [256, 256, 446.30],
    );
    assert.deepEqual(
      [porUnidade.get('2ec861f6-023f-4d7b-9927-3960ad8c2a92').admin, porUnidade.get('2ec861f6-023f-4d7b-9927-3960ad8c2a92').denominador, porUnidade.get('2ec861f6-023f-4d7b-9927-3960ad8c2a92').ticket],
      [382, 382, 398.87],
    );
    assert.deepEqual(
      [porUnidade.get('95553e96-971b-4590-a6eb-0201d013c14d').admin, porUnidade.get('95553e96-971b-4590-a6eb-0201d013c14d').denominador, porUnidade.get('95553e96-971b-4590-a6eb-0201d013c14d').ticket],
      [334, 325, 445.38],
    );

    const setembro = JSON.parse(psql(container, String.raw`
      select public.get_kpis_alunos_canonicos(
        '95553e96-971b-4590-a6eb-0201d013c14d', 2026, 9
      ) #> '{por_unidade,0}';
    `));
    assert.equal(setembro.alunos_pagantes, 328);
    assert.equal(setembro.alunos_pagantes_administrativos, 328);
    assert.equal(setembro.ticket_denominador_pagantes, 327);
    assert.equal(setembro.ticket_medio, 453.25);
  } finally {
    docker(['rm', '--force', container]);
  }
});
