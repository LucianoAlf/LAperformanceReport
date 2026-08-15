import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260812210110_aula_operacional_prioriza_roster.sql',
);
const recoveryPath = path.join(
  root,
  'supabase/migrations/20260812210328_recuperar_fila_aula_operacional_transitoria.sql',
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
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      // A imagem oficial aceita uma conexão provisória durante o initdb e
      // reinicia logo depois. Confirmar a segunda conexão evita um socket
      // efêmero antes de carregar o fixture.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (psql(container, 'select 1;').status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL de teste não iniciou a tempo');
}

const fixtureSchema = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.unidades (id uuid primary key, nome text not null);
  create table public.professores (id integer primary key, nome text not null);
  create table public.alunos (id integer primary key, nome text not null);
  create table public.aulas_emusys (
    id integer primary key,
    emusys_id integer,
    unidade_id uuid,
    professor_id integer,
    professor_nome text,
    data_aula date not null,
    data_hora_inicio timestamptz not null,
    data_hora_fim timestamptz,
    curso_nome text,
    turma_nome text,
    tipo text,
    categoria text,
    cancelada boolean default false,
    anotacoes text,
    anotacoes_fabio text
  );
  create table public.aula_alunos_emusys (
    aula_emusys_id integer not null,
    aluno_id integer,
    aluno_nome text not null
  );
  create table public.aluno_presenca (
    id integer generated always as identity primary key,
    aula_emusys_id integer not null,
    aluno_id integer not null,
    status text,
    status_presenca text,
    respondido_por text
  );
  create table public.aluno_presenca_administrativo (
    aula_emusys_id integer not null,
    aluno_id integer not null,
    justificada boolean default false
  );
  create table public.lead_experimental_aulas (
    id bigint generated always as identity primary key,
    aula_local_id integer,
    lead_experimental_id bigint,
    cancelado_em timestamptz
  );
  create table public.lead_experimentais (
    id bigint generated always as identity primary key,
    nome_aluno text
  );
  create table public.fabio_registros_aula (
    id uuid primary key default gen_random_uuid(),
    professor_id integer,
    status text,
    parent_id uuid,
    aluno_id integer,
    aula_id integer,
    criado_em timestamptz default now()
  );
  create table public.fabio_fila_audios (
    id uuid primary key default gen_random_uuid(),
    professor_id integer,
    unidade_id uuid,
    aula_id integer,
    storage_path text not null,
    status text not null,
    transcricao text,
    erro text,
    erro_tipo text not null default 'transitorio',
    tentativas integer not null default 0,
    origem text not null default 'app',
    atualizado_em timestamptz not null default now()
  );
  create table public.audit_log (
    id uuid primary key default gen_random_uuid(),
    tabela varchar not null,
    registro_id uuid,
    registro_id_text text,
    acao varchar(20) not null,
    dados_antigos jsonb,
    dados_novos jsonb,
    usuario varchar,
    origem text,
    created_at timestamptz default now()
  );

  create function public.fn_professor_do_usuario() returns integer
  language sql stable as $$ select 19 $$;
  create function public.fn_presenca_fecha_chamada(text, text) returns boolean
  language sql stable as $$ select false $$;
  create function public.fn_curso_base(text) returns text
  language sql immutable as $$ select $1 $$;
  create function public.fn_data_corte_cobranca() returns date
  language sql stable as $$ select current_date - 30 $$;
  create function public.fn_janela_registro_dias() returns integer
  language sql stable as $$ select 7 $$;

  create or replace function public.app_minha_agenda_sessao(p_data date default current_date)
  returns jsonb language plpgsql stable security definer
  set search_path = pg_catalog, public
  as $function$
  declare v_professor_id integer := public.fn_professor_do_usuario();
  begin
  return coalesce((
    with aulas_dia as (
      select ae.* from public.aulas_emusys ae
       where ae.professor_id = v_professor_id and ae.data_aula = p_data
         and coalesce(ae.cancelada, false) = false
    ), slots as (
      select data_hora_inicio, data_hora_fim,
             (array_agg(id order by case when tipo = 'turma' then 0 else 1 end, id))[1] as aula_id_ancora
        from aulas_dia
       group by data_hora_inicio, data_hora_fim
    ), ancoras as (
      select ae.* from slots s join aulas_dia ae on ae.id = s.aula_id_ancora
    )
    select jsonb_agg(jsonb_build_object('aula_id_ancora', id) order by id) from ancoras
  ), '[]'::jsonb);
  end
  $function$;

  create or replace function public.fabio_aulas_candidatas(
    p_professor_id integer, p_fluxo text, p_referencia timestamptz default now()
  ) returns jsonb language plpgsql stable security definer
  set search_path = pg_catalog, public
  as $function$
  declare v_total integer;
  begin
    select count(*) into v_total from public.aulas_emusys ae
      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false;
    select count(*) into v_total from public.aulas_emusys ae
      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false;
    return jsonb_build_object('total', v_total);
  end
  $function$;

  create or replace function public.fn_enfileirar_audio_core(
    p_aula_id integer, p_storage_path text, p_duracao_segundos integer,
    p_registro_id uuid, p_origem text, p_professor_id integer
  ) returns jsonb language plpgsql security definer
  set search_path = pg_catalog, public
  as $function$
  declare v_aula public.aulas_emusys%rowtype;
  begin
  select * into v_aula from public.aulas_emusys where id = p_aula_id;
  if not found then raise exception 'Aula % nao encontrada', p_aula_id; end if;
  return jsonb_build_object('aula_id', p_aula_id);
  end
  $function$;

  insert into public.unidades values ('11111111-1111-1111-1111-111111111111', 'Recreio');
  insert into public.professores values (19, 'Professor');
  insert into public.alunos values (10, 'Hugo'), (20, 'Arthur');

  -- Leonardo: antiga vazia + turma atual + individual atual.
  insert into public.aulas_emusys
    (id, unidade_id, professor_id, professor_nome, data_aula, data_hora_inicio,
     data_hora_fim, curso_nome, turma_nome, tipo)
  values
    (100, '11111111-1111-1111-1111-111111111111', 19, 'Professor', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'Guitarra T', 'G_Qua_14', 'turma'),
    (200, '11111111-1111-1111-1111-111111111111', 19, 'Professor', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'Guitarra T', 'G_Qua_14', 'turma'),
    (201, '11111111-1111-1111-1111-111111111111', 19, 'Professor', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'Guitarra T', null, 'individual');
  insert into public.aula_alunos_emusys values (200, 10, 'Hugo'), (201, 10, 'Hugo');

  -- Matheus: turma vazia + reposição individual com roster.
  insert into public.aulas_emusys
    (id, unidade_id, professor_id, professor_nome, data_aula, data_hora_inicio,
     data_hora_fim, curso_nome, turma_nome, tipo)
  values
    (300, '11111111-1111-1111-1111-111111111111', 19, 'Professor', current_date + 5,
     now() + interval '5 days', now() + interval '5 days 1 hour', 'Musicalização', 'MP_Seg_18', 'turma'),
    (301, '11111111-1111-1111-1111-111111111111', 19, 'Professor', current_date + 5,
     now() + interval '5 days', now() + interval '5 days 1 hour', 'Musicalização', null, 'individual'),
    (400, '11111111-1111-1111-1111-111111111111', 19, 'Professor', current_date + 6,
     now() + interval '6 days', now() + interval '6 days 1 hour', 'Piano', 'P_Seg_19', 'turma');
  insert into public.aula_alunos_emusys values (301, 20, 'Arthur');

  insert into public.fabio_fila_audios
    (id, professor_id, unidade_id, aula_id, storage_path, status, erro, tentativas)
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 19,
     '11111111-1111-1111-1111-111111111111', 100, 'audio.webm', 'erro',
     'normalizacao_invalida', 7);
