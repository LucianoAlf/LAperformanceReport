import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const IMAGE = process.env.PRESENCA_PORTAS_POSTGRES_IMAGE || 'postgres:17-alpine';
const CONTAINER = `la-presenca-portas-${process.pid}`;
const UNIDADE = '11111111-1111-4111-8111-111111111111';
const AUTH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HASH = 'a'.repeat(64);

const migrations = [
  'supabase/migrations/20260827030200_presenca_sync_cobertura_idempotente.sql',
  'supabase/migrations/20260827030500_presenca_roster_operacional.sql',
  'supabase/migrations/20260827030600_presenca_comando_auditoria.sql',
  'supabase/migrations/20260827030700_presenca_comando_porta_professor.sql',
  'supabase/migrations/20260827030800_presenca_comando_portas_fabio.sql',
  'supabase/migrations/20260827030900_presenca_comando_overloads_compatibilidade.sql',
  'supabase/migrations/20260827223000_presenca_request_id_arbitragem.sql',
  'supabase/migrations/20260828005703_presenca_roster_v2_expansao_aditiva.sql',
  'supabase/migrations/20260828005709_presenca_slot_lock_core.sql',
];
const portMigration = 'supabase/migrations/20260828005715_presenca_portas_reservadas_duais.sql';

let legacyBefore;

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function run(command, args, options = {}) {
  const result = execute(command, args, options);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function psql(sql) {
  return docker([
    'exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', 'postgres', '-tA',
  ], { input: sql });
}

function psqlFailure(sql) {
  const result = execute('docker', [
    'exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', 'postgres', '-tA',
  ], { input: sql });
  assert.notEqual(result.status, 0, 'SQL deveria falhar');
  return `${result.stdout}\n${result.stderr}`;
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
      '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', 'postgres', '-tA',
    ], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql assincrono falhou\n${stdout}\n${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.end(sql);
  });
}

