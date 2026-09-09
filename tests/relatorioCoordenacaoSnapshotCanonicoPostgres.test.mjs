import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260908181141_relatorio_coordenacao_snapshot_canonico.sql',
  import.meta.url,
);
const performanceMigrationPath = new URL(
  '../supabase/migrations/20260908183928_relatorio_coordenacao_remove_kpi_redundante.sql',
  import.meta.url,
);
const panelParityMigrationPath = new URL(
  '../supabase/migrations/20260908200000_relatorio_coordenacao_espelha_painel.sql',
  import.meta.url,
);
const liveFunctionsFixturePath = new URL(
  './fixtures/relatorio-coordenacao-live-functions-20260908.sql',
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (psql(container, 'select 1;').status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

test('migration troca somente o leitor do relatorio e preserva o restante das funcoes vigentes', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-relatorio-snapshot-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, String.raw`
      create function public.get_health_score_professor_v3_performance(date, uuid, text)
      returns table (fonte text)
      language sql stable as $fn$
        select 'recalculado'::text
      $fn$;

      create function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text)
      returns table (fonte text)
      language sql stable as $fn$
        select 'snapshot_canonico'::text
      $fn$;

      create function public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
        p_payload jsonb,
        p_unidade_id uuid,
        p_competencia date
      ) returns jsonb
      language plpgsql stable as $function$
      declare
        v_fonte text;
      begin
        select r.fonte into v_fonte
        from public.get_health_score_professor_v3_performance(
          p_competencia,
          p_unidade_id,
          'mensal'
        ) r;
        return p_payload || jsonb_build_object('fonte', v_fonte, 'preservado', true);
      end;
      $function$;

      create function public.montar_relatorio_coordenacao_payload_v3(
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer,
        p_periodicidade text default 'mensal'
      ) returns jsonb
      language plpgsql stable as $function$
      declare
        v_fonte text;
      begin
        select r.fonte into v_fonte
        from public.get_health_score_professor_v3_performance(
          make_date(p_ano, p_mes, 1),
          p_unidade_id,
          p_periodicidade
        ) r;
        return jsonb_build_object(
          'fonte', v_fonte,
          'preservado', 42,
          'auditoria', jsonb_build_object(
            'fonte_health_score', 'get_health_score_professor_v3_performance'
          )
        );
      end;
      $function$;
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = await readFile(migrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, String.raw`
      select jsonb_build_object(
        'v2', public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
          '{}'::jsonb,
          '10000000-0000-0000-0000-000000000001'::uuid,
          date '2026-08-01'
        ),
        'v3', public.montar_relatorio_coordenacao_payload_v3(
          '10000000-0000-0000-0000-000000000001'::uuid,
          2026,
          8,
          'ciclo'
        )
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.deepEqual(payload.v2, { fonte: 'snapshot_canonico', preservado: true });
    assert.equal(payload.v3.fonte, 'snapshot_canonico');
    assert.equal(payload.v3.preservado, 42, 'corpo vigente deve ser preservado');
    assert.equal(
      payload.v3.auditoria.fonte_health_score,
      'get_health_score_professor_v3_performance_snapshot_v3',
    );
  } finally {
    docker(['stop', container]);
  }
});

