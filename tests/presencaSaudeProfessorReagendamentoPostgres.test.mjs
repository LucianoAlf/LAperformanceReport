import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const IMAGE = process.env.PRESENCA_SAUDE_POSTGRES_IMAGE || 'postgres:17-alpine';
const MIGRATIONS = [
  'supabase/migrations/20260828101455_presenca_professor_ocorrencia_vigente.sql',
  'supabase/migrations/20260828102034_presenca_professor_reagendamento_fail_closed.sql',
];
const UNIDADE = '11111111-1111-1111-1111-111111111111';
const AUTH_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function psql(container, sql) {
  return docker(
    ['exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'],
    { input: sql },
  );
}

function waitForPostgres(container) {
  let consecutive = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      'docker',
      ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'],
      { encoding: 'utf8' },
    );
    consecutive = probe.status === 0 ? consecutive + 1 : 0;
    if (consecutive >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

test('ocorrencia vigente protege Agenda, LA Teacher, saude e ACL apos reagendamento', () => {
  const container = `la-presenca-saude-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role sol_acesso_restrito nologin;
      create role lia_acesso_restrito nologin;
      create role mila_acesso_restrito nologin;
      create role fabio_agent nologin;

      create schema auth;
      create function auth.uid() returns uuid language sql stable
      as $$ select '${AUTH_UID}'::uuid $$;

      create table public.usuarios(
        id integer primary key,
        auth_user_id uuid,
        ativo boolean not null default true
      );
      create table public.unidades(
        id uuid primary key,
        nome text not null,
        ativo boolean not null default true
      );
      create table public.aulas_emusys(
        id integer primary key,
        emusys_id integer,
        unidade_id uuid not null,
        professor_id integer,
        data_aula date not null,
        data_hora_inicio timestamptz not null,
        data_hora_fim timestamptz not null,
        duracao_minutos integer,
        professor_presenca text,
        professor_presenca_origem text,
        cancelada boolean default false,
        cancelada_origem text,
        categoria text not null default 'normal'
      );
      create table public.professor_ponto_confirmacoes(
        id uuid primary key default gen_random_uuid(),
        professor_id integer not null,
        aula_emusys_id integer not null,
        unidade_id uuid not null,
        data_aula date not null,
        estava_presente boolean not null,
        origem text not null default 'fabio',
        respondido_em timestamptz not null default now(),
        created_at timestamptz not null default now(),
        constraint professor_ponto_confirmacoes_prof_aula_uq
          unique (professor_id, aula_emusys_id)
      );
      create table public.aluno_presenca(
        aula_emusys_id integer,
        status_presenca text,
        status text,
        respondido_por text,
        respondido_em timestamptz,
        espelhado_de_presenca_id uuid,
        emusys_presenca_bruta text,
        emusys_presenca_bruta_anterior text,
        emusys_presenca_alterada_em timestamptz,
        data_aula date,
        horario_aula time
      );
      create table public.automacao_log(
        id bigint generated always as identity primary key,
        aluno_nome text,
        evento text,
        acao text,
        status text,
        detalhes jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default clock_timestamp()
      );

      create function public.usuario_tem_permissao(integer,text,uuid)
      returns boolean language sql stable as $$ select true $$;
      create function public.fn_professor_do_usuario()
      returns integer language sql stable as $$ select 80 $$;
      create function public.fn_presenca_e_forte(text)
      returns boolean language sql immutable as $$ select $1 in ('manual','professor','fabio') $$;

      insert into public.usuarios(id,auth_user_id) values (1,'${AUTH_UID}');
      insert into public.unidades(id,nome) values ('${UNIDADE}','Teste');
      insert into public.aulas_emusys(
        id,emusys_id,unidade_id,professor_id,data_aula,data_hora_inicio,data_hora_fim,
        professor_presenca,professor_presenca_origem,cancelada,cancelada_origem
      ) values
        (1,1001,'${UNIDADE}',10,current_date,current_date-interval '4 hours',current_date-interval '3 hours','presente','agenda_secretaria',false,null),
        (2,1002,'${UNIDADE}',20,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,null),
        (3,1003,'${UNIDADE}',30,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,null),
        (4,1004,'${UNIDADE}',40,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,'sync_ausente_emusys'),
        (5,1005,'${UNIDADE}',50,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,'agenda_secretaria'),
        (7,1007,'${UNIDADE}',70,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,null),
        (8,1008,'${UNIDADE}',80,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,null),
        (9,1009,'${UNIDADE}',90,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,null),
        (10,1010,'${UNIDADE}',100,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,null),
        (12,1012,'${UNIDADE}',120,current_date,current_date-interval '4 hours',current_date-interval '3 hours','presente','agenda_secretaria',false,null),
        (13,1013,'${UNIDADE}',130,current_date,current_date-interval '4 hours',current_date-interval '3 hours','ausente',null,false,null);

      -- Linhas antigas sao criadas antes do trigger corretivo, como no banco real.
      insert into public.professor_ponto_confirmacoes(
        id,professor_id,aula_emusys_id,unidade_id,data_aula,
        estava_presente,origem,respondido_em
      ) values
        ('00000000-0000-0000-0000-000000000001',10,1,'${UNIDADE}',current_date,true,'chamada_secretaria',now()-interval '1 hour'),
        ('00000000-0000-0000-0000-000000000002',20,2,'${UNIDADE}',current_date,true,'chamada_secretaria',now()-interval '1 hour'),
        ('00000000-0000-0000-0000-000000000003',30,3,'${UNIDADE}',current_date-1,true,'chamada_secretaria',now()-interval '1 day'),
        ('00000000-0000-0000-0000-000000000007',70,7,'${UNIDADE}',current_date-1,true,'chamada_secretaria',now()-interval '2 hours'),
        ('00000000-0000-0000-0000-000000000008',80,8,'${UNIDADE}',current_date,true,'fabio',now()-interval '2 hours'),
        ('00000000-0000-0000-0000-000000000009',99,9,'${UNIDADE}',current_date-1,true,'chamada_secretaria',now()-interval '1 day'),
        ('00000000-0000-0000-0000-000000000010',100,10,'${UNIDADE}',current_date,true,'chamada_secretaria',now()-interval '2 hours'),
        ('00000000-0000-0000-0000-000000000012',120,12,'${UNIDADE}',current_date-1,true,'chamada_secretaria',now()-interval '1 day'),
        ('00000000-0000-0000-0000-000000000013',130,13,'${UNIDADE}',current_date-1,true,'chamada_secretaria',now()-interval '1 day');

      insert into public.automacao_log(acao,status,detalhes,created_at) values
        ('presenca_limpa_por_reagendamento','warn',jsonb_build_object('aula_id',7),now()-interval '1 hour'),
        ('presenca_limpa_por_reagendamento','warn',jsonb_build_object('aula_id',8),now()-interval '1 hour');

      grant select on public.unidades, public.aulas_emusys,
        public.professor_ponto_confirmacoes, public.aluno_presenca,
        public.automacao_log to service_role;
    `);

    for (const migration of MIGRATIONS) {
      psql(container, readFileSync(migration, 'utf8'));
    }

    // O ON CONFLICT real da Agenda precisa atualizar a identidade da ocorrencia.
    psql(container, String.raw`
      select public.app_marcar_presenca_professor_aula(7,true);
      update public.aulas_emusys
         set professor_presenca='ausente', professor_presenca_origem=null
       where id=7;

      select public.app_registrar_presenca_professor_dia(
        130,current_date,'${UNIDADE}',null,null
      );

      select public.app_remover_presenca_professor_dia(
        120,current_date,'${UNIDADE}'
      );

      select public.app_responder_confirmacao_ponto(8,true);
    `);

    const writeState = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'agenda_data_atual',(
          select data_aula=current_date from public.professor_ponto_confirmacoes
          where aula_emusys_id=7 and professor_id=70
        ),
        'dia_data_atual',(
          select data_aula=current_date from public.professor_ponto_confirmacoes
          where aula_emusys_id=13 and professor_id=130
        ),
        'remocao_por_ocorrencia',not exists(
          select 1 from public.professor_ponto_confirmacoes
          where aula_emusys_id=12 and professor_id=120
        ),
        'fabio_data_atual',(
          select data_aula=current_date and respondido_em > now()-interval '30 minutes'
          from public.professor_ponto_confirmacoes
          where aula_emusys_id=8 and professor_id=80
        )
      );
    `));
    assert.deepEqual(writeState, {
      agenda_data_atual: true,
      dia_data_atual: true,
      remocao_por_ocorrencia: true,
      fabio_data_atual: true,
    });

    const secondFabio = JSON.parse(psql(container, String.raw`
      select public.app_responder_confirmacao_ponto(8,false);
    `));
    assert.deepEqual(secondFabio, { registrado: false, first_write_wins: true });

    // Reagendamento no mesmo dia tambem cria uma fronteira de ocorrencia,
    // mesmo sem qualquer linha de aluno para provocar o log antigo.
    psql(container, String.raw`
      update public.aulas_emusys
         set data_hora_inicio=data_hora_inicio+interval '30 minutes',
             data_hora_fim=data_hora_fim+interval '30 minutes'
       where id=10;
    `);
    assert.equal(
      Number(psql(container, String.raw`
        select count(*) from public.automacao_log
        where acao='presenca_limpa_por_reagendamento'
          and detalhes->>'aula_id'='10';
      `)),
      1,
    );

    const pointState = JSON.parse(psql(container, String.raw`
      select json_object_agg(aula_emusys_id,ponta_confirmada order by aula_emusys_id)
      from public.vw_ponto_professor_aulas
      where aula_emusys_id in (3,7,8,9,10);
    `));
    assert.deepEqual(pointState, {
      3: false,
      7: true,
      8: true,
      9: false,
      10: false,
    });

    const health = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'marcacoes',marcacoes_humanas,
        'revertidas',revertidas,
        'cancelamentos',cancelamentos_humanos_desfeitos,
        'sem_procedencia',sem_procedencia_na_ficha
      )
      from public.vw_saude_presenca_professor
      where unidade_id='${UNIDADE}';
    `));
    assert.deepEqual(health, {
      marcacoes: 3,
      revertidas: 2,
      cancelamentos: 1,
      sem_procedencia: 2,
    });

    const acl = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'security_invoker',coalesce(c.reloptions,'{}') @> array['security_invoker=true'],
        'anon',has_table_privilege('anon',c.oid,'select'),
        'authenticated',has_table_privilege('authenticated',c.oid,'select'),
        'sol',has_table_privilege('sol_acesso_restrito',c.oid,'select'),
        'lia',has_table_privilege('lia_acesso_restrito',c.oid,'select'),
        'mila',has_table_privilege('mila_acesso_restrito',c.oid,'select'),
        'fabio',has_table_privilege('fabio_agent',c.oid,'select'),
        'service',has_table_privilege('service_role',c.oid,'select'),
        'point_agents_blocked',not exists(
          select 1 from pg_roles r
          where r.rolname in (
            'sol_acesso_restrito','lia_acesso_restrito',
            'mila_acesso_restrito','fabio_agent'
          )
          and has_table_privilege(
            r.rolname,'public.vw_ponto_professor_aulas','select'
          )
        ),
        'writer_agents_blocked',not exists(
          select 1 from pg_roles r
          where r.rolname in (
            'sol_acesso_restrito','lia_acesso_restrito',
            'mila_acesso_restrito','fabio_agent'
          )
          and has_function_privilege(
            r.rolname,
            'public.app_marcar_presenca_professor_aula(integer,boolean)',
            'execute'
          )
        ),
        'teacher_rpc_authenticated',has_function_privilege(
          'authenticated',
          'public.app_responder_confirmacao_ponto(integer,boolean)',
          'execute'
        ),
        'teacher_locks_occurrence',pg_get_functiondef(
          'public.app_responder_confirmacao_ponto(integer,boolean)'::regprocedure
        ) ilike '%for share%',
        'reschedule_fail_closed',pg_get_functiondef(
          'public.fn_reagendamento_limpa_chamada_alunos()'::regprocedure
        ) not ilike '%exception when others%'
      )
      from pg_class c
      where c.oid='public.vw_saude_presenca_professor'::regclass;
    `));
    assert.deepEqual(acl, {
      security_invoker: true,
      anon: false,
      authenticated: false,
      sol: false,
      lia: false,
      mila: false,
      fabio: false,
      service: true,
      point_agents_blocked: true,
      writer_agents_blocked: true,
      teacher_rpc_authenticated: true,
      teacher_locks_occurrence: true,
      reschedule_fail_closed: true,
    });

    const serviceResult = psql(container, String.raw`
        set role service_role;
        select count(*) from public.vw_saude_presenca_professor;
        reset role;
      `);
    assert.equal(
      Number(serviceResult.split(/\r?\n/u).find((line) => /^\d+$/u.test(line))),
      1,
    );
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
