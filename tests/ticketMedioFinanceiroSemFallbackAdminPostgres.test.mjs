import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260905203015_remove_fallback_pagantes_admin_ticket.sql',
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

test('ticket financeiro nunca usa pagantes administrativos como fallback', { timeout: 120_000 }, (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker indisponivel para o teste PostgreSQL');
    return;
  }

  const container = `la-ticket-sem-admin-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    waitForPostgres(container);
    psql(container, String.raw`
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role; exception when duplicate_object then null; end $$;

      create table public.fechamento_mensal_snapshots (
        id bigint generated always as identity primary key,
        ano integer not null,
        mes integer not null,
        escopo text not null,
        unidade_id uuid not null,
        dominio text not null,
        versao integer not null,
        status text not null,
        payload jsonb not null,
        fechado_em timestamptz default now(),
        created_at timestamptz not null default now()
      );

      create function public.get_kpis_alunos_financeiro_vivo_canonico(
        p_unidade_id uuid default null,
        p_ano integer default 2026,
        p_mes integer default 9
      ) returns table (
        unidade_id uuid,
        mrr numeric,
        alunos_pagantes integer,
        inadimplentes integer,
        inadimplencia_valor numeric,
        inadimplencia_pct numeric,
        faturamento_realizado numeric,
        reajustes_validos integer,
        reajuste_pct numeric
      ) language sql stable as $$
        select
          'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
          1000::numeric,
          2,
          1,
          400::numeric,
          50::numeric,
          600::numeric,
          0,
          0::numeric
        where p_ano = 2026
          and p_mes = 9
          and (
            p_unidade_id is null
            or p_unidade_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
          )
      $$;

      create function public.get_financeiro_faturas_emusys_base_ticket_contratual_v1(
        p_unidade_id uuid default null,
        p_ano integer default 2026,
        p_mes integer default 9
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'status', 'ok',
          'tem_dados', true,
          'por_unidade', '[]'::jsonb,
          'totais', '{}'::jsonb
        )
      $$;

      insert into public.fechamento_mensal_snapshots (
        ano, mes, escopo, unidade_id, dominio, versao, status, payload
      ) values
        (
          2026, 8, 'unidade',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'alunos_executivo', 1, 'fechado',
          jsonb_build_object(
            'alunos_pagantes', 334,
            'financeiro_ticket_contratual', jsonb_build_object(
              'mrr_contratual', 144749.17,
              'ticket_denominador_pagantes', 325
            )
          )
        ),
        (
          2026, 8, 'unidade',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'alunos_executivo', 1, 'fechado',
          jsonb_build_object(
            'alunos_pagantes', 410,
            'alunos_pagantes_canonicos', 410,
            'mrr', 164000
          )
        );
    `);

    psql(container, migration);

    const fechado = JSON.parse(psql(container, String.raw`
      select public.aplicar_financeiro_ticket_contratual_v4(
        jsonb_build_object(
          'status', 'ok',
          'tem_dados', true,
          'por_unidade', jsonb_build_array(
            jsonb_build_object(
              'unidade_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              'unidade_nome', 'Fechado explicito',
              'alunos_pagantes', 334,
              'alunos_pagantes_canonicos', 334,
              'ticket_medio', 433.38,
              'faturamento_previsto', 144749.17
            ),
            jsonb_build_object(
              'unidade_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              'unidade_nome', 'Fechado legado',
              'alunos_pagantes', 410,
              'alunos_pagantes_canonicos', 410,
              'ticket_medio', 400,
              'faturamento_previsto', 164000
            )
          ),
          'totais', jsonb_build_object(
            'alunos_pagantes', 744,
            'alunos_pagantes_canonicos', 744,
            'ticket_medio', 415
          )
        ),
        null, 2026, 8
      )::text;
    `));

    const porNome = new Map(fechado.por_unidade.map((row) => [row.unidade_nome, row]));
    const explicito = porNome.get('Fechado explicito');
    const legado = porNome.get('Fechado legado');

    assert.equal(explicito.alunos_pagantes, 334);
    assert.equal(Number(explicito.ticket_denominador_pagantes), 325);
    assert.equal(Number(explicito.faturamento_previsto), 144749.17);
    assert.equal(Number(explicito.ticket_medio), 445.38);

    assert.equal(legado.alunos_pagantes, 410);
    assert.equal(legado.ticket_denominador_pagantes, null);
    assert.equal(legado.alunos_pagantes_canonicos, null);
    assert.equal(legado.ticket_medio, null);
    assert.equal(
      legado.fonte_denominador_ticket,
      'indisponivel_sem_denominador_financeiro_explicito',
    );

    assert.equal(fechado.totais.ticket_denominador_pagantes, null);
    assert.equal(fechado.totais.ticket_medio, null);
    assert.equal(
      fechado.totais.fonte_denominador_ticket,
      'indisponivel_unidade_sem_denominador_financeiro',
    );

    const vivo = JSON.parse(psql(container, String.raw`
      select public.aplicar_financeiro_ticket_contratual_v4(
        jsonb_build_object(
          'status', 'ok',
          'tem_dados', true,
          'por_unidade', jsonb_build_array(
            jsonb_build_object(
              'unidade_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
              'unidade_nome', 'Mes aberto',
              'alunos_pagantes', 99,
              'alunos_pagantes_canonicos', 99,
              'ticket_medio', 10,
              'faturamento_previsto', 990
            )
          ),
          'totais', '{}'::jsonb
        ),
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 2026, 9
      )::text;
    `));

    assert.equal(vivo.por_unidade[0].alunos_pagantes, 99);
    assert.equal(Number(vivo.por_unidade[0].ticket_denominador_pagantes), 2);
    assert.equal(Number(vivo.por_unidade[0].faturamento_previsto), 1000);
    assert.equal(Number(vivo.por_unidade[0].ticket_medio), 500);
    assert.equal(Number(vivo.totais.ticket_denominador_pagantes), 2);
    assert.equal(Number(vivo.totais.ticket_medio), 500);
  } finally {
    docker(['rm', '--force', container]);
  }
});
