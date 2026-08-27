import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260827031300_presenca_consumidores_numericos_v2.sql';

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

function psqlAs(container, user, password, sql) {
  const result = docker([
    'exec', '-e', `PGPASSWORD=${password}`, '-i', container,
    'psql', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1',
    '-U', user, '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = docker([
      'exec', container, 'pg_isready', '-h', '127.0.0.1',
      '-U', 'postgres', '-d', 'postgres',
    ]);
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL 17 descartavel nao ficou pronto via TCP');
}

test('PostgreSQL compila produtores v2 e preserva inventario real', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-presenca-kpi-produtores-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);

    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role fabio_agent nologin;
      create role app_user login password 'app' in role authenticated;

      create table public.vw_presenca_ocorrencia_canonica_v2 (
        slot_key text, aluno_id integer, unidade_id uuid,
        professor_id integer, data_aula date,
        data_hora_inicio timestamptz, data_hora_fim timestamptz,
        curso_nome text, resultado_canonico text, fecha_chamada boolean,
        fonte_decisao text, decidido_em timestamptz,
        emusys_presenca_bruta text, possui_conflito boolean,
        ids_aulas_emusys integer[], regra_versao text
      );
      create table public.aulas_emusys (
        id integer primary key, unidade_id uuid, data_aula date,
        data_hora_fim timestamptz, categoria text, cancelada boolean,
        professor_id integer
      );
      create function public.fn_presenca_pendencias_do_dia_v2(uuid, date)
      returns jsonb language sql stable security definer as $$
        select jsonb_build_object(
          'dados_status', 'atualizados', 'sincronizado_em', now(),
          'pendencias', '[]'::jsonb, 'conflitos', '[]'::jsonb,
          'revisoes_estruturais', '[]'::jsonb
        )
      $$;

      create table public.vw_aluno_identidade_unidade_canonica (
        unidade_id uuid, pessoa_chave text, aluno_id_canonico integer,
        aluno_ids_locais integer[], identidade_fonte text,
        identidade_confianca text
      );
      create table public.alunos (
        id integer primary key, nome text, unidade_id uuid, curso_id integer,
        professor_atual_id integer, telefone text, whatsapp text,
        responsavel_telefone text, status text
      );
      create table public.unidades (id uuid primary key, codigo text);
      create table public.cursos (
        id integer primary key, nome text, is_projeto_banda boolean
      );
      create table public.professores (
        id integer primary key, nome text, ativo boolean, usuario_id uuid
      );
      create table public.professores_unidades (
        professor_id integer, unidade_id uuid, emusys_ativo boolean,
        validacao_status text
      );
      create table public.vw_aluno_sucesso_lista (
        id integer, nome text, unidade_id uuid, unidade_codigo text,
        professor_atual_id integer, professor_nome text, curso_nome text,
        foto_url text
      );
      create table public.aluno_feedback_professor (
        aluno_id integer, professor_id integer, feedback text,
        pratica_em_casa text, evolucao text, animo text, observacao text,
        competencia date, atualizado_em timestamptz, respondido_em timestamptz
      );
      create table public.movimentacoes_admin (
        aluno_id integer, tipo text, mes_saida date
      );

      create function public.is_admin() returns boolean
      language sql stable as $$ select false $$;
      create function public.get_user_unidade_ids()
      returns table (unidade_id uuid) language sql stable as $$
        select null::uuid where false
      $$;
      create function public.fn_competencia_feedback() returns date
      language sql stable as $$ select date '2026-08-01' $$;
      create function public.fn_health_score_v3_periodo(date, text)
      returns table (periodo_inicio date, periodo_fim date, ciclo_codigo text)
      language sql stable as $$
        select date_trunc('month', $1)::date,
          (date_trunc('month', $1) + interval '1 month - 1 day')::date,
          'fixture'::text
      $$;
      create function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
      returns table (unidade_id uuid) language sql stable as $$
        select $1 where $1 is not null
      $$;
    `);

    const migration = readFileSync(migrationPath, 'utf8');
    psql(container, migration);

    const inventory = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'metric_view', to_regclass('public.vw_presenca_ocorrencia_metrica_v2') is not null,
        'aluno_view', to_regclass('public.vw_aluno_frequencia_canonica_v1') is not null,
        'faltas_v2', to_regprocedure('public.get_faltas_periodo_v2(uuid,date,date)') is not null,
        'faltas_legacy', to_regprocedure('public.get_faltas_periodo(uuid,date,date)') is not null,
        'absenteismo', to_regclass('public.vw_absenteismo_aluno') is not null,
        'radar', to_regclass('public.vw_radar_aluno_sinais') is not null,
        'health', to_regprocedure('public.get_health_score_professor_v3_presenca_periodo_v2(date,uuid,text)') is not null,
        'kpi_v2_recriado', to_regprocedure('public.get_kpis_professor_periodo_canonico_v2(integer,integer,uuid,date,date)') is not null,
        'gerencial_recriado', to_regprocedure('public.get_relatorio_gerencial_canonico_v1(uuid,date)') is not null
      );
    `));
    assert.deepEqual(inventory, {
      metric_view: true,
      aluno_view: true,
      faltas_v2: true,
      faltas_legacy: true,
      absenteismo: true,
      radar: true,
      health: true,
      kpi_v2_recriado: false,
      gerencial_recriado: false,
    });

    const empty = JSON.parse(psql(container, String.raw`
      select row_to_json(x)
      from public.get_presenca_metricas_canonicas_v2(
        '60000000-0000-0000-0000-000000000006',
        '2026-08-20', '2026-08-20', null, null
      ) x;
    `));
    assert.equal(empty.estado_publicacao, 'sem_base');
    assert.equal(empty.denominador, null);

    const unit = '60000000-0000-0000-0000-000000000006';
    const serviceCount = psql(container, String.raw`
      insert into public.unidades values ('${unit}', 'RC');
      insert into public.cursos values (1, 'Piano', false);
      insert into public.professores values (20, 'Professor', true, null);
      insert into public.alunos values
        (10, 'Aluno', '${unit}', 1, 20, null, null, null, 'ativo');
      insert into public.vw_aluno_identidade_unidade_canonica values
        ('${unit}', 'pessoa-10', 10, array[10], 'fixture', 'alta');
      insert into public.aulas_emusys values
        (30, '${unit}', date '2026-08-20',
         timestamptz '2026-08-20 13:00:00-03', 'normal', false, 20);
      insert into public.vw_presenca_ocorrencia_canonica_v2 values
        ('slot-1', 10, '${unit}', 20, date '2026-08-20',
         timestamptz '2026-08-20 12:00:00-03',
         timestamptz '2026-08-20 13:00:00-03', 'Piano', 'falta', true,
         'agenda_secretaria', now(), 'ausente', false, array[30], 'v2');
      select count(*) from public.get_faltas_periodo_v2(
        '${unit}', date '2026-08-20', date '2026-08-20'
      );
    `).split(/\r?\n/u).at(-1);
    assert.equal(serviceCount, '1');

    const unauthorized = psqlAs(container, 'app_user', 'app', String.raw`
      select set_config('request.jwt.claim.role', 'authenticated', false);
      select json_build_object(
        'faltas', (select count(*) from public.get_faltas_periodo_v2(
          '${unit}', date '2026-08-20', date '2026-08-20'
        )),
        'professor', (select count(*)
          from public.get_frequencia_professor_periodo_canonica_v1(
            2026, 8, '${unit}', date '2026-08-20', date '2026-08-20'
          )),
        'absenteismo', (select count(*) from public.vw_absenteismo_aluno)
      );
    `).split(/\r?\n/u).at(-1);
    assert.deepEqual(JSON.parse(unauthorized), {
      faltas: 0,
      professor: 0,
      absenteismo: 0,
    });
  } finally {
    docker(['rm', '-f', container]);
  }
});
