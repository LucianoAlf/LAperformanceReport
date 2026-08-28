import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = process.cwd();
const IMAGE = process.env.PRESENCA_ROSTER_ESCALA_POSTGRES_IMAGE || 'postgres:17-alpine';
const MIGRATION =
  'supabase/migrations/20260828043000_presenca_roster_reconciliacao_linear.sql';
const SET_BASED_MIGRATION =
  'supabase/migrations/20260828053000_presenca_roster_reconciliacao_set_based.sql';
const UNIDADE = '44444444-4444-4444-8444-444444444444';
const RUN = '44444444-4444-4444-8444-444444444401';

const migrations = [
  'supabase/migrations/20260827030200_presenca_sync_cobertura_idempotente.sql',
  'supabase/migrations/20260827030500_presenca_roster_operacional.sql',
  'supabase/migrations/20260828005703_presenca_roster_v2_expansao_aditiva.sql',
  MIGRATION,
  SET_BASED_MIGRATION,
];

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function docker(args, input) {
  const result = execute('docker', args, { input });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', 'postgres', '-tA',
  ], sql);
}

function psqlAsync(container, sql, applicationName) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', '-e', `PGAPPNAME=${applicationName}`, container,
      'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
      '-U', 'postgres', '-d', 'postgres', '-tA',
    ], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${stdout}\n${stderr}`));
    });
    child.stdin.end(sql);
  });
}

async function waitForActivity(container, applicationName, expectedWait = null) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const state = psql(container, `
      select coalesce(jsonb_build_object(
        'state', state,
        'wait', wait_event_type
      )::text, '{}')
      from pg_stat_activity
      where application_name = '${applicationName}'
      limit 1;
    `);
    if (state) {
      const activity = JSON.parse(state);
      if (activity.state === 'active' && (expectedWait === null || activity.wait === expectedWait)) {
        return;
      }
    }
    await delay(50);
  }
  assert.fail(`atividade ${applicationName} nao atingiu o estado esperado`);
}

function waitForPostgres(container) {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const probe = execute('docker', [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1',
    ]);
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  assert.fail('PostgreSQL 17 descartavel nao ficou pronto');
}

function json(output) {
  return JSON.parse(output.split(/\r?\n/u).filter(Boolean).at(-1));
}

test('migration elimina os dois caminhos quadraticos do reconciliador', () => {
  assert.equal(existsSync(MIGRATION), true, 'migration de escala ausente');
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.reconciliar_grade_snapshot_emusys_v1/iu);
  assert.doesNotMatch(sql, /v_detalhe\s*:=\s*v_detalhe\s*\|\|/iu);
  assert.match(sql, /v_snapshot_emusys_ids/iu);
  assert.match(sql, /v_snapshot_aula_ids\[v_indice\]\s*:=\s*v_aula\.id/iu);
  assert.match(sql, /jsonb_array_elements\(p_snapshot\)\s+with\s+ordinality/iu);
  assert.match(sql, /emusys_id\s*=\s*any\s*\(v_snapshot_emusys_ids\)/iu);
  assert.doesNotMatch(sql, /from\s+jsonb_array_elements\(p_snapshot\)\s+with\s+ordinality[\s\S]*left\s+join\s+public\.aulas_emusys/iu);
});

test('migration final elimina o loop por aula e o remapeamento duplo de run', () => {
  assert.equal(existsSync(SET_BASED_MIGRATION), true, 'migration set-based ausente');
  const sql = readFileSync(SET_BASED_MIGRATION, 'utf8');

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.reconciliar_grade_snapshot_emusys_core_v3/iu);
  assert.match(sql, /insert\s+into\s+public\.aula_roster_sync_estado[\s\S]*select/iu);
  assert.match(sql, /update\s+public\.aula_alunos_emusys\s+aa[\s\S]*from\s+snapshot_itens/iu);
  assert.doesNotMatch(sql, /for\s+v_indice\s+in/iu);
  assert.doesNotMatch(sql, /set\s+run_id\s*=\s*p_sync_run_id/iu);
  assert.doesNotMatch(sql, /set\s+ultimo_run_visto\s*=\s*p_sync_run_id\s+where\s+aa\.ultimo_run_visto/iu);
  assert.doesNotMatch(sql, /set\s+(?:local\s+)?statement_timeout/iu);
  assert.doesNotMatch(sql, /execute\s+format\s*\(/iu);
});

test('reconciliacao v2 fecha fotografia acima da escala real dentro do teto PostgREST', {
  timeout: 120_000,
}, async (t) => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  const dockerInfo = execute('docker', ['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-presenca-roster-escala-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create schema extensions;
      create extension pgcrypto with schema extensions;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

      create table public.unidades(id uuid primary key, nome text not null);
      insert into public.unidades values ('${UNIDADE}', 'Escala');
      create table public.usuarios(id integer primary key, auth_user_id uuid, ativo boolean default true);
      create function public.usuario_tem_permissao(integer, text, uuid)
      returns boolean language sql stable as $$ select true $$;

      create table public.aulas_emusys(
        id integer primary key,
        emusys_id integer not null,
        unidade_id uuid not null references public.unidades(id),
        professor_id integer,
        data_aula date not null,
        data_hora_inicio timestamptz,
        data_hora_fim timestamptz,
        categoria text default 'normal',
        curso_nome text,
        turma_nome text,
        cancelada boolean not null default false,
        cancelada_origem text,
        cancelada_motivo text,
        cancelada_em timestamptz,
        unique(emusys_id, unidade_id)
      );
      create index aulas_emusys_unidade_data_idx
        on public.aulas_emusys(unidade_id, data_aula);

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
        id uuid primary key default extensions.gen_random_uuid(),
        aula_emusys_id integer not null,
        aluno_id integer not null,
        status_presenca text,
        respondido_por text
      );
    `);

    for (const migration of migrations) {
      psql(container, readFileSync(migration, 'utf8'));
    }

    psql(container, String.raw`
      insert into public.aulas_emusys(
        id, emusys_id, unidade_id, professor_id, data_aula,
        data_hora_inicio, data_hora_fim, categoria, curso_nome, turma_nome
      )
      select
        900000 + g,
        900000 + g,
        '${UNIDADE}',
        100 + (slot_id % 20),
        current_date + 1 + (((slot_id - 1) % 16)::integer),
        (current_date + 1 + (((slot_id - 1) % 16)::integer))::timestamp
          + ((((slot_id - 1) / 16)::integer) || ' minutes')::interval,
        (current_date + 1 + (((slot_id - 1) % 16)::integer))::timestamp
          + ((((slot_id - 1) / 16)::integer) || ' minutes')::interval
          + interval '50 minutes',
        'normal',
        'Curso ' || (slot_id % 10),
        'Turma ' || g
      from generate_series(1, 3000) g
      cross join lateral (select ((g - 1) % 800) + 1 as slot_id) slot;

      insert into public.aula_alunos_emusys(
        aula_emusys_id, unidade_id, aluno_chave, aluno_emusys_id,
        aluno_id, aluno_nome, aluno_nome_normalizado
      )
      select
        900000 + g, '${UNIDADE}', 'emusys:' || g, g, g,
        'Aluno ' || g, 'aluno ' || g
      from generate_series(1, 2800) g;

      insert into public.aluno_presenca(
        aula_emusys_id, aluno_id, status_presenca, respondido_por
      ) values (902900, 999999, 'presente', 'agenda_secretaria');

      insert into public.presenca_sync_execucoes(
        id, request_id, unidade_id, modo, data_alvo, status,
        paginas_lidas, aulas_lidas, presencas_lidas, lease_segundos, heartbeat_em
      ) values (
        '${RUN}', extensions.gen_random_uuid(), '${UNIDADE}', 'metadados',
        current_date + 1, 'iniciada', 28, 2800, 0, 300, clock_timestamp()
      );
      insert into public.presenca_sync_cobertura(
        unidade_id, modo, data_alvo, run_id, status, lease_ate, heartbeat_em,
        paginas_lidas, aulas_lidas, presencas_lidas, iniciada_em
      ) values (
        '${UNIDADE}', 'metadados', current_date + 1, '${RUN}', 'iniciada',
        clock_timestamp() + interval '5 minutes', clock_timestamp(),
        28, 2800, 0, clock_timestamp()
      );
      analyze public.aulas_emusys;
      analyze public.aula_alunos_emusys;

      -- Reproduz o custo dominante dos triggers vivos: cada escrita consulta
      -- o slot e tenta novamente os dois advisory locks ja adquiridos pelo v2.
      create function public.test_roster_lock_vivo()
      returns trigger language plpgsql as $$
      declare
        v_roster bigint;
        v_slot bigint;
      begin
        v_roster := public.fn_presenca_roster_lock_key_v2(new.aula_emusys_id);
        select public.fn_presenca_slot_lock_key_v2(
          a.unidade_id, a.professor_id, a.data_hora_inicio,
          a.data_hora_fim, a.curso_nome
        ) into v_slot
          from public.aulas_emusys a where a.id = new.aula_emusys_id;
        if not pg_try_advisory_xact_lock(v_roster)
           or not pg_try_advisory_xact_lock(v_slot) then
          raise exception 'lock ocupado' using errcode = '55P03';
        end if;
        return new;
      end
      $$;
      create trigger test_roster_lock_vivo
      before update on public.aula_alunos_emusys
      for each row execute function public.test_roster_lock_vivo();

      create function public.test_estado_lock_vivo()
      returns trigger language plpgsql as $$
      declare
        v_roster bigint;
        v_slot bigint;
      begin
        v_roster := public.fn_presenca_roster_lock_key_v2(new.aula_id);
        select public.fn_presenca_slot_lock_key_v2(
          a.unidade_id, a.professor_id, a.data_hora_inicio,
          a.data_hora_fim, a.curso_nome
        ) into v_slot
          from public.aulas_emusys a where a.id = new.aula_id;
        if not pg_try_advisory_xact_lock(v_roster)
           or not pg_try_advisory_xact_lock(v_slot) then
          raise exception 'lock ocupado' using errcode = '55P03';
        end if;
        return new;
      end
      $$;
      create trigger test_estado_lock_vivo
      before insert or update on public.aula_roster_sync_estado
      for each row execute function public.test_estado_lock_vivo();
    `);

    const resultado = json(psql(container, String.raw`
      set statement_timeout = '5s';
      create temporary table resultado_chamada as
      with snapshot as materialized (
        select jsonb_agg(jsonb_build_object(
          'emusys_id', a.emusys_id,
          'estado', 'completo',
          'qtd_esperada', 1,
          'qtd_recebida', 1,
          'aluno_chaves', jsonb_build_array('emusys:' || (a.emusys_id - 900000))
        ) order by a.emusys_id) as payload
        from public.aulas_emusys a
        where a.unidade_id = '${UNIDADE}'
          and a.emusys_id <= 902800
      )
      select public.reconciliar_grade_snapshot_emusys_v2(
          '${RUN}', '${UNIDADE}', current_date + 1, current_date + 16,
          snapshot.payload, false
        ) as resultado
      from snapshot;

      select jsonb_build_object(
        'status', resultado_chamada.resultado ->> 'status',
        'contrato', resultado_chamada.resultado ->> 'contrato',
        'run_id', resultado_chamada.resultado ->> 'run_id',
        'detalhes', jsonb_array_length(resultado_chamada.resultado -> 'detalhe'),
        'estados', (select count(*) from public.aula_roster_sync_estado where run_id = '${RUN}'),
        'ativos', (select count(*) from public.aula_alunos_emusys where ativo_operacional and ultimo_run_visto = '${RUN}'),
        'canceladas', (select count(*) from public.aulas_emusys where cancelada and cancelada_origem = 'sync_ausente_emusys'),
        'presenca_humana', (select count(*) from public.aluno_presenca where aula_emusys_id = 902900 and status_presenca = 'presente' and respondido_por = 'agenda_secretaria')
      )
      from resultado_chamada;
    `));

    assert.deepEqual(resultado, {
      status: 'ok',
      contrato: 'roster_v2',
      run_id: RUN,
      detalhes: 2800,
      estados: 2800,
      ativos: 2800,
      canceladas: 200,
      presenca_humana: 1,
    });

    const blocker = psqlAsync(container, String.raw`
      begin;
      select id from public.aulas_emusys where id = 903000 for update;
      select pg_sleep(8);
      commit;
    `, 'roster_scale_blocker');
    await waitForActivity(container, 'roster_scale_blocker');

    const concorrente = psqlAsync(container, String.raw`
      select public.reconciliar_grade_snapshot_emusys_v1(
        '${UNIDADE}', current_date + 8, current_date + 8,
        jsonb_build_array(
          jsonb_build_object(
            'emusys_id', 999001,
            'estado', 'incompleto',
            'qtd_esperada', 1,
            'qtd_recebida', 0,
            'aluno_chaves', '[]'::jsonb
          ),
          jsonb_build_object(
            'emusys_id', 903000,
            'estado', 'incompleto',
            'qtd_esperada', 1,
            'qtd_recebida', 0,
            'aluno_chaves', '[]'::jsonb
          )
        ), false
      );
    `, 'roster_scale_call');
    await waitForActivity(container, 'roster_scale_call', 'Lock');

    psql(container, String.raw`
      insert into public.aulas_emusys(
        id, emusys_id, unidade_id, professor_id, data_aula,
        data_hora_inicio, data_hora_fim, categoria, curso_nome, turma_nome
      ) values (
        999001, 999001, '${UNIDADE}', 999, current_date + 8,
        (current_date + 8)::timestamp + interval '12 hours',
        (current_date + 8)::timestamp + interval '12 hours 50 minutes',
        'normal', 'Curso concorrente', 'Turma concorrente'
      );
      insert into public.aulas_emusys(
        id, emusys_id, unidade_id, professor_id, data_aula,
        data_hora_inicio, data_hora_fim, categoria, curso_nome, turma_nome
      ) values (
        999002, 999002, '${UNIDADE}', 998, current_date + 8,
        (current_date + 8)::timestamp + interval '13 hours',
        (current_date + 8)::timestamp + interval '13 hours 50 minutes',
        'normal', 'Curso novo fora da fotografia', 'Turma nova fora da fotografia'
      );
    `);

    const detalheConcorrente = json(await concorrente).detalhe;
    await blocker;
    assert.deepEqual(detalheConcorrente[0], {
      emusys_aula_id: 999001,
      estado: 'incompleto',
      acao: 'aula_local_ausente',
    });
    assert.deepEqual(detalheConcorrente[1], {
      aula_local_id: 903000,
      emusys_aula_id: 903000,
      estado: 'incompleto',
      acao: 'revisao_estrutural',
    });
    assert.equal(
      psql(container, 'select cancelada from public.aulas_emusys where id = 999002;'),
      'f',
      'aula criada depois da captura nao pode ser cancelada pela fotografia anterior',
    );
  } finally {
    execute('docker', ['rm', '-f', container]);
  }
});
