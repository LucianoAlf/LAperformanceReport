import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260905192929_separa_base_financeira_ticket_recreio.sql',
    import.meta.url,
  ),
  'utf8',
);

function extractFunction(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `funcao ${name} ausente da migration`);
  const close = migration.indexOf('\n$function$;', start);
  assert.ok(close > start, `fim da funcao ${name} ausente da migration`);
  return migration.slice(start, close + '\n$function$;'.length);
}

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

test('PostgreSQL aceita 344/334 no administrativo e 325 no ticket financeiro', { timeout: 120_000 }, (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker indisponivel para o teste PostgreSQL');
    return;
  }

  const container = `la-ticket-fin-${process.pid}-${Date.now()}`;
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
      create function auth.role() returns text language sql stable as
        $$ select 'service_role'::text $$;

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
        payload_hash text not null default '',
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

      create table public.fechamento_mensal_retificacoes (
        id uuid primary key default gen_random_uuid(),
        snapshot_id uuid not null,
        base_payload_hash text not null,
        payload_corrigido jsonb not null,
        payload_corrigido_hash text not null,
        created_at timestamptz not null default now()
      );

      create table public.programa_fideliza_config (
        ano integer primary key,
        meta_churn_maximo numeric not null,
        meta_inadimplencia_maxima numeric not null,
        meta_renovacao_minima numeric not null,
        meta_reajuste_minimo numeric not null
      );

      create table public.test_admin_base_outputs (
        unidade_id uuid primary key,
        resultado jsonb not null
      );

      create function public.aplicar_financeiro_ticket_contratual_v1(
        p_base jsonb, p_ano integer, p_mes integer
      ) returns jsonb language sql stable as $$ select p_base $$;

      create function public.get_relatorio_admin_mensal_rico_base_v3(
        p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns jsonb language sql stable as $$
        select resultado from public.test_admin_base_outputs where unidade_id = p_unidade_id
      $$;

      insert into public.programa_fideliza_config values (2026, 4, 2, 80, 5);

      with fontes(unidade_id, nome, mrr, pagantes_admin, denominador) as (
        values
          ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 144749.17::numeric, 334, 325),
          ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 114251.65::numeric, 256, 256),
          ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 152368.64::numeric, 382, 382)
      ), payloads as (
        select *, jsonb_build_object(
          'unidade_nome', nome,
          'alunos_ativos', case when nome = 'Recreio' then 344 else pagantes_admin end,
          'alunos_pagantes', pagantes_admin,
          'mrr', mrr,
          'faturamento_previsto', mrr,
          'financeiro_ticket_contratual', jsonb_build_object(
            'mrr_contratual', mrr,
            'ticket_denominador_pagantes', denominador,
            'alunos_pagantes_canonicos', denominador
          )
        ) as payload
        from fontes
      )
      insert into public.fechamento_mensal_snapshots (
        ano, mes, escopo, unidade_id, dominio, versao, status, payload, payload_hash
      )
      select 2026, 8, 'unidade', unidade_id, 'alunos_executivo', 1, 'fechado',
             payload, public.hash_jsonb_canonico(payload)
      from payloads;
    `);

    psql(container, extractFunction('aplicar_financeiro_ticket_contratual_v3'));

    const financeiro = JSON.parse(psql(container, String.raw`
      select public.aplicar_financeiro_ticket_contratual_v3(
        jsonb_build_object(
          'tem_dados', true,
          'por_unidade', jsonb_build_array(
            jsonb_build_object('unidade_id', '95553e96-971b-4590-a6eb-0201d013c14d', 'unidade_nome', 'Recreio'),
            jsonb_build_object('unidade_id', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'unidade_nome', 'Barra'),
            jsonb_build_object('unidade_id', '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'unidade_nome', 'Campo Grande')
          ),
          'totais', '{}'::jsonb
        ),
        null, 2026, 8
      )::text;
    `));

    const porNome = new Map(financeiro.por_unidade.map((row) => [row.unidade_nome, row]));
    assert.equal(Number(porNome.get('Recreio').ticket_medio), 445.38);
    assert.equal(Number(porNome.get('Recreio').ticket_denominador_pagantes), 325);
    assert.equal(Number(porNome.get('Barra').ticket_medio), 446.30);
    assert.equal(Number(porNome.get('Campo Grande').ticket_medio), 398.87);

    const gerencialId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const gerencialPayload = {
      kpis_alunos_canonicos: {
        totais: {
          alunos_pagantes: 334,
          total_alunos_pagantes: 334,
          mrr: 144749.17,
          ticket_medio: 445.38,
          faturamento_previsto: 144749.17,
          ltv_medio: 6680.7,
          tempo_permanencia_medio: 15,
        },
      },
      financeiro_ticket_contratual: {
        ticket_denominador_pagantes: 325,
      },
      financeiro_faturas_emusys: {
        totais: {
          mrr_atual: 143346.97,
          faturamento_previsto: 144749.17,
          ticket_denominador_pagantes: 325,
          alunos_pagantes_canonicos: 325,
        },
      },
      kpis_gestao: [{ inadimplentes: 1, inadimplencia: 0.31 }],
    };
    const payloadLiteral = JSON.stringify(gerencialPayload).replaceAll("'", "''");

    psql(container, String.raw`
      insert into public.fechamento_mensal_snapshots (
        id, ano, mes, escopo, unidade_id, dominio, versao, status, payload, payload_hash
      ) values (
        '${gerencialId}', 2026, 8, 'unidade',
        '95553e96-971b-4590-a6eb-0201d013c14d', 'relatorio_gerencial', 1, 'fechado',
        '${payloadLiteral}'::jsonb,
        public.hash_jsonb_canonico('${payloadLiteral}'::jsonb)
      );

      insert into public.test_admin_base_outputs values (
        '95553e96-971b-4590-a6eb-0201d013c14d',
        jsonb_build_object(
          'payload', jsonb_build_object(
            'resumo', jsonb_build_object('alunos_ativos', 344, 'alunos_pagantes', 334, 'matriculas_ativas', 422),
            'fontes', jsonb_build_object(
              'relatorio_gerencial', jsonb_build_object(
                'snapshot_id', '${gerencialId}',
                'payload_hash', public.hash_jsonb_canonico('${payloadLiteral}'::jsonb)
              )
            ),
            'indicadores_retencao', jsonb_build_object('churn_rate', 8.38)
          )
        )
      );
    `);

    psql(container, extractFunction('get_relatorio_admin_mensal_rico_v1'));

    const rico = JSON.parse(psql(container, String.raw`
      select public.get_relatorio_admin_mensal_rico_v1(
        '95553e96-971b-4590-a6eb-0201d013c14d', 2026, 8
      )::text;
    `));
    assert.equal(Number(rico.payload.resumo.alunos_ativos), 344);
    assert.equal(Number(rico.payload.resumo.alunos_pagantes), 334);
    assert.equal(Number(rico.payload.indicadores_financeiros.ticket_denominador_pagantes), 325);
    assert.equal(Number(rico.payload.indicadores_financeiros.ticket_medio), 445.38);
    assert.equal(Number(rico.payload.indicadores_financeiros.mrr_atual), 144749.17);
  } finally {
    docker(['rm', '--force', container]);
  }
});