function waitForPostgres() {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = execute('docker', [
      'exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1',
    ]);
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

function json(output) {
  return JSON.parse(output.split(/\r?\n/u).filter(Boolean).at(-1));
}

function asAuthenticated(authId, sql) {
  return String.raw`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${authId}', false);
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

function appCreate(authId, requestId, ausentes = []) {
  const array = ausentes.length === 0 ? 'array[]::integer[]' : `array[${ausentes.join(',')}]`;
  return asAuthenticated(authId, String.raw`
    select public.app_criar_comando_chamada_professor_v2('${requestId}', 10, ${array});
  `);
}

function appApply(authId, requestId) {
  return asAuthenticated(authId, String.raw`
    select public.app_aplicar_comando_presenca_v2('${requestId}');
  `);
}

function legacySnapshot() {
  return json(psql(String.raw`
    select coalesce(jsonb_object_agg(s.assinatura, s.contrato order by s.assinatura), '{}'::jsonb)
      from (
        select
          p.oid::regprocedure::text as assinatura,
          jsonb_build_object(
            'definition', pg_get_functiondef(p.oid),
            'acl', coalesce(p.proacl::text, '<null>')
          ) as contrato
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (
            right(p.proname, 3) = '_v1'
            or (
              p.proname = 'app_registrar_presencas_aula'
              and pg_get_function_identity_arguments(p.oid) in (
                'p_aula_emusys_id integer, p_alunos_ausentes integer[]',
                'p_aula_emusys_id integer, p_alunos_ausentes integer[], p_request_id uuid'
              )
            )
          )
      ) s;
  `));
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSleep(requestId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const count = Number(psql(String.raw`
      select count(*) from pg_stat_activity
       where wait_event = 'PgSleep' and query like '%${requestId}%';
    `));
    if (count > 0) return;
    await delay(50);
  }
  throw new Error('porta v2 nao entrou no ponto de concorrencia controlada');
}

test.before(() => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  docker(['run', '--rm', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
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
    insert into public.unidades values ('${UNIDADE}', 'Campo Grande');

    create table public.usuarios(
      id integer primary key, auth_user_id uuid, ativo boolean not null default true
    );
    insert into public.usuarios values (1, '${AUTH_A}', true), (2, '${AUTH_B}', true);

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
      aula_emusys_id integer, professor_id integer,
      primary key(aula_emusys_id, professor_id)
    );
    create table public.fabio_registros_aula(
      id uuid primary key, parent_id uuid, modo_entrada text, aula_id integer,
      aluno_id integer, professor_id integer, campos jsonb default '{}'::jsonb
    );
    create table public.fabio_acoes_pendentes(
      id uuid primary key, professor_id integer, tipo text, estado text,
      expira_em timestamptz, aula_id integer, candidatas integer[], payload jsonb,
      ultima_resposta_wa_id text, atualizado_em timestamptz, encerrado_em timestamptz
    );
    create table public.fabio_acao_eventos(
      acao_id uuid, wa_message_id text unique, evento text, resultado jsonb
    );

    create function public.usuario_tem_permissao(integer, text, uuid)
    returns boolean language sql stable as $$ select true $$;
    create function public.fn_professor_do_usuario()
    returns integer language sql stable as $$
      select case auth.uid()
        when '${AUTH_A}'::uuid then 7
        when '${AUTH_B}'::uuid then 8
        else null
      end
    $$;
    create function public.fn_janela_registro_dias()
    returns integer language sql stable as $$ select 3 $$;
    create function public.fn_presenca_e_forte(text)
    returns boolean language sql stable as $$ select false $$;
    create function public.fn_sincronizar_gemeos_presenca(integer)
    returns integer language sql as $$ select 0 $$;
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
      data_hora_inicio, data_hora_fim, curso_nome, turma_nome, sala_nome
    ) values (
      10, 100, '${UNIDADE}', 7, current_date,
      now() - interval '1 hour', now(), 'Piano', 'Turma', 'Sala'
    );
    insert into public.aula_alunos_emusys(
      aula_emusys_id, unidade_id, aluno_chave, aluno_emusys_id, aluno_id, aluno_nome
    ) values
      (10, '${UNIDADE}', 'emusys:101', 101, 101, 'Aluno Um'),
      (10, '${UNIDADE}', 'emusys:102', 102, 102, 'Aluno Dois');
  `);

  for (const migration of migrations.slice(0, 2)) {
    psql(readFileSync(migration, 'utf8'));
  }

  psql(String.raw`
    insert into public.presenca_sync_execucoes(
      id, request_id, unidade_id, modo, data_alvo, status, snapshot_hash,
      paginas_lidas, aulas_lidas, presencas_lidas, lease_segundos,
      heartbeat_em, finalizada_em
    ) values (
      '${RUN}', gen_random_uuid(), '${UNIDADE}', 'presenca', current_date,
      'concluida', '${HASH}', 1, 1, 2, 300, clock_timestamp(), clock_timestamp()
    );
    insert into public.presenca_sync_cobertura(
      unidade_id, modo, data_alvo, run_id, status, heartbeat_em, snapshot_hash,
      paginas_lidas, aulas_lidas, presencas_lidas, iniciada_em, finalizada_em
    ) values (
      '${UNIDADE}', 'presenca', current_date, '${RUN}', 'concluida',
      clock_timestamp(), '${HASH}', 1, 1, 2, clock_timestamp(), clock_timestamp()
    );
    insert into public.aula_roster_sync_estado(
      aula_id, unidade_id, run_id, estado, qtd_esperada, qtd_recebida, snapshot_hash
    ) values (10, '${UNIDADE}', '${RUN}', 'completo', 2, 2, repeat('b', 32));
    update public.aula_alunos_emusys
       set ativo_operacional = true, ultimo_run_visto = '${RUN}'
     where aula_emusys_id = 10;
  `);

  for (const migration of migrations.slice(2)) {
    psql(readFileSync(migration, 'utf8'));
  }

  legacyBefore = legacySnapshot();
  psql(readFileSync(portMigration, 'utf8'));
});

test.after(() => {
  execute('docker', ['rm', '-f', CONTAINER]);
});