test('migration de performance reaproveita o operacional ja carregado e nao chama KPIs amplos', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-relatorio-kpi-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, String.raw`
      create function public.get_kpis_professor_periodo_canonico_v3(
        integer, integer, uuid, date, date
      ) returns table (
        professor_id integer,
        total_turmas integer,
        alunos_via_turmas integer,
        turmas_elegiveis_media integer,
        carteira_alunos integer
      )
      language plpgsql stable as $fn$
      begin
        raise exception 'KPI_AMPLO_NAO_DEVERIA_SER_CHAMADO';
      end;
      $fn$;

      create function public.montar_relatorio_coordenacao_payload_v3(
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer,
        p_periodicidade text default 'mensal'
      ) returns jsonb
      language plpgsql stable as $function$
      declare
        v_periodo_inicio date := make_date(p_ano, p_mes, 1);
        v_periodo_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
        v_base jsonb := jsonb_build_object(
          'professores', jsonb_build_array(jsonb_build_object(
            'professor_id', 7,
            'operacional', jsonb_build_object(
              'total_turmas', 3,
              'alunos_via_turmas', 5,
              'turmas_elegiveis_media', 3,
              'carteira_alunos', 4
            )
          ))
        );
        v_performance jsonb := '[]'::jsonb;
        v_kpis jsonb := '[]'::jsonb;
        v_operacional jsonb := '{}'::jsonb;
        v_carteira_carga jsonb := '{}'::jsonb;
      begin
        select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
        into v_kpis
        from public.get_kpis_professor_periodo_canonico_v3(
          p_ano,
          p_mes,
          p_unidade_id,
          v_periodo_inicio,
          v_periodo_fim
        ) k;

        with kpis_raw as (
          select value as item
          from jsonb_array_elements(v_kpis)
        ),
        kpis_professor as (
          select
            (item->>'professor_id')::integer as professor_id,
            coalesce(sum((item->>'total_turmas')::integer), 0)::integer as total_turmas,
            coalesce(sum((item->>'alunos_via_turmas')::integer), 0)::integer as alunos_via_turmas,
            coalesce(sum((item->>'turmas_elegiveis_media')::integer), 0)::integer as turmas_elegiveis_media,
            coalesce(sum((item->>'carteira_alunos')::integer), 0)::integer as carteira_alunos
          from kpis_raw
          group by (item->>'professor_id')::integer
        )
        select coalesce(
          jsonb_object_agg(
            professor_id::text,
            jsonb_build_object(
              'total_turmas', total_turmas,
              'alunos_via_turmas', alunos_via_turmas,
              'turmas_elegiveis_media', turmas_elegiveis_media,
              'carteira_alunos', carteira_alunos
            )
          ),
          '{}'::jsonb
        )
        into v_operacional
        from kpis_professor;

        with operacional as (
          select value as item from jsonb_array_elements(v_kpis)
        )
        select jsonb_build_object(
          'total_turmas', coalesce(sum((item->>'total_turmas')::integer), 0)
        )
        into v_carteira_carga
        from operacional;

        return jsonb_build_object(
          'operacional', v_operacional,
          'carteira_carga', v_carteira_carga
        );
      end;
      $function$;
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = await readFile(performanceMigrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, String.raw`
      select public.montar_relatorio_coordenacao_payload_v3(
        '10000000-0000-0000-0000-000000000001'::uuid,
        2026,
        8,
        'ciclo'
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.deepEqual(payload.operacional['7'], {
      total_turmas: 3,
      alunos_via_turmas: 5,
      turmas_elegiveis_media: 3,
      carteira_alunos: 4,
    });
    assert.equal(payload.carteira_carga.total_turmas, 3);
  } finally {
    docker(['stop', container]);
  }
});

