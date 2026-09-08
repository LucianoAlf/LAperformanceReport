import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationName = readdirSync(migrationsDir, { encoding: 'utf8' }).find((name) =>
  name.endsWith('_corrige_ticket_agosto_2026_recreio_334_pagantes.sql')
);
assert.ok(migrationName, 'migration de correcao do ticket ausente');
const migration = readFileSync(new URL(migrationName, migrationsDir), 'utf8');

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
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
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) {
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

test('migration corrige o fechamento realista de 325/445,38 para 334/433,38', { timeout: 120_000 }, (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker indisponivel para o teste PostgreSQL');
    return;
  }

  const container = `la-ticket-334-${process.pid}-${Date.now()}`;
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
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select null::uuid $$;

      create function public.hash_jsonb_canonico(p_payload jsonb)
      returns text language sql immutable as $$
        select encode(digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
      $$;

      create table public.unidades (
        id uuid primary key,
        nome text not null
      );

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
        financeiro_realizado_disponivel boolean not null default true,
        observacao text,
        capturado_em timestamptz not null default now(),
        capturado_por uuid,
        aprovado_em timestamptz,
        aprovado_por uuid,
        fechado_em timestamptz,
        fechado_por uuid,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (ano, mes, escopo, unidade_id, dominio, versao)
      );

      create table public.fechamento_mensal_auditoria (
        id uuid primary key default gen_random_uuid(),
        snapshot_id uuid,
        ano integer not null,
        mes integer not null,
        escopo text not null,
        unidade_id uuid,
        acao text not null,
        detalhes jsonb not null,
        actor_id uuid,
        created_at timestamptz not null default now()
      );

      create table public.dados_mensais (
        id uuid primary key default gen_random_uuid(),
        unidade_id uuid,
        ano integer not null,
        mes integer not null,
        alunos_ativos integer,
        alunos_pagantes integer,
        matriculas_ativas integer,
        evasoes integer,
        churn_rate numeric,
        ticket_medio numeric,
        faturamento_estimado numeric,
        ticket_denominador_pagantes integer,
        ticket_medio_contratual numeric,
        mrr_contratual numeric,
        updated_at timestamptz default now()
      );

      create table public.automacao_log (
        id bigint generated always as identity primary key,
        aluno_nome text not null,
        unidade_nome text,
        evento text not null,
        acao text not null,
        detalhes jsonb,
        workflow_id text,
        execution_id text,
        status text not null,
        created_at timestamptz default now()
      );

      insert into public.unidades (id, nome) values
        ('95553e96-971b-4590-a6eb-0201d013c14d', 'Recreio'),
        ('368d47f5-2d88-4475-bc14-ba084a9a348e', 'Barra'),
        ('2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'Campo Grande');

      with fixture as (
        select jsonb_build_object(
          'alunos_ativos', 344,
          'alunos_pagantes', 334,
          'matriculas_ativas', 422,
          'mrr', 144749.17,
          'ticket_medio', 445.38,
          'ticket_denominador_pagantes', 325,
          'retificacao_ticket_agosto_2026', jsonb_build_object(
            'motivo', 'fixture da retificacao superada',
            'alunos_pagantes_administrativos', 334,
            'ticket_denominador_pagantes', 325
          ),
          'financeiro_ticket_contratual', jsonb_build_object(
            'fonte', 'fechamento_financeiro_agosto_2026',
            'ticket_medio', 445.38,
            'mrr_contratual', 144749.17,
            'faturamento_previsto', 144749.17,
            'faturamento_realizado', 143346.97,
            'alunos_pagantes_canonicos', 325,
            'ticket_denominador_pagantes', 325,
            'alunos_pagantes_administrativos', 334
          )
        ) as payload
      )
      insert into public.fechamento_mensal_snapshots (
        ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
        payload, payload_hash, financeiro_realizado_disponivel, fechado_em
      )
      select 2026, 8, 'unidade', '95553e96-971b-4590-a6eb-0201d013c14d',
             'alunos_executivo', 6, 'fechado',
             'retificacao_integridade_relatorio_agosto_2026_v1',
             payload, public.hash_jsonb_canonico(payload), true, now()
      from fixture;

      with faturas as (
        select jsonb_build_object(
          'mrr_atual', 143346.97,
          'faturamento_previsto', 144749.17,
          'ticket_medio', 445.38,
          'ticket_medio_previsto', 445.38,
          'ticket_denominador_pagantes', 325,
          'alunos_pagantes_canonicos', 325
        ) as valor
      ), bloco as (
        select jsonb_build_object(
          'alunos_ativos', 344,
          'alunos_pagantes', 334,
          'matriculas_ativas', 422,
          'mrr', 144749.17,
          'ticket_medio', 445.38,
          'ticket_denominador_pagantes', 325,
          'alunos_pagantes_canonicos', 325,
          'alunos_pagantes_administrativos', 334
        ) as valor
      ), fixture as (
        select jsonb_build_object(
          'financeiro_ticket_contratual', jsonb_build_object(
            'ticket_medio', 445.38,
            'mrr_contratual', 144749.17,
            'faturamento_previsto', 144749.17,
            'faturamento_realizado', 143346.97,
            'alunos_pagantes_canonicos', 325,
            'ticket_denominador_pagantes', 325,
            'alunos_pagantes_administrativos', 334
          ),
          'financeiro_faturas_emusys', jsonb_build_object('totais', faturas.valor),
          'kpis_gestao', jsonb_build_array(
            bloco.valor || jsonb_build_object('financeiro_faturas_emusys', faturas.valor)
          ),
          'dados_mes_atual', jsonb_build_array(bloco.valor),
          'kpis_alunos_canonicos', jsonb_build_object(
            'totais', bloco.valor,
            'por_unidade', jsonb_build_array(
              bloco.valor || jsonb_build_object(
                'unidade_id', '95553e96-971b-4590-a6eb-0201d013c14d'
              )
            )
          )
        ) as payload
        from faturas, bloco
      )
      insert into public.fechamento_mensal_snapshots (
        id, ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
        payload, payload_hash, financeiro_realizado_disponivel, fechado_em
      )
      select '27d3a3fc-3c78-4060-bb39-197b3bc35d38',
             2026, 8, 'unidade', '95553e96-971b-4590-a6eb-0201d013c14d',
             'relatorio_gerencial', 7, 'fechado',
             'retificacao_integridade_relatorio_agosto_2026_v1',
             payload, public.hash_jsonb_canonico(payload), true, now()
      from fixture;

      with gerencial as (
        select id, payload_hash
        from public.fechamento_mensal_snapshots
        where dominio = 'relatorio_gerencial'
      ), fixture as (
        select jsonb_build_object(
          'resumo', jsonb_build_object(
            'alunos_ativos', 344,
            'alunos_pagantes', 334,
            'matriculas_ativas', 422,
            'ticket_medio', 445.38,
            'ticket_denominador_pagantes', 325,
            'faturamento_previsto', 144749.17
          ),
          'fontes', jsonb_build_object(
            'relatorio_gerencial', jsonb_build_object(
              'snapshot_id', id,
              'payload_hash', payload_hash
            ),
            'financeiro_ticket_contratual', jsonb_build_object(
              'ticket_medio', 445.38,
              'mrr_contratual', 144749.17,
              'ticket_denominador_pagantes', 325,
              'alunos_pagantes_canonicos', 325,
              'alunos_pagantes_administrativos', 334
            )
          )
        ) as payload
        from gerencial
      )
      insert into public.fechamento_mensal_snapshots (
        ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
        payload, payload_hash, financeiro_realizado_disponivel, fechado_em
      )
      select 2026, 8, 'unidade', '95553e96-971b-4590-a6eb-0201d013c14d',
             'relatorio_admin_mensal', 7, 'fechado',
             'retificacao_integridade_relatorio_agosto_2026_v1',
             payload, public.hash_jsonb_canonico(payload), true, now()
      from fixture;

      insert into public.dados_mensais (
        unidade_id, ano, mes, alunos_ativos, alunos_pagantes, matriculas_ativas,
        evasoes, churn_rate, ticket_medio, faturamento_estimado,
        ticket_denominador_pagantes, ticket_medio_contratual, mrr_contratual
      ) values (
        '95553e96-971b-4590-a6eb-0201d013c14d', 2026, 8, 344, 334, 422,
        29, 8.68, 433.38, 144748.92, 325, 445.38, 144749.17
      );

      with outras(unidade_id, nome, pagantes, mrr, ticket) as (
        values
          ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 256, 114251.65::numeric, 446.30::numeric),
          ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 382, 152368.64::numeric, 398.87::numeric)
      ), fixtures as (
        select unidade_id, jsonb_build_object(
          'alunos_ativos', pagantes,
          'alunos_pagantes', pagantes,
          'matriculas_ativas', pagantes,
          'financeiro_ticket_contratual', jsonb_build_object(
            'mrr_contratual', mrr,
            'faturamento_previsto', mrr,
            'ticket_denominador_pagantes', pagantes,
            'alunos_pagantes_canonicos', pagantes,
            'ticket_medio', ticket
          )
        ) as payload
        from outras
      )
      insert into public.fechamento_mensal_snapshots (
        ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
        payload, payload_hash, financeiro_realizado_disponivel, fechado_em
      )
      select 2026, 8, 'unidade', unidade_id, 'alunos_executivo', 1,
             'fechado', 'fixture_outras_unidades', payload,
             public.hash_jsonb_canonico(payload), true, now()
      from fixtures;

      create function public.get_relatorio_admin_mensal_rico_v1(
        p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns jsonb language plpgsql stable as $$
      declare
        v_exec jsonb;
      begin
        select payload into v_exec
        from public.fechamento_mensal_snapshots
        where unidade_id = p_unidade_id and ano = p_ano and mes = p_mes
          and escopo = 'unidade' and dominio = 'alunos_executivo'
          and status = 'fechado'
        order by versao desc, created_at desc limit 1;

        return jsonb_build_object('payload', jsonb_build_object(
          'resumo', jsonb_build_object(
            'alunos_ativos', v_exec->'alunos_ativos',
            'alunos_pagantes', v_exec->'alunos_pagantes',
            'matriculas_ativas', v_exec->'matriculas_ativas'
          ),
          'indicadores_financeiros', jsonb_build_object(
            'mrr_atual', v_exec#>'{financeiro_ticket_contratual,mrr_contratual}',
            'faturamento_previsto', v_exec#>'{financeiro_ticket_contratual,faturamento_previsto}',
            'ticket_denominador_pagantes', v_exec#>'{financeiro_ticket_contratual,ticket_denominador_pagantes}',
            'ticket_medio', v_exec#>'{financeiro_ticket_contratual,ticket_medio}'
          )
        ));
      end;
      $$;

      create function public.get_relatorio_gerencial_canonico_v1(
        p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'administrativo', public.get_relatorio_admin_mensal_rico_v1(p_unidade_id, p_ano, p_mes)->'payload'
        )
      $$;

      create function public.get_financeiro_faturas_emusys(
        p_unidade_id uuid, p_ano integer, p_mes integer
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'tem_dados', true,
          'totais', jsonb_build_object(
            'faturamento_previsto', payload#>'{financeiro_ticket_contratual,faturamento_previsto}',
            'ticket_denominador_pagantes', payload#>'{financeiro_ticket_contratual,ticket_denominador_pagantes}',
            'alunos_pagantes_canonicos', payload#>'{financeiro_ticket_contratual,alunos_pagantes_canonicos}',
            'ticket_medio', payload#>'{financeiro_ticket_contratual,ticket_medio}'
          )
        )
        from public.fechamento_mensal_snapshots
        where unidade_id = p_unidade_id and ano = p_ano and mes = p_mes
          and escopo = 'unidade' and dominio = 'alunos_executivo'
          and status = 'fechado'
        order by versao desc, created_at desc limit 1
      $$;
    `);

    psql(container, migration);

    const latest = psql(container, String.raw`
      with latest as (
        select distinct on (dominio) dominio, versao, fonte, payload, payload_hash
        from public.fechamento_mensal_snapshots
        where unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
          and ano = 2026 and mes = 8
          and dominio in ('alunos_executivo','relatorio_gerencial','relatorio_admin_mensal')
        order by dominio, versao desc, created_at desc
      )
      select jsonb_agg(jsonb_build_object(
        'dominio', dominio,
        'versao', versao,
        'fonte', fonte,
        'hash_valido', public.hash_jsonb_canonico(payload) = payload_hash,
        'ticket', case dominio
          when 'alunos_executivo' then payload->'ticket_medio'
          when 'relatorio_gerencial' then payload#>'{kpis_alunos_canonicos,totais,ticket_medio}'
          else payload#>'{resumo,ticket_medio}'
        end,
        'denominador', case dominio
          when 'alunos_executivo' then payload->'ticket_denominador_pagantes'
          when 'relatorio_gerencial' then payload#>'{kpis_alunos_canonicos,totais,ticket_denominador_pagantes}'
          else payload#>'{resumo,ticket_denominador_pagantes}'
        end
      ) order by dominio)::text
      from latest;
    `);
    const rows = JSON.parse(latest);
    assert.deepEqual(rows.map((row) => row.versao), [7, 8, 8]);
    assert.equal(rows.every((row) => row.fonte === 'correcao_ticket_agosto_2026_recreio_334_pagantes_v1'), true);
    assert.equal(rows.every((row) => row.hash_valido), true);
    assert.equal(rows.every((row) => Number(row.ticket) === 433.38), true);
    assert.equal(rows.every((row) => Number(row.denominador) === 334), true);

    const duplicatas = JSON.parse(psql(container, String.raw`
      with latest as (
        select distinct on (dominio) dominio, id, payload, payload_hash
        from public.fechamento_mensal_snapshots
        where unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
          and ano = 2026 and mes = 8
          and dominio in ('alunos_executivo','relatorio_gerencial','relatorio_admin_mensal')
        order by dominio, versao desc, created_at desc
      ), e as (
        select * from latest where dominio = 'alunos_executivo'
      ), g as (
        select * from latest where dominio = 'relatorio_gerencial'
      ), a as (
        select * from latest where dominio = 'relatorio_admin_mensal'
      )
      select jsonb_build_object(
        'exec_root', jsonb_build_array(e.payload->'ticket_denominador_pagantes', e.payload->'ticket_medio'),
        'exec_financeiro', jsonb_build_array(
          e.payload#>'{financeiro_ticket_contratual,ticket_denominador_pagantes}',
          e.payload#>'{financeiro_ticket_contratual,ticket_medio}'
        ),
        'gerencial_financeiro', jsonb_build_array(
          g.payload#>'{financeiro_ticket_contratual,ticket_denominador_pagantes}',
          g.payload#>'{financeiro_ticket_contratual,ticket_medio}'
        ),
        'gerencial_faturas', jsonb_build_array(
          g.payload#>'{financeiro_faturas_emusys,totais,ticket_denominador_pagantes}',
          g.payload#>'{financeiro_faturas_emusys,totais,ticket_medio}'
        ),
        'gerencial_gestao', jsonb_build_array(
          g.payload#>'{kpis_gestao,0,ticket_denominador_pagantes}',
          g.payload#>'{kpis_gestao,0,ticket_medio}'
        ),
        'gerencial_gestao_canonicos',
          g.payload#>'{kpis_gestao,0,alunos_pagantes_canonicos}',
        'gerencial_gestao_faturas', jsonb_build_array(
          g.payload#>'{kpis_gestao,0,financeiro_faturas_emusys,ticket_denominador_pagantes}',
          g.payload#>'{kpis_gestao,0,financeiro_faturas_emusys,ticket_medio}'
        ),
        'gerencial_dados_mes', jsonb_build_array(
          g.payload#>'{dados_mes_atual,0,ticket_denominador_pagantes}',
          g.payload#>'{dados_mes_atual,0,ticket_medio}'
        ),
        'gerencial_dados_mes_canonicos',
          g.payload#>'{dados_mes_atual,0,alunos_pagantes_canonicos}',
        'gerencial_totais', jsonb_build_array(
          g.payload#>'{kpis_alunos_canonicos,totais,ticket_denominador_pagantes}',
          g.payload#>'{kpis_alunos_canonicos,totais,ticket_medio}'
        ),
        'gerencial_totais_canonicos',
          g.payload#>'{kpis_alunos_canonicos,totais,alunos_pagantes_canonicos}',
        'gerencial_unidade', jsonb_build_array(
          g.payload#>'{kpis_alunos_canonicos,por_unidade,0,ticket_denominador_pagantes}',
          g.payload#>'{kpis_alunos_canonicos,por_unidade,0,ticket_medio}'
        ),
        'gerencial_unidade_canonicos',
          g.payload#>'{kpis_alunos_canonicos,por_unidade,0,alunos_pagantes_canonicos}',
        'admin_resumo', jsonb_build_array(
          a.payload#>'{resumo,ticket_denominador_pagantes}',
          a.payload#>'{resumo,ticket_medio}'
        ),
        'admin_financeiro', jsonb_build_array(
          a.payload#>'{fontes,financeiro_ticket_contratual,ticket_denominador_pagantes}',
          a.payload#>'{fontes,financeiro_ticket_contratual,ticket_medio}'
        ),
        'retificacao_ticket', jsonb_build_array(
          e.payload#>'{retificacao_ticket_agosto_2026,ticket_denominador_pagantes}',
          e.payload#>'{retificacao_ticket_agosto_2026,ticket_medio}'
        ),
        'retificacao_superseded',
          (e.payload#>>'{retificacao_ticket_agosto_2026,superseded}')::boolean,
        'retificacao_superseded_by',
          e.payload#>>'{retificacao_ticket_agosto_2026,superseded_by}' =
            'correcao_ticket_agosto_2026_recreio_334_pagantes_v1',
        'admin_aponta_gerencial',
          a.payload#>>'{fontes,relatorio_gerencial,snapshot_id}' = g.id::text,
        'admin_hash_gerencial',
          a.payload#>>'{fontes,relatorio_gerencial,payload_hash}' = g.payload_hash
      )::text
      from e, g, a;
    `));
    for (const [chave, valor] of Object.entries(duplicatas)) {
      if (typeof valor === 'boolean') {
        assert.equal(valor, true, `${chave} deveria estar reconciliado`);
      } else if (!Array.isArray(valor)) {
        assert.equal(Number(valor), 334, `${chave} permaneceu divergente`);
      } else {
        assert.deepEqual(valor, [334, 433.38], `${chave} permaneceu divergente`);
      }
    }

    const anteriores = JSON.parse(psql(container, String.raw`
      select jsonb_agg(jsonb_build_object(
        'dominio', dominio,
        'versao', versao,
        'denominador', case dominio
          when 'alunos_executivo' then payload->'ticket_denominador_pagantes'
          when 'relatorio_gerencial' then payload#>'{kpis_alunos_canonicos,totais,ticket_denominador_pagantes}'
          else payload#>'{resumo,ticket_denominador_pagantes}'
        end,
        'ticket', case dominio
          when 'alunos_executivo' then payload->'ticket_medio'
          when 'relatorio_gerencial' then payload#>'{kpis_alunos_canonicos,totais,ticket_medio}'
          else payload#>'{resumo,ticket_medio}'
        end
      ) order by dominio)::text
      from public.fechamento_mensal_snapshots
      where unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
        and ano = 2026 and mes = 8
        and ((dominio = 'alunos_executivo' and versao = 6)
          or (dominio = 'relatorio_gerencial' and versao = 7)
          or (dominio = 'relatorio_admin_mensal' and versao = 7));
    `));
    assert.equal(anteriores.length, 3);
    assert.equal(anteriores.every((row) => Number(row.denominador) === 325), true);
    assert.equal(anteriores.every((row) => Number(row.ticket) === 445.38), true);

    const compatibilidade = JSON.parse(psql(container, String.raw`
      select jsonb_build_object(
        'alunos_pagantes', alunos_pagantes,
        'ticket_medio_legado', ticket_medio,
        'faturamento_estimado_legado', faturamento_estimado,
        'denominador', ticket_denominador_pagantes,
        'ticket_contratual', ticket_medio_contratual,
        'mrr_contratual', mrr_contratual
      )::text
      from public.dados_mensais
      where unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
        and ano = 2026 and mes = 8;
    `));
    assert.deepEqual(compatibilidade, {
      alunos_pagantes: 334,
      ticket_medio_legado: 433.38,
      faturamento_estimado_legado: 144748.92,
      denominador: 334,
      ticket_contratual: 433.38,
      mrr_contratual: 144749.17,
    });

    const provas = JSON.parse(psql(container, String.raw`
      select jsonb_build_object(
        'auditorias', (select count(*) from public.fechamento_mensal_auditoria),
        'logs_ok', (select count(*) from public.automacao_log where status = 'ok'),
        'snapshots_recreio', (
          select count(*) from public.fechamento_mensal_snapshots
          where unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
        ),
        'snapshots_outras', (
          select count(*) from public.fechamento_mensal_snapshots
          where unidade_id <> '95553e96-971b-4590-a6eb-0201d013c14d'
        )
      )::text;
    `));
    assert.deepEqual(provas, {
      auditorias: 4,
      logs_ok: 1,
      snapshots_recreio: 6,
      snapshots_outras: 2,
    });
  } finally {
    docker(['rm', '--force', container]);
  }
});
