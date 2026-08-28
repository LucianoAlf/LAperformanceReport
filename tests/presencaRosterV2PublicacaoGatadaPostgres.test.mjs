import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const MIGRATION =
  'supabase/migrations/20260828005722_presenca_roster_v2_publicacao_gatada.sql';
const INTERNAL_HELPERS_MIGRATION =
  'supabase/migrations/20260828051500_presenca_la_teacher_helpers_internos.sql';
const ROOT = process.cwd();
const IMAGE = process.env.PRESENCA_PUBLICACAO_POSTGRES_IMAGE || 'postgres:17-alpine';
const CONTAINER = `la-presenca-publicacao-${process.pid}`;
const UNIDADE = '11111111-1111-4111-8111-111111111111';
const UNIDADE_B = '22222222-2222-4222-8222-222222222222';
const UNIDADE_C = '33333333-3333-4333-8333-333333333333';
const AUTH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HASH = 'a'.repeat(64);

const PRE_ROSTER_MIGRATIONS = [
  'supabase/migrations/20260827030200_presenca_sync_cobertura_idempotente.sql',
  'supabase/migrations/20260827030500_presenca_roster_operacional.sql',
];
const PRE_PUBLICACAO_MIGRATIONS = [
  'supabase/migrations/20260827030600_presenca_comando_auditoria.sql',
  'supabase/migrations/20260827030700_presenca_comando_porta_professor.sql',
  'supabase/migrations/20260827030800_presenca_comando_portas_fabio.sql',
  'supabase/migrations/20260827030900_presenca_comando_overloads_compatibilidade.sql',
  'supabase/migrations/20260827031600_presenca_rollout_config.sql',
  'supabase/migrations/20260828005703_presenca_roster_v2_expansao_aditiva.sql',
  'supabase/migrations/20260828005709_presenca_slot_lock_core.sql',
  'supabase/migrations/20260828005715_presenca_portas_reservadas_duais.sql',
];

const LEGACY_SIGNATURES = {
  agenda: 'public.app_minha_agenda_sessao(date)',
  teacher: 'public.app_registrar_presencas_aula(integer,integer[],uuid)',
  fabioAction: 'public.fabio_confirmar_chamada_acao(uuid,integer,text)',
  fabioRecord: 'public.fabio_emitir_presenca_por_registro(uuid)',
};
const LEGACY_ALIASES = {
  agenda: 'public.app_minha_agenda_sessao_publicacao_legado_v1(date)',
  teacher: 'public.app_registrar_presencas_aula_publicacao_legado_v1(integer,integer[],uuid)',
  fabioAction: 'public.fabio_confirmar_chamada_acao_publicacao_legado_v1(uuid,integer,text)',
  fabioRecord: 'public.fabio_emitir_presenca_por_registro_publicacao_legado_v1(uuid)',
};

