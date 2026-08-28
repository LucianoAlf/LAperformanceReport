import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const IMAGE = process.env.PRESENCA_SLOT_POSTGRES_IMAGE || 'postgres:17-alpine';
const CONTAINER = `la-presenca-slot-${process.pid}`;
const UNIDADE = '11111111-1111-1111-1111-111111111111';
const AUTH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HASH = 'a'.repeat(64);

const migrations = [
  'supabase/migrations/20260827030200_presenca_sync_cobertura_idempotente.sql',
  'supabase/migrations/20260827030500_presenca_roster_operacional.sql',
  'supabase/migrations/20260827030600_presenca_comando_auditoria.sql',
  'supabase/migrations/20260827030700_presenca_comando_porta_professor.sql',
  'supabase/migrations/20260828005703_presenca_roster_v2_expansao_aditiva.sql',
  'supabase/migrations/20260828005709_presenca_slot_lock_core.sql',
];

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

function auth(sql) {
  return String.raw`
    select set_config('request.jwt.claim.sub', '${AUTH}', false);
    select set_config('request.jwt.claim.role', 'authenticated', false);
    ${sql}
  `;
}

function itens(ausentes = [102]) {
  return JSON.stringify([101, 102].map((alunoId) => ({
    aula_emusys_id: 10,
    aluno_id: alunoId,
    status: ausentes.includes(alunoId) ? 'falta' : 'presente',
  })));
}

function criar(requestId, payload = itens()) {
  return auth(String.raw`
    select public.fn_criar_comando_presenca_core_v2(
      '${requestId}', 'la_teacher_aula', null, 10, '${payload}'::jsonb
    );
  `);
}

function aplicar(requestId) {
  return auth(`select public.fn_aplicar_comando_presenca_core_v2('${requestId}');`);
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
  throw new Error('aplicacao nao entrou no ponto de concorrencia controlada');
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

    create function public.usuario_tem_permissao(integer, text, uuid)
    returns boolean language sql stable as $$ select true $$;
    create function public.fn_professor_do_usuario()
    returns integer language sql stable as $$ select 7 $$;
    create function public.fn_janela_registro_dias()
    returns integer language sql stable as $$ select 3 $$;
    create function public.fn_presenca_e_forte(text)
    returns boolean language sql stable as $$
      select $1 in ('agenda_secretaria','professor_la_teacher','professor_whatsapp','fabio_audio')
    $$;
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
});

test.after(() => {
  execute('docker', ['rm', '-f', CONTAINER]);
});

test('request id e idempotente, rejeita payload diferente e aplica uma unica vez', () => {
  const requestId = '10000000-0000-4000-8000-000000000001';
  const primeiro = json(psql(criar(requestId)));
  const repetido = json(psql(criar(requestId)));
  assert.equal(primeiro.status, 'recebido');
  assert.equal(repetido.request_id, requestId);
  assert.equal(psql(`select count(*) from public.presenca_comandos where request_id='${requestId}';`), '1');
  assert.equal(psql(`select count(*) from public.presenca_acao_eventos where request_id='${requestId}';`), '1');

  const conflito = psqlFailure(criar(requestId, itens([101])));
  assert.match(conflito, /23505/u);
  assert.match(conflito, /request_id_reutilizado/u);

  const aplicado = json(psql(aplicar(requestId)));
  assert.equal(aplicado.status, 'concluido');
  const eventos = psql(`select count(*) from public.presenca_acao_eventos where request_id='${requestId}';`);
  const retry = json(psql(aplicar(requestId)));
  assert.equal(retry.status, 'concluido');
  assert.equal(psql(`select count(*) from public.presenca_acao_eventos where request_id='${requestId}';`), eventos);
  assert.deepEqual(json(psql(String.raw`
    select jsonb_object_agg(aluno_id, status_presenca order by aluno_id)
      from public.aluno_presenca where aula_emusys_id=10;
  `)), { 101: 'presente', 102: 'falta' });
});

test('payload parcial e gemea cancelada ou justificada bloqueiam antes da escrita', () => {
  psql('delete from public.aluno_presenca;');
  const parcial = '10000000-0000-4000-8000-000000000002';
  const payloadParcial = JSON.stringify([{ aula_emusys_id: 10, aluno_id: 101, status: 'presente' }]);
  psql(criar(parcial, payloadParcial));
  const erroParcial = psqlFailure(aplicar(parcial));
  assert.match(erroParcial, /23514/u);
  assert.match(erroParcial, /payload_diverge_do_roster_v2/u);
  assert.equal(psql(`select status from public.presenca_comandos where request_id='${parcial}';`), 'recebido');

  psql(String.raw`
    insert into public.aulas_emusys(
      id, emusys_id, unidade_id, professor_id, data_aula, data_hora_inicio,
      data_hora_fim, curso_nome, turma_nome, sala_nome, cancelada, justificada, tipo
    ) select 11, 101, unidade_id, professor_id, data_aula, data_hora_inicio,
      data_hora_fim, curso_nome, 'Gemea', sala_nome, true, false, 'individual'
      from public.aulas_emusys where id=10;
  `);
  const cancelada = '10000000-0000-4000-8000-000000000003';
  psql(criar(cancelada));
  const erroCancelada = psqlFailure(aplicar(cancelada));
  assert.match(erroCancelada, /23514/u);
  assert.match(erroCancelada, /slot_cancelado_ou_justificado/u);
  assert.equal(psql('select count(*) from public.aluno_presenca;'), '0');

  psql('update public.aulas_emusys set cancelada=false, justificada=true where id=11;');
  const justificada = '10000000-0000-4000-8000-000000000004';
  psql(criar(justificada));
  const erroJustificada = psqlFailure(aplicar(justificada));
  assert.match(erroJustificada, /23514/u);
  assert.match(erroJustificada, /slot_cancelado_ou_justificado/u);
  psql('delete from public.aulas_emusys where id=11;');
});