test('migration expoe somente as tres portas v2 e preserva v1 e Teacher byte a byte', () => {
  assert.deepEqual(legacySnapshot(), legacyBefore);

  const sql = readFileSync(portMigration, 'utf8');
  const signatures = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/giu)]
    .map((match) => match[1]);
  assert.deepEqual(signatures, [
    'app_criar_comando_chamada_professor_v2',
    'fabio_criar_comando_chamada_v2',
    'app_aplicar_comando_presenca_v2',
  ]);
  assert.doesNotMatch(sql, /\b(?:app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1)\s*\(/iu);
  assert.match(sql, /fn_criar_comando_presenca_core_v2\s*\(/iu);
  assert.match(sql, /fn_aplicar_comando_presenca_core_v2\s*\(/iu);
});

test('ACL das portas e estrita e os dois overloads Teacher permanecem inalterados', () => {
  const acl = json(psql(String.raw`
    select jsonb_build_object(
      'app_anon', has_function_privilege('anon', 'public.app_criar_comando_chamada_professor_v2(uuid,integer,integer[])', 'execute'),
      'app_auth', has_function_privilege('authenticated', 'public.app_criar_comando_chamada_professor_v2(uuid,integer,integer[])', 'execute'),
      'app_service', has_function_privilege('service_role', 'public.app_criar_comando_chamada_professor_v2(uuid,integer,integer[])', 'execute'),
      'fabio_anon', has_function_privilege('anon', 'public.fabio_criar_comando_chamada_v2(uuid,integer,integer,integer[],text)', 'execute'),
      'fabio_auth', has_function_privilege('authenticated', 'public.fabio_criar_comando_chamada_v2(uuid,integer,integer,integer[],text)', 'execute'),
      'fabio_service', has_function_privilege('service_role', 'public.fabio_criar_comando_chamada_v2(uuid,integer,integer,integer[],text)', 'execute'),
      'apply_anon', has_function_privilege('anon', 'public.app_aplicar_comando_presenca_v2(uuid)', 'execute'),
      'apply_auth', has_function_privilege('authenticated', 'public.app_aplicar_comando_presenca_v2(uuid)', 'execute'),
      'apply_service', has_function_privilege('service_role', 'public.app_aplicar_comando_presenca_v2(uuid)', 'execute')
    );
  `));
  assert.deepEqual(acl, {
    app_anon: false,
    app_auth: true,
    app_service: false,
    fabio_anon: false,
    fabio_auth: false,
    fabio_service: true,
    apply_anon: false,
    apply_auth: true,
    apply_service: true,
  });
});

test('professor B nao cria, inspeciona nem aplica comando do professor A', () => {
  const requestId = '10000000-0000-4000-8000-000000000001';
  const criado = json(psql(appCreate(AUTH_A, requestId, [102])));
  assert.equal(criado.status, 'recebido');

  const criarComoB = psqlFailure(appCreate(
    AUTH_B,
    '10000000-0000-4000-8000-000000000002',
    [102],
  ));
  assert.match(criarComoB, /42501/u);
  assert.match(criarComoB, /aula_nao_pertence_ao_professor/u);

  const statusComoB = psqlFailure(asAuthenticated(
    AUTH_B,
    `select public.app_status_comando_presenca_v1('${requestId}');`,
  ));
  assert.match(statusComoB, /42501/u);

  const applyComoB = psqlFailure(appApply(AUTH_B, requestId));
  assert.match(applyComoB, /42501/u);
  assert.match(applyComoB, /sem_permissao_comando/u);
  assert.equal(psql(`select status from public.presenca_comandos where request_id='${requestId}';`), 'recebido');
  assert.equal(psql(String.raw`
    select count(*) from public.presenca_acao_eventos
     where request_id='${requestId}' and tipo='falhou';
  `), '0');
});

test('Fábio exige service role e contexto professor/aula coerente', () => {
  const denied = psqlFailure(asAuthenticated(AUTH_A, String.raw`
    select public.fabio_criar_comando_chamada_v2(
      '20000000-0000-4000-8000-000000000001', 7, 10, array[102], 'professor_whatsapp'
    );
  `));
  assert.match(denied, /permission denied|42501/iu);

  const mismatch = psqlFailure(asService(String.raw`
    select public.fabio_criar_comando_chamada_v2(
      '20000000-0000-4000-8000-000000000002', 8, 10, array[102], 'professor_whatsapp'
    );
  `));
  assert.match(mismatch, /42501/u);
  assert.match(mismatch, /aula_nao_pertence_ao_professor/u);

  const ok = json(psql(asService(String.raw`
    select public.fabio_criar_comando_chamada_v2(
      '20000000-0000-4000-8000-000000000003', 7, 10, array[102], 'professor_whatsapp'
    );
  `)));
  assert.equal(ok.status, 'recebido');

  psql(`update public.presenca_sync_cobertura set status='falhou', snapshot_hash=null where run_id='${RUN}';`);
  let replay;
  try {
    replay = json(psql(asService(String.raw`
      select public.fabio_criar_comando_chamada_v2(
        '20000000-0000-4000-8000-000000000003', 7, 10, array[102], 'professor_whatsapp'
      );
    `)));
  } finally {
    psql(`update public.presenca_sync_cobertura set status='concluida', snapshot_hash='${HASH}' where run_id='${RUN}';`);
  }
  assert.equal(replay.status, 'recebido');
});

test('A-B-A usa tres UUIDs e retry do primeiro nao duplica linhas ou eventos', () => {
  const ids = [
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
  ];
  json(psql(appCreate(AUTH_A, ids[0], [])));
  json(psql(appCreate(AUTH_A, ids[1], [102])));
  json(psql(appCreate(AUTH_A, ids[2], [])));

  const sequencia = json(psql(String.raw`
    select jsonb_agg(i.status_solicitado order by c.criado_em, c.request_id)
      from public.presenca_comandos c
      join public.presenca_comando_itens i using (request_id)
     where c.request_id = any(array[${ids.map((id) => `'${id}'::uuid`).join(',')}])
       and i.aluno_id = 102;
  `));
  assert.deepEqual(sequencia, ['presente', 'falta', 'presente']);
  assert.equal(psql(String.raw`
    select count(*) from public.presenca_comandos
     where request_id = any(array[${ids.map((id) => `'${id}'::uuid`).join(',')}]);
  `), '3');

  const antes = json(psql(String.raw`
    select jsonb_build_object(
      'comandos', (select count(*) from public.presenca_comandos where request_id='${ids[0]}'),
      'itens', (select count(*) from public.presenca_comando_itens where request_id='${ids[0]}'),
      'eventos', (select count(*) from public.presenca_acao_eventos where request_id='${ids[0]}')
    );
  `));
  const retry = json(psql(appCreate(AUTH_A, ids[0], [])));
  assert.equal(retry.request_id, ids[0]);
  const depois = json(psql(String.raw`
    select jsonb_build_object(
      'comandos', (select count(*) from public.presenca_comandos where request_id='${ids[0]}'),
      'itens', (select count(*) from public.presenca_comando_itens where request_id='${ids[0]}'),
      'eventos', (select count(*) from public.presenca_acao_eventos where request_id='${ids[0]}')
    );
  `));
  assert.deepEqual(depois, antes);

  const conflito = psqlFailure(appCreate(AUTH_A, ids[0], [102]));
  assert.match(conflito, /23505/u);
  assert.match(conflito, /request_id_reutilizado/u);
});

test('roster temporariamente oculto preserva o request para retry sem recibo terminal falso', () => {
  const requestId = '30000000-0000-4000-8000-000000000010';
  const criado = json(psql(appCreate(AUTH_A, requestId, [102])));
  assert.equal(criado.status, 'recebido');

  psql(String.raw`
    update public.presenca_sync_cobertura
       set status = 'falhou', snapshot_hash = null
     where run_id = '${RUN}';
  `);

  let repetido;
  let falha;
  try {
    repetido = json(psql(appCreate(AUTH_A, requestId, [102])));
    psql(appApply(AUTH_A, requestId));
  } catch (error) {
    falha = String(error);
  } finally {
    psql(String.raw`
      update public.presenca_sync_cobertura
         set status = 'concluida', snapshot_hash = '${HASH}'
       where run_id = '${RUN}';
    `);
  }

  assert.equal(repetido.status, 'recebido');
  assert.match(falha, /40001/u);
  assert.equal(
    psql(`select status from public.presenca_comandos where request_id='${requestId}';`),
    'recebido',
  );
  assert.equal(psql(String.raw`
    select count(*) from public.presenca_acao_eventos
     where request_id='${requestId}' and tipo in ('concluido','falhou');
  `), '0');

  const retry = json(psql(appApply(AUTH_A, requestId)));
  assert.notEqual(retry.status, 'recebido');
});

test('apply v2 rejeita comando v1 sem terminalizar ou consumir o recibo legado', () => {
  const requestId = '30000000-0000-4000-8000-000000000099';
  psql(String.raw`
    insert into public.presenca_comandos(
      request_id, tipo, fonte, auth_user_id, usuario_id, unidade_id,
      aula_id, professor_id, data_referencia, payload_hash, itens_total
    ) values (
      '${requestId}', 'professor_aula', 'professor_la_teacher', '${AUTH_A}',
      1, '${UNIDADE}', 10, 7, current_date, repeat('f', 64), 0
    );
    insert into public.presenca_acao_eventos(
      request_id, sequencia, tipo, fonte, auth_user_id, usuario_id,
      unidade_id, aula_id
    ) values (
      '${requestId}', 0, 'recebido', 'professor_la_teacher', '${AUTH_A}',
      1, '${UNIDADE}', 10
    );
  `);

  const falha = psqlFailure(appApply(AUTH_A, requestId));
  assert.match(falha, /22023/u);
  assert.match(falha, /comando_nao_pertence_a_porta_v2/u);
  assert.equal(
    psql(`select status from public.presenca_comandos where request_id='${requestId}';`),
    'recebido',
  );
  assert.equal(psql(String.raw`
    select count(*) from public.presenca_acao_eventos
     where request_id='${requestId}' and tipo in ('concluido','falhou');
  `), '0');
});

test('porta monta o roster sob lock e escritor desconhecido falha rapido com 55P03', async () => {
  psql(String.raw`
    create or replace function public.teste_presenca_atrasar_criacao_v2()
    returns trigger language plpgsql as $$
    begin
      perform pg_sleep(2);
      return new;
    end
    $$;
    create trigger trg_teste_presenca_atrasar_criacao_v2
    before insert on public.presenca_comandos
    for each row execute function public.teste_presenca_atrasar_criacao_v2();
  `);

  const requestId = '40000000-0000-4000-8000-000000000001';
  const criacao = psqlAsync(appCreate(AUTH_A, requestId, [102]));
  await waitForSleep(requestId);
  const mutacao = psqlAsync(String.raw`
    update public.aula_alunos_emusys
       set updated_at = clock_timestamp()
     where aula_emusys_id = 10 and aluno_id = 102
    returning aluno_id;
  `).then(
    (output) => ({ ok: true, output }),
    (error) => ({ ok: false, error: String(error) }),
  );
  const estadoEm300ms = await Promise.race([
    mutacao.then(() => 'concluida'),
    delay(300).then(() => 'bloqueada'),
  ]);
  assert.equal(estadoEm300ms, 'concluida');
  const [resultadoCriacao, resultadoMutacao] = await Promise.all([criacao, mutacao]);
  assert.equal(json(resultadoCriacao).status, 'recebido');
  assert.equal(resultadoMutacao.ok, false);
  assert.match(resultadoMutacao.error, /55P03/u);

  psql(String.raw`
    drop trigger trg_teste_presenca_atrasar_criacao_v2 on public.presenca_comandos;
    drop function public.teste_presenca_atrasar_criacao_v2();
  `);
});

test('apply persiste somente falhas terminais e devolve recibo terminal', () => {
  psql(String.raw`
    create or replace function public.teste_presenca_erro_porta_v2()
    returns trigger language plpgsql as $$
    begin
      raise exception using
        errcode = current_setting('teste.presenca_sqlstate'),
        message = 'falha_controlada_sem_pii';
    end
    $$;
    create trigger trg_teste_presenca_erro_porta_v2
    before insert or update on public.aluno_presenca
    for each row execute function public.teste_presenca_erro_porta_v2();
  `);

  const terminais = ['22023', '23503', '23505', '23514', '42501'];
  for (const [indice, codigo] of terminais.entries()) {
    const requestId = `50000000-0000-4000-8000-00000000010${indice}`;
    psql(appCreate(AUTH_A, requestId, [102]));
    const recibo = json(psql(asAuthenticated(AUTH_A, String.raw`
      select set_config('teste.presenca_sqlstate', '${codigo}', false);
      select public.app_aplicar_comando_presenca_v2('${requestId}');
    `)));
    assert.equal(recibo.status, 'falhou');
    assert.equal(recibo.aplicados, 0);
    assert.equal(recibo.rejeitados, 2);
    assert.deepEqual([...new Set(recibo.erros.map((erro) => erro.codigo))], [codigo]);
    const eventos = psql(String.raw`
      select count(*) from public.presenca_acao_eventos where request_id='${requestId}';
    `);
    assert.equal(psql(String.raw`
      select count(*) from public.presenca_acao_eventos
       where request_id='${requestId}' and tipo='falhou' and erro_codigo='${codigo}';
    `), '1');
    const replay = json(psql(appApply(AUTH_A, requestId)));
    assert.equal(replay.status, 'falhou');
    assert.equal(replay.aplicados, recibo.aplicados);
    assert.equal(replay.rejeitados, recibo.rejeitados);
    assert.deepEqual(replay.erros, recibo.erros);
    assert.equal(psql(String.raw`
      select count(*) from public.presenca_acao_eventos where request_id='${requestId}';
    `), eventos);
  }

  const transitorios = ['40001', '40P01', '55P03', '57014'];
  for (const [indice, codigo] of transitorios.entries()) {
    const requestId = `60000000-0000-4000-8000-00000000010${indice}`;
    psql(appCreate(AUTH_A, requestId, [102]));
    const erro = psqlFailure(asAuthenticated(AUTH_A, String.raw`
      select set_config('teste.presenca_sqlstate', '${codigo}', false);
      select public.app_aplicar_comando_presenca_v2('${requestId}');
    `));
    assert.match(erro, new RegExp(codigo, 'u'));
    assert.equal(psql(`select status from public.presenca_comandos where request_id='${requestId}';`), 'recebido');
    assert.equal(psql(String.raw`
      select count(*) from public.presenca_acao_eventos
       where request_id='${requestId}' and tipo in ('concluido','falhou');
    `), '0');
  }

  psql(String.raw`
    drop trigger trg_teste_presenca_erro_porta_v2 on public.aluno_presenca;
    drop function public.teste_presenca_erro_porta_v2();
  `);
});

test('apply do owner e do service role usa somente o core v2 e e idempotente', () => {
  const ownerRequest = '70000000-0000-4000-8000-000000000001';
  psql(appCreate(AUTH_A, ownerRequest, [102]));
  const aplicado = json(psql(appApply(AUTH_A, ownerRequest)));
  assert.equal(aplicado.status, 'concluido');
  assert.equal(aplicado.aplicados, 2);
  const eventos = psql(`select count(*) from public.presenca_acao_eventos where request_id='${ownerRequest}';`);
  const retry = json(psql(appApply(AUTH_A, ownerRequest)));
  assert.equal(retry.status, 'concluido');
  assert.equal(retry.aplicados, aplicado.aplicados);
  assert.equal(retry.rejeitados, aplicado.rejeitados);
  assert.deepEqual(retry.erros, aplicado.erros);
  assert.equal(psql(`select count(*) from public.presenca_acao_eventos where request_id='${ownerRequest}';`), eventos);

  const serviceRequest = '70000000-0000-4000-8000-000000000002';
  psql(asService(String.raw`
    select public.fabio_criar_comando_chamada_v2(
      '${serviceRequest}', 7, 10, array[101], 'professor_whatsapp'
    );
  `));
  const serviceApply = json(psql(asService(String.raw`
    select public.app_aplicar_comando_presenca_v2('${serviceRequest}');
  `)));
  assert.equal(serviceApply.status, 'concluido');
});