let contractsBefore;
let dataBefore;

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function docker(args, input) {
  const result = execute('docker', args, { input });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function psql(sql) {
  return docker([
    'exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', 'postgres', '-tA',
  ], sql);
}

function waitForPostgres() {
  let stableProbes = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const readyProbe = execute('docker', [
      'exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-d', 'postgres',
    ]);
    const sqlProbe = readyProbe.status === 0
      ? execute('docker', [
          'exec', CONTAINER, 'psql', '--no-psqlrc', '-U', 'postgres', '-d', 'postgres',
          '-tA', '-c', 'select 1',
        ])
      : null;

    if (readyProbe.status === 0 && sqlProbe?.status === 0 && sqlProbe.stdout.trim() === '1') {
      stableProbes += 1;
      if (stableProbes === 3) return;
    } else {
      stableProbes = 0;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  assert.fail('PostgreSQL 17 descartavel nao sustentou tres probes SQL consecutivos');
}

function json(output) {
  return JSON.parse(output.split(/\r?\n/u).filter(Boolean).at(-1));
}

function asAuthenticated(sql) {
  return String.raw`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${AUTH}', false);
    select set_config('request.jwt.claim.role', 'authenticated', false);
    ${sql}
  `;
}

function asService(sql) {
  return String.raw`
    set role service_role;
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claim.role', 'service_role', false);
    ${sql}
  `;
}

function functionContract(signature) {
  return json(psql(String.raw`
    select jsonb_build_object(
      'body', p.prosrc,
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'config', to_jsonb(p.proconfig),
      'result', pg_get_function_result(p.oid),
      'arguments', pg_get_function_identity_arguments(p.oid)
    )
      from pg_proc p
     where p.oid = '${signature}'::regprocedure;
  `));
}

function stateSnapshot() {
  return json(psql(String.raw`
    select jsonb_build_object(
      'flags', (select count(*) from public.presenca_rollout_config),
      'flags_sombra', (
        select count(*) from public.presenca_rollout_config where modo = 'sombra'
      ),
      'roster', (select count(*) from public.aula_alunos_emusys),
      'roster_estado', (select count(*) from public.aula_roster_sync_estado),
      'presencas', (select count(*) from public.aluno_presenca),
      'comandos', (select count(*) from public.presenca_comandos),
      'eventos', (select count(*) from public.presenca_acao_eventos),
      'fabio_eventos', (select count(*) from public.fabio_acao_eventos)
    );
  `));
}

function dataSnapshotWithoutFlags() {
  return json(psql(String.raw`
    select jsonb_build_object(
      'roster', (select count(*) from public.aula_alunos_emusys),
      'roster_estado', (select count(*) from public.aula_roster_sync_estado),
      'presencas', (select count(*) from public.aluno_presenca),
      'comandos', (select count(*) from public.presenca_comandos),
      'eventos', (select count(*) from public.presenca_acao_eventos),
      'fabio_eventos', (select count(*) from public.fabio_acao_eventos)
    );
  `));
}

function resetRosterCounter() {
  psql("select setval('public.test_roster_v2_counter', 1, false);");
}

function rosterCounterCalled() {
  return psql('select is_called from public.test_roster_v2_counter;') === 't';
}

function resetPortCalls() {
  psql('truncate public.test_port_calls;');
}

function portCalls(name) {
  return Number(psql(String.raw`
    select coalesce((
      select chamadas from public.test_port_calls where nome = '${name}'
    ), 0);
  `));
}

function assertStaticContract() {
  const sql = readFileSync(MIGRATION, 'utf8');

  for (const signature of [
    /alter\s+function\s+public\.app_minha_agenda_sessao\s*\(date\)\s+rename\s+to/iu,
    /alter\s+function\s+public\.app_registrar_presencas_aula\s*\(integer\s*,\s*integer\[\]\s*,\s*uuid\)\s+rename\s+to/iu,
    /alter\s+function\s+public\.fabio_confirmar_chamada_acao\s*\(uuid\s*,\s*integer\s*,\s*text\)\s+rename\s+to/iu,
    /alter\s+function\s+public\.fabio_emitir_presenca_por_registro\s*\(uuid\)\s+rename\s+to/iu,
  ]) assert.match(sql, signature);

  for (const functionName of [
    'app_minha_agenda_sessao',
    'app_registrar_presencas_aula',
    'fabio_confirmar_chamada_acao',
    'fabio_emitir_presenca_por_registro',
  ]) {
    assert.match(
      sql,
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(`, 'iu'),
    );
  }

  assert.match(sql, /vw_aula_roster_operacional_v2/iu);
  assert.match(sql, /app_criar_comando_chamada_professor_v2/iu);
  assert.match(sql, /fabio_criar_comando_chamada_v2/iu);
  assert.match(sql, /app_aplicar_comando_presenca_v2/iu);
  assert.match(sql, /when\s+sqlstate\s+'40001'/iu);
  assert.match(sql, /or\s+sqlstate\s+'55P03'/iu);
  assert.match(sql, /'retryable'\s*,\s*true/iu);
  assert.doesNotMatch(sql, /when\s+sqlstate\s+'23514'/iu);

  for (const forbidden of [
    /\bpg_get_functiondef\s*\(/iu,
    /\bregexp_replace\s*\(/iu,
    /\bexception\s+when\s+others\b/iu,
    /(?:insert\s+into|update|delete\s+from)\s+public\.presenca_rollout_config\b/iu,
  ]) assert.doesNotMatch(sql, forbidden);
}

test.before(() => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  docker([
    'run', '--rm', '--name', CONTAINER,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE,
  ]);
  waitForPostgres();

  psql(String.raw`
    create schema extensions;
    create extension if not exists pgcrypto with schema extensions;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;

    create table public.unidades(id uuid primary key, nome text not null);
    insert into public.unidades values
      ('${UNIDADE}', 'Recreio'),
      ('${UNIDADE_B}', 'Barra'),
      ('${UNIDADE_C}', 'Campo Grande');

    create table public.usuarios(
      id integer primary key,
      auth_user_id uuid,
      ativo boolean not null default true
    );
    insert into public.usuarios values (1, '${AUTH}', true);

    create table public.aulas_emusys(
      id integer primary key,
      emusys_id integer not null,
      unidade_id uuid not null references public.unidades(id),
      professor_id integer,
      data_aula date not null,
      data_hora_inicio timestamptz,
      data_hora_fim timestamptz,
      categoria text not null default 'normal',
      curso_nome text,
      turma_nome text,
      sala_nome text,
      anotacoes_fabio text,
      cancelada boolean not null default false,
      justificada boolean not null default false,
      cancelada_origem text,
      cancelada_motivo text,
      cancelada_em timestamptz,
      professor_presenca text,
      professor_presenca_origem text,
      tipo text not null default 'turma'
    );

    create table public.aula_alunos_emusys(
      id bigint generated always as identity primary key,
      aula_emusys_id integer not null references public.aulas_emusys(id),
      unidade_id uuid not null references public.unidades(id),
      aluno_chave text not null,
      aluno_emusys_id bigint,
      aluno_id integer,
      aluno_nome text not null,
      aluno_nome_normalizado text,
      sincronizado_em timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(aula_emusys_id, aluno_chave)
    );

    create table public.aluno_presenca(
      id uuid primary key default gen_random_uuid(),
      aluno_id integer not null,
      aula_emusys_id integer not null,
      professor_id integer,
      unidade_id uuid,
      data_aula date,
      horario_aula time,
      status text,
      status_presenca text,
      curso_nome text,
      turma_nome text,
      sala_nome text,
      respondido_por text,
      respondido_em timestamptz,
      unique(aluno_id, aula_emusys_id)
    );
    create table public.professor_ponto_confirmacoes(
      aula_emusys_id integer,
      professor_id integer,
      primary key(aula_emusys_id, professor_id)
    );
    create table public.fabio_registros_aula(
      id uuid primary key,
      parent_id uuid,
      modo_entrada text,
      aula_id integer,
      aluno_id integer,
      professor_id integer,
      campos jsonb default '{}'::jsonb,
      status text not null default 'confirmado',
      criado_em timestamptz not null default now()
    );
    create table public.fabio_acoes_pendentes(
      id uuid primary key,
      professor_id integer,
      tipo text,
      estado text,
      expira_em timestamptz,
      aula_id integer,
      candidatas integer[],
      payload jsonb,
      ultima_resposta_wa_id text,
      atualizado_em timestamptz,
      encerrado_em timestamptz
    );
    create table public.fabio_acao_eventos(
      acao_id uuid,
      wa_message_id text unique,
      evento text,
      resultado jsonb
    );

    create function public.usuario_tem_permissao(integer, text, uuid)
    returns boolean language sql stable as $$ select true $$;
    create function public.fn_professor_do_usuario()
    returns integer language sql stable as $$
      select case auth.uid() when '${AUTH}'::uuid then 7 else null end
    $$;
    create function public.fn_janela_registro_dias()
    returns integer language sql stable as $$ select 3 $$;
    create function public.fn_presenca_e_forte(text)
    returns boolean language sql stable as $$ select false $$;
    create function public.fn_sincronizar_gemeos_presenca(integer)
    returns integer language sql as $$ select 0 $$;
    create function public.is_admin()
    returns boolean language sql stable as $$ select true $$;
    create function public.app_registrar_chamada_agenda(jsonb)
    returns jsonb language sql as $$ select jsonb_build_object('erros','[]'::jsonb) $$;
    create function public.app_registrar_presencas_aula(integer, integer[])
    returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.app_marcar_presenca_professor_aula(integer, boolean)
    returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.app_registrar_presenca_professor_dia(integer,date,uuid,time,time)
    returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.app_remover_presenca_professor_dia(integer,date,uuid)
    returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.fabio_shortlist_valida(integer,text,integer[],timestamptz)
    returns boolean language sql stable as $$ select true $$;
    create function public.fabio_acao_json(uuid)
    returns jsonb language sql stable as $$ select jsonb_build_object('id',$1) $$;

    insert into public.aulas_emusys(
      id, emusys_id, unidade_id, professor_id, data_aula,
      data_hora_inicio, data_hora_fim, curso_nome, turma_nome, sala_nome, tipo
    ) values
      (10, 100, '${UNIDADE}', 7, current_date, now()-interval '12 hours', now()-interval '11 hours', 'Piano', 'Teacher sombra', 'Sala', 'turma'),
      (11, 110, '${UNIDADE}', 7, current_date, now()-interval '10 hours', now()-interval '9 hours', 'Piano', 'Teacher canonico', 'Sala', 'turma'),
      (20, 200, '${UNIDADE}', 7, current_date, now()-interval '8 hours', now()-interval '7 hours', 'Violao', 'Fabio acao sombra', 'Sala', 'turma'),
      (21, 210, '${UNIDADE}', 7, current_date, now()-interval '6 hours', now()-interval '5 hours', 'Violao', 'Fabio acao canonico', 'Sala', 'turma'),
      (30, 300, '${UNIDADE}', 7, current_date, now()-interval '4 hours', now()-interval '3 hours', 'Canto', 'Fabio registro sombra', 'Sala', 'individual'),
      (31, 310, '${UNIDADE}', 7, current_date, now()-interval '2 hours', now()-interval '1 hour', 'Canto', 'Fabio registro canonico', 'Sala', 'individual'),
      (40, 400, '${UNIDADE}', 7, current_date, now()-interval '14 hours', now()-interval '13 hours', 'Piano', 'Curso simultaneo piano', 'Sala 1', 'turma'),
      (41, 410, '${UNIDADE}', 7, current_date, now()-interval '14 hours', now()-interval '13 hours', 'Violao', 'Curso simultaneo violao', 'Sala 2', 'turma');

    insert into public.aula_alunos_emusys(
      aula_emusys_id, unidade_id, aluno_chave, aluno_emusys_id, aluno_id, aluno_nome
    ) values
      (10, '${UNIDADE}', 'emusys:101', 101, 101, 'Aluno 101'),
      (10, '${UNIDADE}', 'emusys:102', 102, 102, 'Aluno 102'),
      (11, '${UNIDADE}', 'emusys:111', 111, 111, 'Aluno 111'),
      (11, '${UNIDADE}', 'emusys:112', 112, 112, 'Aluno 112'),
      (20, '${UNIDADE}', 'emusys:201', 201, 201, 'Aluno 201'),
      (20, '${UNIDADE}', 'emusys:202', 202, 202, 'Aluno 202'),
      (21, '${UNIDADE}', 'emusys:211', 211, 211, 'Aluno 211'),
      (21, '${UNIDADE}', 'emusys:212', 212, 212, 'Aluno 212'),
      (30, '${UNIDADE}', 'emusys:301', 301, 301, 'Aluno 301'),
      (31, '${UNIDADE}', 'emusys:311', 311, 311, 'Aluno 311'),
      (40, '${UNIDADE}', 'emusys:401', 401, 401, 'Aluno Piano'),
      (41, '${UNIDADE}', 'emusys:411', 411, 411, 'Aluno Violao');
  `);

  for (const migration of PRE_ROSTER_MIGRATIONS) {
    psql(readFileSync(migration, 'utf8'));
  }

  psql(String.raw`
    insert into public.presenca_sync_execucoes(
      id, request_id, unidade_id, modo, data_alvo, status, snapshot_hash,
      paginas_lidas, aulas_lidas, presencas_lidas, lease_segundos,
      heartbeat_em, finalizada_em
    ) values (
      '${RUN}', gen_random_uuid(), '${UNIDADE}', 'presenca', current_date,
      'concluida', '${HASH}', 1, 6, 10, 300, clock_timestamp(), clock_timestamp()
    );
    insert into public.presenca_sync_cobertura(
      unidade_id, modo, data_alvo, run_id, status, heartbeat_em, snapshot_hash,
      paginas_lidas, aulas_lidas, presencas_lidas, iniciada_em, finalizada_em
    ) values (
      '${UNIDADE}', 'presenca', current_date, '${RUN}', 'concluida',
      clock_timestamp(), '${HASH}', 1, 6, 10, clock_timestamp(), clock_timestamp()
    );
    insert into public.aula_roster_sync_estado(
      aula_id, unidade_id, run_id, estado, qtd_esperada, qtd_recebida, snapshot_hash
    ) values
      (10, '${UNIDADE}', '${RUN}', 'completo', 2, 2, repeat('b', 32)),
      (11, '${UNIDADE}', '${RUN}', 'completo', 2, 2, repeat('b', 32)),
      (20, '${UNIDADE}', '${RUN}', 'completo', 2, 2, repeat('b', 32)),
      (21, '${UNIDADE}', '${RUN}', 'completo', 2, 2, repeat('b', 32)),
      (30, '${UNIDADE}', '${RUN}', 'completo', 1, 1, repeat('b', 32)),
      (31, '${UNIDADE}', '${RUN}', 'completo', 1, 1, repeat('b', 32)),
      (40, '${UNIDADE}', '${RUN}', 'completo', 1, 1, repeat('b', 32)),
      (41, '${UNIDADE}', '${RUN}', 'completo', 1, 1, repeat('b', 32));
    update public.aula_alunos_emusys
       set ativo_operacional = true,
           ultimo_run_visto = '${RUN}';
  `);

  for (const migration of PRE_PUBLICACAO_MIGRATIONS) {
    psql(readFileSync(migration, 'utf8'));
  }

  psql(String.raw`
    -- Dublês de contrato desacoplam a Task 7 dos cores 05709/05715 em revisão.
    -- Eles mantêm assinaturas/ACL e permitem injetar SQLSTATE retryable.
    create table public.test_port_calls(
      nome text primary key,
      chamadas integer not null default 0
    );
    create or replace function public.app_criar_comando_chamada_professor_v2(
      p_request_id uuid,
      p_aula_emusys_id integer,
      p_alunos_ausentes integer[]
    ) returns jsonb language plpgsql security definer
    set search_path = pg_catalog, public as $$
    begin
      if coalesce(auth.role(), '') <> 'authenticated' then
        raise exception 'authenticated_obrigatorio' using errcode = '42501';
      end if;
      insert into public.test_port_calls(nome, chamadas)
      values ('teacher_create_v2', 1)
      on conflict (nome) do update set chamadas = test_port_calls.chamadas + 1;
      insert into public.presenca_comandos(
        request_id, tipo, fonte, auth_user_id, usuario_id, unidade_id,
        aula_id, professor_id, data_referencia, status, payload_hash, itens_total
      )
      select
        p_request_id, 'la_teacher_aula', 'professor_la_teacher', auth.uid(), 1,
        a.unidade_id, a.id, a.professor_id, a.data_aula, 'recebido',
        'stub-teacher-v2', count(r.aluno_id)::integer
        from public.aulas_emusys a
        left join public.aula_alunos_emusys r on r.aula_emusys_id = a.id
       where a.id = p_aula_emusys_id
       group by a.unidade_id, a.id, a.professor_id, a.data_aula
      on conflict (request_id) do nothing;
      return public.app_status_comando_presenca_v1(p_request_id);
    end
    $$;

    create or replace function public.fabio_criar_comando_chamada_v2(
      p_request_id uuid,
      p_professor_id integer,
      p_aula_emusys_id integer,
      p_alunos_ausentes integer[],
      p_fonte text
    ) returns jsonb language plpgsql security definer
    set search_path = pg_catalog, public as $$
    begin
      if coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'service_role_obrigatorio' using errcode = '42501';
      end if;
      insert into public.test_port_calls(nome, chamadas)
      values ('fabio_create_v2', 1)
      on conflict (nome) do update set chamadas = test_port_calls.chamadas + 1;
      insert into public.presenca_comandos(
        request_id, tipo, fonte, auth_user_id, unidade_id, aula_id,
        professor_id, data_referencia, status, payload_hash, itens_total
      )
      select
        p_request_id,
        case p_fonte
          when 'fabio_audio' then 'fabio_audio_aula'
          when 'professor_la_teacher' then 'fabio_manual_aula'
          else 'fabio_aula'
        end,
        p_fonte,
        null,
        a.unidade_id,
        a.id,
        p_professor_id,
        a.data_aula,
        'recebido',
        'stub-fabio-v2',
        count(r.aluno_id)::integer
        from public.aulas_emusys a
        left join public.aula_alunos_emusys r on r.aula_emusys_id = a.id
       where a.id = p_aula_emusys_id
       group by a.unidade_id, a.id, a.data_aula
      on conflict (request_id) do nothing;
      return public.app_status_comando_presenca_v1(p_request_id);
    end
    $$;

    create or replace function public.app_aplicar_comando_presenca_v2(
      p_request_id uuid
    ) returns jsonb language plpgsql security definer
    set search_path = pg_catalog, public as $$
    declare
      v_sqlstate text := nullif(current_setting('test.apply_sqlstate', true), '');
    begin
      insert into public.test_port_calls(nome, chamadas)
      values ('apply_v2', 1)
      on conflict (nome) do update set chamadas = test_port_calls.chamadas + 1;
      if v_sqlstate is not null then
        raise exception using
          errcode = v_sqlstate,
          message = 'falha_retryable_injetada';
      end if;
      update public.presenca_comandos
         set status = 'concluido',
             itens_aplicados = itens_total,
             concluido_em = clock_timestamp(),
             atualizado_em = clock_timestamp()
       where request_id = p_request_id;
      return public.app_status_comando_presenca_v1(p_request_id);
    end
    $$;

    create table public.aluno_presenca_administrativo(
      aula_emusys_id integer,
      aluno_id integer,
      justificada boolean
    );
    create table public.aluno_presenca_conflitos(
      aluno_presenca_id uuid,
      estado text
    );
    create table public.lead_experimentais(
      id bigint primary key,
      nome_aluno text
    );
    create table public.lead_experimental_aulas(
      id bigint primary key,
      aula_local_id integer,
      lead_experimental_id bigint,
      cancelado_em timestamptz
    );
    create table public.vw_presenca_slot_canonica_v1(
      aluno_presenca_id uuid,
      aluno_id integer,
      unidade_id uuid,
      professor_id integer,
      data_hora_inicio timestamptz,
      data_hora_fim timestamptz,
      curso_nome text,
      status_presenca text,
      respondido_por text,
      presenca_afirmada text,
      chamada_fechada boolean
    );
    create table public.vw_presenca_ocorrencia_canonica_v2(
      slot_key text,
      aluno_id integer,
      professor_id integer,
      data_aula date,
      ids_aulas_emusys integer[],
      resultado_canonico text,
      fonte_decisao text,
      fecha_chamada boolean,
      decidido_em timestamptz,
      possui_conflito boolean
    );

    insert into public.vw_presenca_slot_canonica_v1
    select
      gen_random_uuid(), r.aluno_id, a.unidade_id, a.professor_id,
      a.data_hora_inicio, a.data_hora_fim, a.curso_nome,
      'presente', 'professor_la_teacher', 'presente', true
      from public.vw_aula_roster_operacional_v2 r
      join public.aulas_emusys a on a.id = r.aula_emusys_id;
    insert into public.vw_presenca_ocorrencia_canonica_v2
    select
      'slot:' || r.aula_emusys_id || ':' || r.aluno_id,
      r.aluno_id, a.professor_id, a.data_aula, array[r.aula_emusys_id],
      'presente', 'professor_la_teacher', true, clock_timestamp(), false
      from public.vw_aula_roster_operacional_v2 r
      join public.aulas_emusys a on a.id = r.aula_emusys_id;

    create function public.fn_presenca_dados_frescos_interno_v1(uuid, date)
    returns jsonb language sql stable security definer as $$
      select jsonb_build_object(
        'publicavel', true,
        'finalizada_em', clock_timestamp() - interval '30 minutes'
      )
    $$;

    create function public.app_minha_agenda_sessao_base_v1(
      p_data date default current_date
    ) returns jsonb language sql stable security definer
    set search_path = pg_catalog, public as $$
      select jsonb_build_array(jsonb_build_object('fonte', 'teacher-legado'))
    $$;
    create function public.app_minha_agenda_sessao_canonica_v2(
      p_data date default current_date
    ) returns jsonb language sql stable security definer
    set search_path = pg_catalog, public as $$
      select jsonb_build_object('fonte', 'teacher-canonico-antigo')
    $$;
    revoke all on function public.app_minha_agenda_sessao_canonica_v2(date)
      from public, anon, authenticated, service_role;

    create function public.app_minha_agenda_sessao(
      p_data date default current_date
    ) returns jsonb language plpgsql stable security definer
    set search_path = pg_catalog, public as $$
    declare
      v_professor_id integer := public.fn_professor_do_usuario();
      v_modo text;
    begin
      if v_professor_id is null then
        return jsonb_build_object('erro', 'sem_professor_vinculado');
      end if;
      select case
        when count(*) > 0 and bool_and(c.modo = 'canonico_v2') then 'canonico_v2'
        when count(*) > 0 and bool_and(c.modo = 'legado') then 'legado'
        else 'sombra'
      end into v_modo
        from public.presenca_rollout_config c
       where c.superficie = 'la_teacher'
         and c.unidade_id in (
           select distinct ae.unidade_id
             from public.aulas_emusys ae
            where ae.professor_id = v_professor_id
              and ae.data_aula = p_data
         );
      if coalesce(v_modo, 'sombra') = 'canonico_v2' then
        return public.app_minha_agenda_sessao_canonica_v2(p_data)
          || jsonb_build_object('rollout_modo', 'canonico_v2');
      end if;
      return public.app_minha_agenda_sessao_base_v1(p_data);
    end
    $$;
    revoke all on function public.app_minha_agenda_sessao(date)
      from public, anon, authenticated, service_role;
    grant execute on function public.app_minha_agenda_sessao(date)
      to authenticated;

    alter view public.vw_aula_roster_operacional_v2
      rename to vw_aula_roster_operacional_v2_real_test;
    create sequence public.test_roster_v2_counter;
    create view public.vw_aula_roster_operacional_v2
    with (security_invoker = true) as
    select real.*
      from public.vw_aula_roster_operacional_v2_real_test real
     where nextval('public.test_roster_v2_counter') > 0;
    revoke all on table public.vw_aula_roster_operacional_v2
      from public, anon, authenticated, service_role;
    grant select on table public.vw_aula_roster_operacional_v2 to service_role;
  `);

  contractsBefore = Object.fromEntries(
    Object.entries(LEGACY_SIGNATURES).map(([name, signature]) => [
      name,
      functionContract(signature),
    ]),
  );
  dataBefore = stateSnapshot();
  psql(readFileSync(MIGRATION, 'utf8'));
  psql(readFileSync(INTERNAL_HELPERS_MIGRATION, 'utf8'));
});

test.after(() => {
  execute('docker', ['rm', '-f', CONTAINER]);
});

test('migration aplica depois da Task 5 sem cutover ou mutacao de dados', () => {
  const after = stateSnapshot();
  assert.deepEqual(after, dataBefore);
  assert.equal(after.flags, 21);
  assert.equal(after.flags_sombra, 21);
  assert.equal(after.presencas, 0);
  assert.equal(after.comandos, 0);
  assert.equal(after.eventos, 0);
});

test('helpers privados do LA Teacher se declaram internos para a auditoria de portas', () => {
  const helpers = json(psql(String.raw`
    select jsonb_agg(jsonb_build_object(
      'assinatura', assinatura,
      'interna', coalesce(obj_description(to_regprocedure(assinatura), 'pg_proc'), '') like '%[interna]%',
      'anon_execute', has_function_privilege('anon', assinatura, 'execute'),
      'authenticated_execute', has_function_privilege('authenticated', assinatura, 'execute'),
      'service_role_execute', has_function_privilege('service_role', assinatura, 'execute')
    ) order by assinatura)
    from unnest(array[
      'public.app_minha_agenda_sessao_publicacao_legado_v1(date)',
      'public.app_registrar_presencas_aula_canonica_v2_interno(uuid,integer,integer[])',
      'public.app_registrar_presencas_aula_publicacao_legado_v1(integer,integer[],uuid)'
    ]) as assinatura;
  `));

  assert.equal(helpers.length, 3);
  for (const helper of helpers) {
    assert.equal(helper.interna, true, `${helper.assinatura}: marcador [interna] ausente`);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(
        helper[`${role}_execute`],
        false,
        `${helper.assinatura}: helper interno nao pode abrir execute para ${role}`,
      );
    }
  }
});

test('auditoria de helpers internos detecta abertura acidental exclusiva para anon', () => {
  const probe = json(psql(String.raw`
    create temp table _auditoria_helper_acl(resultado jsonb);

    grant execute on function public.app_minha_agenda_sessao_publicacao_legado_v1(date)
      to anon;

    insert into _auditoria_helper_acl(resultado)
    select jsonb_build_object('violacoes', count(*))
      from unnest(array[
        'public.app_minha_agenda_sessao_publicacao_legado_v1(date)',
        'public.app_registrar_presencas_aula_canonica_v2_interno(uuid,integer,integer[])',
        'public.app_registrar_presencas_aula_publicacao_legado_v1(integer,integer[],uuid)'
      ]) as assinatura
     where coalesce(obj_description(to_regprocedure(assinatura), 'pg_proc'), '') like '%[interna]%'
       and (
         has_function_privilege('anon', assinatura, 'execute')
         or has_function_privilege('authenticated', assinatura, 'execute')
         or has_function_privilege('service_role', assinatura, 'execute')
       );

    revoke execute on function public.app_minha_agenda_sessao_publicacao_legado_v1(date)
      from anon;

    select resultado from _auditoria_helper_acl;
  `));

  assert.equal(probe.violacoes, 1, 'abertura exclusiva para anon precisa ser detectada');

  assert.equal(
    psql(String.raw`
      select has_function_privilege(
        'anon',
        'public.app_minha_agenda_sessao_publicacao_legado_v1(date)',
        'execute'
      );
    `),
    'f',
    'contraprova deve restaurar a ACL privada',
  );
});

test('rename preserva corpos e atributos legados; aliases ficam privados', () => {
  for (const [name, signature] of Object.entries(LEGACY_ALIASES)) {
    assert.deepEqual(
      functionContract(signature),
      contractsBefore[name],
      `${name}: ALTER FUNCTION RENAME deve preservar o corpo exato`,
    );
  }

  const acl = json(psql(String.raw`
    select jsonb_build_object(
      'agenda_alias_auth', has_function_privilege(
        'authenticated', '${LEGACY_ALIASES.agenda}', 'execute'
      ),
      'agenda_alias_service', has_function_privilege(
        'service_role', '${LEGACY_ALIASES.agenda}', 'execute'
      ),
      'teacher_alias_auth', has_function_privilege(
        'authenticated', '${LEGACY_ALIASES.teacher}', 'execute'
      ),
      'teacher_alias_service', has_function_privilege(
        'service_role', '${LEGACY_ALIASES.teacher}', 'execute'
      ),
      'action_alias_service', has_function_privilege(
        'service_role', '${LEGACY_ALIASES.fabioAction}', 'execute'
      ),
      'record_alias_service', has_function_privilege(
        'service_role', '${LEGACY_ALIASES.fabioRecord}', 'execute'
      ),
      'agenda_anon', has_function_privilege(
        'anon', '${LEGACY_SIGNATURES.agenda}', 'execute'
      ),
      'agenda_auth', has_function_privilege(
        'authenticated', '${LEGACY_SIGNATURES.agenda}', 'execute'
      ),
      'agenda_service', has_function_privilege(
        'service_role', '${LEGACY_SIGNATURES.agenda}', 'execute'
      ),
      'teacher_anon', has_function_privilege(
        'anon', '${LEGACY_SIGNATURES.teacher}', 'execute'
      ),
      'teacher_auth', has_function_privilege(
        'authenticated', '${LEGACY_SIGNATURES.teacher}', 'execute'
      ),
      'teacher_service', has_function_privilege(
        'service_role', '${LEGACY_SIGNATURES.teacher}', 'execute'
      ),
      'action_auth', has_function_privilege(
        'authenticated', '${LEGACY_SIGNATURES.fabioAction}', 'execute'
      ),
      'action_service', has_function_privilege(
        'service_role', '${LEGACY_SIGNATURES.fabioAction}', 'execute'
      ),
      'record_auth', has_function_privilege(
        'authenticated', '${LEGACY_SIGNATURES.fabioRecord}', 'execute'
      ),
      'record_service', has_function_privilege(
        'service_role', '${LEGACY_SIGNATURES.fabioRecord}', 'execute'
      )
    );
  `));
  assert.deepEqual(acl, {
    agenda_alias_auth: false,
    agenda_alias_service: false,
    teacher_alias_auth: false,
    teacher_alias_service: false,
    action_alias_service: false,
    record_alias_service: false,
    agenda_anon: false,
    agenda_auth: true,
    agenda_service: false,
    teacher_anon: false,
    teacher_auth: true,
    teacher_service: true,
    action_auth: false,
    action_service: true,
    record_auth: false,
    record_service: true,
  });

  for (const signature of Object.values(LEGACY_SIGNATURES)) {
    const contract = functionContract(signature);
    assert.equal(contract.owner, 'postgres');
    assert.equal(contract.security_definer, true);
    assert.deepEqual(contract.config, ['search_path=pg_catalog, public']);
    assert.equal(contract.result, 'jsonb');
  }
  assert.equal(functionContract(LEGACY_SIGNATURES.agenda).volatility, 's');
});

test('sombra e legado executam somente os corpos preservados, inclusive Fabio', () => {
  psql(String.raw`
    insert into public.fabio_acoes_pendentes(
      id, professor_id, tipo, estado, expira_em, aula_id, candidatas, payload
    ) values (
      '20000000-0000-4000-8000-000000000001', 7, 'confirmar_chamada',
      'aberta', now() + interval '1 day', 20, array[20],
      jsonb_build_object('alunos_ausentes', jsonb_build_array(202))
    );
    insert into public.fabio_registros_aula(
      id, parent_id, modo_entrada, aula_id, aluno_id, professor_id, campos
    ) values (
      '30000000-0000-4000-8000-000000000001', null, 'manual',
      30, 301, 7, jsonb_build_object('presenca', 'presente')
    );
  `);

  resetRosterCounter();
  resetPortCalls();
  const agenda = json(psql(asAuthenticated(String.raw`
    select public.app_minha_agenda_sessao(current_date);
  `)));
  const teacher = json(psql(asAuthenticated(String.raw`
    select public.app_registrar_presencas_aula(
      10, array[102], '10000000-0000-4000-8000-000000000001'
    );
  `)));
  const action = json(psql(asService(String.raw`
    select public.fabio_confirmar_chamada_acao(
      '20000000-0000-4000-8000-000000000001', 7, 'wa-shadow'
    );
  `)));
  const record = json(psql(asService(String.raw`
    select public.fabio_emitir_presenca_por_registro(
      '30000000-0000-4000-8000-000000000001'
    );
  `)));

  assert.deepEqual(agenda, [{ fonte: 'teacher-legado' }]);
  assert.equal(teacher.status, 'concluido');
  assert.equal(action.codigo, 'chamada_confirmada');
  assert.equal(record.status, 'concluido');
  assert.equal(rosterCounterCalled(), false, 'sombra nao pode consultar roster v2');
  assert.equal(portCalls('teacher_create_v2'), 0);
  assert.equal(portCalls('fabio_create_v2'), 0);
  assert.equal(portCalls('apply_v2'), 0);

  psql(String.raw`
    update public.presenca_rollout_config
       set modo = 'legado'
     where unidade_id = '${UNIDADE}' and superficie = 'la_teacher';
  `);
  resetRosterCounter();
  const legacyRead = json(psql(asAuthenticated(String.raw`
    select public.app_minha_agenda_sessao(current_date);
  `)));
  assert.deepEqual(legacyRead, [{ fonte: 'teacher-legado' }]);
  assert.equal(rosterCounterCalled(), false, 'legado nao pode consultar roster v2');
});

test('canonico le roster v2 e roteia Teacher e os dois writers Fabio', () => {
  psql(String.raw`
    update public.presenca_rollout_config
       set modo = 'canonico_v2'
     where unidade_id = '${UNIDADE}' and superficie = 'la_teacher';
    insert into public.fabio_acoes_pendentes(
      id, professor_id, tipo, estado, expira_em, aula_id, candidatas, payload
    ) values (
      '21000000-0000-4000-8000-000000000001', 7, 'confirmar_chamada',
      'aberta', now() + interval '1 day', 21, array[21],
      jsonb_build_object('alunos_ausentes', jsonb_build_array(212))
    );
    insert into public.fabio_registros_aula(
      id, parent_id, modo_entrada, aula_id, aluno_id, professor_id, campos
    ) values (
      '31000000-0000-4000-8000-000000000001', null, 'manual',
      31, 311, 7, jsonb_build_object('presenca', 'presente')
    );
  `);

  resetRosterCounter();
  resetPortCalls();
  const agenda = json(psql(asAuthenticated(String.raw`
    select public.app_minha_agenda_sessao(current_date);
  `)));
  assert.equal(agenda.regra_versao, 'presenca-v2');
  assert.equal(agenda.rollout_modo, 'canonico_v2');
  assert.ok(Array.isArray(agenda.sessoes));
  assert.equal(rosterCounterCalled(), true, 'leitura canonica deve materializar roster v2');

  const teacher = json(psql(asAuthenticated(String.raw`
    select public.app_registrar_presencas_aula(
      11, array[112], '11000000-0000-4000-8000-000000000001'
    );
  `)));
  assert.equal(teacher.status, 'concluido');
  assert.equal(portCalls('teacher_create_v2'), 1);
  assert.equal(portCalls('apply_v2'), 1);

  const action = json(psql(asService(String.raw`
    select public.fabio_confirmar_chamada_acao(
      '21000000-0000-4000-8000-000000000001', 7, 'wa-canonical'
    );
  `)));
  assert.equal(action.codigo, 'chamada_confirmada');
  assert.equal(action.escrita.status, 'concluido');
  assert.equal(portCalls('fabio_create_v2'), 1);
  assert.equal(portCalls('apply_v2'), 2);

  const record = json(psql(asService(String.raw`
    select public.fabio_emitir_presenca_por_registro(
      '31000000-0000-4000-8000-000000000001'
    );
  `)));
  assert.equal(record.status, 'concluido');
  assert.equal(record.fonte, 'professor_la_teacher');
  assert.equal(portCalls('fabio_create_v2'), 2);
  assert.equal(portCalls('apply_v2'), 3);
});

test('agenda canonica preserva cursos distintos no mesmo horario', () => {
  psql(String.raw`
    update public.presenca_rollout_config
       set modo = 'canonico_v2'
     where unidade_id = '${UNIDADE}' and superficie = 'la_teacher';
  `);

  const agenda = json(psql(asAuthenticated(String.raw`
    select public.app_minha_agenda_sessao(current_date);
  `)));
  const simultaneas = agenda.sessoes.filter((sessao) => [40, 41].includes(sessao.aula_id_ancora));

  assert.deepEqual(
    simultaneas.map((sessao) => ({
      aula: sessao.aula_id_ancora,
      curso: sessao.curso,
      alunos: sessao.alunos.map((aluno) => aluno.aluno_id),
    })),
    [
      { aula: 40, curso: 'Piano', alunos: [401] },
      { aula: 41, curso: 'Violao', alunos: [411] },
    ],
  );
});

test('40001 e 55P03 voltam como retryable sem terminalizar o request', () => {
  psql(String.raw`
    update public.presenca_rollout_config
       set modo = 'canonico_v2'
     where unidade_id = '${UNIDADE}' and superficie = 'la_teacher';
    insert into public.fabio_acoes_pendentes(
      id, professor_id, tipo, estado, expira_em, aula_id, candidatas, payload
    ) values (
      '22000000-0000-4000-8000-000000000001', 7, 'confirmar_chamada',
      'aberta', now() + interval '1 day', 21, array[21],
      jsonb_build_object('alunos_ausentes', jsonb_build_array(212))
    );
    insert into public.fabio_registros_aula(
      id, parent_id, modo_entrada, aula_id, aluno_id, professor_id, campos
    ) values (
      '32000000-0000-4000-8000-000000000001', null, 'manual',
      31, 311, 7, jsonb_build_object('presenca', 'presente')
    );
  `);

  const teacher = json(psql(asAuthenticated(String.raw`
    select set_config('test.apply_sqlstate', '40001', false);
    select public.app_registrar_presencas_aula(
      11, array[112], '12000000-0000-4000-8000-000000000001'
    );
  `)));
  assert.equal(teacher.status, 'recebido');
  assert.equal(teacher.retryable, true);
  assert.equal(teacher.erro_codigo, '40001');
  assert.equal(psql(String.raw`
    select status from public.presenca_comandos
     where request_id = '12000000-0000-4000-8000-000000000001';
  `), 'recebido');

  const action = json(psql(asService(String.raw`
    select set_config('test.apply_sqlstate', '55P03', false);
    select public.fabio_confirmar_chamada_acao(
      '22000000-0000-4000-8000-000000000001', 7, 'wa-retryable'
    );
  `)));
  assert.equal(action.codigo, 'presenca_nao_aplicada');
  assert.equal(action.recibo.status, 'recebido');
  assert.equal(action.recibo.retryable, true);
  assert.equal(action.recibo.erro_codigo, '55P03');
  assert.equal(psql(String.raw`
    select estado from public.fabio_acoes_pendentes
     where id = '22000000-0000-4000-8000-000000000001';
  `), 'aberta');
  assert.equal(psql(String.raw`
    select status from public.presenca_comandos
     where request_id = '22000000-0000-4000-8000-000000000001';
  `), 'recebido');

  const record = json(psql(asService(String.raw`
    select set_config('test.apply_sqlstate', '40001', false);
    select public.fabio_emitir_presenca_por_registro(
      '32000000-0000-4000-8000-000000000001'
    );
  `)));
  assert.equal(record.status, 'recebido');
  assert.equal(record.retryable, true);
  assert.equal(record.erro_codigo, '40001');
  assert.equal(psql(String.raw`
    select (campos ? 'presenca_emitida')::text
      from public.fabio_registros_aula
     where id = '32000000-0000-4000-8000-000000000001';
  `), 'false');
  assert.equal(psql(String.raw`
    select status
      from public.presenca_comandos
     where request_id = md5(
       'fabio-registro:32000000-0000-4000-8000-000000000001'
     )::uuid;
  `), 'recebido');

  assert.equal(psql(String.raw`
    select count(*) from public.presenca_acao_eventos
     where request_id in (
       '12000000-0000-4000-8000-000000000001',
       '22000000-0000-4000-8000-000000000001',
       md5('fabio-registro:32000000-0000-4000-8000-000000000001')::uuid
     ) and tipo in ('concluido', 'falhou');
  `), '0');
});

test('rollback por flag nao toca presenca, roster, comandos ou eventos', () => {
  const before = dataSnapshotWithoutFlags();
  psql(String.raw`
    update public.presenca_rollout_config
       set modo = 'legado'
     where unidade_id = '${UNIDADE}' and superficie = 'la_teacher';
  `);
  assert.deepEqual(dataSnapshotWithoutFlags(), before);

  resetRosterCounter();
  const agenda = json(psql(asAuthenticated(String.raw`
    select public.app_minha_agenda_sessao(current_date);
  `)));
  assert.deepEqual(agenda, [{ fonte: 'teacher-legado' }]);
  assert.equal(rosterCounterCalled(), false);
});

test(
  'publicacao v2 e estatica, preserva entrypoints e nao altera flags ou dados no apply',
  assertStaticContract,
);