test('40001, 40P01, 55P03 e 57014 escapam e deixam comando nao terminal', () => {
  psql(String.raw`
    create or replace function public.teste_presenca_erro_transitorio()
    returns trigger language plpgsql as $$
    begin
      raise exception using
        errcode = current_setting('teste.presenca_sqlstate'),
        message = 'falha_transitoria_controlada';
    end
    $$;
    create trigger trg_teste_presenca_erro_transitorio
    before insert or update on public.aluno_presenca
    for each row execute function public.teste_presenca_erro_transitorio();
  `);

  const codigos = ['40001', '40P01', '55P03', '57014'];
  for (const [indice, codigo] of codigos.entries()) {
    const requestId = `10000000-0000-4000-8000-00000000010${indice}`;
    psql(criar(requestId));
    const erro = psqlFailure(auth(String.raw`
      select set_config('teste.presenca_sqlstate', '${codigo}', false);
      select public.fn_aplicar_comando_presenca_core_v2('${requestId}');
    `));
    assert.match(erro, new RegExp(codigo, 'u'));
    assert.equal(psql(`select status from public.presenca_comandos where request_id='${requestId}';`), 'recebido');
    assert.equal(psql(String.raw`
      select count(*) from public.presenca_acao_eventos
       where request_id='${requestId}' and tipo in ('concluido','falhou');
    `), '0');
  }

  psql(String.raw`
    drop trigger trg_teste_presenca_erro_transitorio on public.aluno_presenca;
    drop function public.teste_presenca_erro_transitorio();
  `);
});

test('mutacao de roster espera o lock mantido pela aplicacao reservada', async () => {
  psql('delete from public.aluno_presenca;');
  psql(String.raw`
    create or replace function public.teste_presenca_atrasar_primeiro_item()
    returns trigger language plpgsql as $$
    begin
      if new.aluno_id = 101 then perform pg_sleep(2); end if;
      return new;
    end
    $$;
    create trigger trg_teste_presenca_atrasar_primeiro_item
    before insert or update on public.aluno_presenca
    for each row execute function public.teste_presenca_atrasar_primeiro_item();
  `);

  const requestId = '10000000-0000-4000-8000-000000000200';
  psql(criar(requestId));
  const aplicacao = psqlAsync(aplicar(requestId));
  await waitForSleep(requestId);
  const mutacao = psqlAsync(String.raw`
    update public.aula_alunos_emusys
       set updated_at = clock_timestamp()
     where aula_emusys_id=10 and aluno_id=102
    returning aluno_id;
  `);
  const estadoEm300ms = await Promise.race([
    mutacao.then(() => 'concluida'),
    delay(300).then(() => 'bloqueada'),
  ]);
  assert.equal(estadoEm300ms, 'bloqueada');
  const [resultadoAplicacao, resultadoMutacao] = await Promise.all([aplicacao, mutacao]);
  assert.equal(json(resultadoAplicacao).status, 'concluido');
  assert.match(resultadoMutacao, /102/u);

  psql(String.raw`
    drop trigger trg_teste_presenca_atrasar_primeiro_item on public.aluno_presenca;
    drop function public.teste_presenca_atrasar_primeiro_item();
  `);
});

test('cores e triggers permanecem privados inclusive para service_role', () => {
  const acl = json(psql(String.raw`
    select jsonb_build_object(
      'auth_create', has_function_privilege('authenticated', 'public.fn_criar_comando_presenca_core_v2(uuid,text,uuid,integer,jsonb)', 'execute'),
      'service_create', has_function_privilege('service_role', 'public.fn_criar_comando_presenca_core_v2(uuid,text,uuid,integer,jsonb)', 'execute'),
      'auth_apply', has_function_privilege('authenticated', 'public.fn_aplicar_comando_presenca_core_v2(uuid)', 'execute'),
      'service_apply', has_function_privilege('service_role', 'public.fn_aplicar_comando_presenca_core_v2(uuid)', 'execute'),
      'auth_validate', has_function_privilege('authenticated', 'public.fn_validar_comando_roster_reservado_v2(uuid)', 'execute'),
      'service_validate', has_function_privilege('service_role', 'public.fn_validar_comando_roster_reservado_v2(uuid)', 'execute'),
      'auth_roster_trigger', has_function_privilege('authenticated', 'public.fn_presenca_roster_lock_trigger_v2()', 'execute'),
      'service_slot_trigger', has_function_privilege('service_role', 'public.fn_presenca_slot_lock_trigger_v2()', 'execute')
    );
  `));
  assert.deepEqual(acl, {
    auth_create: false,
    service_create: false,
    auth_apply: false,
    service_apply: false,
    auth_validate: false,
    service_validate: false,
    auth_roster_trigger: false,
    service_slot_trigger: false,
  });
});