`;

test('migration resolve slots reais, preserva vazio único e religa fila com auditoria', async (t) => {
  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }

  const container = `la-aula-operacional-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const fixture = psql(container, fixtureSchema);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    const migration = fs.readFileSync(migrationPath, 'utf8');
    const setup = psql(container, migration);
    const agendaDefinition = psql(
      container,
      "select pg_get_functiondef('public.app_minha_agenda_sessao(date)'::regprocedure);",
    );
    assert.equal(
      setup.status,
      0,
      `${setup.stderr || setup.stdout}\napp_minha_agenda_sessao:\n${agendaDefinition.stdout}`,
    );

    assert.ok(fs.existsSync(recoveryPath), 'falta migration de recuperação transitória');
    const recovery = psql(container, fs.readFileSync(recoveryPath, 'utf8'));
    assert.equal(recovery.status, 0, recovery.stderr || recovery.stdout);

    const resolved = psql(container, `
      select public.fn_aula_operacional_id(id)
      from (values (100), (200), (201), (300), (301), (400)) ids(id)
      order by id;
    `);
    assert.equal(resolved.status, 0, resolved.stderr || resolved.stdout);
    assert.deepEqual(resolved.stdout.trim().split(/\r?\n/u), ['200', '200', '200', '301', '301', '400']);

    const agendaLeonardo = psql(container, `
      select public.app_minha_agenda_sessao(current_date - 1)::text;
    `);
    assert.equal(agendaLeonardo.status, 0, agendaLeonardo.stderr || agendaLeonardo.stdout);
    assert.deepEqual(JSON.parse(agendaLeonardo.stdout.trim()), [{ aula_id_ancora: 200 }]);

    const agendaComoApp = psql(container, `
      set role authenticated;
      select public.app_minha_agenda_sessao(current_date - 1)::text;
      reset role;
    `);
    assert.equal(agendaComoApp.status, 0, agendaComoApp.stderr || agendaComoApp.stdout);
    const jsonComoApp = agendaComoApp.stdout
      .trim()
      .split(/\r?\n/u)
      .find((linha) => linha.startsWith('['));
    assert.deepEqual(JSON.parse(jsonComoApp), [{ aula_id_ancora: 200 }]);

    const relink = psql(container, `
      select aula_id || '|' || status || '|' || tentativas || '|' || coalesce(erro, '<null>')
      from public.fabio_fila_audios
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      select count(*) from public.audit_log
      where registro_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        and acao = 'relink_aula_roster';
    `);
    assert.equal(relink.status, 0, relink.stderr || relink.stdout);
    assert.deepEqual(relink.stdout.trim().split(/\r?\n/u), ['200|pendente|0|<null>', '1']);

    const acl = psql(container, `
      select has_function_privilege('anon', 'public.fn_aula_operacional_id(integer)', 'execute'),
             has_function_privilege('authenticated', 'public.fn_aula_operacional_id(integer)', 'execute'),
             has_function_privilege('service_role', 'public.fn_aula_operacional_id(integer)', 'execute');
    `);
    assert.equal(acl.status, 0, acl.stderr || acl.stdout);
    assert.equal(acl.stdout.trim(), 'f|f|t');
  } finally {
    docker(['stop', container]);
  }
});