test('migration final recompila exatamente o corpo vivo auditado e preserva as guardas', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const definitionsSql = await readFile(liveFunctionsFixturePath, 'utf8');

  const container = `la-relatorio-painel-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, [
      'create role anon;',
      'create role authenticated;',
      'create role service_role;',
      String.raw`
        create table public.unidades (id uuid primary key, nome text not null);
        create table public.professores (id integer primary key, nome text not null, ativo boolean not null);
        create table public.professores_unidades (
          professor_id integer not null,
          unidade_id uuid not null,
          emusys_ativo boolean not null,
          validacao_status text not null,
          disponibilidade jsonb
        );
        create table public.professor_acoes (
          id integer primary key,
          professor_id integer,
          unidade_id uuid,
          tipo text,
          titulo text,
          status text,
          data_agendada date
        );
        create table public.catalogo_treinamentos (
          nome text,
          descricao text,
          foco text,
          ativo boolean
        );

        create function public.fn_health_score_professor_v3_ator_leitura(uuid)
        returns integer language sql stable as $fn$ select null::integer $fn$;

        create function public.fn_health_score_v3_periodo(date, text)
        returns table (
          periodo_inicio date,
          periodo_fim date,
          ciclo_codigo text,
          periodo_label text
        ) language sql stable as $fn$
          select date_trunc('month', $1)::date,
            (date_trunc('month', $1) + interval '1 month - 1 day')::date,
            'fixture'::text,
            'Fixture'::text
        $fn$;

        create function public.get_health_score_professor_v3_performance_snapshot_v3(date, uuid, text)
        returns table (
          professor_id integer,
          unidade_id uuid,
          comparabilidade_estado text,
          score_observado numeric,
          valor_bruto numeric,
          metrica text,
          meta numeric,
          codigo_evidencia text
        ) language sql stable as $fn$
          select 7, $2, 'comparavel'::text, 90::numeric,
            v.valor, v.metrica, v.meta, 'evidencia_valida'::text
          from (values
            ('numero_alunos'::text, 10::numeric, null::numeric),
            ('retencao'::text, 95::numeric, 80::numeric),
            ('presenca'::text, 90::numeric, 75::numeric)
          ) v(metrica, valor, meta)
        $fn$;

        create function public.get_health_score_professor_v3_capacidade_diagnostico(date, uuid)
        returns table (
          professor_id integer,
          unidade_id uuid,
          capacidade_excedida boolean,
          capacidade_fisica boolean,
          evidencias jsonb,
          curso_id integer,
          turma_chave text
        ) language sql stable as $fn$
          select null::integer, null::uuid, false, false, '{}'::jsonb, null::integer, null::text
          where false
        $fn$;

        insert into public.unidades values ('10000000-0000-0000-0000-000000000001', 'Recreio');
        insert into public.professores values (7, 'Professor Fixture', true);
        insert into public.professores_unidades values (
          7,
          '10000000-0000-0000-0000-000000000001',
          true,
          'validado',
          '{"segunda": true}'::jsonb
        );
        insert into public.catalogo_treinamentos values ('Acolhimento', 'Descricao', 'Foco', true);
      `,
      'set check_function_bodies = off;',
      definitionsSql,
    ].join('\n'));
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = await readFile(panelParityMigrationPath, 'utf8');
    const applied = psql(container, `set check_function_bodies = off;\n${migration}`);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, String.raw`
      select jsonb_build_object(
        'hash', md5(replace(
          pg_get_functiondef(
            'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'::regprocedure
          ),
          E'\r\n',
          E'\n'
        )),
        'base_periodo', pg_get_functiondef(
          'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'::regprocedure
        ) like '%get_kpis_professor_periodo_canonico_base_20260711%',
        'roster_ativo', pg_get_functiondef(
          'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'::regprocedure
        ) like '%active_roster%',
        'metadados_ciclo', pg_get_functiondef(
          'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'::regprocedure
        ) like '%v_periodo_publicacao_oficial%',
        'qualidade_sem_falso_zero', pg_get_functiondef(
          'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'::regprocedure
        ) like '%professores_sem_fonte%',
        'contexto', public.montar_relatorio_coordenacao_contexto_v3_v1(
          '10000000-0000-0000-0000-000000000001'::uuid,
          2026,
          9,
          'mensal'
        )
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepEqual({
      hash: payload.hash,
      base_periodo: payload.base_periodo,
      roster_ativo: payload.roster_ativo,
      metadados_ciclo: payload.metadados_ciclo,
      qualidade_sem_falso_zero: payload.qualidade_sem_falso_zero,
    }, {
      hash: 'c7aeb3256b177cf4fd782c5705f03ab7',
      base_periodo: true,
      roster_ativo: true,
      metadados_ciclo: true,
      qualidade_sem_falso_zero: true,
    });
    assert.equal(payload.contexto.periodo.unidade_nome, 'Recreio');
    assert.equal(payload.contexto.mapa_sinais.length, 1);
    assert.equal(payload.contexto.mapa_sinais[0].sinal, 'expansao_sustentavel');
    assert.equal(payload.contexto.mapa_sinais[0].professor, 'Professor Fixture');
    assert.equal(payload.contexto.agenda_treinamentos.catalogo[0].nome, 'Acolhimento');
  } finally {
    docker(['stop', container]);
  }
});
